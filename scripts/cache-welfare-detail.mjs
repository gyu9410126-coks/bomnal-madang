// 파일명: scripts/cache-welfare-detail.mjs
// 역할: GitHub Actions가 하루 1번, cache-welfare-list.mjs 실행 "다음"에 실행돼요.
//       복지시설 27,159건은 주소·전화번호를 알려면 시설 1개당 정부 API를 1번씩 더
//       불러야 해서, 하루에 다 하면 정부 API 하루 호출한도(10,000회)를 넘어요.
//       그래서 하루에 최대 9,000건씩만(한도의 90%, 나머지는 여유분) 나눠서 채워요.
//       api/data/welfare-detail.json에 이미 채워진 시설(fcltCd가 이미 key로 있는 것)은
//       건너뛰고, 아직 안 채워진 시설만 순서대로 다음 9,000건을 처리해요 - 그래서
//       "진행상황 파일"을 따로 안 만들어도, welfare-detail.json 자체가 진행상황이에요.
//       (예상: 27,159건 ÷ 9,000건 ≈ 3일이면 전체 완성, 그 뒤로는 새로 생기는 시설만
//       가끔 채우면 되니까 호출량이 크게 줄어요)

import fs from 'node:fs/promises';
import path from 'node:path';

const WELFARE_API_KEY = process.env.WELFARE_API_KEY;

// (한글 설명) 앱이 아직 오픈 전이라 실사용자 트래픽이 거의 없어서, 하루 한도(10,000회)의
//             90%인 9,000건까지 넉넉하게 써서 최대한 빨리(3~4일) 끝내기로 했어요
//             (경아오빠 2026-07-24 결정). 앱 오픈 후라면 이 숫자를 낮춰야 해요.
// (한글 설명) [3차 수정 2026-07-26] 어제 9,000건씩 크게 시도했다가 이틀 연속
//             하루 종일 429(너무 빠름/한도초과)로 전부 막혔어요. 정확한 원인이
//             "속도"인지 "하루 한도 자체가 이미 작다"인지 구분이 안 되는 상태라,
//             이번엔 아주 작게(150건)만 시도해서 "이 정도는 확실히 성공하는지"부터
//             확인해요. 성공하면 다음번엔 조금씩 늘려가면서 안전한 지점을 찾을
//             거예요 - 큰 숫자로 바로 시도해서 하루를 또 날리지 않기 위한
//             안전제일 접근이에요.
const DAILY_LIMIT = 150;

// (한글 설명) 한 번에 너무 많이 동시에 요청하면 정부 서버에 부담이 될 수 있어서,
//             20개씩 묶어서 처리하고 묶음 사이에 살짝 쉬어요.
// (한글 설명) [2차 수정] 20개씩 동시요청했더니 첫 배치부터 HTTP 429(너무 많이
//             요청함)로 전부 막혀서, 9,000번을 시도했는데 단 1건도 성공 못 했어요.
//             일자리 캐싱 때 겪었던 것과 같은 문제라, 검증된 해결법(동시요청 대폭
//             축소)을 그대로 적용해요.
const BATCH_SIZE = 3;
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

