// 파일명: scripts/cache-finance-data.mjs
// 역할: GitHub Actions가 하루 1번 실행해요.
//       서민금융진흥원 "서민금융교육콘텐츠" 정부 API 전체(322건 확인됨, 2026-07-24 기준)를
//       미리 받아와서 api/data/finance-data.json 파일로 저장해요.
//       (api/benefit.js는 정부 서버를 매번 부르지 않고, 이 저장된 파일에서 바로 꺼내 써요)
//
// (한글 설명) 이 정부 API는 XML로만 응답해요(health.js의 medicine/nutrition과 달리 JSON
//             옵션이 없음, 기존 api/benefit.js 코드에서 이미 확인된 내용). 그래서 XML을
//             직접 읽어서 처리해요.

import fs from 'node:fs/promises';
import path from 'node:path';

const FINANCE_EDU_KEY = process.env.FINANCE_EDU_KEY;

// (한글 설명) [안전하게 설계] 이 API가 numOfRows를 한 번에 몇 건까지 허용하는지 아직
//             정확히 확인 못 했어요(기존 코드가 항상 10으로 고정해서 써왔기 때문). 그래서
//             넉넉해 보이는 100건으로 먼저 시도하고, 혹시 정부 서버가 거부하면(에러 응답)
//             더 작은 값(50→10 순서)으로 자동으로 줄여서 재시도해요.
const PAGE_SIZE_CANDIDATES = [100, 50, 10];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// XML 문자열에서 <item>...</item> 블록들을 객체 배열로 변환해요.
// (한글 설명) api/benefit.js에 있는 parseXmlItems 함수와 완전히 같은 방식이에요
//             (같은 정부 API를 다루니까 파싱 방식도 똑같이 맞춰야 해요).
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
  const key = encodeURIComponent(FINANCE_EDU_KEY);
  const url =
    `https://apis.data.go.kr/B553701/SeominFinancialEducationContentsInfoService/getFinancialEducationContentsInfo` +
    `?serviceKey=${key}&pageNo=${pageNo}&numOfRows=${numOfRows}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('HTTP 상태코드 ' + r.status);
  return r.text();
}

// (한글 설명) 후보 페이지 크기 중 실제로 되는 걸 찾아요. 100건이 거부되면 50건, 그것도
//             안 되면 10건으로 - 이렇게 하면 정확한 상한선을 몰라도 안전하게 동작해요.
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

async function fetchAllFinance() {
  if (!FINANCE_EDU_KEY) {
    throw new Error('FINANCE_EDU_KEY 환경변수가 없어요. GitHub Secrets 등록을 확인해 주세요.');
  }

  const { pageSize, firstPageXml } = await findWorkingPageSize();
  const totalCount = extractTotalCount(firstPageXml);
  const totalPages = Math.max(Math.ceil(totalCount / pageSize), 1);

  let allItems = parseXmlItems(firstPageXml, 'item');
  console.log(`   [서민금융교육] 1/${totalPages} 페이지 받음 (누적 ${allItems.length}건, 페이지당 ${pageSize}건)`);

  for (let pageNo = 2; pageNo <= totalPages; pageNo++) {
    const xml = await fetchPageXml(pageNo, pageSize);
    allItems = allItems.concat(parseXmlItems(xml, 'item'));
    console.log(`   [서민금융교육] ${pageNo}/${totalPages} 페이지 받음 (누적 ${allItems.length}건)`);
    await sleep(200);
  }

  // (한글 설명) 혹시 정부 API가 페이지 경계에서 항목을 중복으로 줄 수도 있어서,
  //             idNo(고유번호) 기준으로 중복을 한 번 더 제거해줘요(안전장치).
  const seen = new Set();
  const deduped = allItems.filter((it) => {
    if (!it.idNo) return true; // idNo가 없으면 그냥 통과(드문 경우)
    if (seen.has(it.idNo)) return false;
    seen.add(it.idNo);
    return true;
  });

  return { items: deduped, totalCount };
}

// (한글 설명) 안전장치 - 받아온 개수가 정부 API가 알려준 전체 개수의 90%보다 적으면,
//             중간에 뭔가 실패한 것으로 보고 저장을 건너뛰어요.
function isSafeToSave(items, totalCount) {
  if (totalCount === 0) return false;
  return items.length >= totalCount * 0.9;
}

async function main() {
  const outDir = path.resolve('api/data');
  await fs.mkdir(outDir, { recursive: true });

  console.log('💰 서민금융교육 콘텐츠 받아오는 중...');
  try {
    const finance = await fetchAllFinance();
    console.log(`   → 총 ${finance.items.length}건 받음 (정부 API가 알려준 전체: ${finance.totalCount}건)`);
    if (isSafeToSave(finance.items, finance.totalCount)) {
      await fs.writeFile(path.join(outDir, 'finance-data.json'), JSON.stringify(finance.items), 'utf8');
      console.log('   ✅ api/data/finance-data.json 저장 완료');
    } else {
      console.error('   ❌ 받아온 개수가 너무 적어서(90% 미만) 저장을 건너뛰어요. 기존 파일 유지.');
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('   🔥 서민금융교육 받아오기 실패:', err.message);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('🔥 스크립트 실행 중 예상 못한 오류:', err);
  process.exitCode = 1;
});
