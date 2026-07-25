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
// (한글 설명) [4차 수정 2026-07-24] 동시요청 15개로 시도했더니 1,522/1,523페이지가
//             전부 실패했어요. 바로 직전에 "순차적으로(1개씩)" 50페이지를 돌렸을 땐
//             멀쩡했던 걸 보면, 이 정부 서버(노인인력개발원)는 "동시에 여러 개 요청"
//             자체를 못 견디고 막아버리는 것 같아요(오늘 쓴 총 호출 횟수도 몇백 번뿐이라
//             하루 한도 소진은 아닌 것으로 보임). 그래서 동시요청 개수를 3개로 확
//             낮췄고, 실패한 페이지는 한 번 더 재시도하도록(잠깐 쉬었다가) 안전장치를
//             추가했어요.
const CONCURRENCY = 3; // 15개는 실패, 순차(1개)는 성공 - 그 중간값으로 안전하게
const BATCH_PAUSE_MS = 400;
const PAGE_TIMEOUT_MS = 12000;
const PAGE_RETRY_DELAY_MS = 2000;

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

// (한글 설명) 한 번 실패해도 바로 포기하지 않고, 잠깐 쉬었다가 딱 한 번만 더
//             시도해요(이 서버가 가끔 일시적으로 느릴 때가 있어서, 한 번 더 주면
//             성공하는 경우가 있어요).
async function fetchPageXmlWithRetry(url) {
  try {
    return await fetchPageXmlWithTimeout(url, PAGE_TIMEOUT_MS);
  } catch (e) {
    await sleep(PAGE_RETRY_DELAY_MS);
    return await fetchPageXmlWithTimeout(url, PAGE_TIMEOUT_MS);
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

// (한글 설명) [신규 2026-07-24] 한국노인인력개발원의 "자립형일자리 사업모집공고"
//             (JobBsnInfoService)도 같은 방식으로 캐싱해서 목록에 합쳐요. 이건
//             구체적인 채용공고가 아니라 "이 지역 시니어클럽 등이 몇 명 뽑는 사업을
//             운영 중"이라는 성격이라, 화면에 보여줄 제목을 저희가 직접 만들어야 해요.
//             지역명은 이미 "충청남도 청양군"처럼 텍스트로 오기 때문에, 기존 지역검색
//             (location.includes(region))이 코드 수정 없이 그대로 잘 작동해요.
const SELF_RELIANCE_PAGE_SIZE = 500;

// XML에서 <item>...</item> 블록마다, 그 안의 모든 <태그>값</태그>을 객체로 뽑아내는
// 범용 파서예요(태그 이름을 미리 몰라도 다 뽑아줘요).
function parseGenericXmlItems(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRegex.exec(xml)) !== null) {
    const block = m[1];
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

function buildSelfRelianceTitle(it) {
  const org = it.orgName || '수행기관';
  const count = it.hpInvtCnt ? `모집 ${it.hpInvtCnt}명` : '모집중';
  return `[자립형일자리] ${org} (${count})`;
}

const SELF_RELIANCE_TYPE_MAP = { int: '인턴형', trn: '연수형' };

async function fetchSelfRelianceItems() {
  const base = 'http://apis.data.go.kr/B552474/JobBsnInfoService/getJobBsnRecruitList';
  const firstUrl = `${base}?ServiceKey=${encodeURIComponent(SENIOR_API_KEY)}&numOfRows=${SELF_RELIANCE_PAGE_SIZE}&pageNo=1`;

  let firstXml;
  try {
    firstXml = await fetchPageXmlWithRetry(firstUrl);
  } catch (err) {
    console.error('   ⚠️ 자립형일자리 1페이지 실패 - 이 부분은 건너뛰고 계속 진행해요:', err.message);
    return [];
  }

  const totalCountMatch = firstXml.match(/<totalCount>(\d+)<\/totalCount>/);
  const totalCount = totalCountMatch ? parseInt(totalCountMatch[1], 10) : 0;
  if (totalCount === 0) {
    console.log('   ⚠️ 자립형일자리 전체 건수를 확인할 수 없어요 - 이 부분은 건너뛰어요.');
    return [];
  }
  const totalPages = Math.ceil(totalCount / SELF_RELIANCE_PAGE_SIZE);
  console.log(`🧩 자립형일자리 사업모집공고 전체 ${totalCount}건(${totalPages}페이지) 받아오는 중...`);

  let rawItems = parseGenericXmlItems(firstXml);
  let failedPages = 0;

  for (let pageNo = 2; pageNo <= totalPages; pageNo++) {
    const url = `${base}?ServiceKey=${encodeURIComponent(SENIOR_API_KEY)}&numOfRows=${SELF_RELIANCE_PAGE_SIZE}&pageNo=${pageNo}`;
    try {
      const xml = await fetchPageXmlWithRetry(url);
      rawItems = rawItems.concat(parseGenericXmlItems(xml));
    } catch (e) {
      failedPages++;
    }
    if (pageNo % 10 === 0 || pageNo === totalPages) {
      console.log(`   자립형일자리 ${pageNo}/${totalPages}페이지 완료 (누적 원본 ${rawItems.length}건, 실패 ${failedPages}페이지)`);
    }
    await sleep(200);
  }

  // (한글 설명) 안전장치 - 페이지 실패가 너무 많으면(20% 이상) 이 부분은
  //             신뢰할 수 없다고 보고 건너뛰어요(기존 SenuriService 데이터는 그대로 저장돼요).
  if (failedPages > totalPages * 0.2) {
    console.error(`   ❌ 자립형일자리 페이지 실패가 너무 많아요(${failedPages}/${totalPages}) - 이 부분은 건너뛰어요.`);
    return [];
  }

  const recruiting = rawItems.filter((it) => it.trnStatNm === '모집중');
  console.log(`   → 자립형일자리: 전체 ${rawItems.length}건 중 모집중 ${recruiting.length}건`);

  return recruiting.map((it) => ({
    id: 'selfreliance-' + (it.projNo || Math.random().toString(36).slice(2)),
    title: buildSelfRelianceTitle(it),
    company: it.orgName || '',
    workType: SELF_RELIANCE_TYPE_MAP[it.jobType] || '자립형 일자리',
    location: [it.dstrCd1Nm, it.dstrCd2Nm].filter(Boolean).join(' '),
    startDate: it.hpNotiSdate || '',
    endDate: it.hpNotiEdate || '',
  }));
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
    firstXml = await fetchPageXmlWithRetry(firstUrl);
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
        const xml = await fetchPageXmlWithRetry(url);
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

  // (한글 설명) [신규 2026-07-24] 여기까지는 기존 SenuriService(민간형 채용) 데이터예요.
  //             이제 자립형일자리 사업모집공고를 추가로 받아와서 같은 목록에 합쳐요.
  //             이 부분이 실패해도(위 함수 안에서 이미 안전하게 처리) 기존 데이터는
  //             그대로 저장돼요 - 전체가 같이 실패하지 않아요.
  const selfRelianceItems = await fetchSelfRelianceItems();
  const combinedItems = allItems.concat(selfRelianceItems);
  console.log(`📊 최종 합계: 민간형 ${allItems.length}건 + 자립형 ${selfRelianceItems.length}건 = 총 ${combinedItems.length}건`);

  await fs.writeFile(path.join(outDir, 'jobs-cache.json'), JSON.stringify(combinedItems), 'utf8');
  console.log(`✅ api/data/jobs-cache.json 저장 완료 (총 ${combinedItems.length}건)`);
}

main().catch((err) => {
  console.error('🔥 스크립트 실행 중 예상 못한 오류:', err);
  process.exitCode = 1;
});
