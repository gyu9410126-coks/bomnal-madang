// ============================================================
// 📁 파일명: api/weather.js
// 📌 역할: 브라우저에서 받은 위도/경도로 기상청 날씨 조회
// ============================================================

export default async function handler(req, res) {

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const API_KEY = process.env.WEATHER_API_KEY;
  if (!API_KEY) {
    return res.status(500).json({ ok: false, error: 'API 키 없음' });
  }

  // ── 브라우저에서 전달받은 위도/경도 ──
  // 없으면 서울 기본값(위도 37.5665, 경도 126.9780) 사용
  const lat = parseFloat(req.query.lat) || 37.5665;
  const lon = parseFloat(req.query.lon) || 126.9780;

  // ── 위도/경도 → 기상청 격자 좌표(nx, ny) 변환 ──
  // 기상청은 지도를 5km 격자로 나눠서 위도/경도 대신 격자번호 사용
  // 아래 공식은 기상청 공식 변환 수식입니다
  function latLonToGrid(lat, lon) {
    const RE     = 6371.00877;  // 지구 반경 (km)
    const GRID   = 5.0;         // 격자 간격 (km)
    const SLAT1  = 30.0;        // 표준 위도 1
    const SLAT2  = 60.0;        // 표준 위도 2
    const OLON   = 126.0;       // 기준 경도
    const OLAT   = 38.0;        // 기준 위도
    const XO     = 43;          // 기준점 X 격자
    const YO     = 136;         // 기준점 Y 격자

    const DEGRAD = Math.PI / 180.0;
    const re     = RE / GRID;
    const slat1  = SLAT1 * DEGRAD;
    const slat2  = SLAT2 * DEGRAD;
    const olon   = OLON  * DEGRAD;
    const olat   = OLAT  * DEGRAD;

    let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
    sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
    let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
    sf = Math.pow(sf, sn) * Math.cos(slat1) / sn;
    let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
    ro = re * sf / Math.pow(ro, sn);

    let ra = Math.tan(Math.PI * 0.25 + lat * DEGRAD * 0.5);
    ra = re * sf / Math.pow(ra, sn);
    let theta = lon * DEGRAD - olon;
    if (theta > Math.PI)  theta -= 2.0 * Math.PI;
    if (theta < -Math.PI) theta += 2.0 * Math.PI;
    theta *= sn;

    const nx = Math.floor(ra * Math.sin(theta) + XO + 0.5);
    const ny = Math.floor(ro - ra * Math.cos(theta) + YO + 0.5);
    return { nx, ny };
  }

  // ── 위도/경도 → 지역명 변환 (대략적인 시/도 기준) ──
  function getCityName(lat, lon) {
    if (lat >= 37.4 && lat <= 37.7 && lon >= 126.7 && lon <= 127.3) return '서울';
    if (lat >= 37.3 && lat <= 37.6 && lon >= 126.4 && lon <= 126.8) return '인천';
    if (lat >= 37.1 && lat <= 37.5 && lon >= 126.6 && lon <= 127.5) return '경기';
    if (lat >= 35.0 && lat <= 35.3 && lon >= 128.8 && lon <= 129.3) return '부산';
    if (lat >= 35.7 && lat <= 36.1 && lon >= 128.4 && lon <= 128.8) return '대구';
    if (lat >= 35.1 && lat <= 35.4 && lon >= 126.7 && lon <= 127.0) return '광주';
    if (lat >= 36.2 && lat <= 36.5 && lon >= 127.2 && lon <= 127.6) return '대전';
    if (lat >= 35.4 && lat <= 35.7 && lon >= 129.1 && lon <= 129.5) return '울산';
    if (lat >= 36.5 && lat <= 37.0 && lon >= 127.0 && lon <= 127.8) return '충북';
    if (lat >= 36.0 && lat <= 36.7 && lon >= 126.3 && lon <= 127.2) return '충남';
    if (lat >= 35.6 && lat <= 36.2 && lon >= 127.4 && lon <= 128.1) return '전북';
    if (lat >= 34.3 && lat <= 35.5 && lon >= 126.3 && lon <= 127.3) return '전남';
    if (lat >= 35.5 && lat <= 36.9 && lon >= 128.0 && lon <= 129.4) return '경북';
    if (lat >= 34.7 && lat <= 35.7 && lon >= 127.5 && lon <= 128.9) return '경남';
    if (lat >= 33.1 && lat <= 33.6 && lon >= 126.1 && lon <= 126.9) return '제주';
    if (lat >= 37.0 && lat <= 38.6 && lon >= 127.5 && lon <= 129.4) return '강원';
    return '내 지역';
  }

  const { nx, ny } = latLonToGrid(lat, lon);
  const cityName   = getCityName(lat, lon);

  // ── 날짜·시간 계산 (한국시간 KST) ──
  const now  = new Date();
  const kst  = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const year  = kst.getUTCFullYear();
  const month = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const day   = String(kst.getUTCDate()).padStart(2, '0');
  const hour  = kst.getUTCHours();
  const min   = kst.getUTCMinutes();

  let baseDate = `${year}${month}${day}`;
  const releaseTimes = [2, 5, 8, 11, 14, 17, 20, 23];
  let baseHour = 23;

  for (let i = releaseTimes.length - 1; i >= 0; i--) {
    if (hour > releaseTimes[i] || (hour === releaseTimes[i] && min >= 10)) {
      baseHour = releaseTimes[i];
      break;
    }
  }

  // 자정~02:10 사이면 전날 23시 데이터 사용
  if (hour < 2 || (hour === 2 && min < 10)) {
    const yesterday = new Date(kst.getTime() - 24 * 60 * 60 * 1000);
    baseDate = `${yesterday.getUTCFullYear()}${String(yesterday.getUTCMonth()+1).padStart(2,'0')}${String(yesterday.getUTCDate()).padStart(2,'0')}`;
    baseHour = 23;
  }

  const baseTime = String(baseHour).padStart(2, '0') + '00';

  // ── 기상청 API 호출 ──
  const url =
    `http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst` +
    `?serviceKey=${encodeURIComponent(API_KEY)}` +
    `&pageNo=1&numOfRows=100&dataType=JSON` +
    `&base_date=${baseDate}&base_time=${baseTime}` +
    `&nx=${nx}&ny=${ny}`;

  try {
    const apiRes  = await fetch(url);
    const apiData = await apiRes.json();
    const items   = apiData?.response?.body?.items?.item;

    if (!items || items.length === 0) {
      return res.status(200).json({ ok: false, error: '날씨 데이터 없음' });
    }

    let tmp = null, sky = null, pty = null, pop = null;
    const targetHour = String(hour).padStart(2, '0') + '00';

    items.forEach(function(item) {
      if (item.fcstTime === targetHour || tmp === null) {
        if (item.category === 'TMP') tmp = item.fcstValue;
        if (item.category === 'SKY') sky = item.fcstValue;
        if (item.category === 'PTY') pty = item.fcstValue;
        if (item.category === 'POP') pop = item.fcstValue;
      }
    });

    // ── 날씨 아이콘·상태 변환 ──
    let icon = '☀️', state = '맑음';
    if      (pty === '1') { icon = '🌧️'; state = '비'; }
    else if (pty === '3') { icon = '❄️'; state = '눈'; }
    else if (pty === '4') { icon = '🌦️'; state = '소나기'; }
    else if (sky === '4') { icon = '☁️'; state = '흐림'; }
    else if (sky === '3') { icon = '⛅'; state = '구름많음'; }

    // ── 시간대별 메시지 ──
    let msg;
    if      (hour < 6)  msg = '이른 새벽, 건강 챙기세요!';
    else if (hour < 12) msg = '상쾌한 아침입니다! 😊';
    else if (hour < 18) msg = '오늘도 좋은 하루 되세요!';
    else                msg = '편안한 저녁 되세요! 🌙';

    return res.status(200).json({
      ok:    true,
      icon:  icon,
      temp:  tmp ? tmp + '°C' : '--°C',
      state: state,
      pop:   pop ? pop + '%' : '0%',
      msg:   msg,
      city:  cityName   // ← 지역명도 함께 반환
    });

  } catch (err) {
    return res.status(200).json({ ok: false, error: err.message });
  }
}