// (한글 설명) 시설 1개의 상세정보(주소·전화번호)를 정부 API에서 받아와요.
//             [수정 2026-07-26] 진단 결과, 이 API는 jrsdSggCd(지역)+fcltKindCd(종류)는
//             정확히 걸러주는데 fcltCd(시설코드)는 걸러주지 않고 그 지역·종류의 아무
//             시설이나 하나 돌려준다는 걸 확인했어요(6개 샘플 전부 지역·종류는 일치,
//             시설코드만 다름). 그래서 fcltCd로 딱 1건만 달라고 하는 대신, 지역+종류로
//             여러 건(100건)을 받아와서 그 안에서 우리가 찾는 fcltCd를 직접 찾아요.
async function fetchDetail(item) {
  const detailKey = encodeURIComponent(WELFARE_API_KEY);
  const url =
    `https://apis.data.go.kr/B554287/sclWlfrFcltInfoInqirService1/getFcltByBassInfoInqire` +
    `?serviceKey=${detailKey}&numOfRows=100&pageNo=1` +
    (item.jrsdSggCd ? `&jrsdSggCd=${encodeURIComponent(item.jrsdSggCd)}` : '') +
    (item.fcltKindCd ? `&fcltKindCd=${encodeURIComponent(item.fcltKindCd)}` : '');

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

  const detailItems = parseXmlItems(xml, 'item');
  // (한글 설명) 100건 안에서 우리가 찾는 fcltCd를 직접 찾아요.
  const candidate = detailItems.find((d) => d.fcltCd === item.fcltCd);
  if (!candidate) {
    const err = new Error(`100건 안에서 못 찾음(같은 지역·종류가 100건보다 많을 수 있음) - 전체 ${detailItems.length}건 받음`);
    err.reason = 'NOT_FOUND_IN_PAGE';
    throw err;
  }

  const fullAddr = ((candidate.fcltAddr || '') + ' ' + (candidate.fcltDtl_1Addr || '')).trim();
  return { fullAddr, fcltTelNo: candidate.fcltTelNo || '' };
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

  // (한글 설명) 아직 상세정보가 없는 시설만 골라서, 오늘 처리할 만큼(최대 9,000건)만 잘라요.
  const remaining = list.filter((it) => it.fcltCd && !(it.fcltCd in detailMap));
  const todayBatch = remaining.slice(0, DAILY_LIMIT);

  if (todayBatch.length === 0) {
    console.log('🎉 이미 전체 완료됐어요! (새로 생긴 시설이 있으면 다음 목록 갱신 때 자동으로 채워져요)');
    return;
  }

  console.log(`🚀 오늘 ${todayBatch.length}건 처리 시작 (남은 전체: ${remaining.length}건)`);

  let successCount = 0;
  let failCount = 0;
  const failReasonCounts = {}; // (한글 설명) 실패 이유별로 몇 번씩 나왔는지 세어봐요
  const failSamples = []; // 원인 파악용으로 처음 3개 실패의 원본 응답 앞부분만 기록해요

  let currentPause = BATCH_PAUSE_MS;

  for (let i = 0; i < todayBatch.length; i += BATCH_SIZE) {
    const chunk = todayBatch.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(chunk.map(async (item) => {
      try {
        const detail = await fetchDetail(item);
        return { fcltCd: item.fcltCd, detail, error: null };
      } catch (e) {
        return { fcltCd: item.fcltCd, detail: null, error: e };
      }
    }));

    let sawRateLimit = false;
    results.forEach(({ fcltCd, detail, error }) => {
      if (detail) {
        detailMap[fcltCd] = detail;
        successCount++;
      } else {
        failCount++; // 다음 실행 때 다시 시도돼요(자동 재시도)
        const reason = (error && error.reason) || 'UNKNOWN';
        failReasonCounts[reason] = (failReasonCounts[reason] || 0) + 1;
        if (reason === 'HTTP_429') sawRateLimit = true;
        if (failSamples.length < 6 && error) {
          failSamples.push({ fcltCd, message: error.message, rawSample: error.rawSample || null });
        }
      }
    });

    if ((i / BATCH_SIZE) % 25 === 0) {
      console.log(`   진행중... ${Math.min(i + BATCH_SIZE, todayBatch.length)}/${todayBatch.length}건 (성공 ${successCount}, 실패 ${failCount})`);
    }

    // (한글 설명) 이번 배치에서 429(너무 빠름)를 만났으면, 다음 배치 전에 훨씬
    //             더 오래 쉬어요(점점 늘어남). 문제없이 잘 됐으면 원래 속도로 돌아가요.
    if (sawRateLimit) {
      currentPause = Math.min(currentPause + BACKOFF_PAUSE_MS, MAX_BACKOFF_MS);
      console.log(`   ⏸️ 서버가 "너무 빠르다"고 해서(429) ${currentPause / 1000}초 쉬었다가 계속할게요.`);
    } else {
      currentPause = BATCH_PAUSE_MS;
    }
    await sleep(currentPause);
  }

  console.log(`✅ 오늘 처리 완료: 성공 ${successCount}건, 실패(다음에 재시도) ${failCount}건`);
  console.log(`📊 전체 진행률: ${Object.keys(detailMap).length}/${list.length}건 (${Math.round((Object.keys(detailMap).length / list.length) * 100)}%)`);

  // (한글 설명) [신규] 실패 이유별 집계와 원본 샘플을 같이 보여줘요 - 왜 실패했는지
  //             (한도 초과인지, 다른 이유인지) 다음번에 로그만 보고 바로 알 수 있어요.
  if (failCount > 0) {
    console.log('🔍 실패 이유별 집계:');
    Object.entries(failReasonCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([reason, count]) => {
        console.log(`   - ${reason}: ${count}건`);
      });
    console.log('🔍 실패 샘플(원본 응답 일부):');
    failSamples.forEach((s, idx) => {
      console.log(`   [샘플 ${idx + 1}] fcltCd=${s.fcltCd} / ${s.message}`);
      if (s.rawSample) console.log(`      원본: ${s.rawSample}`);
    });
  }

  await fs.writeFile(detailPath, JSON.stringify(detailMap), 'utf8');
  console.log('💾 api/data/welfare-detail.json 저장 완료');
}

main().catch((err) => {
  console.error('🔥 스크립트 실행 중 예상 못한 오류:', err);
  process.exitCode = 1;
});
