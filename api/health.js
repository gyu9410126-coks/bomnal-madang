// =============================================
// api/health.js — 건강·약국 카테고리 통합 프록시
// Vercel 서버리스 함수 (API 키를 클라이언트에 노출하지 않기 위한 중간 서버)
// =============================================

// (한글 설명) 요양시설 3만여 곳 데이터를 "실시간으로 정부 API에 물어보는" 대신,
//             미리 만들어둔 파일(data/care-data.json)에서 바로 꺼내 써요.
//             import 방식은 배포할 때 Vercel이 이 파일이 필요하다는 걸 자동으로
//             알아채서 같이 담아가기 때문에, 별도 설정(vercel.json) 없이도 안전해요.
//             (fs로 직접 읽는 방식은 배포 시 파일 누락 위험이 있어서 이 방식으로 교체함)
import careData from './data/care-data.json';
// (한글 설명) care-data.json 자체에서 뽑아낸 "시/군/구 이름 → 코드" 표예요.
//             요양시설찾기 검색할 때 이 표로 지역코드를 찾아야 care-data.json과 항상 맞아요.
import careSigunguCodes from './data/care-sigungu-codes.json';
// (한글 설명) [신규] 병원찾기(건강보험심사평가원 hospInfoService1) 전용 시도/시군구 코드표예요.
//             건강보험심사평가원이 직접 배포한 코드표(코드테이블_행정구역_20240524.csv)에서
//             뽑아냈어요. 다른 API들과 코드 체계가 완전히 달라서(자릿수도 다름) 반드시
//             이 표로만 코드를 찾아야 해요. 시도코드는 활용가이드 예제(sidoCd=110000)와
//             똑같이 맞도록 "코드표의 2자리 코드 + 0000"으로 미리 계산해 저장해뒀어요.
import hospitalSigunguCodes from './data/hospital-sigungu-codes.json';

// (한글 설명) [버그 수정] 부산·대구·인천·광주·대전·울산 6개 광역시는 심평원 코드표 안에서
//             시/군/구 이름 앞에 도시 짧은이름이 붙어있어요(예: "기장군"이 아니라 "부산기장군").
//             화면 드롭다운은 "기장군"처럼 정식 법정동 이름만 쓰기 때문에, 그대로 찾으면
//             못 찾아서 시/군/구 코드 없이 시/도 전체로만 검색되던 실제 버그가 있었어요.
//             (서울/경기/강원 등은 이 문제가 없어요 — 코드표에 도시이름이 안 붙어있음)
const SIDO_SHORT = {
  '서울특별시':'서울', '부산광역시':'부산', '대구광역시':'대구', '인천광역시':'인천',
  '광주광역시':'광주', '대전광역시':'대전', '울산광역시':'울산', '세종특별자치시':'세종',
  '경기도':'경기', '강원도':'강원', '충청북도':'충북', '충청남도':'충남',
  '전라북도':'전북', '전라남도':'전남', '경상북도':'경북', '경상남도':'경남',
  '제주특별자치도':'제주'
};

// (한글 설명) [버그 수정] 성남시·안양시·고양시는 코드표에 "시 전체"를 뜻하는 통합 코드가
//             없고, "성남수정구/성남중원구/성남분당구"처럼 구 단위로만 나뉘어 있어요(수원시
//             등은 통합 코드가 따로 있어서 문제없음). 화면 드롭다운엔 "성남시" 하나만 있으니,
//             이 3곳은 구 코드 여러 개를 한꺼번에 찾아서 합쳐야 해요.
const MULTI_SGGU = {
  '경기도': {
    '성남시': ['310401', '310402', '310403'],
    '안양시': ['310701', '310702'],
    '고양시': ['311901', '311902', '311903'],
  },
};

// (한글 설명) 전국 17개 시도 코드는 정부에서 정한 고정 번호라서 안전하게 표로 만들어둬요.
//             benefit.js에서 이미 검증된 표를 그대로 가져왔어요.
const SIDO_CODES = {
  '서울특별시': '11', '부산광역시': '26', '대구광역시': '27', '인천광역시': '28',
  '광주광역시': '29', '대전광역시': '30', '울산광역시': '31', '세종특별자치시': '36',
  '경기도': '41', '강원도': '51', '충청북도': '43', '충청남도': '44',
  '전라북도': '52', '전라남도': '46', '경상북도': '47', '경상남도': '48',
  '제주특별자치도': '50'
  // (한글 설명) [버그 수정] 강원도는 2023년 6월 "강원특별자치도"로, 전라북도는 2024년 1월
  //             "전북특별자치도"로 바뀌면서, 행정안전부 법정동코드도 각각 42→51, 45→52로
  //             바뀌었어요(정부 공식 변경공지로 확인함). 옛날 번호(42,45)를 그대로 쓰고
  //             있어서 이 두 지역만 읍면동 목록이 항상 빈 목록으로 나왔던 거예요.
};

// (한글 설명) [신규] 카카오 주소검색은 "서울", "인천"처럼 줄임말로 시/도 이름을 줘요.
//             그런데 SIDO_CODES는 "서울특별시"처럼 정식명칭이라 그대로 두면 못 찾아요.
//             그래서 줄임말이 오면 정식명칭으로 바꿔주는 변환표를 하나 둬요.
const SIDO_ALIAS = {
  '서울': '서울특별시', '부산': '부산광역시', '대구': '대구광역시', '인천': '인천광역시',
  '광주': '광주광역시', '대전': '대전광역시', '울산': '울산광역시', '세종': '세종특별자치시',
  '경기': '경기도', '강원': '강원도', '충북': '충청북도', '충남': '충청남도',
  '전북': '전라북도', '전남': '전라남도', '경북': '경상북도', '경남': '경상남도',
  '제주': '제주특별자치도'
};
function normalizeSido(s) {
  if (!s) return s;
  if (SIDO_CODES[s]) return s; // 이미 정식명칭이면 그대로 둬요
  return SIDO_ALIAS[s] || s;
}

