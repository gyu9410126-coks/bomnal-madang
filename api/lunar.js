// 파일명: api/lunar.js
// 역할: Vercel 서버리스 함수
//       브라우저 → 이 파일 → 한국천문연구원 API 순서로 음력 데이터를 가져옴
//       (브라우저에서 직접 API를 부르면 CORS 오류가 나기 때문에 중간 다리 역할)

export default async function handler(req, res) {

  // ① 환경변수에서 API 키 가져오기
  const apiKey = process.env.LUNAR_API_KEY;

  // API 키가 없으면 오류 반환
  if (!apiKey) {
    return res.status(500).json({ ok: false, message: 'API 키가 설정되지 않았습니다.' });
  }

  // ② 쿼리 파라미터에서 년도·월 받기
  const year  = req.query.year;
  const month = req.query.month;

  if (!year || !month) {
    return res.status(400).json({ ok: false, message: 'year, month 파라미터가 필요합니다.' });
  }

  // ③ 해당 월의 날짜 수 계산
  const pad = (n) => String(n).padStart(2, '0');
  const daysInMonth = new Date(year, month, 0).getDate();
  const results = [];

  try {
    for (let d = 1; d <= daysInMonth; d++) {

      // ④ 하루씩 API 요청 주소 조립
      const url =
        `https://apis.data.go.kr/B090041/openapi/service/LrsrCldInfoService/getLunCalInfo` +
        `?serviceKey=${encodeURIComponent(apiKey)}` +
        `&solYear=${year}` +
        `&solMonth=${pad(month)}` +
        `&solDay=${pad(d)}` +
        `&_type=json`;

      // ⑤ 한국천문연구원 서버에 데이터 요청
      const response = await fetch(url);
      const data = await response.json();
      const item = data?.response?.body?.items?.item;

      // ⑥ 필요한 값만 추출해서 저장
      results.push({
        day:          d,
        lunMonth:     item?.lunMonth     || '',   // 음력 월
        lunDay:       item?.lunDay       || '',   // 음력 일
        lunLeapmonth: item?.lunLeapmonth || '',   // 윤달 여부 (윤: Y)
        lunSecha:     item?.lunSecha     || '',   // 육십갑자 (예: 갑진)
        lunNday:      item?.lunNday      || ''    // 음력 월의 날수
      });
    }

    // ⑦ 하루 단위로 캐시 저장 (86400초 = 1일)
    //    음력은 매일 바뀌지 않으니 하루 캐시로 API 호출 횟수 절약
    res.setHeader('Cache-Control', 's-maxage=86400');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // ⑧ 앱에 JSON 형태로 결과 전달
    return res.status(200).json({ ok: true, year, month, data: results });

  } catch (err) {
    // ⑨ 오류 발생 시 에러 메시지 전달
    return res.status(500).json({ ok: false, message: '서버 오류: ' + err.message });
  }
}
