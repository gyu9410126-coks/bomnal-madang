// api/traffic.js — 교통정보 Vercel 서버리스 프록시
// (한글 설명) 2026-07-17 활용가이드 5개(버스정류소·버스도착·지하철·기차·고속버스)를
// 실제로 다운로드해서 정확히 확인한 뒤 전면 재작성했어요. 예전 코드는 존재하지
// 않는 주소를 쓰거나(기차·고속버스), 이름을 ID인 것처럼 잘못 보내고 있었어요.
//
// 환경변수: TAGO_BUS_STOP_KEY, TAGO_BUS_ARRIVAL_KEY, TAGO_SUBWAY_KEY,
//           KORAIL_TRAIN_KEY, TAGO_EXPRESS_KEY

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  const { type, keyword, nodeId, cityCode, gpsLati, gpsLong, dailyTypeCode, upDownTypeCode, subwayStationId, depart, arrive, date } = req.query;

  // (한글 설명) 이 파일 안에서 여러 번 쓰는 "정부 응답에서 item 배열 뽑기"
  //             공통 함수예요. item이 1개면 객체 하나로만 오고, 여러 개면
  //             배열로 오는 정부 API 특성 때문에 항상 배열로 통일해줘요.
  function extractItems(data) {
    const body = data?.response?.body;
    if (!body?.items?.item) return [];
    return Array.isArray(body.items.item) ? body.items.item : [body.items.item];
  }

  try {
    // ════════════════════════════════════════════
    // [진단용] 버스 도시코드 전체 목록 (추측 금지, 항상 이걸로 확인)
    // ════════════════════════════════════════════
    if (type === 'busCityCodes') {
      const url = `https://apis.data.go.kr/1613000/BusSttnInfoInqireService/getCtyCodeList`
        + `?serviceKey=${encodeURIComponent(process.env.TAGO_BUS_STOP_KEY)}&_type=json`;
      const r = await fetch(url);
      const data = await r.json();
      return res.json({ ok: true, items: extractItems(data), raw: data });
    }

    // ════════════════════════════════════════════
    // [1] 버스정류장 검색 — GPS(내 주변) 우선, 이름검색은 도시코드 필요
    // ════════════════════════════════════════════
    if (type === 'busStopGps') {
      if (!gpsLati || !gpsLong) return res.json({ ok: false, message: 'GPS 좌표 없음' });
      const url = `https://apis.data.go.kr/1613000/BusSttnInfoInqireService/getCrdntPrxmtSttnList`
        + `?serviceKey=${encodeURIComponent(process.env.TAGO_BUS_STOP_KEY)}`
        + `&numOfRows=10&pageNo=1&_type=json`
        + `&gpsLati=${encodeURIComponent(gpsLati)}&gpsLong=${encodeURIComponent(gpsLong)}`;
      const r = await fetch(url);
      const data = await r.json();
      return res.json({ ok: true, items: extractItems(data) });
    }

    if (type === 'busStopName') {
      if (!keyword || !cityCode) return res.json({ ok: false, message: '지역과 정류장 이름을 모두 입력해 주세요' });
      const url = `https://apis.data.go.kr/1613000/BusSttnInfoInqireService/getSttnNoList`
        + `?serviceKey=${encodeURIComponent(process.env.TAGO_BUS_STOP_KEY)}`
        + `&numOfRows=15&pageNo=1&_type=json`
        + `&cityCode=${encodeURIComponent(cityCode)}&nodeNm=${encodeURIComponent(keyword)}`;
      const r = await fetch(url);
      const data = await r.json();
      const items = extractItems(data).map(function(i){ return Object.assign({}, i, { cityCode: cityCode }); });
      return res.json({ ok: true, items });
    }

    // ════════════════════════════════════════════
    // [2] 버스 도착 정보 (정류소ID + 도시코드 필요)
    // ════════════════════════════════════════════
    if (type === 'busArrival') {
      if (!nodeId || !cityCode) return res.json({ ok: false, message: '파라미터 없음' });
      const url = `https://apis.data.go.kr/1613000/ArvlInfoInqireService/getSttnAcctoArvlPrearngeInfoList`
        + `?serviceKey=${encodeURIComponent(process.env.TAGO_BUS_ARRIVAL_KEY)}`
        + `&numOfRows=15&pageNo=1&_type=json`
        + `&cityCode=${encodeURIComponent(cityCode)}&nodeId=${encodeURIComponent(nodeId)}`;
      const r = await fetch(url);
      const data = await r.json();
      return res.json({ ok: true, items: extractItems(data) });
    }

    // ════════════════════════════════════════════
    // [3] 지하철 — 1단계: 역이름으로 역ID 검색
    // ════════════════════════════════════════════
    if (type === 'subwayStationSearch') {
      if (!keyword) return res.json({ ok: false, message: '역 이름 없음' });
      const url = `https://apis.data.go.kr/1613000/SubwayInfo/GetKwrdFndSubwaySttnList`
        + `?serviceKey=${encodeURIComponent(process.env.TAGO_SUBWAY_KEY)}`
        + `&numOfRows=15&pageNo=1&_type=json`
        + `&subwayStationName=${encodeURIComponent(keyword)}`;
      const r = await fetch(url);
      const data = await r.json();
      return res.json({ ok: true, items: extractItems(data) });
    }

    // ════════════════════════════════════════════
    // [3-2] 지하철 — 2단계: 역ID + 요일 + 방향으로 시간표 조회
    //     (한글 설명) 실시간 도착정보가 아니라 "정해진 시간표"예요.
    //     dailyTypeCode: 01평일 02토요일 03일요일 / upDownTypeCode: U상행 D하행
    // ════════════════════════════════════════════
    if (type === 'subwaySchedule') {
      if (!subwayStationId || !dailyTypeCode || !upDownTypeCode) {
        return res.json({ ok: false, message: '파라미터 없음' });
      }
      const url = `https://apis.data.go.kr/1613000/SubwayInfo/GetSubwaySttnAcctoSchdulList`
        + `?serviceKey=${encodeURIComponent(process.env.TAGO_SUBWAY_KEY)}`
        + `&numOfRows=30&pageNo=1&_type=json`
        + `&subwayStationId=${encodeURIComponent(subwayStationId)}`
        + `&dailyTypeCode=${encodeURIComponent(dailyTypeCode)}`
        + `&upDownTypeCode=${encodeURIComponent(upDownTypeCode)}`;
      const r = await fetch(url);
      const data = await r.json();
      return res.json({ ok: true, items: extractItems(data) });
    }

    // ════════════════════════════════════════════
    // [4] 기차(코레일) — 역이름으로 바로 검색 가능(코드 불필요, 실제 확인됨)
    //     cond[필드::연산자]=값 형태라 파라미터 이름 자체를 URL인코딩해야 해요.
    // ════════════════════════════════════════════
    if (type === 'train') {
      if (!depart || !arrive) return res.json({ ok: false, message: '파라미터 없음' });
      const today = new Date();
      const dateStr = date || (today.getFullYear()
        + String(today.getMonth()+1).padStart(2,'0')
        + String(today.getDate()).padStart(2,'0'));

      const depKey = encodeURIComponent('cond[dptre_stn_nm::EQ]');
      const arrKey = encodeURIComponent('cond[arvl_stn_nm::EQ]');
      const dateKey = encodeURIComponent('cond[run_ymd::EQ]');

      const url = `https://apis.data.go.kr/B551457/run/v2/travelerTrainRunPlan2`
        + `?serviceKey=${encodeURIComponent(process.env.KORAIL_TRAIN_KEY)}`
        + `&numOfRows=20&pageNo=1&returnType=JSON`
        + `&${depKey}=${encodeURIComponent(depart)}`
        + `&${arrKey}=${encodeURIComponent(arrive)}`
        + `&${dateKey}=${encodeURIComponent(dateStr)}`;
      const r = await fetch(url);
      const data = await r.json();
      const body = data?.response?.body;
      const items = body?.items?.item ? (Array.isArray(body.items.item) ? body.items.item : [body.items.item]) : [];
      return res.json({ ok: true, items });
    }

    // ════════════════════════════════════════════
    // [5] 고속버스 — 1단계: 터미널명으로 터미널ID 검색
    // ════════════════════════════════════════════
    if (type === 'expressTerminalSearch') {
      if (!keyword) return res.json({ ok: false, message: '터미널명 없음' });
      const url = `https://apis.data.go.kr/1613000/ExpBusInfo/GetExpBusTrminlList`
        + `?serviceKey=${encodeURIComponent(process.env.TAGO_EXPRESS_KEY)}`
        + `&numOfRows=15&pageNo=1&_type=json`
        + `&terminalNm=${encodeURIComponent(keyword)}`;
      const r = await fetch(url);
      const data = await r.json();
      return res.json({ ok: true, items: extractItems(data) });
    }

    // ════════════════════════════════════════════
    // [5-2] 고속버스 — 2단계: 터미널ID로 실제 운행정보 조회
    // ════════════════════════════════════════════
    if (type === 'express') {
      if (!depart || !arrive) return res.json({ ok: false, message: '파라미터 없음' });
      const today = new Date();
      const dateStr = date || (today.getFullYear()
        + String(today.getMonth()+1).padStart(2,'0')
        + String(today.getDate()).padStart(2,'0'));

      const url = `https://apis.data.go.kr/1613000/ExpBusInfo/GetStrtpntAlocFndExpbusInfo`
        + `?serviceKey=${encodeURIComponent(process.env.TAGO_EXPRESS_KEY)}`
        + `&numOfRows=20&pageNo=1&_type=json`
        + `&depTerminalId=${encodeURIComponent(depart)}`
        + `&arrTerminalId=${encodeURIComponent(arrive)}`
        + `&depPlandTime=${dateStr}`;
      const r = await fetch(url);
      const data = await r.json();
      return res.json({ ok: true, items: extractItems(data) });
    }

    return res.json({ ok: false, message: '알 수 없는 type' });

  } catch (e) {
    console.error('traffic API error:', e);
    return res.status(500).json({ ok: false, message: '서버 오류', error: e.message });
  }
}
