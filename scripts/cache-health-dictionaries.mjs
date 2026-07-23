// 파일명: scripts/cache-health-dictionaries.mjs
// 역할: GitHub Actions가 하루 1번 실행해요.
//       정부 API(약효능·복용법 / 식품영양정보) 전체 데이터를 미리 받아와서
//       api/data/medicine-data.json, api/data/nutrition-data.json 파일로 저장해요.
//       (health.js는 정부 서버를 매번 부르지 않고, 이 저장된 파일에서 바로 검색해요)
//
// (한글 설명) import/export 방식(ESM)으로 짠 이유: .mjs 확장자는 Node.js가 항상
//             ESM(import/export 문법)으로 읽어요. package.json 설정 없이도 항상 동작해요.

import fs from 'node:fs/promises';
import path from 'node:path';

// ① 환경변수에서 API 키 가져오기 (GitHub Secrets에서 전달됨)
const MEDICINE_API_KEY = process.env.MEDICINE_API_KEY;
const FOOD_NUTRITION_API_KEY = process.env.FOOD_NUTRITION_API_KEY;

// (한글 설명) 정부 API가 한 번에 최대 500건까지만 허용해요(2026-07-24 실제 테스트로 확인됨:
//             "numOfRows 최대값은 =[500]입니다" 에러 메시지로 확인). 그래서 500건씩 나눠서
//             여러 번 받아와요.
const PAGE_SIZE = 500;

// (한글 설명) 잠깐 쉬는 함수 - 정부 서버에 너무 빠르게 연달아 요청하지 않으려고 씀
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// (한글 설명) 혹시 한 번 요청이 실패해도(네트워크 오류 등) 바로 포기하지 않고
//             1.5초 쉬었다가 최대 2번까지 다시 시도해요.
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

// (한글 설명) 정부 API 응답의 items는 결과가 1건이면 객체 하나로, 여러 건이면
//             배열로 오는 경우가 있어서(다른 파일들에서도 계속 나온 패턴), 항상
//             배열로 통일해주는 함수예요.
function normalizeItems(items) {
  if (!items) return [];
  return Array.isArray(items) ? items : [items];
}

// ─────────────────────────────────────────
// 💊 약효능·복용법 (식품의약품안전처 e약은요) 전체 받아오기
// 화면(health.html)에서 항목을 거의 다 쓰기 때문에, 원본 필드를 그대로 저장해요.
// ─────────────────────────────────────────
async function fetchAllMedicine() {
  if (!MEDICINE_API_KEY) {
    throw new Error('MEDICINE_API_KEY 환경변수가 없어요. GitHub Secrets 등록을 확인해 주세요.');
  }

  const baseUrl = 'https://apis.data.go.kr/1471000/DrbEasyDrugInfoService/getDrbEasyDrugList';

  const firstUrl =
    `${baseUrl}?serviceKey=${encodeURIComponent(MEDICINE_API_KEY)}` +
    `&pageNo=1&numOfRows=${PAGE_SIZE}&type=json`;
  const first = await fetchJsonWithRetry(firstUrl);

  if (!first.header || first.header.resultCode !== '00') {
    throw new Error('약효능·복용법 API 응답이 비정상이에요: ' + JSON.stringify(first.header));
  }

  const totalCount = parseInt(first.body.totalCount, 10) || 0;
  const totalPages = Math.max(Math.ceil(totalCount / PAGE_SIZE), 1);

  let allItems = normalizeItems(first.body.items);
  console.log(`   [약효능·복용법] 1/${totalPages} 페이지 받음 (누적 ${allItems.length}건)`);

  for (let pageNo = 2; pageNo <= totalPages; pageNo++) {
    const pageUrl =
      `${baseUrl}?serviceKey=${encodeURIComponent(MEDICINE_API_KEY)}` +
      `&pageNo=${pageNo}&numOfRows=${PAGE_SIZE}&type=json`;
    const data = await fetchJsonWithRetry(pageUrl);
    allItems = allItems.concat(normalizeItems(data.body && data.body.items));
    console.log(`   [약효능·복용법] ${pageNo}/${totalPages} 페이지 받음 (누적 ${allItems.length}건)`);
    await sleep(200);
  }

  return { items: allItems, totalCount };
}

// ─────────────────────────────────────────
// 🥗 식품영양정보 (식품의약품안전처) 전체 받아오기
// (한글 설명) 화면에서 실제로 쓰는 필드만 뽑아서 저장해요(원본은 AMT_NUM1~157까지
//             157개나 있는데, health.html의 searchNutrition 함수를 직접 확인해보니
//             실제로 화면에 쓰는 건 12개뿐이었어요 - 나머지를 다 저장하면 용량 낭비예요).
// ─────────────────────────────────────────
const NUTRITION_FIELDS_TO_KEEP = [
  'FOOD_CD',       // 식품 고유코드
  'FOOD_NM_KR',    // 식품명
  'FOOD_CAT1_NM',  // 식품 대분류명
  'SERVING_SIZE',  // 영양성분 기준량
  'AMT_NUM1',      // 열량(kcal)
  'AMT_NUM3',      // 단백질(g)
  'AMT_NUM4',      // 지방(g)
  'AMT_NUM6',      // 탄수화물(g)
  'AMT_NUM7',       // 당류(g)
  'AMT_NUM13',     // 나트륨(mg)
  'SUB_REF_NAME',  // 출처
  'MAKER_NM',      // 업체명
];

