// ============================================================
// 📁 파일명: api/weather.js
// 📌 역할: GPS 위도/경도 → 카카오 주소변환 → 기상청 날씨 조회
// ============================================================

export default async function handler(req, res) {

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  /* 캐시 완전 비활성화 — 매번 새 데이터 요청 */
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');

  const WEATHER_KEY = process.env.WEATHER_API_KEY;
  const KAKAO_KEY   = process.env.KAKAO_API_KEY;

  if (!WEATHER_KEY) {
    return res.status(500).json({ ok: false, error: '날씨 API 키 없음' });
  }

  // ── 브라우저에서 전달받은 위도/경도 (없으면 서울 기본값) ──
  const lat = parseFloat(req.query.lat) || 37.5665;
  const lon = parseFloat(req.query.lon) || 126.9780;

  // ── ① 카카오 주소변환 API로 지역명 가져오기 ──
  let cityName = '내 지역';
  if (KAKAO_KEY) {
    try {
      const kakaoUrl =
        `https://dapi.kakao.com/v2/local/geo/coord2regioncode.json?x=${lon}&y=${lat}`;
      const kakaoRes  = await fetch(kakaoUrl, {
        headers: { 'Authorization': 'KakaoAK ' + KAKAO_KEY }
      });
      const kakaoData = await kakaoRes.json();
      const docs = kakaoData?.documents;

      if (docs && docs.length > 0) {
        const region = docs.find(d => d.region_type === 'H') || docs[0];

        const sido   = region.region_1depth_name || '';
        const sigu   = region.region_2depth_name || '';
        const dong   = region.region_3depth_name || '';

        const sidoShort = sido
          .replace('특별자치시', '')
          .replace('특별자치도', '')
          .replace('특별시', '')
          .replace('광역시', '')
          .trim();

        cityName = [sidoShort, sigu, dong].filter(Boolean).join(' ');
      }
    } catch (e) {
      cityName = '내 지역';
    }
  }

  // ── ② 위도/경도 → 기상청 격자 좌표(nx, ny) 변환 ──
  function latLonToGrid(lat, lon) {
    const RE    = 6371.00877;
    const GRID  = 5.0;
    const SLAT1 = 30.0;
    const SLAT2 = 60.0;
    const OLON  = 126.0;
    const OLAT  = 38.0;
    const XO    = 43;
    const YO    = 136;

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

  const { nx, ny } = latLonToGrid(lat, lon);

  // ── ③ 날짜·시간 계산 (한국시간 KST) ──
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

  if (hour < 2 || (hour === 2 && min < 10)) {
    const yesterday = new Date(kst.getTime() - 24 * 60 * 60 * 1000);
    baseDate = `${yesterday.getUTCFullYear()}${String(yesterday.getUTCMonth()+1).padStart(2,'0')}${String(yesterday.getUTCDate()).padStart(2,'0')}`;
    baseHour = 23;
  }

  const baseTime = String(baseHour).padStart(2, '0') + '00';

  // ── ④ 기상청 API 호출 ──
  const url =
    `http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst` +
    `?serviceKey=${encodeURIComponent(WEATHER_KEY)}` +
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

    let icon = '☀️', state = '맑음';
    if      (pty === '1') { icon = '🌧️'; state = '비'; }
    else if (pty === '3') { icon = '❄️'; state = '눈'; }
    else if (pty === '4') { icon = '🌦️'; state = '소나기'; }
    else if (sky === '4') { icon = '☁️'; state = '흐림'; }
    else if (sky === '3') { icon = '⛅'; state = '구름많음'; }

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
      city:  cityName
    });

  } catch (err) {
    return res.status(200).json({ ok: false, error: err.message });
  }
}
