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
// (한글 설명) [수정 2026-07-24] 처음엔 "고정 200페이지"를 다 훑는 방식이었는데, 실제
//             실행해보니 접수중 공고는 앞쪽 몇십 페이지 안에 거의 다 몰려있고, 그 뒤로는
//             전부 마감된 옛날 공고뿐이었어요(80~120페이지 구간에서 접수중 공고가 0건
//             늘어남 - 2026-07-24 실행 로그로 확인됨). 게다가 뒷페이지로 갈수록 정부
//             서버 응답이 느려져서, 필요도 없는 페이지를 훑느라 시간만 오래 걸렸어요.
//             그래서 "접수중 공고가 연속으로 안 나오면 알아서 멈추기" 방식으로 바꿨어요.
const MAX_PAGES = 200; // 혹시 몰라 안전장치로 남겨둔 최대 페이지 수(보통 이 전에 멈춰요)
const STOP_AFTER_EMPTY_PAGES = 10; // 접수중 공고가 연속 10페이지 동안 0건이면 그만 찾아요

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

  console.log(`💼 최신 채용공고 받아오는 중... (접수중 공고가 연속 ${STOP_AFTER_EMPTY_PAGES}페이지 동안 안 나오면 자동으로 멈춰요, 최대 ${MAX_PAGES}페이지)`);

  let allItems = [];
  let rawTotal = 0;
  let emptyStreak = 0; // 접수중 공고가 0건이었던 페이지가 연속 몇 번인지
  let lastPageReached = 0;

  try {
    for (let pageNo = 1; pageNo <= MAX_PAGES; pageNo++) {
      const url =
        `https://apis.data.go.kr/B552474/SenuriService/getJobList` +
        `?serviceKey=${encodeURIComponent(SENIOR_API_KEY)}&pageNo=${pageNo}&numOfRows=${PAGE_SIZE}`;
      const xml = await fetchWithRetry(url);
      const pageItems = parsePage(xml);
      rawTotal += (xml.match(/<item>/g) || []).length;
      allItems = allItems.concat(pageItems);
      lastPageReached = pageNo;

      if (pageItems.length === 0) {
        emptyStreak++;
      } else {
        emptyStreak = 0;
      }

      if (pageNo % 10 === 0 || pageNo === MAX_PAGES) {
        console.log(`   ${pageNo}페이지 완료 (누적 원본 ${rawTotal}건 중 접수중 ${allItems.length}건, 최근 연속 빈페이지 ${emptyStreak}회)`);
      }

      if (emptyStreak >= STOP_AFTER_EMPTY_PAGES) {
        console.log(`   ⏹️ 접수중 공고가 연속 ${STOP_AFTER_EMPTY_PAGES}페이지 동안 안 나와서 ${pageNo}페이지에서 멈춰요.`);
        break;
      }

      await sleep(150);
    }
  } catch (err) {
    console.error('🔥 받아오기 중 오류:', err.message);
    process.exitCode = 1;
    return;
  }

  console.log(`📊 실제로 훑은 페이지: ${lastPageReached}페이지 (원본 ${rawTotal}건 중 접수중 ${allItems.length}건)`);

  // (한글 설명) 안전장치 - 너무 일찍(예: 정부 서버 첫 페이지부터 이상 응답) 멈췄으면
  //             뭔가 잘못된 걸로 보고 저장을 건너뛰고 어제 파일을 유지해요.
  if (lastPageReached < 3 || allItems.length === 0) {
    console.error('❌ 너무 일찍 멈췄거나 접수중 공고가 0건이에요. 저장을 건너뛰고 기존 파일을 유지해요.');
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