function trimNutritionItem(it) {
  const out = {};
  NUTRITION_FIELDS_TO_KEEP.forEach((field) => {
    out[field] = it[field] || '';
  });
  return out;
}

async function fetchAllNutrition() {
  if (!FOOD_NUTRITION_API_KEY) {
    throw new Error('FOOD_NUTRITION_API_KEY 환경변수가 없어요. GitHub Secrets 등록을 확인해 주세요.');
  }

  const baseUrl = 'https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo02/getFoodNtrCpntDbInq02';
  // (한글 설명) DB_CLASS_NM=품목대표 필터는 health.js의 기존 실시간 호출 로직과 똑같이
  //             적용해요(브랜드 상용제품 수천 건이 섞여 나오는 걸 막기 위한 필터, 기존
  //             health.js 주석에 이미 설명되어 있던 내용을 그대로 유지).
  const commonParams = `&DB_CLASS_NM=${encodeURIComponent('품목대표')}&type=json`;

  const firstUrl =
    `${baseUrl}?serviceKey=${encodeURIComponent(FOOD_NUTRITION_API_KEY)}` +
    `&pageNo=1&numOfRows=${PAGE_SIZE}${commonParams}`;
  const first = await fetchJsonWithRetry(firstUrl);

  if (!first.header || first.header.resultCode !== '00') {
    throw new Error('식품영양정보 API 응답이 비정상이에요: ' + JSON.stringify(first.header));
  }

  const totalCount = parseInt(first.body.totalCount, 10) || 0;
  const totalPages = Math.max(Math.ceil(totalCount / PAGE_SIZE), 1);

  let allItems = normalizeItems(first.body.items).map(trimNutritionItem);
  console.log(`   [식품영양정보] 1/${totalPages} 페이지 받음 (누적 ${allItems.length}건)`);

  for (let pageNo = 2; pageNo <= totalPages; pageNo++) {
    const pageUrl =
      `${baseUrl}?serviceKey=${encodeURIComponent(FOOD_NUTRITION_API_KEY)}` +
      `&pageNo=${pageNo}&numOfRows=${PAGE_SIZE}${commonParams}`;
    const data = await fetchJsonWithRetry(pageUrl);
    allItems = allItems.concat(normalizeItems(data.body && data.body.items).map(trimNutritionItem));
    console.log(`   [식품영양정보] ${pageNo}/${totalPages} 페이지 받음 (누적 ${allItems.length}건)`);
    await sleep(200);
  }

  return { items: allItems, totalCount };
}

// (한글 설명) 안전장치 - 받아온 개수가 정부 API가 알려준 전체 개수의 90%보다 적으면,
//             중간에 뭔가 실패한 것으로 보고 저장을 건너뛰어요. "오늘 데이터가 없는 것"보다
//             "어제 저장해둔 정상 데이터가 계속 남아있는 것"이 훨씬 안전해요.
function isSafeToSave(items, totalCount) {
  if (totalCount === 0) return false;
  return items.length >= totalCount * 0.9;
}

// ─────────────────────────────────────────
// 실행부
// ─────────────────────────────────────────
async function main() {
  const outDir = path.resolve('api/data');
  await fs.mkdir(outDir, { recursive: true });

  let hadError = false;

  console.log('💊 약효능·복용법 데이터 받아오는 중...');
  try {
    const medicine = await fetchAllMedicine();
    console.log(`   → 총 ${medicine.items.length}건 받음 (정부 API가 알려준 전체: ${medicine.totalCount}건)`);
    if (isSafeToSave(medicine.items, medicine.totalCount)) {
      await fs.writeFile(path.join(outDir, 'medicine-data.json'), JSON.stringify(medicine.items), 'utf8');
      console.log('   ✅ api/data/medicine-data.json 저장 완료');
    } else {
      console.error('   ❌ 받아온 개수가 너무 적어서(90% 미만) 저장을 건너뛰어요. 기존 파일 유지.');
      hadError = true;
    }
  } catch (err) {
    console.error('   🔥 약효능·복용법 받아오기 실패:', err.message);
    hadError = true;
  }

  console.log('🥗 식품영양정보 데이터 받아오는 중...');
  try {
    const nutrition = await fetchAllNutrition();
    console.log(`   → 총 ${nutrition.items.length}건 받음 (정부 API가 알려준 전체: ${nutrition.totalCount}건)`);
    if (isSafeToSave(nutrition.items, nutrition.totalCount)) {
      await fs.writeFile(path.join(outDir, 'nutrition-data.json'), JSON.stringify(nutrition.items), 'utf8');
      console.log('   ✅ api/data/nutrition-data.json 저장 완료');
    } else {
      console.error('   ❌ 받아온 개수가 너무 적어서(90% 미만) 저장을 건너뛰어요. 기존 파일 유지.');
      hadError = true;
    }
  } catch (err) {
    console.error('   🔥 식품영양정보 받아오기 실패:', err.message);
    hadError = true;
  }

  if (hadError) {
    // (한글 설명) 문제가 있었다는 걸 GitHub Actions 화면에서 빨간색으로 바로 알 수 있게
    //             종료코드를 1로 설정해요(단, 정상 처리된 파일은 이미 저장됐으니 그대로 둬요).
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('🔥 스크립트 실행 중 예상 못한 오류:', err);
  process.exitCode = 1;
});
