// api/benefit.js — 복지혜택 카테고리 API 프록시
// Vercel 서버리스 함수 (API 키를 클라이언트에 노출하지 않기 위한 중간 서버)

// XML 문자열에서 태그 값을 추출하는 헬퍼 함수
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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { type } = req.query;

  try {

    // ── 1. 사회복지시설 현황 (복지시설찾기) ─────────────────────────
    if (type === 'welfare') {
      const { sido, sigungu, type: facilityType } = req.query;
      const key = encodeURIComponent(process.env.WELFARE_API_KEY);
      const url = `https://apis.data.go.kr/B554287/sclWlfrFcltInfoInqirService1/getNFcltBizInqire`
        + `?serviceKey=${key}`
        + `&pageNo=1&numOfRows=20`
        + (sido        ? `&ctpvNm=${encodeURIComponent(sido)}`       : '')
        + (sigungu     ? `&signguNm=${encodeURIComponent(sigungu)}`  : '')
        + (facilityType? `&fcltyTy=${encodeURIComponent(facilityType)}` : '');

      const r = await fetch(url);
      const xml = await r.text();
      const items = parseXmlItems(xml, 'item');
      return res.status(200).json({ items });
    }

    // ── 2. 중앙부처복지서비스 (복지혜택검색) ────────────────────────
    if (type === 'benefit') {
      const { keyword } = req.query;
      const key = encodeURIComponent(process.env.BENEFIT_API_KEY);
      const url = `https://apis.data.go.kr/B554287/NationalWelfareInformationsV001/NationalWelfarelistV001`
        + `?serviceKey=${key}`
        + `&callTp=L`
        + `&pageNo=1&numOfRows=10`
        + (keyword ? `&searchWrd=${encodeURIComponent(keyword)}` : '')
        + `&srchKeyCode=001`;

      const r = await fetch(url);
      const xml = await r.text();
      const items = parseXmlItems(xml, 'servList');
      return res.status(200).json({ items });
    }

    // ── 3. 마을변호사 지역별 현황 ───────────────────────────────────
    if (type === 'lawyer') {
      const { sido, sigungu } = req.query;
      const key = encodeURIComponent(process.env.LAWYER_API_KEY);
      const url = `https://apis.data.go.kr/1270000/mojmabyun/mabyun`
        + `?serviceKey=${key}`
        + `&pageNo=1&numOfRows=20`
        + (sido    ? `&ctpvNm=${encodeURIComponent(sido)}`     : '')
        + (sigungu ? `&signguNm=${encodeURIComponent(sigungu)}` : '');

      const r = await fetch(url);
      const xml = await r.text();
      const items = parseXmlItems(xml, 'item');
      return res.status(200).json({ items });
    }

    // ── 4. 서민금융교육 콘텐츠 ─────────────────────────────────────
    if (type === 'finance') {
      const { pageNo } = req.query;
      const key = encodeURIComponent(process.env.FINANCE_EDU_KEY);
      const url = `https://apis.data.go.kr/B553701/SeominFinancialEducationContentsInfoService/getFinancialEducationContentsInfo`
        + `?serviceKey=${key}`
        + `&pageNo=${pageNo || 1}&numOfRows=10`;

      const r = await fetch(url);
      const xml = await r.text();
      const items = parseXmlItems(xml, 'item');
      return res.status(200).json({ items });
    }

    // ── 5. 소상공인 상가정보 (전통시장·상가) ────────────────────────
    if (type === 'store') {
      const { keyword, sido, sigungu } = req.query;
      const key = encodeURIComponent(process.env.STORE_API_KEY);
      const url = `https://apis.data.go.kr/B553077/api/open/sdsc2/storeListInUpjong`
        + `?serviceKey=${key}`
        + `&pageNo=1&numOfRows=20&resultType=json`
        + (keyword ? `&indsNm=${encodeURIComponent(keyword)}` : '')
        + (sido    ? `&ctprvnCd=${encodeURIComponent(sido)}`  : '')
        + (sigungu ? `&signguCd=${encodeURIComponent(sigungu)}` : '');

      const r = await fetch(url);
      const data = await r.json();
      return res.status(200).json(data);
    }

    return res.status(400).json({ error: 'type 파라미터가 필요합니다 (welfare/benefit/lawyer/finance/store)' });

  } catch (err) {
    console.error('[benefit.js error]', err);
    return res.status(500).json({ error: '서버 오류가 발생했습니다', detail: err.message });
  }
}
