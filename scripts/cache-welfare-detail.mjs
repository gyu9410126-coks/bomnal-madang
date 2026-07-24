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
const DAILY_LIMIT = 9000;

// (한글 설명) 한 번에 너무 많이 동시에 요청하면 정부 서버에 부담이 될 수 있어서,
//             20개씩 묶어서 처리하고 묶음 사이에 살짝 쉬어요.
const BATCH_SIZE = 20;
const BATCH_PAUSE_MS = 200;

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
//             benefit.js의 실시간 조회 코드와 완전히 같은 요청 방식이에요.
async function fetchDetail(item) {
  const detailKey = encodeURIComponent(WELFARE_API_KEY);
  const url =
    `https://apis.data.go.kr/B554287/sclWlfrFcltInfoInqirService1/getFcltByBassInfoInqire` +
    `?serviceKey=${detailKey}&numOfRows=1&pageNo=1` +
    `&fcltCd=${encodeURIComponent(item.fcltCd || '')}` +
    (item.jrsdSggCd ? `&jrsdSggCd=${encodeURIComponent(item.jrsdSggCd)}` : '') +
    (item.fcltKindCd ? `&fcltKindCd=${encodeURIComponent(item.fcltKindCd)}` : '');

  const r = await fetch(url);
  if (!r.ok) throw new Error('HTTP 상태코드 ' + r.status);
  const xml = await r.text();
  const detailItems = parseXmlItems(xml, 'item');
  const candidate = detailItems[0] || {};
  if (candidate.fcltCd && candidate.fcltCd !== item.fcltCd) return null; // 안전장치

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

  for (let i = 0; i < todayBatch.length; i += BATCH_SIZE) {
    const chunk = todayBatch.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(chunk.map(async (item) => {
      try {
        const detail = await fetchDetail(item);
        return { fcltCd: item.fcltCd, detail };
      } catch (e) {
        return { fcltCd: item.fcltCd, detail: null };
      }
    }));

    results.forEach(({ fcltCd, detail }) => {
      if (detail) {
        detailMap[fcltCd] = detail;
        successCount++;
      } else {
        failCount++; // 다음 실행 때 다시 시도돼요(자동 재시도)
      }
    });

    if ((i / BATCH_SIZE) % 25 === 0) {
      console.log(`   진행중... ${Math.min(i + BATCH_SIZE, todayBatch.length)}/${todayBatch.length}건 (성공 ${successCount}, 실패 ${failCount})`);
    }
    await sleep(BATCH_PAUSE_MS);
  }

  console.log(`✅ 오늘 처리 완료: 성공 ${successCount}건, 실패(다음에 재시도) ${failCount}건`);
  console.log(`📊 전체 진행률: ${Object.keys(detailMap).length}/${list.length}건 (${Math.round((Object.keys(detailMap).length / list.length) * 100)}%)`);

  await fs.writeFile(detailPath, JSON.stringify(detailMap), 'utf8');
  console.log('💾 api/data/welfare-detail.json 저장 완료');
}

main().catch((err) => {
  console.error('🔥 스크립트 실행 중 예상 못한 오류:', err);
  process.exitCode = 1;
});
