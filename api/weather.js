// ============================================================
// 📁 파일명: api/weather.js
// 📌 역할: GPS 위도/경도 → 카카오 주소변환 → 기상청/환경공단 날씨 통합 조회
// type 파라미터로 기능 구분:
//   (없음)   = 기존 현재날씨 (그대로 유지, 기존 화면 안 깨짐)
//   weekly   = 일주일 날씨(오늘~3일 단기예보 + 4~7일 중기예보)
//   warning  = 폭염·한파 등 기상특보 확인
//   dust     = 미세먼지·초미세먼지 실시간 정보
// ============================================================


const LAND_CODES = {"서울": "11B00000", "인천": "11B00000", "경기도": "11B00000", "강원도영서": "11D10000", "강원도영동": "11D20000", "대전": "11C20000", "세종": "11C20000", "충청남도": "11C20000", "충청북도": "11C10000", "광주": "11F20000", "전라남도": "11F20000", "전북자치도": "11F10000", "대구": "11H10000", "경상북도": "11H10000", "부산": "11H20000", "울산": "11H20000", "경상남도": "11H20000", "제주도": "11G00000"};

const TEMP_CODES = {"백령도": "11A00101", "서울": "11B10101", "과천": "11B10102", "광명": "11B10103", "강화": "11B20101", "김포": "11B20102", "인천": "11B20201", "시흥": "11B20202", "안산": "11B20203", "부천": "11B20204", "의정부": "11B20301", "고양": "11B20302", "양주": "11B20304", "파주": "11B20305", "동두천": "11B20401", "연천": "11B20402", "포천": "11B20403", "가평": "11B20404", "구리": "11B20501", "남양주": "11B20502", "양평": "11B20503", "하남": "11B20504", "수원": "11B20601", "안양": "11B20602", "오산": "11B20603", "화성": "11B20604", "성남": "11B20605", "평택": "11B20606", "의왕": "11B20609", "군포": "11B20610", "안성": "11B20611", "용인": "11B20612", "이천": "11B20701", "광주": "11F20501", "여주": "11B20703", "충주": "11C10101", "진천": "11C10102", "음성": "11C10103", "제천": "11C10201", "단양": "11C10202", "청주": "11C10301", "보은": "11C10302", "괴산": "11C10303", "증평": "11C10304", "추풍령": "11C10401", "영동": "11C10402", "옥천": "11C10403", "서산": "11C20101", "태안": "11C20102", "당진": "11C20103", "홍성": "11C20104", "보령": "11C20201", "서천": "11C20202", "천안": "11C20301", "아산": "11C20302", "예산": "11C20303", "대전": "11C20401", "공주": "11C20402", "계룡": "11C20403", "세종": "11C20404", "부여": "11C20501", "청양": "11C20502", "금산": "11C20601", "논산": "11C20602", "철원": "11D10101", "화천": "11D10102", "인제": "11D10201", "양구": "11D10202", "춘천": "11D10301", "홍천": "11D10302", "원주": "11D10401", "횡성": "11D10402", "영월": "11D10501", "정선": "11D10502", "평창": "11D10503", "대관령": "11D20201", "태백": "11D20301", "속초": "11D20401", "고성": "11H20404", "양양": "11D20403", "강릉": "11D20501", "동해": "11D20601", "삼척": "11D20602", "울릉도": "11E00101", "독도": "11E00102", "전주": "11F10201", "익산": "11F10202", "정읍": "11F10203", "완주": "11F10204", "장수": "11F10301", "무주": "11F10302", "진안": "11F10303", "남원": "11F10401", "임실": "11F10402", "순창": "11F10403", "완도": "11F20301", "해남": "11F20302", "강진": "11F20303", "장흥": "11F20304", "여수": "11F20401", "광양": "11F20402", "고흥": "11F20403", "보성": "11F20404", "순천시": "11F20405", "장성": "11F20502", "나주": "11F20503", "담양": "11F20504", "화순": "11F20505", "구례": "11F20601", "곡성": "11F20602", "순천": "11F20603", "흑산도": "11F20701", "성산": "11G00101", "제주": "11G00201", "성판악": "11G00302", "서귀포": "11G00401", "고산": "11G00501", "이어도": "11G00601", "추자도": "11G00800", "산천단": "11G00901", "한남": "11G01001", "울진": "11H10101", "영덕": "11H10102", "포항": "11H10201", "경주": "11H10202", "문경": "11H10301", "상주": "11H10302", "예천": "11H10303", "영주": "11H10401", "봉화": "11H10402", "영양": "11H10403", "안동": "11H10501", "의성": "11H10502", "청송": "11H10503", "김천": "11H10601", "구미": "11H10602", "고령": "11H10604", "성주": "11H10605", "대구": "11H10701", "영천": "11H10702", "경산": "11H10703", "청도": "11H10704", "칠곡": "11H10705", "군위": "11H10707", "울산": "11H20101", "양산": "11H20102", "부산": "11H20201", "창원": "11H20301", "김해": "11H20304", "통영": "11H20401", "사천": "11H20402", "거제": "11H20403", "남해": "11H20405", "함양": "11H20501", "거창": "11H20502", "합천": "11H20503", "밀양": "11H20601", "의령": "11H20602", "함안": "11H20603", "창녕": "11H20604", "진주": "11H20701", "산청": "11H20703", "하동": "11H20704", "사리원": "11I10001", "신계": "11I10002", "해주": "11I20001", "개성": "11I20002", "장연(용연)": "11I20003", "신의주": "11J10001", "삭주(수풍)": "11J10002", "구성": "11J10003", "자성(중강)": "11J10004", "강계": "11J10005", "희천": "11J10006", "평양": "11J20001", "진남포(남포)": "11J20002", "안주": "11J20004", "양덕": "11J20005", "청진": "11K10001", "웅기(선봉)": "11K10002", "성진(김책)": "11K10003", "무산(삼지연)": "11K10004", "함흥": "11K20001", "장진": "11K20002", "북청(신포)": "11K20003", "혜산": "11K20004", "풍산": "11K20005", "원산": "11L10001", "고성(장전)": "11L10002", "평강": "11L10003", "군산": "21F10501", "김제": "21F10502", "고창": "21F10601", "부안": "21F10602", "함평": "21F20101", "영광": "21F20102", "진도": "21F20201", "목포": "21F20801", "영암": "21F20802", "신안": "21F20803", "무안": "21F20804"};

