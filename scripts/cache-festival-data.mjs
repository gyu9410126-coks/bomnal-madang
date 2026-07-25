// 파일명: scripts/cache-festival-data.mjs
// 역할: GitHub Actions가 하루 1번 실행해요.
//       전국문화축제표준데이터(약 1,300여 건, 분기별 갱신) 전체를 통째로 받아와
//       api/data/festival-cache.json에 저장해요(어제 것을 완전히 덮어씀).
//       지금까지는 Vercel의 12시간 HTTP 캐싱(Cache-Control)만 걸려있었는데, 이건
//       "같은 지역을 12시간 안에 또 검색해야만" 빨라지는 약한 캐싱이었어요. 오늘
//       다른 카테고리(병원·복지·일자리)와 통일해서, 처음 검색하는 사람도 항상
//       빠르게 나오도록 파일로 미리 저장해두는 방식으로 바꿔요.
//       [중요] "축제 종료일이 지났는지"는 캐싱하는 시점이 아니라 사용자가 실제로
//       검색하는 "오늘" 기준으로 걸러야 하기 때문에, 원본 필드(시작일/종료일)를
//       그대로 저장해두고, 화면에 보여줄 때(culture.js) 그날그날 걸러요.

import fs from 'node:fs/promises';
import path from 'node:path';

const FESTIVAL_STD_API_KEY = process.env.FESTIVAL_STD_API_KEY;
const ENDPOINT = 'https://api.data.go.kr/openapi/tn_pubr_public_cltur_fstvl_api';
const PAGE_SIZE = 1000;

// (한글 설명) 화면에서 실제로 쓰는 원본 필드만 뽑아서 저장해요. culture.js가
//             하던 것과 완전히 같은 필드명을 그대로 유지해요(가공은 요청 시점에).
const FIELDS_TO_KEEP = [
  'fstvlNm', 'opar', 'fstvlStartDate', 'fstvlEndDate',
  'rdnmadr', 'latitude', 'longitude', 'homepageUrl', 'phoneNumber', 'fstvlCo',
];

function trimItem(it) {
  const out = {};
  FIELDS_TO_KEEP.forEach((f) => { out[f] = it[f] !== undefined ? it[f] : ''; });
  return out;
}

async function fetchPage(pageNo) {
  const url = `${ENDPOINT}?serviceKey=${encodeURIComponent(FESTIVAL_STD_API_KEY)}&pageNo=${pageNo}&numOfRows=${PAGE_SIZE}&type=json`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const json = await r.json();
  const body = json && json.response && json.response.body;
  if (!body) throw new Error('응답 형식이 예상과 달라요(response.body 없음)');
  const totalCount = parseInt(body.totalCount, 10) || 0;
  const items = body.items;
  let list = [];
  if (typeof items === 'string') list = [];
  else if (Array.isArray(items)) list = items;
  else if (items && items.item) list = Array.isArray(items.item) ? items.item : [items.item];
  return { list, totalCount };
}

function isSafeToSave(items, totalCount) {
  if (totalCount === 0) return false;
  return items.length >= totalCount * 0.9;
}

async function main() {
  if (!FESTIVAL_STD_API_KEY) {
    console.error('🔥 FESTIVAL_STD_API_KEY 환경변수가 없어요. GitHub Secrets 등록을 확인해 주세요.');
    process.exitCode = 1;
    return;
  }

  const outDir = path.resolve('api/data');
  await fs.mkdir(outDir, { recursive: true });

  console.log('🎪 전국 지역축제 데이터 받아오는 중...');
  try {
    const first = await fetchPage(1);
    const totalCount = first.totalCount;
    const totalPages = Math.max(Math.ceil(totalCount / PAGE_SIZE), 1);
    let allItems = first.list.map(trimItem);
    console.log(`   1/${totalPages} 페이지 완료 (누적 ${allItems.length}/${totalCount}건)`);

    for (let pageNo = 2; pageNo <= totalPages; pageNo++) {
      const page = await fetchPage(pageNo);
      allItems = allItems.concat(page.list.map(trimItem));
      console.log(`   ${pageNo}/${totalPages} 페이지 완료 (누적 ${allItems.length}/${totalCount}건)`);
    }

    console.log(`   → 총 ${allItems.length}건 받음 (정부 API가 알려준 전체: ${totalCount}건)`);
    if (isSafeToSave(allItems, totalCount)) {
      await fs.writeFile(path.join(outDir, 'festival-cache.json'), JSON.stringify(allItems), 'utf8');
      console.log('   ✅ api/data/festival-cache.json 저장 완료');
    } else {
      console.error('   ❌ 받아온 개수가 너무 적어서(90% 미만) 저장을 건너뛰어요. 기존 파일 유지.');
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('   🔥 받아오기 실패:', err.message);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('🔥 스크립트 실행 중 예상 못한 오류:', err);
  process.exitCode = 1;
});
