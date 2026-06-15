// ============================================================
// 📁 파일명: api/weather.js
// 📌 역할: 기상청 API를 대신 호출해서 결과를 앱에 전달하는 중계소
//         (API 키가 브라우저에 노출되지 않도록 서버에서 처리)
// ============================================================

export default async function handler(req, res) {

  // ── CORS 설정: 봄날마당 도메인에서만 접근 허용 ──
  // (CORS = 다른 주소에서 이 API 호출을 허용할지 결정하는 규칙)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  // ── 기상청 API 키 (Vercel 환경변수에서 가져옴 — 코드에 직접 쓰면 위험!) ──
  const API_KEY = process.env.WEATHER_API_KEY;

  if (!API_KEY) {
    return res.status(500).json({ ok: false, error: 'API 키가 설정되지 않았습니다.' });
  }

  // ── 오늘 날짜·시간 계산 ──
  // 기상청 단기예보는 하루 8번 발표: 02,05,08,11,14,17,20,23시
  const now = new Date();

  // 한국 시간(KST)으로 변환 (UTC+9)
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);

  const year  = kst.getUTCFullYear();
  const month = String(kst.getUTCMonth() + 1).padStart(2, '0'); // 01~12
  const day   = String(kst.getUTCDate()).padStart(2, '0');       // 01~31
  const hour  = kst.getUTCHours(); // 0~23

  const baseDate = `${year}${month}${day}`; // 예: 20260616

  // 가장 최근 발표 시간 계산 (발표 후 10분 뒤부터 사용 가능)
  // 발표 시각: 0200, 0500, 0800, 1100, 1400, 1700, 2000, 2300
  const releaseTimes = [2, 5, 8, 11, 14, 17, 20, 23];
  let baseHour = 23; // 기본값: 전날 23시
  let fetchDate = baseDate;

  for (let i = releaseTimes.length - 1; i >= 0; i--) {
    // 발표 후 최소 10분 경과해야 데이터 준비됨
    if (hour > releaseTimes[i] || (hour === releaseTimes[i] && kst.getUTCMinutes() >= 10)) {
      baseHour = releaseTimes[i];
      break;
    }
  }

  // 자정~02:10 사이면 전날 23시 데이터 사용
  if (hour < 2 || (hour === 2 && kst.getUTCMinutes() < 10)) {
    const yesterday = new Date(kst.getTime() - 24 * 60 * 60 * 1000);
    const yy = yesterday.getUTCFullYear();
    const ym = String(yesterday.getUTCMonth() + 1).padStart(2, '0');
    const yd = String(yesterday.getUTCDate()).padStart(2, '0');
    fetchDate = `${yy}${ym}${yd}`;
    baseHour  = 23;
  }

  const baseTime = String(baseHour).padStart(2, '0') + '00'; // 예: 0800

  // ── 서울 격자 좌표 (nx=60, ny=127) ──
  // 기상청은 지도를 격자로 나눠서 좌표 대신 격자번호 사용
  const nx = 60;
  const ny = 127;

  // ── 기상청 API 호출 ──
  const url =
    `http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst` +
    `?serviceKey=${encodeURIComponent(API_KEY)}` +
    `&pageNo=1&numOfRows=100` +
    `&dataType=JSON` +
    `&base_date=${fetchDate}` +
    `&base_time=${baseTime}` +
    `&nx=${nx}&ny=${ny}`;

  try {
    const apiRes  = await fetch(url);
    const apiData = await apiRes.json();

    const items = apiData?.response?.body?.items?.item;

    if (!items || items.length === 0) {
      return res.status(200).json({ ok: false, error: '날씨 데이터 없음' });
    }

    // ── 필요한 값만 추출 ──
    // TMP: 기온(°C), SKY: 하늘상태(1맑음/3구름많음/4흐림), PTY: 강수형태(0없음/1비/3눈/4소나기)
    let tmp = null; // 기온
    let sky = null; // 하늘상태
    let pty = null; // 강수형태
    let pop = null; // 강수확률(%)

    // 현재 시간에 가장 가까운 예보 추출
    const targetHour = String(hour).padStart(2, '0') + '00';

    items.forEach(function(item) {
      if (item.fcstTime === targetHour || tmp === null) {
        if (item.category === 'TMP') tmp = item.fcstValue;
        if (item.category === 'SKY') sky = item.fcstValue;
        if (item.category === 'PTY') pty = item.fcstValue;
        if (item.category === 'POP') pop = item.fcstValue;
      }
    });

    // ── 날씨 아이콘·상태 텍스트 변환 ──
    let icon  = '☀️';
    let state = '맑음';

    if (pty === '1')      { icon = '🌧️'; state = '비'; }
    else if (pty === '3') { icon = '❄️'; state = '눈'; }
    else if (pty === '4') { icon = '🌦️'; state = '소나기'; }
    else if (sky === '4') { icon = '☁️'; state = '흐림'; }
    else if (sky === '3') { icon = '⛅'; state = '구름많음'; }
    else                  { icon = '☀️'; state = '맑음'; }

    // ── 시간대별 인사 메시지 ──
    let msg;
    if      (hour < 6)  msg = '이른 새벽, 건강 챙기세요!';
    else if (hour < 12) msg = '상쾌한 아침입니다! 😊';
    else if (hour < 18) msg = '오늘도 좋은 하루 되세요!';
    else                msg = '편안한 저녁 되세요! 🌙';

    // ── 결과 반환 ──
    return res.status(200).json({
      ok:    true,
      icon:  icon,
      temp:  tmp ? tmp + '°C' : '--°C',
      state: state,
      pop:   pop ? pop + '%' : '0%', // 강수확률
      msg:   msg
    });

  } catch (err) {
    return res.status(200).json({ ok: false, error: err.message });
  }
}