// (한글 설명) 시/군/구는 250개 가까이 되서 표로 다 외우지 않고, 그때그때 정부서버에
//             "이 시/도 안에 있는 시/군/구 목록 좀 줘"라고 물어봐서 정확한 코드를 찾아요.
//             (benefit.js와 동일한 검증된 로직)
async function resolveRegionCode(sido, sigungu, rawServiceKey) {
  const sidoFull = normalizeSido(sido);
  if (!sidoFull || !SIDO_CODES[sidoFull]) return null;
  const ctprvnCd = SIDO_CODES[sidoFull];
  if (!sigungu) return { divId: 'ctprvnCd', key: ctprvnCd };

  const key = encodeURIComponent(rawServiceKey);
  const url = `https://apis.data.go.kr/B553077/api/open/sdsc2/baroApi`
    + `?resId=dong&catId=cty&ctprvnCd=${ctprvnCd}&type=json&ServiceKey=${key}`;
  try {
    const r = await fetch(url);
    const data = await r.json();
    const items = (data.body && data.body.items) || [];
    const norm = (s) => (s || '').replace(/\s/g, '');
    const match = items.find((it) => norm(it.signguNm) === norm(sigungu));
    if (match) return { divId: 'signguCd', key: match.signguCd };
  } catch (e) {
    // 실패하면 시/도 단위로라도 검색되도록 아래에서 처리
  }
  return { divId: 'ctprvnCd', key: ctprvnCd };
}

// (한글 설명) "내 위치로 찾기" GPS 버튼용: 좌표를 카카오 API에 보내서
//             "여기가 어느 시/도, 어느 시/군/구인지" 이름을 알아내요.
//             (benefit.js와 동일한 검증된 로직)
async function reverseGeocodeSidoSigungu(lat, lng, kakaoKey) {
  if (!kakaoKey) return null;
  const url = `https://dapi.kakao.com/v2/local/geo/coord2regioncode.json?x=${lng}&y=${lat}`;
  try {
    const r = await fetch(url, { headers: { Authorization: `KakaoAK ${kakaoKey}` } });
    const data = await r.json();
    const docs = data.documents || [];
    const doc = docs.find((d) => d.region_type === 'H') || docs[0];
    if (!doc) return null;
    return { sido: doc.region_1depth_name, sigungu: doc.region_2depth_name, dong: doc.region_3depth_name };
  } catch (e) {
    return null;
  }
}

// (한글 설명) 시/군/구 코드 안에 있는 "동" 이름을 진짜 "동 코드(adongCd)"로 바꿔주는 함수예요.
//             정부의 공식 "행정동 조회" API(baroApi, catId=admi)를 그대로 사용해요.
//             (benefit.js와 동일한 검증된 로직)
async function resolveAdongCode(signguCd, dongName, rawServiceKey) {
  if (!signguCd || !dongName) return null;
  const key = encodeURIComponent(rawServiceKey);
  const url = `https://apis.data.go.kr/B553077/api/open/sdsc2/baroApi`
    + `?resId=dong&catId=admi&signguCd=${signguCd}&type=json&ServiceKey=${key}`;
  try {
    const r = await fetch(url);
    const data = await r.json();
    const items = (data.body && data.body.items) || [];
    const norm = (s) => (s || '').replace(/\s/g, '');
    const match = items.find((it) => norm(it.adongNm) === norm(dongName));
    if (match) return match.adongCd;
  } catch (e) {
    // 실패하면 그냥 null을 돌려줘서, 시/군/구 단위로라도 검색되게 해요
  }
  return null;
}

// (한글 설명) [신규] 병원찾기용 "시/도 이름, 시/군/구 이름" → "심평원 코드"로 바꿔주는 함수예요.
//             hospitalSigunguCodes.json 안에서 정확히 이름이 일치하는 항목을 찾아요.
//             시/군/구까지는 찾았는데 정확히 일치하는 이름이 없으면(예: 오타/다른 표기),
//             시/도 코드만이라도 돌려줘서 "시/도 전체"로라도 검색되게 해요(요양시설찾기와 동일한 안전장치).
function resolveHospitalRegion(sido, sigungu) {
  const entry = hospitalSigunguCodes[sido];
  if (!entry) return null; // 시/도 이름 자체를 못 찾으면 검색 불가
  const result = { sidoCd: entry.sidoCd, sgguCd: null, sgguCds: null, sigunguMatched: true };
  if (!sigungu) { result.sigunguMatched = false; return result; }

  // (한글 설명) [버그 수정] 성남시/안양시/고양시처럼 통합코드가 없는 도시는 구 코드 여러 개를
  //             한꺼번에 돌려줘요. 이 경우는 sgguCds(배열)로 표시하고, 호출하는 쪽에서
  //             여러 번 조회해서 합쳐야 해요.
  if (MULTI_SGGU[sido] && MULTI_SGGU[sido][sigungu]) {
    result.sgguCds = MULTI_SGGU[sido][sigungu];
    return result;
  }

  const norm = (s) => (s || '').replace(/\s/g, '');
  const keys = Object.keys(entry.sigungu || {});
  let key = keys.find((name) => norm(name) === norm(sigungu));
  if (!key) {
    // (한글 설명) [버그 수정] 직접 일치가 안 되면, 광역시 짧은이름을 앞에 붙여서 한 번 더
    //             찾아봐요. 예: "기장군" → "부산기장군"으로 재시도. (부산진구처럼 정식 이름에
    //             이미 도시이름이 포함된 경우는 1차 시도에서 이미 찾아지므로 문제없어요.)
    const short = SIDO_SHORT[sido];
    if (short) key = keys.find((name) => norm(name) === norm(short + sigungu));
  }
  if (key) {
    result.sgguCd = entry.sigungu[key];
  } else {
    result.sigunguMatched = false; // 못 찾았다는 표시만 해두고, 시/도 코드는 그대로 씀
  }
  return result;
}


