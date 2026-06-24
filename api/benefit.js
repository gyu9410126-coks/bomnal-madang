// api/benefit.js — 복지혜택 카테고리 API 프록시
// Vercel 서버리스 함수 (API 키를 클라이언트에 노출하지 않기 위한 중간 서버)

export default async function handler(req, res) {
  // CORS 헤더 설정 (어떤 도메인에서도 이 API를 호출할 수 있게)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // OPTIONS 요청 처리 (브라우저가 사전 확인하는 요청)
  if (req.method === 'OPTIONS') return res.status(200).end();

  // URL에서 type 파라미터 추출 (어떤 API를 호출할지 구분)
  const { type } = req.query;

  try {

    // ── 1. 전국사회복지시설 (복지시설찾기) ──────────────────────────
    if (type === 'welfare') {
      const { sido, sigungu, type: facilityType } = req.query;
      const key = encodeURIComponent(process.env.WELFARE_API_KEY);
      const url = `https://www.data.go.kr/iim/api/selectAPIAcountList.do`
        + `?serviceKey=${key}`
        + `&pageNo=1&numOfRows=20&resultType=json`
        + (sido       ? `&sido=${encodeURIComponent(sido)}`             : '')
        + (sigungu    ? `&sigungu=${encodeURIComponent(sigungu)}`       : '')
        + (facilityType ? `&fcltyTy=${encodeURIComponent(facilityType)}` : '');

      const r = await fetch(url);
      const data = await r.json();
      return res.status(200).json(data);
    }

    // ── 2. 중앙부처복지서비스 (복지혜택검색) ─────────────────────────
    if (type === 'benefit') {
      const { keyword, lifeNmArray } = req.query;
      const key = encodeURIComponent(process.env.BENEFIT_API_KEY);
      const url = `https://www.bokjiro.go.kr/ssis-tbu/twataa/wlfareInfo/moveTWAT52011M.do`
        + `?serviceKey=${key}`
        + `&pageNo=1&numOfRows=10&resultType=json`
        + (keyword      ? `&srchKeyword=${encodeURIComponent(keyword)}`         : '')
        + (lifeNmArray  ? `&lifeNmArray=${encodeURIComponent(lifeNmArray)}`     : '');

      const r = await fetch(url);
      const data = await r.json();
      return res.status(200).json(data);
    }

    // ── 3. 대한민국 공공서비스(혜택) ─────────────────────────────────
    if (type === 'public') {
      const { keyword, pageNo } = req.query;
      const key = encodeURIComponent(process.env.PUBLIC_SERVICE_KEY);
      const url = `https://apis.data.go.kr/1051000/WelfareLocInfoService1/getWelfareLocInfoService1`
        + `?serviceKey=${key}`
        + `&pageNo=${pageNo || 1}&numOfRows=10&resultType=json`
        + (keyword ? `&srchKeyword=${encodeURIComponent(keyword)}` : '');

      const r = await fetch(url);
      const data = await r.json();
      return res.status(200).json(data);
    }

    // ── 4. 마을변호사 지역별 현황 ─────────────────────────────────────
    if (type === 'lawyer') {
      const { sido, sigungu } = req.query;
      const key = encodeURIComponent(process.env.LAWYER_API_KEY);
      const url = `https://apis.data.go.kr/1320000/VillLawyerInfoService/getVillLawyerInfo`
        + `?serviceKey=${key}`
        + `&pageNo=1&numOfRows=20&resultType=json`
        + (sido    ? `&ctpvNm=${encodeURIComponent(sido)}`    : '')
        + (sigungu ? `&signguNm=${encodeURIComponent(sigungu)}` : '');

      const r = await fetch(url);
      const data = await r.json();
      return res.status(200).json(data);
    }

    // ── 5. 서민금융교육 콘텐츠 ───────────────────────────────────────
    if (type === 'finance') {
      const { pageNo } = req.query;
      const key = encodeURIComponent(process.env.FINANCE_EDU_KEY);
      const url = `https://apis.data.go.kr/1160100/service/GetFinancialEducationInfoService/getFinancialEducationInfo`
        + `?serviceKey=${key}`
        + `&pageNo=${pageNo || 1}&numOfRows=10&resultType=json`;

      const r = await fetch(url);
      const data = await r.json();
      return res.status(200).json(data);
    }

    // ── 6. 소상공인 상가정보 (주변 전통시장·상가) ────────────────────
    if (type === 'store') {
      const { keyword, sido, sigungu } = req.query;
      const key = encodeURIComponent(process.env.STORE_API_KEY);
      const url = `https://apis.data.go.kr/B553077/API/3.0/data/largeUpjongList`
        + `?serviceKey=${key}`
        + `&pageNo=1&numOfRows=20&resultType=json`
        + (keyword ? `&indsNm=${encodeURIComponent(keyword)}`      : '')
        + (sido    ? `&ctprvnCd=${encodeURIComponent(sido)}`        : '')
        + (sigungu ? `&signguCd=${encodeURIComponent(sigungu)}`     : '');

      const r = await fetch(url);
      const data = await r.json();
      return res.status(200).json(data);
    }

    // type 파라미터가 없거나 잘못된 경우
    return res.status(400).json({ error: 'type 파라미터가 필요합니다 (welfare/benefit/public/lawyer/finance/store)' });

  } catch (err) {
    // 서버 에러 처리
    console.error('[benefit.js error]', err);
    return res.status(500).json({ error: '서버 오류가 발생했습니다', detail: err.message });
  }
}
