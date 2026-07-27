// 파일명: scripts/cache-welfare-detail.mjs
// 역할: GitHub Actions가 하루 1번, cache-welfare-list.mjs 실행 "다음"에 실행돼요.
//       복지시설 27,149건은 주소·전화번호를 알려면 정부 API를 더 불러야 해요.
//       [4차 수정 2026-07-26] 처음엔 "시설 1개당 API 1번씩" 구조였는데, 진단해보니
//       이 API는 fcltCd(시설코드)로 걸러주지 않고 jrsdSggCd(지역)+fcltKindCd(종류)만
//       정확히 걸러줘요. 그래서 "같은 지역+같은 종류" 시설들은 딱 1번의 API 호출로
//       한꺼번에(최대 100건) 받아올 수 있다는 걸 알아냈어요. 이걸 활용해서, 아직 안
//       채워진 시설들을 지역+종류별로 묶어서 그룹 하나당 1번(많으면 몇 번)만 호출해요 -
//       예전 "시설 1개=호출 1번" 방식보다 훨씬 적은 호출로 훨씬 많은 시설을 채울 수 있어요.

import fs from 'node:fs/promises';
import path from 'node:path';

const WELFARE_API_KEY = process.env.WELFARE_API_KEY;

// (한글 설명) [4차 수정] 이제 기준이 "시설 개수"가 아니라 "API 호출 횟수"예요.
//             그룹으로 묶어서 부르니까 하루 한도(10,000회) 대비 훨씬 여유있어요.
//             앱 오픈 전이라 넉넉하게 3,000회로 잡았어요(그래도 한도의 30%뿐).
const DAILY_CALL_LIMIT = 3000;
// 그룹 하나가 100건 넘게 있을 수도 있어서(예: 대도시의 흔한 시설 종류),
// 한 그룹에 너무 많은 페이지를 쓰지 않도록 그룹당 최대 5페이지(500건)로 제한해요.
const MAX_PAGES_PER_GROUP = 5;
const GROUP_PAGE_SIZE = 100;

// (한글 설명) 한 번에 너무 많이 동시에 요청하면 정부 서버에 부담이 될 수 있어서,
//             3개씩 묶어서 처리하고 묶음 사이에 살짝 쉬어요(일자리 캐싱에서
//             검증된 방식과 동일해요 - 20개는 막혔고 3개는 안전했어요).
const CONCURRENCY = 3;
const BATCH_PAUSE_MS = 500;
// 429가 감지되면 정부 서버가 잠깐 쉬라는 신호로 보고, 다음 배치 전에 훨씬 더
// 오래 쉬어요(그래도 계속 429면 점점 더 길게 쉬어요, 최대 10초까지).
const BACKOFF_PAUSE_MS = 3000;
const MAX_BACKOFF_MS = 10000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseXmlItems(xml, itemTag) {
  const items = [];
  const regex = new RegExp(`<${itemTag}[^>]*>([\\s\\S]*?)<\\/${itemTag}>`, 'g');
  let match;
  while ((match = regex.exec(xml)) !== null) {
    const block = match[1];
    const obj = {};
    const fieldRegex = /<([^\/>\s]+)[^>]*>([\s\S]*?)<\/\1>/g;
    let f;
    while ((f = fieldRegex.exec(block)) !== null) {
      obj[f[1]] = f[2].trim();
    }
    items.push(obj);
  }
  return items;
}

