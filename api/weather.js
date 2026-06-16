// ============================================================
// 📁 파일명: api/weather.js
// 📌 역할: GPS 위도/경도 → 카카오 주소변환 → 기상청 날씨 조회
//          단기예보(오늘) + 중기예보(7일) + 기상특보 통합
// ============================================================

export default async function handler(req, res) {

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');

  const WEATHER_KEY = process.env.WEATHER_API_KEY;
  const KAKAO_KEY   = process.env.KAKAO_API_KEY;

  if (!WEATHER_KEY) {
    return res.status(500).json({ ok: false, error: '날씨 API 키 없음' });
  }

  const lat = parseFloat(req.query.lat) || 37.5665;
  const lon = parseFloat(req.query.lon) || 126.9780;

  // ── ① 카카오 주소변환 ──
  let cityName = '내 지역';
  let sido2    = '11B';  // 기상청 중기예보 지역코드 기본값(서울/경기)
  let sido3    = '11B10101'; // 기상특보 구역코드 기본값(서울)

  if (KAKAO_KEY) {
    try {
      const kakaoRes  = await fetch(
        `https://dapi.kakao.com/v2/local/geo/coord2regioncode.json?x=${lon}&y=${lat}`,
        { headers: { 'Authorization': 'KakaoAK ' + KAKAO_KEY } }
      );
      const kakaoData = await kakaoRes.json();
      const docs = kakaoData?.documents;
      if (docs && docs.length > 0) {
        const region = docs.find(d => d.region_type === 'H') || docs[0];
        const sido   = region.region_1depth_name || '';
        const sigu   = region.region_2depth_name || '';
        const dong   = region.region_3depth_name || '';
        const sidoShort = sido
          .replace('특별자치시','').replace('특별자치도','')
          .replace('특별시','').replace('광역시','').trim();
        cityName = [sidoShort, sigu, dong].filter(Boolean).join(' ');

        // 중기예보 지역코드 매핑 (시/도 기준)
        const midMap = {
          '서울':'11B','경기':'11B','인천':'11B',
          '강원':'11D','충북':'11C','충남':'11C','대전':'11C','세종':'11C',
          '경북':'11H','경남':'11H','부산':'11H','울산':'11H','대구':'11H',
          '전북':'11F','전남':'11F','광주':'11F',
          '제주':'11G'
        };
        for (const key of Object.keys(midMap)) {
          if (sido.includes(key)) { sido2 = midMap[key]; break; }
        }

        // 기상특보 구역코드 매핑
        const alertMap = {
          '서울':'11B10101','경기':'11B20601','인천':'11B20201',
          '강원':'11D10301','충북':'11C10301','충남':'11C20401','대전':'11C20401','세종':'11C20401',
          '경북':'11H10701','경남':'11H20301','부산':'11H20201','울산':'11H20101','대구':'11H10501',
          '전북':'11F10201','전남':'11F20401','광주':'11F20501',
          '제주':'11G00201'
        };
        for (const key of Object.keys(alertMap)) {
          if (sido.includes(key)) { sido3 = alertMap[key]; break; }
        }
      }
    } catch (e) { cityName = '내 지역'; }
  }

  // ── ② 격자 좌표 변환 ──
  function latLonToGrid(lat, lon) {
    const RE=6371.00877,GRID=5.0,SLAT1=30.0,SLAT2=60.0,OLON=126.0,OLAT=38.0,XO=43,YO=136;
    const DEGRAD=Math.PI/180.0;
    const re=RE/GRID,slat1=SLAT1*DEGRAD,slat2=SLAT2*DEGRAD,olon=OLON*DEGRAD,olat=OLAT*DEGRAD;
    let sn=Math.tan(Math.PI*0.25+slat2*0.5)/Math.tan(Math.PI*0.25+slat1*0.5);
    sn=Math.log(Math.cos(slat1)/Math.cos(slat2))/Math.log(sn);
    let sf=Math.tan(Math.PI*0.25+slat1*0.5);
    sf=Math.pow(sf,sn)*Math.cos(slat1)/sn;
    let ro=Math.tan(Math.PI*0.25+olat*0.5);
    ro=re*sf/Math.pow(ro,sn);
    let ra=Math.tan(Math.PI*0.25+lat*DEGRAD*0.5);
    ra=re*sf/Math.pow(ra,sn);
    let theta=lon*DEGRAD-olon;
    if(theta>Math.PI)theta-=2.0*Math.PI;
    if(theta<-Math.PI)theta+=2.0*Math.PI;
    theta*=sn;
    return { nx:Math.floor(ra*Math.sin(theta)+XO+0.5), ny:Math.floor(ro-ra*Math.cos(theta)+YO+0.5) };
  }
  const { nx, ny } = latLonToGrid(lat, lon);

  // ── ③ 날짜·시간 계산 ──
  const now   = new Date();
  const kst   = new Date(now.getTime() + 9*60*60*1000);
  const year  = kst.getUTCFullYear();
  const month = String(kst.getUTCMonth()+1).padStart(2,'0');
  const day   = String(kst.getUTCDate()).padStart(2,'0');
  const hour  = kst.getUTCHours();
  const min   = kst.getUTCMinutes();

  let baseDate = `${year}${month}${day}`;
  const releaseTimes = [2,5,8,11,14,17,20,23];
  let baseHour = 23;
  for (let i=releaseTimes.length-1; i>=0; i--) {
    if (hour>releaseTimes[i]||(hour===releaseTimes[i]&&min>=10)) { baseHour=releaseTimes[i]; break; }
  }
  if (hour<2||(hour===2&&min<10)) {
    const yesterday = new Date(kst.getTime()-24*60*60*1000);
    baseDate=`${yesterday.getUTCFullYear()}${String(yesterday.getUTCMonth()+1).padStart(2,'0')}${String(yesterday.getUTCDate()).padStart(2,'0')}`;
    baseHour=23;
  }
  const baseTime = String(baseHour).padStart(2,'0')+'00';

  // 중기예보용 날짜 (오늘 기준 tmFc: 0600 or 1800)
  const midTmFc = `${year}${month}${day}${hour>=18?'1800':'0600'}`;

  // ── ④ 단기예보 API 호출 ──
  const shortUrl =
    `http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst` +
    `?serviceKey=${encodeURIComponent(WEATHER_KEY)}` +
    `&pageNo=1&numOfRows=200&dataType=JSON` +
    `&base_date=${baseDate}&base_time=${baseTime}&nx=${nx}&ny=${ny}`;

  // ── ⑤ 중기예보 API 호출 (기온) ──
  const midTempUrl =
    `http://apis.data.go.kr/1360000/MidFcstInfoService/getMidTa` +
    `?serviceKey=${encodeURIComponent(WEATHER_KEY)}` +
    `&pageNo=1&numOfRows=10&dataType=JSON` +
    `&regId=${sido2}00&tmFc=${midTmFc}`;

  // ── ⑥ 중기예보 API 호출 (육상날씨) ──
  const midLandUrl =
    `http://apis.data.go.kr/1360000/MidFcstInfoService/getMidLandFcst` +
    `?serviceKey=${encodeURIComponent(WEATHER_KEY)}` +
    `&pageNo=1&numOfRows=10&dataType=JSON` +
    `&regId=${sido2}&tmFc=${midTmFc}`;

  // ── ⑦ 기상특보 API 호출 ──
  const alertUrl =
    `http://apis.data.go.kr/1360000/WthrWrnInfoService/getWthrWrnMsg` +
    `?serviceKey=${encodeURIComponent(WEATHER_KEY)}` +
    `&pageNo=1&numOfRows=10&dataType=JSON` +
    `&stnId=108`;

  try {
    // 4개 API 동시 호출
    const [shortRes, midTempRes, midLandRes, alertRes] = await Promise.allSettled([
      fetch(shortUrl),
      fetch(midTempUrl),
      fetch(midLandUrl),
      fetch(alertUrl)
    ]);

    // ── 단기예보 파싱 ──
    let tmp=null, sky=null, pty=null, pop=null, tmn=null, tmx=null, wsd=null;
    if (shortRes.status==='fulfilled') {
      const apiData = await shortRes.value.json();
      const items   = apiData?.response?.body?.items?.item || [];
      const targetHour = String(hour).padStart(2,'0')+'00';
      items.forEach(function(item) {
        if (item.fcstTime===targetHour||tmp===null) {
          if(item.category==='TMP') tmp=item.fcstValue;
          if(item.category==='SKY') sky=item.fcstValue;
          if(item.category==='PTY') pty=item.fcstValue;
          if(item.category==='POP') pop=item.fcstValue;
          if(item.category==='WSD') wsd=item.fcstValue;
        }
        if(item.category==='TMN') tmn=item.fcstValue;
        if(item.category==='TMX') tmx=item.fcstValue;
      });
    }

    // 날씨 아이콘·상태 결정
    function getIconState(ptyVal, skyVal) {
      if(ptyVal==='1') return {icon:'🌧️',state:'비'};
      if(ptyVal==='3') return {icon:'❄️',state:'눈'};
      if(ptyVal==='4') return {icon:'🌦️',state:'소나기'};
      if(skyVal==='4') return {icon:'☁️',state:'흐림'};
      if(skyVal==='3') return {icon:'⛅',state:'구름많음'};
      return {icon:'☀️',state:'맑음'};
    }
    const {icon, state} = getIconState(pty, sky);

    // 체감온도 계산 (간단 공식)
    const tmpNum = parseFloat(tmp)||0;
    const wsdNum = parseFloat(wsd)||0;
    const feel   = Math.round(13.12 + 0.6215*tmpNum - 11.37*Math.pow(wsdNum,0.16) + 0.3965*Math.pow(wsdNum,0.16)*tmpNum);

    let msg;
    if(hour<6)       msg='이른 새벽, 건강 챙기세요!';
    else if(hour<12) msg='상쾌한 아침입니다! 😊';
    else if(hour<18) msg='오늘도 좋은 하루 되세요!';
    else             msg='편안한 저녁 되세요! 🌙';

    // ── 중기예보 파싱 (3~7일) ──
    const week = [];
    const days = ['일','월','화','수','목','금','토'];
    const today = new Date(kst.getTime());

    if (midTempRes.status==='fulfilled' && midLandRes.status==='fulfilled') {
      const midTempData = await midTempRes.value.json();
      const midLandData = await midLandRes.value.json();
      const tempItem = midTempData?.response?.body?.items?.item?.[0];
      const landItem = midLandData?.response?.body?.items?.item?.[0];

      for (let d=3; d<=7; d++) {
        const futureDate = new Date(today.getTime() + d*24*60*60*1000);
        const dow = days[futureDate.getDay()];
        const tmnKey = `taMin${d}`;
        const tmxKey = `taMax${d}`;
        const wfKey  = d<=4 ? `wf${d}Am` : `wf${d}`;

        const lo  = tempItem?.[tmnKey] ?? '--';
        const hi  = tempItem?.[tmxKey] ?? '--';
        const wf  = landItem?.[wfKey]  ?? '';

        function wfToIcon(wf) {
          if(!wf) return {icon:'☀️',state:'맑음'};
          if(wf.includes('비') && wf.includes('눈')) return {icon:'🌨️',state:'비/눈'};
          if(wf.includes('비')) return {icon:'🌧️',state:'비'};
          if(wf.includes('눈')) return {icon:'❄️',state:'눈'};
          if(wf.includes('흐')) return {icon:'☁️',state:'흐림'};
          if(wf.includes('구름많')) return {icon:'⛅',state:'구름많음'};
          return {icon:'☀️',state:'맑음'};
        }
        const {icon:wIcon, state:wState} = wfToIcon(wf);
        week.push({ day:dow, icon:wIcon, state:wState, lo:lo, hi:hi, rain:'--' });
      }
    }

    // ── 기상특보 파싱 ──
    let alert = null;
    if (alertRes.status==='fulfilled') {
      try {
        const alertData = await alertRes.value.json();
        const alertItems = alertData?.response?.body?.items?.item || [];
        if (alertItems.length > 0) {
          const a = alertItems[0];
          const title = a.title || a.tmEf || '';
          // 주요 특보 키워드 필터
          const keywords = ['폭염','한파','태풍','호우','강풍','대설','황사','풍랑'];
          for (const kw of keywords) {
            if (title.includes(kw)) {
              alert = { type: kw, msg: title };
              break;
            }
          }
        }
      } catch(e) {}
    }

    return res.status(200).json({
      ok:    true,
      icon:  icon,
      temp:  tmp ? tmp+'°C' : '--°C',
      state: state,
      feel:  feel+'°C',
      pop:   pop ? pop+'%' : '0%',
      wind:  wsd ? wsd+'m/s' : '--',
      tmn:   tmn ? tmn+'°C' : '--°C',
      tmx:   tmx ? tmx+'°C' : '--°C',
      msg:   msg,
      city:  cityName,
      week:  week,      // 3~7일 예보 배열
      alert: alert      // 기상특보 (없으면 null)
    });

  } catch (err) {
    return res.status(200).json({ ok: false, error: err.message });
  }
}
