// 파일명: api/lunar-convert.js
// 역할: 양력 날짜 → 음력 날짜 변환 (한국천문연구원 API)
//       - solDay 까지 주면: 하루치 (헤더용)
//       - solDay 없이 solYear+solMonth만 주면: 한달 전체 (달력용)

export default async function handler(req, res) {

  // ① 환경변수에서 API 키 가져오기
  const apiKey = process.env.LUNAR_CONVERT_KEY;

  if (!apiKey) {
    return res.status(500).json({ ok: false, message: 'API 키가 설정되지 않았습니다.' });
  }

  // ② 쿼리 파라미터로 년/월/일 받기 (일은 선택)
  const today = new Date();
  const solYear  = req.query.year  || today.getFullYear();
  const solMonth = req.query.month || String(today.getMonth() + 1).padStart(2, '0');
  const solDay   = req.query.day || null; // 없으면 한달 전체 조회

  try {
    // ③ API 요청 주소 만들기
    let url =
      `https://apis.data.go.kr/B090041/openapi/service/LrsrCldInfoService/getLunCalInfo` +
      `?serviceKey=${encodeURIComponent(apiKey)}` +
      `&solYear=${solYear}` +
      `&solMonth=${String(solMonth).padStart(2,'0')}` +
      `&numOfRows=31` +
      `&_type=json`;

    if (solDay) {
      url += `&solDay=${String(solDay).padStart(2,'0')}`;
    }

    // ④ API 서버에 데이터 요청
    const response = await fetch(url);
    const data = await response.json();
    const items = data?.response?.body?.items?.item;

    // ⑤ 데이터가 없을 때 처리
    if (!items) {
      return res.status(200).json({ ok: false, message: '음력 데이터가 없습니다.' });
    }

    // ⑥ 배열이 아닌 경우(하루치만 있을 때)도 배열로 통일
    const list = Array.isArray(items) ? items : [items];

    // ⑦ 보기 좋은 형태로 정리
    const days = list.map(function(item) {
      const lunMonth = parseInt(item.lunMonth);
      const lunDay   = parseInt(item.lunDay);
      const lunLeap  = item.lunLeapmonth === 'Y' ? '(윤)' : '';
      const solDayNum = parseInt(item.solDay);
      return {
        solDay: solDayNum,          // 양력 일
        lunMonth: lunMonth,         // 음력 월
        lunDay: lunDay,             // 음력 일
        lunLeap: lunLeap,           // 윤달 여부
        text: lunMonth + '/' + lunDay // 달력 칸에 쓰기 좋은 짧은 형태 (예: 5/12)
      };
    });

    // ⑧ 하루 단위 캐시
    res.setHeader('Cache-Control', 's-maxage=86400');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // ⑨ 하루치 조회면 편하게 today 필드도 같이 줌
    return res.status(200).json({
      ok: true,
      year: solYear,
      month: solMonth,
      days: days,
      today: solDay ? days[0] : null
    });

  } catch (err) {
    return res.status(500).json({ ok: false, message: '서버 오류: ' + err.message });
  }
}
