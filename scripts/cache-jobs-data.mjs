// 파일명: scripts/cache-jobs-data.mjs
// 역할: GitHub Actions가 하루 1번 실행해요.
//       노인일자리 채용공고는 전체 76만 건이 넘고 계속 바뀌는(마감/신규등록) 데이터라서,
//       "전체를 다 캐싱"하는 대신 "최신 등록순 10만 건 중 접수중인 것만"을 매일 통째로
//       새로 받아와 api/data/jobs-cache.json에 덮어써요(어제 것을 완전히 지우고 새로
//       채움 - 그래서 항상 "오늘 기준 최신 상태"를 유지해요, 복지시설처럼 조금씩
//       채워나가는 방식이 아니에요).
//       이 방식으로 지역검색(regionSearch)과 기본 목록 조회 둘 다 정부 서버를 매번
//       실시간으로 안 부르고 캐시에서 바로 처리할 수 있어요.

import fs from 'node:fs/promises';
import path from 'node:path';

const SENIOR_API_KEY = process.env.SENIOR_API_KEY;

// (한글 설명) 2026-07-24 실제 테스트로 500건은 정상 동작 확인됨. 1000건은 아직
//             테스트 안 해봐서, 검증된 500건으로 안전하게 진행해요.
const PAGE_SIZE = 500;
// (한글 설명) 200페이지 × 500건 = 최신 10만 건. 하루 호출 200번이면 한도(10,000)의
//             2%뿐이라 훨씬 늘려도 안전하지만, "최신순 정렬"이라는 확실한 문서 근거가
//             없어서(관찰로 추정한 것) 일단 10만 건으로 시작하고, 나중에 지역별로
//             결과가 너무 적으면 이 숫자를 늘리는 걸 검토하기로 함(경아오빠 2026-07-24).
const TOTAL_PAGES = 200;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, retries = 2) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error('HTTP 상태코드 ' + r.status);
      return await r.text();
    } catch (err) {
      lastError = err;
      if (attempt < retries) await sleep(1500);
    }
  }
  throw lastError;
}

function get(itemXml, tag) {
  const m = itemXml.match(new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)<\\/' + tag + '>'));
  return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : '';
}

const WORK_TYPE_MAP = { CM0101: '정규직', CM0102: '계약직', CM0103: '파트타임', CM0104: '일용직', CM0105: '시간제', CM0106: '기타' };

// (한글 설명) 화면(job.html)에서 실제로 쓰는 필드만 뽑아서 저장해요 + "접수중"인
//             공고만 남겨요(마감된 건 화면에 어차피 안 보여주니까 저장할 필요가 없어요
//             - 캐시 파일 용량도 줄어들어요).
function parsePage(xml) {
  const itemMatches = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
  const items = [];
  itemMatches.forEach((itemXml) => {
    const deadline = get(itemXml, 'deadline');
    if (deadline !== '접수중') return; // 마감된 공고는 캐시에 안 넣어요
    const rawCode = get(itemXml, 'emplymShp') || get(itemXml, 'emplymShpNm');
    items.push({
      id: get(itemXml, 'jobId'),
      title: get(itemXml, 'recrtTitle'),
      company: get(itemXml, 'oranNm'),
      workType: WORK_TYPE_MAP[rawCode] || rawCode || '-',
      location: get(itemXml, 'workPlcNm'),
      startDate: get(itemXml, 'frDd'),
      endDate: get(itemXml, 'toDd'),
    });
  });
  return items;
}

async function main() {
  if (!SENIOR_API_KEY) {
    console.error('🔥 SENIOR_API_KEY 환경변수가 없어요. GitHub Secrets 등록을 확인해 주세요.');
    process.exitCode = 1;
    return;
  }

  const outDir = path.resolve('api/data');
  await fs.mkdir(outDir, { recursive: true });

  console.log(`💼 최신 채용공고 ${TOTAL_PAGES}페이지(최대 ${TOTAL_PAGES * PAGE_SIZE}건) 받아오는 중...`);

  let allItems = [];
  let rawTotal = 0;

  try {
    for (let pageNo = 1; pageNo <= TOTAL_PAGES; pageNo++) {
      const url =
        `https://apis.data.go.kr/B552474/SenuriService/getJobList` +
        `?serviceKey=${encodeURIComponent(SENIOR_API_KEY)}&pageNo=${pageNo}&numOfRows=${PAGE_SIZE}`;
      const xml = await fetchWithRetry(url);
      const pageItems = parsePage(xml);
      rawTotal += (xml.match(/<item>/g) || []).length;
      allItems = allItems.concat(pageItems);

      if (pageNo % 20 === 0 || pageNo === TOTAL_PAGES) {
        console.log(`   ${pageNo}/${TOTAL_PAGES} 페이지 완료 (누적 원본 ${rawTotal}건 중 접수중 ${allItems.length}건)`);
      }
      await sleep(150);
    }
  } catch (err) {
    console.error('🔥 받아오기 중 오류:', err.message);
    process.exitCode = 1;
    return;
  }

  // (한글 설명) 안전장치 - 받아온 원본 개수가 너무 적으면(예: 정부 서버 문제로 페이지가
  //             거의 다 비어있게 왔으면) 저장을 건너뛰고 어제 파일을 그대로 유지해요.
  const expectedMin = TOTAL_PAGES * PAGE_SIZE * 0.5; // 원본 기준 절반 이상은 와야 정상으로 판단
  if (rawTotal < expectedMin) {
    console.error(`❌ 받아온 원본 개수(${rawTotal}건)가 너무 적어요(기대치 ${expectedMin}건 이상). 저장을 건너뛰고 기존 파일을 유지해요.`);
    process.exitCode = 1;
    return;
  }

  await fs.writeFile(path.join(outDir, 'jobs-cache.json'), JSON.stringify(allItems), 'utf8');
  console.log(`✅ api/data/jobs-cache.json 저장 완료 (접수중 공고 ${allItems.length}건)`);
}

main().catch((err) => {
  console.error('🔥 스크립트 실행 중 예상 못한 오류:', err);
  process.exitCode = 1;
});
