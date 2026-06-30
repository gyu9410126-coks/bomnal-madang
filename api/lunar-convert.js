// 파일명: api/lunar-convert.js
// 역할: 양력 날짜 → 음력 날짜 변환
//       브라우저 → 이 파일 → 한국천문연구원 양음력변환 API

export default async function handler(req, res) {

  // ① 환경변수에서 API 키 가져오기
  const apiKey = process.env.LUNAR_CONVERT_KEY;

  if (!apiKey) {
    return res.status(500).json({ ok: false, message: 'API 키가 설정되지 않았습니다.' });
  }

  // ② 오늘 날짜 (또는 쿼리로 받은 날짜)
  const today = new Date();
  const solYear  = req.query.year  || today.getFullYear();
  const solMonth = req.query.month || String(today.getMonth() + 1).padStart(2, '0');
  const solDay   = req.query.day   || String(today.getDate()).padStart(2, '0');

  try {
    // ③ 한국천문연구원 양음력변환 API 요청
    const url =
      `https://apis.data.go.kr/B090041/openapi/service/LrsrCldInfoService/getLunCalInfo` +
      `?serviceKey=${encodeURIComponent(apiKey)}` +
      `&solYear=${solYear}` +
      `&solMonth=${solMonth}` +
      `&solDay=${solDay}` +
      `&_type=json`;

    // ④ API 서버에 데이터 요청
    const response = await fetch(url);
    const data = await response.json();
    const item = data?.response?.body?.items?.item;

    // ⑤ 데이터가 없을 때 처리
    if (!item) {
      return res.status(200).json({ ok: false, message: '음력 데이터가 없습니다.' });
    }

    // ⑥ 음력 날짜 추출
    const lunMonth = item.lunMonth; // 음력 월
    const lunDay   = item.lunDay;   // 음력 일
    const lunLeap  = item.lunLeapmonth === 'Y' ? '(윤)' : ''; // 윤달 여부

    // ⑦ 하루 단위 캐시
    res.setHeader('Cache-Control', 's-maxage=86400');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // ⑧ 앱에 JSON 형태로 결과 전달
    return res.status(200).json({
      ok: true,
      lunMonth: String(parseInt(lunMonth)),
      lunDay:   String(parseInt(lunDay)),
      lunLeap,
      text: '음력 ' + lunLeap + parseInt(lunMonth) + '월 ' + parseInt(lunDay) + '일'
    });

  } catch (err) {
    return res.status(500).json({ ok: false, message: '서버 오류: ' + err.message });
  }
}
