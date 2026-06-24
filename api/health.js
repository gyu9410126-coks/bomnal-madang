// =============================================
// api/health.js — 건강·약국 카테고리 통합 프록시
// Vercel 서버리스 함수 (API 키를 클라이언트에 노출하지 않기 위한 중간 서버)
// =============================================

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
      url = 'http://apis.data.go.kr/B552657/ErmctInsttInfoInqireService/getParmacyListInfoInqire';
      queryParams.append('serviceKey', process.env.PHARMACY_API_KEY);
      queryParams.append('Q0', params.Q0 || '서울특별시');
      queryParams.append('Q1', params.Q1 || '');
      if (params.QN) queryParams.append('QN', params.QN);
      queryParams.append('pageNo', params.pageNo || '1');
      queryParams.append('numOfRows', params.numOfRows || '10');
      queryParams.append('_type', 'json');
    }

    // ─────────────────────────────────────────
    // 2. 🚑 응급실찾기
    // 국립중앙의료원 응급의료기관 기본정보 조회
    // 파라미터: Q0(시도명), Q1(시군구명), pageNo, numOfRows
    // ─────────────────────────────────────────
    else if (type === 'emergency') {
      url = 'http://apis.data.go.kr/B552657/ErmctInfoInqireService/getEgytBassInfoInqire';
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
      url = 'http://apis.data.go.kr/1471000/DrbEasyDrugInfoService/getDrbEasyDrugList';
      queryParams.append('serviceKey', process.env.MEDICINE_API_KEY);
      queryParams.append('itemName', params.itemName || '');
      queryParams.append('pageNo', params.pageNo || '1');
      queryParams.append('numOfRows', params.numOfRows || '10');
      queryParams.append('type', 'json');
    }

    // ─────────────────────────────────────────
    // 4. 🏪 건강매장찾기
    // 소상공인시장진흥공단 상가(상권)정보
    // 파라미터: divId(구분), key(지역코드), indsLclsCd(대분류), indsMclsCd(중분류), pageNo, numOfRows
    // 건강관련 업종 중분류코드: I2(보건업), 건강용품: Q(스포츠·여가)
    // ─────────────────────────────────────────
    else if (type === 'store') {
      url = 'http://apis.data.go.kr/B553077/api/open/sdsc2/storeListInDong';
      queryParams.append('serviceKey', process.env.STORE_API_KEY);
      queryParams.append('pageNo', params.pageNo || '1');
      queryParams.append('numOfRows', params.numOfRows || '10');
      queryParams.append('indsLclsCd', params.indsLclsCd || 'Q');  // Q = 스포츠·여가·건강
      queryParams.append('indsMclsCd', params.indsMclsCd || 'Q12'); // Q12 = 건강·의료용품
      if (params.ctprvnCd) queryParams.append('ctprvnCd', params.ctprvnCd);
      if (params.signguCd) queryParams.append('signguCd', params.signguCd);
      queryParams.append('type', 'json');
    }

    // ─────────────────────────────────────────
    // 5. 🌿 한방약재사전
    // 식품의약품안전처 한약재 품질규격 정보
    // 파라미터: itemName(약재명), pageNo, numOfRows
    // ─────────────────────────────────────────
    else if (type === 'herbal') {
      url = 'http://apis.data.go.kr/1471000/HerbalMdcinInfoService/getHerbalMdcinList';
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
      url = 'http://apis.data.go.kr/B550928/LtcInsttInfoService2/getLtcInsttList2';
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
      url = 'http://apis.data.go.kr/1471000/FoodNtrIrdntInfoService1/getFoodNtrItdntList1';
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
      url = 'http://apis.data.go.kr/B551182/hospInfoServicev2/getHospBasisList';
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
      url = 'http://apis.data.go.kr/1471000/HealthFoodInfoService/getHealthFoodList';
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
