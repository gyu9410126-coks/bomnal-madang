// =============================================
// api/health.js — 건강·약국 카테고리 통합 프록시
// Vercel 서버리스 함수 (API 키를 클라이언트에 노출하지 않기 위한 중간 서버)
// =============================================

// (한글 설명) 전국 17개 시도 코드는 정부에서 정한 고정 번호라서 안전하게 표로 만들어둬요.
//             benefit.js에서 이미 검증된 표를 그대로 가져왔어요.
const SIDO_CODES = {
  '서울특별시': '11', '부산광역시': '26', '대구광역시': '27', '인천광역시': '28',
  '광주광역시': '29', '대전광역시': '30', '울산광역시': '31', '세종특별자치시': '36',
  '경기도': '41', '강원도': '42', '충청북도': '43', '충청남도': '44',
  '전라북도': '45', '전라남도': '46', '경상북도': '47', '경상남도': '48',
  '제주특별자치도': '50'
};

// (한글 설명) 시/군/구는 250개 가까이 되서 표로 다 외우지 않고, 그때그때 정부서버에
//             "이 시/도 안에 있는 시/군/구 목록 좀 줘"라고 물어봐서 정확한 코드를 찾아요.
//             (benefit.js와 동일한 검증된 로직)
async function resolveRegionCode(sido, sigungu, rawServiceKey) {
  if (!sido || !SIDO_CODES[sido]) return null;
  const ctprvnCd = SIDO_CODES[sido];
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
      // (한글 설명) [수정] GPS 좌표(lat/lng)가 오면, 이미 검증된 방식으로 동네 이름을 알아내서
      //             Q0(시도)·Q1(시군구)·QN(읍면동) 자리에 채워요. 없으면 예전처럼 직접 받은 값을 써요.
      const { Q0, Q1, QN, lat, lng } = params;
      let q0 = Q0 || '서울특별시';
      let q1 = Q1 || '';
      let qn = QN || '';
      if (lat && lng) {
        const geo = await reverseGeocodeSidoSigungu(lat, lng, process.env.KAKAO_API_KEY);
        if (geo) { q0 = geo.sido; q1 = geo.sigungu; qn = geo.dong || ''; }
      }
      const pharmacyUrl = 'https://apis.data.go.kr/B552657/ErmctInsttInfoInqireService/getParmacyListInfoInqire';
      const pharmacyParams = new URLSearchParams();
      pharmacyParams.append('serviceKey', process.env.PHARMACY_API_KEY);
      pharmacyParams.append('Q0', q0);
      pharmacyParams.append('Q1', q1);
      if (qn) pharmacyParams.append('QN', qn);
      pharmacyParams.append('pageNo', params.pageNo || '1');
      pharmacyParams.append('numOfRows', params.numOfRows || '10');
      pharmacyParams.append('_type', 'json');

      const pharmacyApiUrl = `${pharmacyUrl}?${pharmacyParams.toString()}`;
      const pr = await fetch(pharmacyApiUrl);

      // (한글 설명) [신규] debug=1 을 붙여서 호출하면, 정부 API가 준 답을 우리 서버가
      //             가공하지 않고 원본 그대로 화면에 보여줘요. "화면이 답을 못 찾는 이유"가
      //             서버 문제인지, 답의 생김새(모양) 문제인지 눈으로 확인하기 위한 통로예요.
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
    // 국립중앙의료원 응급의료기관 기본정보 조회
    // 파라미터: Q0(시도명), Q1(시군구명), pageNo, numOfRows
    // ─────────────────────────────────────────
    else if (type === 'emergency') {
      url = 'https://apis.data.go.kr/B552657/ErmctInfoInqireService/getEgytBassInfoInqire';
      queryParams.append('serviceKey', process.env.EMERGENCY_API_KEY);
      queryParams.append('Q0', params.Q0 || '서울특별시');
      queryParams.append('Q1', params.Q1 || '');
      queryParams.append('pageNo', params.pageNo || '1');
      queryParams.append('numOfRows', params.numOfRows || '10');
      queryParams.append('_type', 'json');
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

      const storeUrl = `https://apis.data.go.kr/B553077/api/open/sdsc2/storeListInDong`
        + `?serviceKey=${serviceKey}`
        + `&divId=${finalDivId}&key=${finalKey}`
        + `&numOfRows=20&pageNo=1&type=json`
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
    // 국민건강보험공단 장기요양기관 정보
    // 파라미터: emdongNm(읍면동명), pageNo, numOfRows
    // ─────────────────────────────────────────
    else if (type === 'care') {
      url = 'https://apis.data.go.kr/B550928/getLtcInsttDetailInfoService02/getLtcInsttDetailInfo02';
      queryParams.append('serviceKey', process.env.CARE_API_KEY);
      queryParams.append('emdongNm', params.emdongNm || '');
      if (params.siDoNm) queryParams.append('siDoNm', params.siDoNm);
      if (params.siGunGuNm) queryParams.append('siGunGuNm', params.siGunGuNm);
      queryParams.append('pageNo', params.pageNo || '1');
      queryParams.append('numOfRows', params.numOfRows || '10');
      queryParams.append('type', 'json');
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