async function readJsonSafe(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

// (한글 설명) 지역(jrsdSggCd)+종류(fcltKindCd) 그룹 하나의 한 페이지(최대 100건)를 받아와요.
async function fetchGroupPage(jrsdSggCd, fcltKindCd, pageNo) {
  const detailKey = encodeURIComponent(WELFARE_API_KEY);
  const url =
    `https://apis.data.go.kr/B554287/sclWlfrFcltInfoInqirService1/getFcltByBassInfoInqire` +
    `?serviceKey=${detailKey}&numOfRows=${GROUP_PAGE_SIZE}&pageNo=${pageNo}` +
    (jrsdSggCd ? `&jrsdSggCd=${encodeURIComponent(jrsdSggCd)}` : '') +
    (fcltKindCd ? `&fcltKindCd=${encodeURIComponent(fcltKindCd)}` : '');

  const r = await fetch(url);
  if (!r.ok) {
    const err = new Error(`HTTP ${r.status}`);
    err.reason = `HTTP_${r.status}`;
    throw err;
  }
  const xml = await r.text();

  const resultCodeMatch = xml.match(/<resultCode>([^<]*)<\/resultCode>/);
  const resultMsgMatch = xml.match(/<resultMsg>([^<]*)<\/resultMsg>/);
  const resultCode = resultCodeMatch ? resultCodeMatch[1] : null;
  if (resultCode !== '00') {
    const resultMsg = resultMsgMatch ? resultMsgMatch[1] : '(메시지 없음)';
    const err = new Error(`resultCode=${resultCode} ${resultMsg}`);
    err.reason = `RESULTCODE_${resultCode}`;
    err.rawSample = xml.slice(0, 300);
    throw err;
  }

  const totalCountMatch = xml.match(/<totalCount>(\d+)<\/totalCount>/);
  const totalCount = totalCountMatch ? parseInt(totalCountMatch[1], 10) : 0;
  const items = parseXmlItems(xml, 'item');
  return { items, totalCount };
}

function buildDetail(candidate) {
  const fullAddr = ((candidate.fcltAddr || '') + ' ' + (candidate.fcltDtl_1Addr || '')).trim();
  return { fullAddr, fcltTelNo: candidate.fcltTelNo || '' };
}

// (한글 설명) [버그 수정 2026-07-26] 실패한(429 등) 호출이 callsUsed에 안 잡혀서,
//             하루 호출한도 안전장치가 전혀 작동을 안 했어요(429 계속 나와도 한도
//             체크에서 안 걸려서 몇 시간이고 계속 돎). 이제 성공/실패 상관없이
//             "실제로 정부 서버에 요청을 보낸 횟수"를 정확히 세도록 고쳤어요.
async function fetchGroup(jrsdSggCd, fcltKindCd, wantedFcltCds) {
  const wanted = new Set(wantedFcltCds);
  const found = new Map();
  let callsUsed = 0;
  let lastError = null;

  let page1;
  try {
    callsUsed++;
    page1 = await fetchGroupPage(jrsdSggCd, fcltKindCd, 1);
  } catch (e) {
    return { found, callsUsed, error: e };
  }
  page1.items.forEach((d) => { if (wanted.has(d.fcltCd)) found.set(d.fcltCd, buildDetail(d)); });

  const totalPages = Math.min(Math.ceil(page1.totalCount / GROUP_PAGE_SIZE) || 1, MAX_PAGES_PER_GROUP);
  for (let p = 2; p <= totalPages && found.size < wanted.size; p++) {
    try {
      callsUsed++;
      const pageX = await fetchGroupPage(jrsdSggCd, fcltKindCd, p);
      pageX.items.forEach((d) => { if (wanted.has(d.fcltCd)) found.set(d.fcltCd, buildDetail(d)); });
    } catch (e) {
      lastError = e;
      break; // 이 그룹의 다음 페이지는 그만 시도하고, 지금까지 찾은 것만 반환해요
    }
  }

  return { found, callsUsed, error: lastError };
}

async function main() {
  if (!WELFARE_API_KEY) {
    console.error('🔥 WELFARE_API_KEY 환경변수가 없어요. GitHub Secrets 등록을 확인해 주세요.');
    process.exitCode = 1;
    return;
  }

  const dataDir = path.resolve('api/data');
  const listPath = path.join(dataDir, 'welfare-list.json');
  const detailPath = path.join(dataDir, 'welfare-detail.json');

  const list = await readJsonSafe(listPath, []);
  if (list.length === 0) {
    console.log('⚠️ welfare-list.json이 비어있어요(목록 캐싱이 먼저 성공해야 해요). 오늘은 건너뛰어요.');
    return;
  }

  const detailMap = await readJsonSafe(detailPath, {});
  const alreadyDone = Object.keys(detailMap).length;
  console.log(`📋 전체 ${list.length}건 중 이미 ${alreadyDone}건 완료됨.`);

  const remaining = list.filter((it) => it.fcltCd && !(it.fcltCd in detailMap));
  if (remaining.length === 0) {
    console.log('🎉 이미 전체 완료됐어요! (새로 생긴 시설이 있으면 다음 목록 갱신 때 자동으로 채워져요)');
    return;
  }

  // (한글 설명) 같은 지역(jrsdSggCd)+같은 종류(fcltKindCd)끼리 묶어요.
  const groupMap = new Map(); // key -> { jrsdSggCd, fcltKindCd, fcltCds: [] }
  remaining.forEach((it) => {
    const key = `${it.jrsdSggCd || ''}||${it.fcltKindCd || ''}`;
    if (!groupMap.has(key)) {
      groupMap.set(key, { jrsdSggCd: it.jrsdSggCd, fcltKindCd: it.fcltKindCd, fcltCds: [] });
    }
    groupMap.get(key).fcltCds.push(it.fcltCd);
  });
  const groups = Array.from(groupMap.values());
  console.log(`🧩 남은 ${remaining.length}건이 ${groups.length}개 그룹(지역+종류)으로 묶였어요.`);
  console.log(`🚀 그룹 처리 시작 (하루 호출한도 ${DAILY_CALL_LIMIT}회, 동시요청 ${CONCURRENCY}개씩)`);

  let successCount = 0;
  let failCount = 0;
  let callsUsed = 0;
  let groupsProcessed = 0;
  const failReasonCounts = {};
  const failSamples = [];
  let currentPause = BATCH_PAUSE_MS;
  let stoppedByBudget = false;

  outerLoop:
  for (let i = 0; i < groups.length; i += CONCURRENCY) {
    if (callsUsed >= DAILY_CALL_LIMIT) { stoppedByBudget = true; break outerLoop; }

    const chunk = groups.slice(i, i + CONCURRENCY);
    const results = await Promise.all(chunk.map((g) => fetchGroup(g.jrsdSggCd, g.fcltKindCd, g.fcltCds)));

    let sawRateLimit = false;
    results.forEach((result, idx) => {
      const g = chunk[idx];
      callsUsed += result.callsUsed;
      groupsProcessed++;

      g.fcltCds.forEach((fcltCd) => {
        if (result.found.has(fcltCd)) {
          detailMap[fcltCd] = result.found.get(fcltCd);
          successCount++;
        } else {
          failCount++;
          const reason = (result.error && result.error.reason) || 'NOT_FOUND_IN_GROUP';
          failReasonCounts[reason] = (failReasonCounts[reason] || 0) + 1;
          if (reason === 'HTTP_429') sawRateLimit = true;
          if (failSamples.length < 6) {
            failSamples.push({ fcltCd, message: (result.error && result.error.message) || reason });
          }
        }
      });
    });

    if (groupsProcessed % 100 < CONCURRENCY || groupsProcessed === groups.length) {
      console.log(`   진행중... 그룹 ${groupsProcessed}/${groups.length} (호출 ${callsUsed}/${DAILY_CALL_LIMIT}회, 성공 ${successCount}, 실패 ${failCount})`);
    }

    if (sawRateLimit) {
      currentPause = Math.min(currentPause + BACKOFF_PAUSE_MS, MAX_BACKOFF_MS);
      console.log(`   ⏸️ 서버가 "너무 빠르다"고 해서(429) ${currentPause / 1000}초 쉬었다가 계속할게요.`);
    } else {
      currentPause = BATCH_PAUSE_MS;
    }
    await sleep(currentPause);
  }

  console.log(`✅ 오늘 처리 완료: 그룹 ${groupsProcessed}/${groups.length}개 처리${stoppedByBudget ? '(호출한도 도달로 중단)' : ''}, API 호출 ${callsUsed}회`);
  console.log(`   성공 ${successCount}건, 실패(다음에 재시도) ${failCount}건`);
  console.log(`📊 전체 진행률: ${Object.keys(detailMap).length}/${list.length}건 (${Math.round((Object.keys(detailMap).length / list.length) * 100)}%)`);

  if (failCount > 0) {
    console.log('🔍 실패 이유별 집계:');
    Object.entries(failReasonCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([reason, count]) => {
        console.log(`   - ${reason}: ${count}건`);
      });
    console.log('🔍 실패 샘플:');
    failSamples.forEach((s, idx) => {
      console.log(`   [샘플 ${idx + 1}] fcltCd=${s.fcltCd} / ${s.message}`);
    });
  }

  await fs.writeFile(detailPath, JSON.stringify(detailMap), 'utf8');
  console.log('💾 api/data/welfare-detail.json 저장 완료');
}

main().catch((err) => {
  console.error('🔥 스크립트 실행 중 예상 못한 오류:', err);
  process.exitCode = 1;
});
