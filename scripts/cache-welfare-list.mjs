// 파일명: scripts/cache-welfare-list.mjs
// 역할: GitHub Actions가 하루 1번 실행해요.
//       사회보장정보원 복지시설 "목록"(이름·종류·지역, 전체 27,159건)을 통째로 받아와
//       api/data/welfare-list.json에 저장해요. 주소·전화번호는 이 파일이 아니라
//       scripts/cache-welfare-detail.mjs가 따로 하루 9,000건씩 나눠서 채워요
//       (시설 1개당 정부 API를 1번씩 더 불러야 해서, 27,159번을 하루에 다 하면 한도를
//       넘기 때문이에요 - 목록은 이런 문제가 없어서 매일 전체를 다시 받아도 안전해요).

import fs from 'node:fs/promises';
import path from 'node:path';

const WELFARE_API_KEY = process.env.WELFARE_API_KEY;

// (한글 설명) 정확한 상한선을 아직 확인 안 해서, 넉넉한 값부터 시도하고 안 되면
//             점점 줄여서 재시도해요(서민금융교육 캐싱 때 썼던 것과 같은 안전한 방식).
const PAGE_SIZE_CANDIDATES = [500, 100, 50];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// XML 문자열에서 <item>...</item> 블록들을 객체 배열로 변환해요.
// (한글 설명) benefit.js의 parseXmlItems 함수와 완전히 같은 방식이에요.
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

function extractTotalCount(xml) {
  const m = xml.match(/<totalCount>(\d+)<\/totalCount>/);
  return m ? parseInt(m[1], 10) : 0;
}

function extractResultCode(xml) {
  const m = xml.match(/<resultCode>([^<]*)<\/resultCode>/);
  return m ? m[1] : null;
}

async function fetchPageXml(pageNo, numOfRows) {
  const key = encodeURIComponent(WELFARE_API_KEY);
  const url =
    `https://apis.data.go.kr/B554287/sclWlfrFcltInfoInqirService1/getFcltListInfoInqire` +
    `?serviceKey=${key}&numOfRows=${numOfRows}&pageNo=${pageNo}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('HTTP 상태코드 ' + r.status);
  return r.text();
}

// (한글 설명) 후보 페이지 크기 중 실제로 되는 걸 찾아요.
async function findWorkingPageSize() {
  for (const size of PAGE_SIZE_CANDIDATES) {
    const xml = await fetchPageXml(1, size);
    const resultCode = extractResultCode(xml);
    if (resultCode === '00') {
      return { pageSize: size, firstPageXml: xml };
    }
    console.log(`   numOfRows=${size} 는 거부됨(resultCode=${resultCode}), 더 작은 값으로 재시도...`);
  }
  throw new Error('어떤 페이지 크기로도 정상 응답을 못 받았어요.');
}

// (한글 설명) 화면(benefit.html)에서 실제로 쓰는 필드 + 상세조회에 필요한 필드만 남겨요.
//             fcltKindCd는 화면엔 안 보이지만, 나중에 상세정보(주소·전화번호) 조회할 때
//             꼭 필요한 값이라 같이 저장해둬요.
const FIELDS_TO_KEEP = ['fcltCd', 'fcltKindCd', 'fcltKindNm', 'fcltNm', 'jrsdSggCd', 'jrsdSggNm'];
function trimItem(it) {
  const out = {};
  FIELDS_TO_KEEP.forEach((f) => { out[f] = it[f] !== undefined ? it[f] : ''; });
  return out;
}

async function fetchAllList() {
  if (!WELFARE_API_KEY) {
    throw new Error('WELFARE_API_KEY 환경변수가 없어요. GitHub Secrets 등록을 확인해 주세요.');
  }

  const { pageSize, firstPageXml } = await findWorkingPageSize();
  const totalCount = extractTotalCount(firstPageXml);
  const totalPages = Math.max(Math.ceil(totalCount / pageSize), 1);

  let allItems = parseXmlItems(firstPageXml, 'item').map(trimItem);
  console.log(`   1/${totalPages} 페이지 받음 (누적 ${allItems.length}/${totalCount}건, 페이지당 ${pageSize}건)`);

  for (let pageNo = 2; pageNo <= totalPages; pageNo++) {
    const xml = await fetchPageXml(pageNo, pageSize);
    allItems = allItems.concat(parseXmlItems(xml, 'item').map(trimItem));
    console.log(`   ${pageNo}/${totalPages} 페이지 받음 (누적 ${allItems.length}/${totalCount}건)`);
    await sleep(150);
  }

  // (한글 설명) 혹시 페이지 경계에서 항목이 중복으로 올 수도 있어서, fcltCd 기준으로
  //             한 번 더 중복을 제거해줘요(안전장치).
  const seen = new Set();
  const deduped = allItems.filter((it) => {
    if (!it.fcltCd) return true;
    if (seen.has(it.fcltCd)) return false;
    seen.add(it.fcltCd);
    return true;
  });

  return { items: deduped, totalCount };
}

function isSafeToSave(items, totalCount) {
  if (totalCount === 0) return false;
  return items.length >= totalCount * 0.9;
}

async function main() {
  const outDir = path.resolve('api/data');
  await fs.mkdir(outDir, { recursive: true });

  console.log('🏥 복지시설 목록 받아오는 중...');
  try {
    const result = await fetchAllList();
    console.log(`   → 총 ${result.items.length}건 받음 (정부 API가 알려준 전체: ${result.totalCount}건)`);
    if (isSafeToSave(result.items, result.totalCount)) {
      await fs.writeFile(
        path.join(outDir, 'welfare-list.json'),
        JSON.stringify(result.items),
        'utf8'
      );
      console.log('   ✅ api/data/welfare-list.json 저장 완료');
    } else {
      console.error('   ❌ 받아온 개수가 너무 적어서(90% 미만) 저장을 건너뛰어요. 기존 파일 유지.');
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('   🔥 복지시설 목록 받아오기 실패:', err.message);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('🔥 스크립트 실행 중 예상 못한 오류:', err);
  process.exitCode = 1;
});