const GANGWON_YEONGDONG = ['강릉시','속초시','동해시','삼척시','고성군','양양군'];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');

  const WEATHER_KEY = process.env.WEATHER_API_KEY;
  const KAKAO_KEY   = process.env.KAKAO_API_KEY;
  const DUST_KEY    = process.env.AIRKOREA_API_KEY;

  if (!WEATHER_KEY) {
    return res.status(500).json({ ok: false, error: '날씨 API 키 없음' });
  }

  const type = req.query.type || 'current';
  const lat = parseFloat(req.query.lat) || 37.5665;
  const lon = parseFloat(req.query.lon) || 126.9780;

  // ── 공통 함수: GPS → 카카오 주소변환 ──
  async function resolveRegion() {
    let sido = '', sigu = '', dong = '', cityName = '내 지역';
    if (KAKAO_KEY) {
      try {
        const kakaoUrl = `https://dapi.kakao.com/v2/local/geo/coord2regioncode.json?x=${lon}&y=${lat}`;
        const kakaoRes = await fetch(kakaoUrl, { headers: { 'Authorization': 'KakaoAK ' + KAKAO_KEY } });
        const kakaoData = await kakaoRes.json();
        const docs = kakaoData?.documents;
        if (docs && docs.length > 0) {
          const region = docs.find(d => d.region_type === 'H') || docs[0];
          sido = region.region_1depth_name || '';
          sigu = region.region_2depth_name || '';
          dong = region.region_3depth_name || '';
          const sidoShort = sido.replace('특별자치시','').replace('특별자치도','').replace('특별시','').replace('광역시','').trim();
          cityName = [sidoShort, sigu, dong].filter(Boolean).join(' ');
        }
      } catch (e) { /* 기본값 유지 */ }
    }
    return { sido, sigu, dong, cityName };
  }

  // ── 공통 함수: 위도/경도 → 기상청 격자 좌표(nx, ny) ──
  function latLonToGrid(lat, lon) {
    const RE = 6371.00877, GRID = 5.0, SLAT1 = 30.0, SLAT2 = 60.0, OLON = 126.0, OLAT = 38.0, XO = 43, YO = 136;
    const DEGRAD = Math.PI / 180.0;
    const re = RE / GRID, slat1 = SLAT1 * DEGRAD, slat2 = SLAT2 * DEGRAD, olon = OLON * DEGRAD, olat = OLAT * DEGRAD;
    let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
    sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
    let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
    sf = Math.pow(sf, sn) * Math.cos(slat1) / sn;
    let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
    ro = re * sf / Math.pow(ro, sn);
    let ra = Math.tan(Math.PI * 0.25 + lat * DEGRAD * 0.5);
    ra = re * sf / Math.pow(ra, sn);
    let theta = lon * DEGRAD - olon;
    if (theta > Math.PI) theta -= 2.0 * Math.PI;
    if (theta < -Math.PI) theta += 2.0 * Math.PI;
    theta *= sn;
    const nx = Math.floor(ra * Math.sin(theta) + XO + 0.5);
    const ny = Math.floor(ro - ra * Math.cos(theta) + YO + 0.5);
    return { nx, ny };
  }

  // ── 공통 함수: 한국시간(KST) 계산 ──
  function getKst() {
    const now = new Date();
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    return {
      year: kst.getUTCFullYear(),
      month: String(kst.getUTCMonth() + 1).padStart(2, '0'),
      day: String(kst.getUTCDate()).padStart(2, '0'),
      hour: kst.getUTCHours(),
      min: kst.getUTCMinutes(),
      dateObj: kst,
    };
  }

  try {
    // ════════════════════════════════════════════
    // [기본] 현재 날씨 (기존 기능, 100% 그대로 유지)
    // ════════════════════════════════════════════
    if (type === 'current') {
      const { cityName } = await resolveRegion();
      const { nx, ny } = latLonToGrid(lat, lon);
      const kst = getKst();

      let baseDate = `${kst.year}${kst.month}${kst.day}`;
      const releaseTimes = [2, 5, 8, 11, 14, 17, 20, 23];
      let baseHour = 23;
      for (let i = releaseTimes.length - 1; i >= 0; i--) {
        if (kst.hour > releaseTimes[i] || (kst.hour === releaseTimes[i] && kst.min >= 10)) { baseHour = releaseTimes[i]; break; }
      }
      if (kst.hour < 2 || (kst.hour === 2 && kst.min < 10)) {
        const yesterday = new Date(kst.dateObj.getTime() - 24 * 60 * 60 * 1000);
        baseDate = `${yesterday.getUTCFullYear()}${String(yesterday.getUTCMonth()+1).padStart(2,'0')}${String(yesterday.getUTCDate()).padStart(2,'0')}`;
        baseHour = 23;
      }
      const baseTime = String(baseHour).padStart(2, '0') + '00';

      const url = `http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst`
        + `?serviceKey=${encodeURIComponent(WEATHER_KEY)}&pageNo=1&numOfRows=100&dataType=JSON`
        + `&base_date=${baseDate}&base_time=${baseTime}&nx=${nx}&ny=${ny}`;

      const apiRes = await fetch(url);
      const apiData = await apiRes.json();
      const items = apiData?.response?.body?.items?.item;
      if (!items || items.length === 0) return res.status(200).json({ ok: false, error: '날씨 데이터 없음' });

      let tmp = null, sky = null, pty = null, pop = null;
      const targetHour = String(kst.hour).padStart(2, '0') + '00';
      items.forEach(function(item) {
        if (item.fcstTime === targetHour || tmp === null) {
          if (item.category === 'TMP') tmp = item.fcstValue;
          if (item.category === 'SKY') sky = item.fcstValue;
          if (item.category === 'PTY') pty = item.fcstValue;
          if (item.category === 'POP') pop = item.fcstValue;
        }
      });

      let icon = '☀️', state = '맑음';
      if (pty === '1') { icon = '🌧️'; state = '비'; }
      else if (pty === '3') { icon = '❄️'; state = '눈'; }
      else if (pty === '4') { icon = '🌦️'; state = '소나기'; }
      else if (sky === '4') { icon = '☁️'; state = '흐림'; }
      else if (sky === '3') { icon = '⛅'; state = '구름많음'; }

      let msg;
      if (kst.hour < 6) msg = '이른 새벽, 건강 챙기세요!';
      else if (kst.hour < 12) msg = '상쾌한 아침입니다! 😊';
      else if (kst.hour < 18) msg = '오늘도 좋은 하루 되세요!';
      else msg = '편안한 저녁 되세요! 🌙';

      return res.status(200).json({
        ok: true, icon, temp: tmp ? tmp + '°C' : '--°C', state, pop: pop ? pop + '%' : '0%', msg, city: cityName
      });
    }

    // ════════════════════════════════════════════
    // [warning] 폭염·한파 등 기상특보 확인
    // ════════════════════════════════════════════
    if (type === 'warning') {
      const { sido, cityName } = await resolveRegion();

      const kst = getKst();
      const now = kst.dateObj;
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const fmt = (d) => `${d.getUTCFullYear()}${String(d.getUTCMonth()+1).padStart(2,'0')}${String(d.getUTCDate()).padStart(2,'0')}${String(d.getUTCHours()).padStart(2,'0')}${String(d.getUTCMinutes()).padStart(2,'0')}`;
      const fromTmFc = fmt(yesterday);
      const toTmFc = fmt(now);

      // (한글 설명) 활용가이드는 "L1011900" 같은 특보구역코드를 쓰라고 했지만
      //             실제로는 계속 DB_ERROR가 났고, "108"(서울) 같은 옛날 방식
      //             숫자 관측지점번호를 쓰니 정상 작동하는 걸 실제 테스트로 확인했어요.
      //             그래서 숫자코드 방식을 기본으로 써요.
      const NUMERIC_STN = { '서울':108,'인천':112,'경기도':119,'강원도':101,'충청북도':131,'충청남도':133,'대전':133,'세종':239,'전라북도':146,'전북자치도':146,'광주':156,'전라남도':165,'대구':143,'경상북도':143,'부산':159,'울산':152,'경상남도':155,'제주도':184,'제주특별자치도':184 };
      const sidoNorm = sido.replace('특별자치도','').replace('특별자치시','').replace('특별시','').replace('광역시','').trim();
      const numericId = NUMERIC_STN[sido] || NUMERIC_STN[sidoNorm] || 108;

      const urlNumeric = `http://apis.data.go.kr/1360000/WthrWrnInfoService/getWthrWrnList`
        + `?serviceKey=${encodeURIComponent(WEATHER_KEY)}&pageNo=1&numOfRows=10&dataType=JSON&stnId=${numericId}`;
      const urlWithRange = `http://apis.data.go.kr/1360000/WthrWrnInfoService/getWthrWrnList`
        + `?serviceKey=${encodeURIComponent(WEATHER_KEY)}&pageNo=1&numOfRows=10&dataType=JSON`
        + `&stnId=${numericId}&fromTmFc=${fromTmFc}&toTmFc=${toTmFc}`;

      if (req.query.debug === '1') {
        const [r1, r2] = await Promise.all([fetch(urlNumeric), fetch(urlWithRange)]);
        const [t1, t2] = await Promise.all([r1.text(), r2.text()]);
        return res.status(200).json({
          ok: true, debug: true, numericId,
          numericUrl: urlNumeric.replace(WEATHER_KEY, '(키-숨김)'), numericRaw: t1.slice(0, 1800),
          withRangeUrl: urlWithRange.replace(WEATHER_KEY, '(키-숨김)'), withRangeRaw: t2.slice(0, 1800),
        });
      }

      let apiRes = await fetch(urlNumeric);
      let apiData = await apiRes.json();
      if (apiData?.response?.header?.resultCode !== '00') {
        apiRes = await fetch(urlWithRange);
        apiData = await apiRes.json();
      }
      const items = apiData?.response?.body?.items?.item;
      const list = items ? (Array.isArray(items) ? items : [items]) : [];

      // (한글 설명) title(제목) 글자 안에서 특보 종류 + 등급 글자를 직접 찾아요.
      //             제일 최근(첫번째) 항목부터 순서대로 보면서, "해제"된 건 넘어가고
      //             지금도 유효한 특보를 찾아요.
      const TYPE_KEYWORDS = [
        ['heat', '폭염'], ['cold', '한파'], ['rain', '호우'], ['snow', '대설'],
        ['wind', '강풍'], ['typhoon', '태풍'], ['fog', '안개'], ['dry', '건조'],
      ];
      let result = { ok: true, hasWarning: false };
      for (const item of list) {
        const title = item.title || '';
        if (title.includes('해제')) continue; // 해제된 특보는 지금 유효하지 않으니 넘어가요
        let wtype = null;
        for (const [key, kw] of TYPE_KEYWORDS) {
          if (title.includes(kw)) { wtype = key; break; }
        }
        if (wtype) {
          const level = title.includes('경보') ? '경보' : (title.includes('주의보') ? '주의보' : '특보');
          result.hasWarning = true;
          result.warnType = wtype;
          result.level = level;
          result.title = title;
          break;
        }
      }
      result.city = cityName;
      return res.status(200).json(result);
    }

    // ════════════════════════════════════════════
    // [dust] 미세먼지·초미세먼지 실시간 정보
    // ════════════════════════════════════════════
    if (type === 'dust') {
      if (!DUST_KEY) return res.status(200).json({ ok: false, error: '미세먼지 API 키 없음' });
      const { sido, sigu, cityName } = await resolveRegion();
      const sidoShort = sido.replace('특별자치시','').replace('특별자치도','').replace('특별시','').replace('광역시','').trim() || '서울';

      // (한글 설명) 측정소 주소가 "경상남도"가 아니라 "경남"처럼 줄임말로 저장된
      //             경우가 있어서(실제 테스트로 확인함), 여러 방식으로 순서대로 시도해요.
      const SIDO_ABBR = {
        '경기도':'경기', '강원도':'강원', '강원특별자치도':'강원',
        '충청북도':'충북', '충청남도':'충남', '전라북도':'전북', '전북특별자치도':'전북',
        '전라남도':'전남', '경상북도':'경북', '경상남도':'경남', '제주특별자치도':'제주', '제주도':'제주',
      };
      const addrCandidates = [sidoShort, SIDO_ABBR[sidoShort], SIDO_ABBR[sido], sigu].filter(Boolean);
      const uniqueAddrs = [...new Set(addrCandidates)];

      // (한글 설명) TM좌표 변환 없이, 지역 이름으로 그 근처 측정소들을 검색해서
      //             WGS84 좌표(GPS와 같은 방식)로 제일 가까운 곳을 직접 골라요.
      let stations = [];
      let usedAddr = '';
      for (const addr of uniqueAddrs) {
        const listUrl = `http://apis.data.go.kr/B552584/MsrstnInfoInqireSvc/getMsrstnList`
          + `?serviceKey=${encodeURIComponent(DUST_KEY)}&returnType=json&numOfRows=100&pageNo=1`
          + `&addr=${encodeURIComponent(addr)}&ver=1.1`;
        try {
          const listRes = await fetch(listUrl);
          const listData = await listRes.json();
          const items = listData?.response?.body?.items || [];
          if (items.length) { stations = items; usedAddr = addr; break; }
        } catch (e) { /* 다음 후보로 넘어가요 */ }
      }

      if (!stations.length) return res.status(200).json({ ok: false, error: '측정소를 찾을 수 없어요', city: cityName, tried: uniqueAddrs });

      // (한글 설명) ver=1.1이면 dmX=경도, dmY=위도예요(활용가이드로 확인함).
      function dist(sLat, sLon) {
        return Math.sqrt(Math.pow(sLat - lat, 2) + Math.pow(sLon - lon, 2));
      }
      const sorted = stations
        .map(function(s) {
          const sLon = parseFloat(s.dmX), sLat = parseFloat(s.dmY);
          return { s, d: (isNaN(sLon) || isNaN(sLat)) ? Infinity : dist(sLat, sLon) };
        })
        .filter(function(x) { return x.d !== Infinity; })
        .sort(function(a, b) { return a.d - b.d; })
        .slice(0, 5)
        .map(function(x) { return x.s; });

      if (!sorted.length) return res.status(200).json({ ok: false, error: '가까운 측정소를 찾을 수 없어요', city: cityName });

      if (req.query.debug === '1') {
        const rtUrl0 = `http://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getMsrstnAcctoRltmMesureDnsty`
          + `?serviceKey=${encodeURIComponent(DUST_KEY)}&returnType=json&numOfRows=1&pageNo=1`
          + `&stationName=${encodeURIComponent(sorted[0].stationName)}&dataTerm=DAILY&ver=1.3`;
        const r = await fetch(rtUrl0);
        const t = await r.text();
        return res.status(200).json({ ok: true, debug: true, usedAddr, triedAddrs: uniqueAddrs, candidateStations: sorted.map(s => s.stationName), requestUrl: rtUrl0.replace(DUST_KEY, '(키-숨김)'), rawSample: t.slice(0, 2000) });
      }

      // (한글 설명) 제일 가까운 곳부터 순서대로 시도해서, 데이터가 있는 첫 측정소를 써요
      //             (활용가이드에 "측정소 현지 사정에 따라 미수신될 수 있음"이라고 명시돼있어요).
      let latest = null, usedStation = null;
      for (const st of sorted) {
        const rtUrl = `http://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getMsrstnAcctoRltmMesureDnsty`
          + `?serviceKey=${encodeURIComponent(DUST_KEY)}&returnType=json&numOfRows=1&pageNo=1`
          + `&stationName=${encodeURIComponent(st.stationName)}&dataTerm=DAILY&ver=1.3`;
        try {
          const rtRes = await fetch(rtUrl);
          const rtData = await rtRes.json();
          const item = (rtData?.response?.body?.items || [])[0];
          if (item && item.pm10Value && item.pm10Value !== '-') {
            latest = item; usedStation = st.stationName; break;
          }
        } catch (e) { /* 다음 측정소로 넘어가요 */ }
      }

      if (!latest) return res.status(200).json({ ok: false, error: '주변 측정소에 데이터가 아직 없어요', city: cityName });

      const GRADE_TEXT = { '1': '좋음', '2': '보통', '3': '나쁨', '4': '매우나쁨' };
      const GRADE_COLOR = { '1': '#2e7d32', '2': '#f9a825', '3': '#e65100', '4': '#c62828' };

      return res.status(200).json({
        ok: true,
        city: cityName,
        stationName: usedStation,
        pm10: latest.pm10Value || '-',
        pm10Grade: GRADE_TEXT[latest.pm10Grade] || '정보없음',
        pm10Color: GRADE_COLOR[latest.pm10Grade] || '#888',
        pm25: latest.pm25Value || '-',
        pm25Grade: GRADE_TEXT[latest.pm25Grade] || '정보없음',
        pm25Color: GRADE_COLOR[latest.pm25Grade] || '#888',
        dataTime: latest.dataTime || '',
      });
    }

    // ════════════════════════════════════════════
    // [weekly] 일주일 날씨 (오늘~3일 단기예보 + 4~7일 중기예보)
    // ════════════════════════════════════════════
    if (type === 'weekly') {
      const { sido, sigu, cityName } = await resolveRegion();
      const { nx, ny } = latLonToGrid(lat, lon);
      const kst = getKst();

      // ── 1) 오늘~3일: 단기예보(시간별)를 날짜별로 묶어서 최고/최저 뽑기 ──
      let baseDate = `${kst.year}${kst.month}${kst.day}`;
      const releaseTimes = [2, 5, 8, 11, 14, 17, 20, 23];
      let baseHour = 23;
      for (let i = releaseTimes.length - 1; i >= 0; i--) {
        if (kst.hour > releaseTimes[i] || (kst.hour === releaseTimes[i] && kst.min >= 10)) { baseHour = releaseTimes[i]; break; }
      }
      if (kst.hour < 2 || (kst.hour === 2 && kst.min < 10)) {
        const yesterday = new Date(kst.dateObj.getTime() - 24 * 60 * 60 * 1000);
        baseDate = `${yesterday.getUTCFullYear()}${String(yesterday.getUTCMonth()+1).padStart(2,'0')}${String(yesterday.getUTCDate()).padStart(2,'0')}`;
        baseHour = 23;
      }
      const baseTime = String(baseHour).padStart(2, '0') + '00';

      const shortUrl = `http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst`
        + `?serviceKey=${encodeURIComponent(WEATHER_KEY)}&pageNo=1&numOfRows=1000&dataType=JSON`
        + `&base_date=${baseDate}&base_time=${baseTime}&nx=${nx}&ny=${ny}`;

      const shortRes = await fetch(shortUrl);
      const shortData = await shortRes.json();
      const shortItems = shortData?.response?.body?.items?.item || [];

      // 날짜별로 그룹핑
      const byDate = {};
      shortItems.forEach(function(it) {
        if (!byDate[it.fcstDate]) byDate[it.fcstDate] = {};
        const d = byDate[it.fcstDate];
        if (it.category === 'TMP') {
          const v = parseFloat(it.fcstValue);
          if (d.tmin === undefined || v < d.tmin) d.tmin = v;
          if (d.tmax === undefined || v > d.tmax) d.tmax = v;
        }
        if (it.category === 'SKY' && it.fcstTime === '1200') d.sky = it.fcstValue;
        if (it.category === 'PTY' && it.fcstTime === '1200') d.pty = it.fcstValue;
        if (it.category === 'POP') {
          const v = parseInt(it.fcstValue, 10);
          if (d.pop === undefined || v > d.pop) d.pop = v;
        }
      });

      function skyIcon(sky, pty) {
        if (pty === '1') return '🌧️';
        if (pty === '3') return '❄️';
        if (pty === '4') return '🌦️';
        if (sky === '4') return '☁️';
        if (sky === '3') return '⛅';
        return '☀️';
      }

      const dayLabels = ['오늘','내일','모레'];
      const dates = Object.keys(byDate).sort().slice(0, 3);
      const days = dates.map(function(dt, idx) {
        const d = byDate[dt];
        return {
          label: dayLabels[idx] || dt,
          date: dt,
          icon: skyIcon(d.sky, d.pty),
          tmax: d.tmax !== undefined ? Math.round(d.tmax) : null,
          tmin: d.tmin !== undefined ? Math.round(d.tmin) : null,
          pop: d.pop !== undefined ? d.pop : null,
          predicted: false,
        };
      });

      // ── 2) 4~7일: 중기예보(육상+기온) ──
      // (한글 설명) LAND_CODES는 시/도 단위 이름표라서 시/군/구 이름으로는 못 찾아요.
      //             강원도만 영동/영서로 나뉘어서 시/군/구까지 봐야 하고, 나머지는 시/도만 보면 돼요.
      let landCode;
      if (sido.includes('강원')) {
        landCode = GANGWON_YEONGDONG.includes(sigu) ? LAND_CODES['강원도영동'] : LAND_CODES['강원도영서'];
      } else {
        const sidoNorm = sido.replace('특별자치도','').replace('특별자치시','').replace('특별시','').replace('광역시','').trim();
        landCode = LAND_CODES[sido] || LAND_CODES[sidoNorm]
          || (sidoNorm === '전북' ? LAND_CODES['전북자치도'] : null)
          || LAND_CODES['서울'];
      }
      // (한글 설명) 카카오가 "수원시 영통구"처럼 구까지 붙여서 줄 때가 있어서,
      //             띄어쓰기 앞부분(시 이름)만 먼저 떼어내고 접미사를 지워요.
      const siguMain = sigu ? sigu.split(' ')[0].replace(/(광역시|특별시|시|군|구)$/, '') : '';
      const tempCode = TEMP_CODES[siguMain] || TEMP_CODES['서울'];

      // 중기예보 발표시각(최근 06 또는 18시 KST, 최근 24시간만 제공)
      let midHour = kst.hour >= 18 ? 18 : (kst.hour >= 6 ? 6 : 18);
      let midDateObj = kst.dateObj;
      if (kst.hour < 6) {
        midDateObj = new Date(kst.dateObj.getTime() - 24 * 60 * 60 * 1000);
      }
      const midTmFc = `${midDateObj.getUTCFullYear()}${String(midDateObj.getUTCMonth()+1).padStart(2,'0')}${String(midDateObj.getUTCDate()).padStart(2,'0')}${String(midHour).padStart(2,'0')}00`;

      const dayNames = ['일','월','화','수','목','금','토'];
      const midDays = [];
      try {
        const landUrl = `http://apis.data.go.kr/1360000/MidFcstInfoService/getMidLandFcst`
          + `?serviceKey=${encodeURIComponent(WEATHER_KEY)}&numOfRows=10&pageNo=1&dataType=JSON`
          + `&regId=${landCode}&tmFc=${midTmFc}`;
        const taUrl = `http://apis.data.go.kr/1360000/MidFcstInfoService/getMidTa`
          + `?serviceKey=${encodeURIComponent(WEATHER_KEY)}&numOfRows=10&pageNo=1&dataType=JSON`
          + `&regId=${tempCode}&tmFc=${midTmFc}`;

        if (req.query.debug === '1') {
          const [lr, tr] = await Promise.all([fetch(landUrl), fetch(taUrl)]);
          const [lt, tt] = await Promise.all([lr.text(), tr.text()]);
          return res.status(200).json({
            ok: true, debug: true, landCode, tempCode, midTmFc,
            landUrl: landUrl.replace(WEATHER_KEY, '(키-숨김)'), landRaw: lt.slice(0, 1500),
            taUrl: taUrl.replace(WEATHER_KEY, '(키-숨김)'), taRaw: tt.slice(0, 1500),
          });
        }

        const [landRes, taRes] = await Promise.all([fetch(landUrl), fetch(taUrl)]);
        const [landData, taData] = await Promise.all([landRes.json(), taRes.json()]);
        const landItem = (landData?.response?.body?.items?.item || [])[0] || {};
        const taItem = (taData?.response?.body?.items?.item || [])[0] || {};

        for (let n = 4; n <= 7; n++) {
          const wfAm = landItem['wf' + n + 'Am'] || landItem['wf' + n] || '';
          const wfPm = landItem['wf' + n + 'Pm'] || landItem['wf' + n] || '';
          const wfText = wfPm || wfAm || '';
          let icon = '☀️';
          if (wfText.includes('비') && wfText.includes('눈')) icon = '🌨️';
          else if (wfText.includes('소나기')) icon = '🌦️';
          else if (wfText.includes('비')) icon = '🌧️';
          else if (wfText.includes('눈')) icon = '❄️';
          else if (wfText.includes('흐림')) icon = '☁️';
          else if (wfText.includes('구름')) icon = '⛅';

          const popAm = landItem['rnSt' + n + 'Am'];
          const popPm = landItem['rnSt' + n + 'Pm'];
          const popSingle = landItem['rnSt' + n];
          const pop = popPm !== undefined ? popPm : (popAm !== undefined ? popAm : popSingle);

          const targetDate = new Date(kst.dateObj.getTime() + (n - (kst.hour < 6 ? 1 : 0)) * 24 * 60 * 60 * 1000);
          const label = dayNames[targetDate.getUTCDay()] + '요일';

          midDays.push({
            label: label,
            icon: icon,
            tmax: taItem['taMax' + n] !== undefined ? taItem['taMax' + n] : null,
            tmin: taItem['taMin' + n] !== undefined ? taItem['taMin' + n] : null,
            pop: pop !== undefined ? pop : null,
            predicted: true,
          });
        }
      } catch (e) {
        // 중기예보 실패해도 단기예보(3일)까지는 보여줄 수 있게 조용히 넘어가요
      }

      return res.status(200).json({ ok: true, city: cityName, days: days.concat(midDays) });
    }

    return res.status(400).json({ ok: false, error: '알 수 없는 type' });

  } catch (err) {
    return res.status(200).json({ ok: false, error: err.message });
  }
}
