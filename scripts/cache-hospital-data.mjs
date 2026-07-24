// 파일명: scripts/cache-hospital-data.mjs
// 역할: GitHub Actions가 하루 1번 실행해요.
//       건강보험심사평가원 병원정보서비스(hospInfoServicev2) 전체 데이터를
//       시/도별로 나눠서 받아와 api/data/hospital-{시도코드}.json 17개 파일로 저장해요.
//       (전국을 파일 하나에 합치면 너무 커져서, 검색할 때 필요한 지역 파일 하나만
//       빠르게 불러올 수 있도록 시/도별로 나눴어요)

import fs from 'node:fs/promises';
import path from 'node:path';

const HOSPITAL_API_KEY = process.env.HOSPITAL_API_KEY;

// (한글 설명) 정부 API가 한 번에 최대 1000건까지 허용해요(2026-07-24 실제 테스트로 확인됨).
const PAGE_SIZE = 1000;

// (한글 설명) 전국 17개 시/도의 6자리 코드예요(2자리 코드 + "0000").
//             health.js의 SIDO_CODES(2자리) 표와 완전히 같은 기준으로 만들었어요.
const SIDO_CD_LIST = [
  '110000', // 서울특별시
  '260000', // 부산광역시
  '270000', // 대구광역시
  '280000', // 인천광역시
  '290000', // 광주광역시
  '300000', // 대전광역시
  '310000', // 울산광역시
  '360000', // 세종특별자치시
  '410000', // 경기도
  '510000', // 강원특별자치도
  '430000', // 충청북도
  '440000', // 충청남도
  '520000', // 전북특별자치도
  '460000', // 전라남도
  '470000', // 경상북도
  '480000', // 경상남도
  '500000', // 제주특별자치도
];

// (한글 설명) 화면(health.html)에서 실제로 쓰는 필드만 뽑아서 저장해요(원본엔 의사수,
//             병상수 등 수십 개 필드가 더 있는데 화면에서 안 씀 - 용량 절약).
//             sgguCd, emdongNm은 화면엔 안 보이지만 지역/동 필터링에 필요해서 남겨둬요.
const FIELDS_TO_KEEP = [
  'yadmNm', 'addr', 'telno', 'hospUrl',
  'clCd', 'clCdNm', 'sidoCd', 'sgguCd', 'emdongNm',
  'XPos', 'YPos',
];

function trimItem(it) {
  const out = {};
  FIELDS_TO_KEEP.forEach((f) => { out[f] = it[f] !== undefined ? it[f] : ''; });
  return out;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJsonWithRetry(url, retries = 2) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error('HTTP 상태코드 ' + r.status);
      return await r.json();
    } catch (err) {
      lastError = err;
      if (attempt < retries) await sleep(1500);
    }
  }
  throw lastError;
}

function normalizeItems(items) {
  if (!items) return [];
  return Array.isArray(items) ? items : [items];
}

// (한글 설명) 시/도 하나(sidoCd)에 대한 전체 병원 목록을 다 받아와요.
async function fetchAllForSido(sidoCd) {
  const baseUrl = 'https://apis.data.go.kr/B551182/hospInfoServicev2/getHospBasisList';

  const firstUrl =
    `${baseUrl}?serviceKey=${encodeURIComponent(HOSPITAL_API_KEY)}` +
    `&sidoCd=${sidoCd}&pageNo=1&numOfRows=${PAGE_SIZE}&_type=json`;
  const first = await fetchJsonWithRetry(firstUrl);

  const header = first.response && first.response.header;
  if (!header || header.resultCode !== '00') {
    throw new Error(`${sidoCd} 첫 페이지 응답이 비정상이에요: ` + JSON.stringify(header));
  }

  const body = first.response.body;
  const totalCount = parseInt(body.totalCount, 10) || 0;
  const totalPages = Math.max(Math.ceil(totalCount / PAGE_SIZE), 1);

  let allItems = normalizeItems(body.items && body.items.item).map(trimItem);
  console.log(`   [${sidoCd}] 1/${totalPages} 페이지 (누적 ${allItems.length}/${totalCount}건)`);

  for (let pageNo = 2; pageNo <= totalPages; pageNo++) {
    const pageUrl =
      `${baseUrl}?serviceKey=${encodeURIComponent(HOSPITAL_API_KEY)}` +
      `&sidoCd=${sidoCd}&pageNo=${pageNo}&numOfRows=${PAGE_SIZE}&_type=json`;
    const data = await fetchJsonWithRetry(pageUrl);
    const pageBody = data.response && data.response.body;
    const pageItems = normalizeItems(pageBody && pageBody.items && pageBody.items.item).map(trimItem);
    allItems = allItems.concat(pageItems);
    console.log(`   [${sidoCd}] ${pageNo}/${totalPages} 페이지 (누적 ${allItems.length}/${totalCount}건)`);
    await sleep(150);
  }

  return { items: allItems, totalCount };
}

// (한글 설명) 안전장치 - 받아온 개수가 정부 API가 알려준 전체 개수의 90%보다 적으면,
//             중간에 뭔가 실패한 것으로 보고 그 시/도 파일 저장을 건너뛰어요.
function isSafeToSave(items, totalCount) {
  if (totalCount === 0) return false;
  return items.length >= totalCount * 0.9;
}

async function main() {
  if (!HOSPITAL_API_KEY) {
    console.error('🔥 HOSPITAL_API_KEY 환경변수가 없어요. GitHub Secrets 등록을 확인해 주세요.');
    process.exitCode = 1;
    return;
  }

  const outDir = path.resolve('api/data');
  await fs.mkdir(outDir, { recursive: true });

  let hadError = false;
  let grandTotal = 0;

  for (const sidoCd of SIDO_CD_LIST) {
    console.log(`🏨 [${sidoCd}] 병원 데이터 받아오는 중...`);
    try {
      const result = await fetchAllForSido(sidoCd);
      console.log(`   → 총 ${result.items.length}건 받음 (정부 API가 알려준 전체: ${result.totalCount}건)`);
      if (isSafeToSave(result.items, result.totalCount)) {
        await fs.writeFile(
          path.join(outDir, `hospital-${sidoCd}.json`),
          JSON.stringify(result.items),
          'utf8'
        );
        console.log(`   ✅ api/data/hospital-${sidoCd}.json 저장 완료`);
        grandTotal += result.items.length;
      } else {
        console.error(`   ❌ [${sidoCd}] 받아온 개수가 너무 적어서(90% 미만) 저장을 건너뛰어요. 기존 파일 유지.`);
        hadError = true;
      }
    } catch (err) {
      console.error(`   🔥 [${sidoCd}] 받아오기 실패:`, err.message);
      hadError = true;
    }
    await sleep(300); // (한글 설명) 시/도 사이에도 살짝 쉬어서 정부 서버에 부담을 줄여요
  }

  console.log(`\n📊 전국 합계(저장 성공한 시/도만): ${grandTotal}건`);

  if (hadError) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('🔥 스크립트 실행 중 예상 못한 오류:', err);
  process.exitCode = 1;
});