export default async function handler(req, res) {
  // CORS 헤더 설정 (브라우저에서 이 함수를 호출할 수 있도록 허용)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  // (한글 설명) 로딩시간 최적화: 완전히 같은 검색(같은 주소창 URL)이 10분 안에 또 들어오면,
  //             정부 API를 다시 호출하지 않고 Vercel이 저장해둔 응답을 바로 돌려줘요.
  //             10분이 지나도 20분까지는 "일단 예전 답을 보여주고 뒤에서 새로 받아오는" 방식이라
  //             사용자 입장에서는 거의 항상 빠르게 느껴져요.
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1200');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // URL에서 type 파라미터 읽기
  // 예: /api/health?type=pharmacy&Q0=서울특별시&Q1=강남구
  const { type, ...params } = req.query;

  if (!type) {
    return res.status(400).json({ error: 'type 파라미터가 필요합니다.' });
  }

  try {
    let url = '';
    let queryParams = new URLSearchParams();

    // ─────────────────────────────────────────
    // 1. 💊 약국찾기
    // 국립중앙의료원 전국약국정보 조회서비스
    // 파라미터: Q0(시도명), Q1(시군구명), pageNo, numOfRows
    // ─────────────────────────────────────────
    if (type === 'pharmacy') {
      // (한글 설명) [전면 교체] 정부의 "전국약국정보" API는 시/군/구 단위까지만 검색되고,
      //             거리순 정렬 기능이 아예 없었어요(좌표기반 기능도 있었지만 지도버튼에 필요한
      //             좌표를 안 주고 결과 개수 조절도 안 먹혀서 못 믿을 데이터였음, 이미 확인됨).
      //             그래서 카카오 로컬 API의 "카테고리로 장소검색"(약국=PM9)으로 완전히 바꿨어요.
      //             이미 쓰고 있는 KAKAO_API_KEY를 그대로 재사용해요(새 키 필요 없음).
      //             GPS는 내 좌표를 그대로 중심점으로 쓰고, 지역 드롭다운은 "시도+시군구+동"
      //             텍스트를 먼저 좌표로 바꾼(주소검색) 다음 그 좌표를 중심으로 검색해요.
      //             이러면 "진짜 가까운 순서" 정렬과 "읍/면/동 단위 검색"이 둘 다 가능해져요.
      const { Q0, Q1, dong, lat, lng } = params;
      const kakaoKey = process.env.KAKAO_API_KEY;

      let x, y; // 검색 중심 좌표 (x=경도, y=위도 — 카카오 API 표기 방식)

      if (lat && lng) {
        x = lng;
        y = lat;
      } else {
        // (한글 설명) 동까지 선택했으면 "시도 시군구 동"으로, 안 했으면 "시도 시군구"로
        //             주소검색을 해서 중심 좌표를 알아내요. 동 단위가 더 정확해서 먼저 시도하고,
        //             혹시 실패하면 시군구 단위로 한 번 더 시도해요.
        const tryGeocode = async (queryText) => {
          if (!queryText) return null;
          const url = `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(queryText)}&size=1`;
          const r = await fetch(url, { headers: { Authorization: `KakaoAK ${kakaoKey}` } });
          if (!r.ok) return null;
          const d = await r.json();
          const doc = d.documents && d.documents[0];
          return doc ? { x: doc.x, y: doc.y } : null;
        };

        const fullQuery = [Q0, Q1, dong].filter(Boolean).join(' ');
        let geo = await tryGeocode(fullQuery);
        if (!geo && dong) {
          geo = await tryGeocode([Q0, Q1].filter(Boolean).join(' '));
        }
        if (!geo) {
          return res.status(200).json({ documents: [], meta: { is_end: true }, message: '지역을 확인할 수 없습니다. 다른 지역을 선택해 보세요.' });
        }
        x = geo.x;
        y = geo.y;
      }

      // (한글 설명) 카카오 장소검색은 한 번에 최대 15개, 페이지는 최대 3페이지(총 45개)까지만 지원해요.
      const pageNo = Math.min(parseInt(params.pageNo || '1', 10) || 1, 3);
      const size = Math.min(parseInt(params.numOfRows || '15', 10) || 15, 15);

      const catParams = new URLSearchParams();
      catParams.append('category_group_code', 'PM9'); // PM9 = 약국
      catParams.append('x', x);
      catParams.append('y', y);
      catParams.append('radius', '20000'); // 최대 반경(20km) — 결과는 거리순이라 가까운 곳부터 나옴
      catParams.append('sort', 'distance');
      catParams.append('page', String(pageNo));
      catParams.append('size', String(size));

      const catUrl = `https://dapi.kakao.com/v2/local/search/category.json?${catParams.toString()}`;
      const pr = await fetch(catUrl, { headers: { Authorization: `KakaoAK ${kakaoKey}` } });

      // (한글 설명) debug=1 을 붙여서 호출하면, 카카오 API가 준 답을 그대로 화면에 보여줘요.
      if (params.debug === '1') {
        const raw = await pr.text();
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.status(200).send(raw);
      }

      if (!pr.ok) {
        return res.status(pr.status).json({ error: 'API 호출 실패', status: pr.status });
      }
      const pharmacyData = await pr.json();
      return res.status(200).json(pharmacyData);
    }

    // ─────────────────────────────────────────
    // 2. 🚑 응급실찾기
    // 국립중앙의료원 응급의료기관 목록정보 조회
    // (한글 설명) [수정] 예전엔 getEgytBassInfoInqire(기관ID로 딱 1곳만 찾는 API)를 썼는데,
    //             이 API는 애초에 지역 필터가 없어서 Q0/Q1을 보내도 무시되고 전체 목록이
    //             나왔던 것으로 확인됨(공식 활용가이드 hwp 문서로 검증). 지역별 목록을 찾는
    //             진짜 API는 getEgytListInfoInqire이고, Q0(시도)·Q1(시군구)를 정상 지원함.
    //             [신규] GPS 좌표(lat/lng)가 오면 약국찾기와 동일한 방식으로 시도·시군구
    //             이름을 알아내서 Q0/Q1 자리에 채워요.
    // 파라미터: Q0(시도명), Q1(시군구명), pageNo, numOfRows
    // ─────────────────────────────────────────
    else if (type === 'emergency') {
      const { Q0: emQ0, Q1: emQ1, lat: emLat, lng: emLng } = params;
      let emq0 = emQ0 || '서울특별시';
      let emq1 = emQ1 || '';
      if (emLat && emLng) {
        const geo = await reverseGeocodeSidoSigungu(emLat, emLng, process.env.KAKAO_API_KEY);
        if (geo) { emq0 = geo.sido; emq1 = geo.sigungu; }
      }
      const emergencyUrl = 'https://apis.data.go.kr/B552657/ErmctInfoInqireService/getEgytListInfoInqire';
      const emergencyParams = new URLSearchParams();
      emergencyParams.append('serviceKey', process.env.EMERGENCY_API_KEY);
      emergencyParams.append('Q0', emq0);
      emergencyParams.append('Q1', emq1);
      emergencyParams.append('pageNo', params.pageNo || '1');
      emergencyParams.append('numOfRows', params.numOfRows || '10');
      emergencyParams.append('_type', 'json');

      const emergencyApiUrl = `${emergencyUrl}?${emergencyParams.toString()}`;
      const er = await fetch(emergencyApiUrl);

      // (한글 설명) [신규] debug=1 을 붙여서 호출하면, 정부 API가 준 답을 가공하지 않고
      //             원본 그대로 보여줘요. 좌표(위치정보) 필드가 실제로 있는지 확인하기 위한 통로예요.
      if (params.debug === '1') {
        const raw = await er.text();
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.status(200).send(raw);
      }

      if (!er.ok) {
        return res.status(er.status).json({ error: 'API 호출 실패', status: er.status });
      }
      const emergencyData = await er.json();
      return res.status(200).json(emergencyData);
    }

    // ─────────────────────────────────────────
    // 3. 📖 약효능·복용법
    // 식품의약품안전처 의약품개요정보(e약은요)
    // 파라미터: itemName(약품명 검색어), pageNo, numOfRows
    // ─────────────────────────────────────────
    else if (type === 'medicine') {
      url = 'https://apis.data.go.kr/1471000/DrbEasyDrugInfoService/getDrbEasyDrugList';
      queryParams.append('serviceKey', process.env.MEDICINE_API_KEY);
      queryParams.append('itemName', params.itemName || '');
      queryParams.append('pageNo', params.pageNo || '1');
      queryParams.append('numOfRows', params.numOfRows || '10');
      queryParams.append('type', 'json');
    }

    // ─────────────────────────────────────────
    // 4. 🏪 건강매장찾기 (전면 교체)
    // 소상공인시장진흥공단 상가(상권)정보
    // (한글 설명) [전면 수정] 예전엔 시/도 2자리 코드표를 직접 만들어 썼는데, 시/군/구까지밖에
    //             못 좁혔어요. 이제 benefit.js에서 검증된 방식대로 시/군/구·동까지 정확한
    //             숫자코드로 바꿔서 검색해요. GPS로 눌러도, 드롭다운으로 골라도 다 지원돼요.
    // 파라미터: sido, sigungu, dong(선택) 또는 lat/lng(GPS, 선택) / keyword(업종코드)
    // ─────────────────────────────────────────
    else if (type === 'store') {
      const { keyword, sido, sigungu, dong, lat, lng } = params;
      const rawKey = process.env.STORE_API_KEY;
      const serviceKey = encodeURIComponent(rawKey);

      let regionSido = sido;
      let regionSigungu = sigungu;
      let regionDong = dong || null; // (한글 설명) 드롭다운에서 동을 직접 골랐으면 여기 채워져요

      // GPS 좌표가 오면 드롭다운 선택보다 GPS를 우선 사용해요
      if (lat && lng) {
        const geo = await reverseGeocodeSidoSigungu(lat, lng, process.env.KAKAO_API_KEY);
        if (geo) {
          regionSido = geo.sido;
          regionSigungu = geo.sigungu;
          regionDong = geo.dong;
        }
      }

      const region = await resolveRegionCode(regionSido, regionSigungu, rawKey);
      if (!region) {
        return res.status(200).json({ body: { items: [] }, message: '지역을 확인할 수 없습니다.' });
      }

      // 동 이름까지 알고 있으면(=시/군/구 코드가 확정됐으면) 동 코드로 한 번 더 좁혀봐요.
      // 동 코드를 못 찾으면 그냥 시/군/구 단위를 그대로 써요.
      let finalDivId = region.divId;
      let finalKey = region.key;
      if (regionDong && region.divId === 'signguCd') {
        const adongCd = await resolveAdongCode(region.key, regionDong, rawKey);
        if (adongCd) {
          finalDivId = 'adongCd';
          finalKey = adongCd;
        }
      }

      // 업종코드가 2글자면 대분류(indsLclsCd), 그보다 길면 소분류(indsSclsCd)로 판단
      let indsParam = '';
      if (keyword) {
        indsParam = keyword.length <= 2
          ? `&indsLclsCd=${encodeURIComponent(keyword)}`
          : `&indsSclsCd=${encodeURIComponent(keyword)}`;
      }

      // (한글 설명) [수정] pageNo가 항상 1로 고정돼 있어서 "더보기"를 눌러도 같은 페이지만
      //             다시 받아오던 문제를 고쳤어요. 이제 화면에서 보낸 페이지 번호를 그대로 써요.
      const storePageNo = params.pageNo || '1';
      const storeUrl = `https://apis.data.go.kr/B553077/api/open/sdsc2/storeListInDong`
        + `?serviceKey=${serviceKey}`
        + `&divId=${finalDivId}&key=${finalKey}`
        + `&numOfRows=20&pageNo=${storePageNo}&type=json`
        + indsParam;

      const r = await fetch(storeUrl);

      if (req.query.debug === '1') {
        const raw = await r.text();
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.status(200).send(raw);
      }

      const data = await r.json();
      return res.status(200).json(data);
    }

    // ─────────────────────────────────────────
    // 4-1. 🏪 읍/면/동 목록 조회 (건강매장찾기용, 신규)
    // (한글 설명) 화면에서 시/도, 시/군/구를 선택하면, 그 안에 있는 "동" 목록을
    //             전부 가져와서 세 번째 드롭다운(동 선택)을 채우는 데 써요.
    //             (benefit.js의 dongList와 동일한 검증된 로직)
    // ─────────────────────────────────────────
    else if (type === 'dongList') {
      const { sido, sigungu } = params;
      const rawKey = process.env.STORE_API_KEY;

      // (한글 설명) [신규] debugAll=1 을 붙이면, 17개 시/도 전체의 시/군/구 원본 목록을
      //             한꺼번에 가져와서 보여줘요. 경아오빠가 지역마다 하나씩 테스트 안 해도
      //             되도록, 한 번 호출로 전체를 점검할 수 있게 만든 진단 통로예요.
      //             [수정] 처음엔 17개를 한꺼번에(동시에) 불렀더니 정부 서버가 "너무 빨리
      //             여러 번 부른다"며 일부를 막아서(API 토큰 에러), 3개씩 나눠서 순서대로
      //             부르도록 바꿨어요. 또한 에러가 나면 원본 텍스트도 그대로 보여주게 했어요.
      if (params.debugAll === '1') {
        const dkey = encodeURIComponent(rawKey);
        const allSido = Object.keys(SIDO_CODES);
        const results = [];
        const chunkSize = 3;
        for (let i = 0; i < allSido.length; i += chunkSize) {
          const chunk = allSido.slice(i, i + chunkSize);
          const chunkResults = await Promise.all(chunk.map(async (sName) => {
            const ctprvnCd = SIDO_CODES[sName];
            const ctyUrl = `https://apis.data.go.kr/B553077/api/open/sdsc2/baroApi`
              + `?resId=dong&catId=cty&ctprvnCd=${ctprvnCd}&type=json&ServiceKey=${dkey}`;
            try {
              const cr = await fetch(ctyUrl);
              const raw = await cr.text();
              try {
                const cdata = JSON.parse(raw);
                const items = (cdata.body && cdata.body.items) || [];
                return { sido: sName, ctprvnCd, count: items.length, names: items.map((it) => it.signguNm) };
              } catch (parseErr) {
                return { sido: sName, ctprvnCd, error: '응답이 JSON이 아님', rawPreview: raw.slice(0, 200) };
              }
            } catch (e) {
              return { sido: sName, ctprvnCd, error: String(e) };
            }
          }));
          results.push(...chunkResults);
          // (한글 설명) 다음 묶음 부르기 전에 살짝 쉬어서(300ms) 서버 부담을 줄여요.
          if (i + chunkSize < allSido.length) {
            await new Promise((resolve) => setTimeout(resolve, 300));
          }
        }
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        return res.status(200).json(results);
      }

      // (한글 설명) [신규] debug=1 을 붙이면, 시/군/구 이름을 찾는 원본 목록 전체와
      //             우리가 무엇을 찾으려 했는지를 그대로 보여줘요. 성남시/고양시처럼
      //             "구가 있는 시"가 이 목록에 어떤 이름으로 들어있는지 확인하기 위한 통로예요.
      if (params.debug === '1') {
        const sidoFull = normalizeSido(sido);
        const ctprvnCd = SIDO_CODES[sidoFull];
        const dkey = encodeURIComponent(rawKey);
        const ctyUrl = `https://apis.data.go.kr/B553077/api/open/sdsc2/baroApi`
          + `?resId=dong&catId=cty&ctprvnCd=${ctprvnCd}&type=json&ServiceKey=${dkey}`;
        const cr = await fetch(ctyUrl);
        const cdata = await cr.json();
        const items = (cdata.body && cdata.body.items) || [];
        const names = items.map((it) => it.signguNm);
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.status(200).send(
          `[찾으려는 시/군/구] ${sigungu}\n\n[호출한 주소]\n${ctyUrl}\n\n[이 시/도의 전체 시/군/구 목록 (${names.length}개)]\n${names.join(', ')}`
        );
      }

      const sidoFull = normalizeSido(sido);
      if (!sidoFull || !SIDO_CODES[sidoFull]) {
        return res.status(200).json({ items: [] });
      }
      const ctprvnCd = SIDO_CODES[sidoFull];
      const key = encodeURIComponent(rawKey);

      // (한글 설명) [버그 수정] 성남시/고양시/수원시/부천시/안산시/안양시/용인시처럼 "구가 있는
      //             시"는 이 시스템에서도 "성남시 분당구"처럼 구 단위로만 나뉘어 있고 "성남시"
      //             자체는 목록에 없어요(실제 원본 응답으로 확인함). 그래서 이름이 정확히
      //             일치하는 게 없으면, "OO시 "로 시작하는 구들을 전부 찾아서 각 구의 동 목록을
      //             합쳐줘요. (병원찾기의 성남/안양/고양 코드 병합과 같은 원리예요.)
      const ctyUrl = `https://apis.data.go.kr/B553077/api/open/sdsc2/baroApi`
        + `?resId=dong&catId=cty&ctprvnCd=${ctprvnCd}&type=json&ServiceKey=${key}`;
      let signguCds = [];
      try {
        const cr = await fetch(ctyUrl);
        const cdata = await cr.json();
        const ctyItems = (cdata.body && cdata.body.items) || [];
        const norm = (s) => (s || '').replace(/\s/g, '');
        let matches = ctyItems.filter((it) => norm(it.signguNm) === norm(sigungu));
        if (matches.length === 0) {
          matches = ctyItems.filter((it) => norm(it.signguNm).startsWith(norm(sigungu)));
        }
        signguCds = matches.map((it) => it.signguCd);
      } catch (e) {
        return res.status(200).json({ items: [] });
      }

      if (signguCds.length === 0) {
        return res.status(200).json({ items: [] });
      }

      try {
        const results = await Promise.all(signguCds.map(async (signguCd) => {
          const dongUrl = `https://apis.data.go.kr/B553077/api/open/sdsc2/baroApi`
            + `?resId=dong&catId=admi&signguCd=${signguCd}&type=json&ServiceKey=${key}`;
          const r = await fetch(dongUrl);
          const data = await r.json();
          const rawItems = (data.body && data.body.items) || [];
          return rawItems.map((it) => ({ adongCd: it.adongCd, adongNm: it.adongNm }));
        }));
        const items = [].concat(...results);
        return res.status(200).json({ items });
      } catch (e) {
        return res.status(200).json({ items: [] });
      }
    }

    // ─────────────────────────────────────────
    // 5. 🌿 한방약재사전
    // 식품의약품안전처 한약재 품질규격 정보
    // 파라미터: itemName(약재명), pageNo, numOfRows
    // ─────────────────────────────────────────
    else if (type === 'herbal') {
      url = 'https://apis.data.go.kr/1430000/MatInfoService/getMatInfoList';
      queryParams.append('serviceKey', process.env.HERBAL_API_KEY);
      queryParams.append('itemName', params.itemName || '');
      queryParams.append('pageNo', params.pageNo || '1');
      queryParams.append('numOfRows', params.numOfRows || '10');
      queryParams.append('type', 'json');
    }

    // ─────────────────────────────────────────
    // 6. 🏥 요양시설찾기
    // (한글 설명) [전면 교체] 정부의 "장기요양기관 상세정보조회" API는 기관코드를 이미
    //             알아야만 조회되는 구조라 지역검색이 아예 불가능했어요(활용가이드 문서로
    //             확인됨). 그래서 국민건강보험공단이 공개한 "전국 장기요양기관 현황" 파일
    //             데이터(엑셀)를 미리 data/care-data.json으로 만들어두고, 여기서 바로
    //             검색해요. 전화번호는 이 파일에 없어서, 화면에 보여줄 결과(최대 10~20건)만
    //             카카오에 "이 이름 아세요?" 하고 물어봐서 있으면 붙여줘요.
    // 파라미터: sido(시도명), sigungu(시군구명), dong(읍면동명, 선택), pageNo, numOfRows
    // ─────────────────────────────────────────
    else if (type === 'care') {
      const { sido, sigungu, dong } = params;
      if (!sido || !sigungu) {
        return res.status(200).json({ items: [], total: 0, hasMore: false, message: '시/도와 시/군/구를 먼저 선택해 주세요.' });
      }
      const sidoFull = normalizeSido(sido);
      const sidoCd = SIDO_CODES[sidoFull];
      if (!sidoCd) {
        return res.status(200).json({ items: [], total: 0, hasMore: false, message: '시/도를 확인할 수 없습니다.' });
      }

      // (한글 설명) [수정] 예전엔 소상공인시장진흥공단 API가 주는 시/군/구 코드(resolveRegionCode)를
      //             그대로 썼는데, 이 코드는 care-data.json을 만들 때 쓴 국민건강보험공단 코드와
      //             체계가 달라서(자릿수도 다름) 매번 검색 결과가 0건으로 나왔던 실제 버그가 있었어요.
      //             그래서 대신 care-data.json 자체에서 뽑아낸 "시/군/구 이름 → 코드" 표
      //             (care-sigungu-codes.json)로 직접 찾도록 바꿨어요. care-data.json의 키와
      //             100% 같은 체계라서 이제 항상 정확히 맞아요.
      const norm = (s) => (s || '').replace(/\s/g, '');
      const sigunguTable = careSigunguCodes[sidoCd] || {};
      const sigunguKey = Object.keys(sigunguTable).find((name) => norm(name) === norm(sigungu));
      if (!sigunguKey) {
        return res.status(200).json({ items: [], total: 0, hasMore: false, message: '시/군/구를 확인할 수 없습니다. 지역을 다시 선택해 주세요.' });
      }

      const regionKey = sidoCd + '_' + sigunguTable[sigunguKey];
      let list = careData[regionKey] || [];

      // 읍/면/동까지 입력했으면 한 번 더 좁혀요. 정확히 일치하는 곳이 없으면
      // 0건으로 끝내지 않고 시/군/구 전체 결과를 그대로 보여줘요.
      if (dong) {
        const filtered = list.filter((it) => norm(it.d) === norm(dong));
        if (filtered.length > 0) list = filtered;
      }

      const pageNo = Math.max(parseInt(params.pageNo || '1', 10) || 1, 1);
      const size = Math.min(parseInt(params.numOfRows || '10', 10) || 10, 20);
      const start = (pageNo - 1) * size;
      const pageItems = list.slice(start, start + size);
      const hasMore = start + size < list.length;

      // (한글 설명) 3만 건 전체가 아니라 "지금 화면에 보여줄 만큼만" 카카오에 물어봐요.
      //             Promise.all로 한꺼번에 동시에 물어봐서, 10건이든 1건이든 걸리는
      //             시간은 거의 똑같아요(순서대로 하나씩 기다리지 않음 — 로딩시간 최적화).
      const kakaoKey = process.env.KAKAO_API_KEY;
      const enriched = await Promise.all(pageItems.map(async (it) => {
        let tel = '';
        let lat = null;
        let lon = null;
        try {
          const kwUrl = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(sigungu + ' ' + it.n)}&size=1`;
          const kr = await fetch(kwUrl, { headers: { Authorization: `KakaoAK ${kakaoKey}` } });
          const kd = await kr.json();
          const doc = kd.documents && kd.documents[0];
          if (doc) {
            tel = doc.phone || '';
            lat = doc.y;
            lon = doc.x;
          }
        } catch (e) {
          // 카카오가 이 시설을 모르면 조용히 넘어가요 (전화번호 없이 표시)
        }

        if (!lat) {
          // 전화번호는 못 찾아도, 주소로 좌표는 구해서 지도·길찾기 버튼은 살려줘요
          try {
            const geoUrl = `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(it.a)}&size=1`;
            const gr = await fetch(geoUrl, { headers: { Authorization: `KakaoAK ${kakaoKey}` } });
            const gd = await gr.json();
            const gdoc = gd.documents && gd.documents[0];
            if (gdoc) { lat = gdoc.y; lon = gdoc.x; }
          } catch (e) {
            // 좌표도 못 구하면 지도 버튼 없이 이름/주소만 보여줘요
          }
        }

        return { name: it.n, addr: it.a, dong: it.d, typeNm: it.t, capacity: it.cap, tel, lat, lon };
      }));

      return res.status(200).json({ items: enriched, total: list.length, hasMore });
    }

    // ─────────────────────────────────────────
    // 7. 🥗 식품영양정보
    // 식품의약품안전처 식품영양성분DB
    // 파라미터: desc_kor(식품명), pageNo, numOfRows
    // ─────────────────────────────────────────
    else if (type === 'nutrition') {
      url = 'https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo02/getFoodNtrCpntDbInAttrbInfo02';
      queryParams.append('serviceKey', process.env.FOOD_NUTRITION_API_KEY);
      queryParams.append('desc_kor', params.desc_kor || '');
      queryParams.append('pageNo', params.pageNo || '1');
      queryParams.append('numOfRows', params.numOfRows || '10');
      queryParams.append('type', 'json');
    }

    // ─────────────────────────────────────────
    // 8. 🏨 병원찾기
    // 건강보험심사평가원 병원정보서비스 (hospInfoServicev2)
    // (한글 설명) [2차 수정 - 2026-07] 활용가이드 문서만 보고 hospInfoService1로 바꿨었는데,
    //             경아오빠 data.go.kr 계정의 실제 승인된 활용신청 상세정보를 직접 확인해보니
    //             End Point가 hospInfoServicev2로 등록되어 있었어요(문서가 오래돼서 실제와
    //             달랐던 것). 그래서 진짜 주소인 v2로 다시 되돌렸어요.
    //             오퍼레이션명(getHospBasisList)은 data.go.kr에 v2 전용 공식 문서가 없어서
    //             100% 확정은 아니고, 2016년 이전 구버전 명칭을 참고한 추정이에요.
    //             debug=1로 꼭 확인해야 해요 — 안 되면 다른 오퍼레이션명으로 바로 재시도할게요.
    // 파라미터: sido(시도명, 지역검색시 필수), sigungu(시군구명, 선택), dong(읍면동명, 선택-텍스트),
    //          clCd(종별코드, 선택), dgsbjtCd(진료과목코드, 선택),
    //          lat/lng(GPS검색시), pageNo, numOfRows
    // 출처표시 필수: 건강보험심사평가원 (공공저작물 제1유형)
    // ─────────────────────────────────────────
    else if (type === 'hospital') {
      const { sido, sigungu, dong, clCd, dgsbjtCd, lat, lng } = params;
      url = 'https://apis.data.go.kr/B551182/hospInfoServicev2/getHospBasisList';
      queryParams.append('serviceKey', process.env.HOSPITAL_API_KEY);
      queryParams.append('pageNo', params.pageNo || '1');
      queryParams.append('numOfRows', params.numOfRows || '10');
      queryParams.append('_type', 'json');

      if (lat && lng) {
        // (한글 설명) GPS 검색 모드 — 내 좌표를 중심으로 반경 안의 병원을 거리순으로 찾아요.
        //             반경은 30km로 시작해요(경아오빠 결정). 정부 API가 이 반경을 거부하면
        //             (에러 응답이 오면) 다음 세션에서 반경을 줄여서 재시도해야 해요.
        queryParams.append('xPos', lng);
        queryParams.append('yPos', lat);
        queryParams.append('radius', '30000'); // 단위: 미터(m) = 30km
      } else {
        // (한글 설명) 지역 드롭다운 검색 모드
        if (!sido) {
          return res.status(200).json({ response: { body: { items: {}, totalCount: 0 } }, message: '시/도를 먼저 선택해 주세요.' });
        }
        const region = resolveHospitalRegion(sido, sigungu);
        if (!region) {
          return res.status(200).json({ response: { body: { items: {}, totalCount: 0 } }, message: '시/도를 확인할 수 없습니다.' });
        }

        // (한글 설명) [버그 수정] 성남시/안양시/고양시처럼 구 코드가 여러 개인 경우,
        //             각 구를 전부 조회해서 합친 다음, 우리가 직접 페이지를 나눠줘요.
        //             (공용 처리부의 "한 번만 fetch" 흐름을 못 쓰기 때문에 여기서 바로 응답해요.)
        if (region.sgguCds) {
          const pageNo = Math.max(parseInt(params.pageNo || '1', 10) || 1, 1);
          const numOfRows = Math.min(parseInt(params.numOfRows || '10', 10) || 10, 20);
          const subResults = await Promise.all(region.sgguCds.map(async (code) => {
            const qp = new URLSearchParams();
            qp.append('serviceKey', process.env.HOSPITAL_API_KEY);
            qp.append('_type', 'json');
            qp.append('pageNo', '1');
            qp.append('numOfRows', '100'); // 구 하나당 최대 100건이면 충분해요
            qp.append('sidoCd', region.sidoCd);
            qp.append('sgguCd', code);
            if (dong) qp.append('emdongNm', dong);
            if (clCd) qp.append('clCd', clCd);
            if (dgsbjtCd) qp.append('dgsbjtCd', dgsbjtCd);
            try {
              const r = await fetch(`https://apis.data.go.kr/B551182/hospInfoServicev2/getHospBasisList?${qp.toString()}`);
              if (!r.ok) return [];
              const d = await r.json();
              const itemsWrap = d.response && d.response.body && d.response.body.items;
              if (!itemsWrap || !itemsWrap.item) return [];
              return Array.isArray(itemsWrap.item) ? itemsWrap.item : [itemsWrap.item];
            } catch (e) {
              return [];
            }
          }));
          const merged = [].concat(...subResults);
          const start = (pageNo - 1) * numOfRows;
          const pageItems = merged.slice(start, start + numOfRows);
          return res.status(200).json({
            response: {
              header: { resultCode: '00', resultMsg: 'NORMAL SERVICE.' },
              body: { items: { item: pageItems }, numOfRows, pageNo, totalCount: merged.length },
            },
          });
        }

        queryParams.append('sidoCd', region.sidoCd);
        if (region.sgguCd) queryParams.append('sgguCd', region.sgguCd);
        if (dong) queryParams.append('emdongNm', dong); // 텍스트로 직접 필터(코드 아님)
      }

      if (clCd) queryParams.append('clCd', clCd);           // 종별코드(병원등급)
      if (dgsbjtCd) queryParams.append('dgsbjtCd', dgsbjtCd); // 진료과목코드
    }

    // ─────────────────────────────────────────
    // 9. 💪 건강기능식품정보
    // 식품의약품안전처 건강기능식품 영양DB
    // 파라미터: prdlstNm(제품명), pageNo, numOfRows
    // ─────────────────────────────────────────
    else if (type === 'supplement') {
      url = 'https://apis.data.go.kr/1471000/HealthFoodInfoService/getHealthFoodList';
      queryParams.append('serviceKey', process.env.HEALTH_FUNC_API_KEY);
      queryParams.append('prdlstNm', params.prdlstNm || '');
      queryParams.append('pageNo', params.pageNo || '1');
      queryParams.append('numOfRows', params.numOfRows || '10');
      queryParams.append('type', 'json');
    }

    // 알 수 없는 type
    else {
      return res.status(400).json({ error: `알 수 없는 type: ${type}` });
    }

    // ─────────────────────────────────────────
    // 실제 공공 API 호출
    // ─────────────────────────────────────────
    const apiUrl = `${url}?${queryParams.toString()}`;

    // (한글 설명) [신규] debug=1 을 붙여서 호출하면, 정부 API가 준 답을 가공하지 않고
    //             (성공이든 에러든) HTTP 상태코드와 함께 원본 그대로 보여줘요. 약국찾기·
    //             응급실찾기에 이미 있는 것과 같은 진단용 통로인데, 이 공통 처리부(병원찾기,
    //             건강기능식품정보 등이 씀)에는 빠져있어서 이번에 추가했어요.
    if (params.debug === '1') {
      const debugResponse = await fetch(apiUrl);
      const raw = await debugResponse.text();
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.status(200).send(`[호출한 주소]\n${apiUrl}\n\n[응답 상태코드] ${debugResponse.status}\n\n[원본 응답]\n${raw}`);
    }

    const response = await fetch(apiUrl);

    if (!response.ok) {
      return res.status(response.status).json({ error: 'API 호출 실패', status: response.status });
    }

    const contentType = response.headers.get('content-type') || '';

    // JSON 응답인 경우
    if (contentType.includes('json')) {
      const data = await response.json();
      // (한글 설명) [신규] 병원찾기 GPS 검색은 정부 API가 "반경 안의 병원"은 걸러주지만
      //             "가까운 순 정렬"까지는 안 해줘서(실제 테스트로 확인됨), 여기서 직접
      //             거리(distance) 값 기준으로 오름차순 정렬해줘요(품질기준 11번: 거리순 기본).
      if (type === 'hospital' && params.lat && params.lng) {
        try {
          const itemsWrap = data.response && data.response.body && data.response.body.items;
          if (itemsWrap && itemsWrap.item) {
            const arr = Array.isArray(itemsWrap.item) ? itemsWrap.item : [itemsWrap.item];
            arr.sort((a, b) => parseFloat(a.distance || 0) - parseFloat(b.distance || 0));
            itemsWrap.item = arr;
          }
        } catch (e) {
          // 정렬 실패해도 결과 자체는 그대로 보여줘요(정렬만 안 될 뿐 검색은 되게)
        }
      }
      return res.status(200).json(data);
    }

    // XML 응답인 경우 (일부 API는 JSON 요청해도 XML로 올 수 있음)
    const text = await response.text();
    return res.status(200).send(text);

  } catch (err) {
    console.error('[health proxy error]', err);
    return res.status(500).json({ error: '서버 오류', message: err.message });
  }
}
