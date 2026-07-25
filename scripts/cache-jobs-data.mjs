// 파일명: scripts/cache-jobs-data.mjs
// 역할: GitHub Actions가 하루 1번 실행해요.
//       노인일자리 채용공고 전체(76만 건 이상)를 다 훑어서, 그중 "접수중"인 공고만
//       골라내 api/data/jobs-cache.json에 매일 통째로 새로 저장해요(어제 것을 완전히
//       지우고 새로 채움 - 그래서 항상 "오늘 기준 최신 상태"를 유지해요, 복지시설처럼
//       조금씩 채워나가는 방식이 아니에요). 전체를 다 훑는 이유는, "최근 등록된 것만"
//       보면 오래전에 등록됐지만 접수기간이 길어서 여전히 접수중인 공고를 놓칠 수
//       있기 때문이에요(2026-07-24 실제로 이 문제를 발견해서 방식을 바꿨어요).
//       이 방식으로 지역검색(regionSearch)과 기본 목록 조회 둘 다 정부 서버를 매번
//       실시간으로 안 부르고 캐시에서 바로 처리할 수 있어요.

import fs from 'node:fs/promises';
import path from 'node:path';

const SENIOR_API_KEY = process.env.SENIOR_API_KEY;

// (한글 설명) 2026-07-24 실제 테스트로 500건은 정상 동작 확인됨. 1000건은 아직
//             테스트 안 해봐서, 검증된 500건으로 안전하게 진행해요.
const PAGE_SIZE = 500;
// (한글 설명) [3차 수정 2026-07-24] "최신순으로 훑다가 안 나오면 멈추기" 방식으로는
//             385건만 잡혔는데, 다시 생각해보니 "오래전에 등록됐지만 접수기간이 길어서
//             여전히 접수중인" 공고를 놓칠 수 있다는 걸 깨달았어요(경아오빠 지적).
//             그래서 방식을 바꿔서 "전체를 다 훑어서 접수중인 것만 골라내는" 방식으로
//             바꿨어요. 전체 76만 건을 500건씩 봐도 약 1,523번이면 되고, 이건 하루
//             한도(10,000회)의 15%뿐이라 완전히 안전해요.
//             [주의] 예전에 일자리 지역검색을 만들 때 이미 겪었던 교훈을 그대로
//             반영했어요(메모리 기록): (1) 뒷페이지로 갈수록 정부 서버 응답이 훨씬
//             느려짐 (2) 한 번에 50개씩 동시요청하면 너무 많아서 서로 방해되는 듯함.
//             그래서 동시요청 개수를 여유있게 낮추고(15개), 페이지 하나가 너무 오래
//             걸리면 그 페이지만 포기하고 넘어가도록(10초 타임아웃) 만들었어요.
const CONCURRENCY = 15; // 한 번에 동시에 몇 페이지씩 요청할지 (50은 너무 많았다는 교훈 반영)
const BATCH_PAUSE_MS = 300;
const PAGE_TIMEOUT_MS = 10000; // 페이지 하나가 10초 넘게 걸리면 포기하고 다음으로

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPageXmlWithTimeout(url, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const r = await fetch(url, { signal: controller.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.text();
  } finally {
    clearTimeout(timer);
  }
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

  // (한글 설명) 먼저 1페이지만 받아서 "전체 몇 건인지(totalCount)"를 확인하고,
  //             거기서 전체 페이지 수를 계산해요.
  const firstUrl =
    `https://apis.data.go.kr/B552474/SenuriService/getJobList` +
    `?serviceKey=${encodeURIComponent(SENIOR_API_KEY)}&pageNo=1&numOfRows=${PAGE_SIZE}`;
  let firstXml;
  try {
    firstXml = await fetchPageXmlWithTimeout(firstUrl, PAGE_TIMEOUT_MS);
  } catch (err) {
    console.error('🔥 1페이지 받아오기 실패:', err.message);
    process.exitCode = 1;
    return;
  }
  const totalCountMatch = firstXml.match(/<totalCount>(\d+)<\/totalCount>/);
  const totalCount = totalCountMatch ? parseInt(totalCountMatch[1], 10) : 0;
  if (totalCount === 0) {
    console.error('❌ 전체 건수(totalCount)를 확인할 수 없어요. 저장을 건너뛰고 기존 파일을 유지해요.');
    process.exitCode = 1;
    return;
  }
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  console.log(`💼 전체 ${totalCount}건(${totalPages}페이지)을 전부 훑어서 접수중인 공고만 골라낼게요.`);
  console.log(`   (동시요청 ${CONCURRENCY}개씩, 한 페이지가 ${PAGE_TIMEOUT_MS / 1000}초 넘게 걸리면 그 페이지만 포기하고 넘어가요)`);

  let allItems = parsePage(firstXml);
  let successPages = 1;
  let failedPages = 0;
  const pageNumbers = [];
  for (let p = 2; p <= totalPages; p++) pageNumbers.push(p);

  for (let i = 0; i < pageNumbers.length; i += CONCURRENCY) {
    const chunk = pageNumbers.slice(i, i + CONCURRENCY);
    const results = await Promise.all(chunk.map(async (pageNo) => {
      const url =
        `https://apis.data.go.kr/B552474/SenuriService/getJobList` +
        `?serviceKey=${encodeURIComponent(SENIOR_API_KEY)}&pageNo=${pageNo}&numOfRows=${PAGE_SIZE}`;
      try {
        const xml = await fetchPageXmlWithTimeout(url, PAGE_TIMEOUT_MS);
        return { ok: true, items: parsePage(xml) };
      } catch (e) {
        return { ok: false, items: [] };
      }
    }));

    results.forEach((r) => {
      if (r.ok) { successPages++; } else { failedPages++; }
      allItems = allItems.concat(r.items);
    });

    const donePages = Math.min(i + CONCURRENCY, pageNumbers.length) + 1;
    if (donePages % 150 < CONCURRENCY || donePages === totalPages) {
      console.log(`   ${donePages}/${totalPages}페이지 진행 중... (누적 접수중 ${allItems.length}건, 실패 ${failedPages}페이지)`);
    }

    await sleep(BATCH_PAUSE_MS);
  }

  console.log(`📊 완료: ${successPages}/${totalPages}페이지 성공(실패 ${failedPages}페이지), 접수중 공고 ${allItems.length}건`);

  // (한글 설명) 안전장치 - 성공한 페이지가 너무 적으면(예: 정부 서버 전체 장애)
  //             저장을 건너뛰고 어제 파일을 그대로 유지해요.
  if (successPages < totalPages * 0.8) {
    console.error(`❌ 성공한 페이지 비율이 너무 낮아요(${successPages}/${totalPages}). 저장을 건너뛰고 기존 파일을 유지해요.`);
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
