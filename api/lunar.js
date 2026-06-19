// 파일명: api/lunar.js
// 역할: Vercel 서버리스 함수
//       브라우저 → 이 파일 → 한국천문연구원 특일정보 API 순서로 공휴일 데이터를 가져옴
//       (브라우저에서 직접 API를 부르면 CORS 오류가 나기 때문에 중간 다리 역할)

export default async function handler(req, res) {

  // ① 환경변수에서 API 키 가져오기
  const apiKey = process.env.LUNAR_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ ok: false, message: 'API 키가 설정되지 않았습니다.' });
  }

  // ② 쿼리 파라미터에서 년도 받기
  const year = req.query.year || new Date().getFullYear();

  try {
    // ③ 한국천문연구원 특일정보 API 요청 (1~12월 한꺼번에)
    const url =
      `https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo` +
      `?serviceKey=${encodeURIComponent(apiKey)}` +
      `&solYear=${year}` +
      `&numOfRows=50` +
      `&_type=json`;

    // ④ API 서버에 데이터 요청
    const response = await fetch(url);
    const data = await response.json();
    const items = data?.response?.body?.items?.item;

    // ⑤ 데이터가 없을 때 처리
    if (!items) {
      return res.status(200).json({ ok: false, message: '공휴일 데이터가 없습니다.' });
    }

    // ⑥ 배열이 아닌 경우(1개만 있을 때)도 배열로 통일
    const list = Array.isArray(items) ? items : [items];

    // ⑦ 날짜 키(YYYY-MM-DD) : 공휴일명 형태로 변환
    const holidays = {};
    list.forEach(function(item) {
      const dateStr = String(item.locdate);
      // 20260101 → 2026-01-01 형태로 변환
      const key = dateStr.slice(0,4) + '-' + dateStr.slice(4,6) + '-' + dateStr.slice(6,8);
      holidays[key] = item.dateName;
    });

    // ⑧ 하루 단위 캐시 (86400초 = 1일)
    res.setHeader('Cache-Control', 's-maxage=86400');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // ⑨ 앱에 JSON 형태로 결과 전달
    return res.status(200).json({ ok: true, year, holidays });

  } catch (err) {
    return res.status(500).json({ ok: false, message: '서버 오류: ' + err.message });
  }
}
