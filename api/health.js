// =============================================
// api/health.js — 건강·약국 카테고리 통합 프록시
// Vercel 서버리스 함수 (API 키를 클라이언트에 노출하지 않기 위한 중간 서버)
// =============================================

// (한글 설명) 요양시설 3만여 곳 데이터를 "실시간으로 정부 API에 물어보는" 대신,
//             미리 만들어둔 파일(data/care-data.json)에서 바로 꺼내 써요.
//             import 방식은 배포할 때 Vercel이 이 파일이 필요하다는 걸 자동으로
//             알아채서 같이 담아가기 때문에, 별도 설정(vercel.json) 없이도 안전해요.
//             (fs로 직접 읽는 방식은 배포 시 파일 누락 위험이 있어서 이 방식으로 교체함)
import careData from '../data/care-data.json';

// (한글 설명) 전국 17개 시도 코드는 정부에서 정한 고정 번호라서 안전하게 표로 만들어둬요.
//             benefit.js에서 이미 검증된 표를 그대로 가져왔어요.
const SIDO_CODES = {
  '서울특별시': '11', '부산광역시': '26', '대구광역시': '27', '인천광역시': '28',
  '광주광역시': '29', '대전광역시': '30', '울산광역시': '31', '세종특별자치시': '36',
  '경기도': '41', '강원도': '42', '충청북도': '43', '충청남도': '44',
  '전라북도': '45', '전라남도': '46', '경상북도': '47', '경상남도': '48',
  '제주특별자치도': '50'
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

      const region = await resolveRegionCode(sido, sigungu, rawKey);
      if (!region || region.divId !== 'signguCd') {
        return res.status(200).json({ items: [] });
      }

      const key = encodeURIComponent(rawKey);
      const dongUrl = `https://apis.data.go.kr/B553077/api/open/sdsc2/baroApi`
        + `?resId=dong&catId=admi&signguCd=${region.key}&type=json&ServiceKey=${key}`;

      try {
        const r = await fetch(dongUrl);
        const data = await r.json();
        const rawItems = (data.body && data.body.items) || [];
        const items = rawItems.map((it) => ({ adongCd: it.adongCd, adongNm: it.adongNm }));
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
      const region = await resolveRegionCode(sido, sigungu, process.env.STORE_API_KEY);
      if (!region || region.divId !== 'signguCd') {
        return res.status(200).json({ items: [], total: 0, hasMore: false, message: '시/군/구를 확인할 수 없습니다. 지역을 다시 선택해 주세요.' });
      }

      const regionKey = sidoCd + '_' + region.key;
      let list = careData[regionKey] || [];

      // 읍/면/동까지 입력했으면 한 번 더 좁혀요. 정확히 일치하는 곳이 없으면
      // 0건으로 끝내지 않고 시/군/구 전체 결과를 그대로 보여줘요.
      if (dong) {
        const norm = (s) => (s || '').replace(/\s/g, '');
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
    // 건강보험심사평가원 병원정보서비스
    // 파라미터: sidoCd(시도코드), sgguCd(시군구코드), pageNo, numOfRows
    // 출처표시 필수: 건강보험심사평가원 (공공저작물 제1유형)
    // ─────────────────────────────────────────
    else if (type === 'hospital') {
      url = 'https://apis.data.go.kr/B551182/hospInfoServicev2/getHospBasisList';
      queryParams.append('serviceKey', process.env.HOSPITAL_API_KEY);
      if (params.sidoCd) queryParams.append('sidoCd', params.sidoCd);
      if (params.sgguCd) queryParams.append('sgguCd', params.sgguCd);
      if (params.dgsbjtCd) queryParams.append('dgsbjtCd', params.dgsbjtCd); // 진료과목코드
      queryParams.append('pageNo', params.pageNo || '1');
      queryParams.append('numOfRows', params.numOfRows || '10');
      queryParams.append('_type', 'json');
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
    const response = await fetch(apiUrl);

    if (!response.ok) {
      return res.status(response.status).json({ error: 'API 호출 실패', status: response.status });
    }

    const contentType = response.headers.get('content-type') || '';

    // JSON 응답인 경우
    if (contentType.includes('json')) {
      const data = await response.json();
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
