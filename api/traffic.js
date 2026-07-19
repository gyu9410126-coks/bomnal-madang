// api/traffic.js — 교통정보 Vercel 서버리스 프록시
// (한글 설명) 2026-07-17 활용가이드 8개(TAGO 5개 + 서울 열린데이터광장 3개)를
// 실제로 다운로드해서 확인한 뒤 완성했어요. 서울은 전국(TAGO) 시스템에
// 아예 없어서 별도 시스템(서울 열린데이터광장)을 따로 붙였어요.
//
// 환경변수:
//  TAGO_BUS_STOP_KEY, TAGO_BUS_ARRIVAL_KEY, TAGO_BUS_LOCATION_KEY,
//  TAGO_SUBWAY_KEY, KORAIL_TRAIN_KEY, TAGO_EXPRESS_KEY, TAGO_EXPRESS_ARRIVAL_KEY,
//  SEOUL_BUS_KEY (data.go.kr 경유, 정류소정보조회서비스),
//  SEOUL_SUBWAY_KEY (data.seoul.go.kr 실시간지하철 전용키, 일반키와 다름)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  const {
    type, keyword, nodeId, cityCode, routeId, gpsLati, gpsLong,
    dailyTypeCode, upDownTypeCode, subwayStationId, depart, arrive, date,
    tmX, tmY, radius, arsId,
  } = req.query;

  // (한글 설명) 정부 응답에서 item 배열 뽑는 공통 함수예요. item이 1개면
  //             객체 하나로, 여러 개면 배열로 오는 특성 때문에 통일해줘요.
  function extractItems(data) {
    const body = data?.response?.body;
    if (!body?.items?.item) return [];
    return Array.isArray(body.items.item) ? body.items.item : [body.items.item];
  }

  try {
    // ════════════════════════════════════════════
    // [진단용] 버스 도시코드 전체 목록
    // ════════════════════════════════════════════
    if (type === 'busCityCodes') {
      const url = `https://apis.data.go.kr/1613000/BusSttnInfoInqireService/getCtyCodeList`
        + `?serviceKey=${encodeURIComponent(process.env.TAGO_BUS_STOP_KEY)}&_type=json`;
      const r = await fetch(url);
      const data = await r.json();
      return res.json({ ok: true, items: extractItems(data) });
    }

    // ════════════════════════════════════════════
    // [1] 전국 버스정류장 검색 — GPS 우선, 이름검색은 도시코드 필요
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
    // [2] 전국 버스 도착 정보
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
    // [2-2] 전국 버스 실시간 위치 (노선ID 기준, 정류소별경유노선에서 routeId 확보 후 사용)
    // ════════════════════════════════════════════
    if (type === 'busLocation') {
      if (!cityCode || !routeId) return res.json({ ok: false, message: '파라미터 없음' });
      const url = `https://apis.data.go.kr/1613000/BusLcInfoInqireService/getRouteAcctoBusLcList`
        + `?serviceKey=${encodeURIComponent(process.env.TAGO_BUS_LOCATION_KEY)}`
        + `&numOfRows=20&pageNo=1&_type=json`
        + `&cityCode=${encodeURIComponent(cityCode)}&routeId=${encodeURIComponent(routeId)}`;
      const r = await fetch(url);
      const data = await r.json();
      return res.json({ ok: true, items: extractItems(data) });
    }

    // ════════════════════════════════════════════
    // [2-3] 정류소별 경유노선 목록 (버스 위치조회에 필요한 routeId 확보용)
    // ════════════════════════════════════════════
    if (type === 'busRoutesAtStop') {
      if (!cityCode || !nodeId) return res.json({ ok: false, message: '파라미터 없음' });
      const url = `https://apis.data.go.kr/1613000/BusSttnInfoInqireService/getSttnThrghRouteList`
        + `?serviceKey=${encodeURIComponent(process.env.TAGO_BUS_STOP_KEY)}`
        + `&numOfRows=20&pageNo=1&_type=json`
        + `&cityCode=${encodeURIComponent(cityCode)}&nodeid=${encodeURIComponent(nodeId)}`;
      const r = await fetch(url);
      const data = await r.json();
      return res.json({ ok: true, items: extractItems(data) });
    }

    // ════════════════════════════════════════════
    // [3] 전국 지하철 — 1단계: 역이름으로 역ID 검색
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
    // [3-2] 전국 지하철 — 2단계: 요일별 시간표 (실시간 아님, 확정 시간표)
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
    // [4] 기차(코레일) — 역이름으로 바로 검색 가능
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
    // [5] 고속버스 예매시간표 — 1단계: 터미널명으로 터미널ID 검색
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
    // [5-2] 고속버스 예매시간표 — 2단계: 터미널ID로 배차시간표 조회
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

    // ════════════════════════════════════════════
    // [5-3] 고속버스 실시간 도착정보 — 별도 서비스(ExpBusArrInfo),
    //     터미널코드가 [5]와 다른 별도 체계라 이 서비스 자체 코드조회로 확보해야 함
    // ════════════════════════════════════════════
    if (type === 'expressArrTerminalSearch') {
      if (!keyword) return res.json({ ok: false, message: '터미널명 없음' });
      const url = `https://apis.data.go.kr/1613000/ExpBusArrInfo/GetExpBusTmnList`
        + `?serviceKey=${encodeURIComponent(process.env.TAGO_EXPRESS_ARRIVAL_KEY)}`
        + `&numOfRows=15&pageNo=1&_type=json`
        + `&tmnNm=${encodeURIComponent(keyword)}`;
      const r = await fetch(url);
      const data = await r.json();
      return res.json({ ok: true, items: extractItems(data) });
    }

    if (type === 'expressArrival') {
      if (!depart || !arrive) return res.json({ ok: false, message: '파라미터 없음' });
      const url = `https://apis.data.go.kr/1613000/ExpBusArrInfo/GetExpBusArrPrdtInfo`
        + `?serviceKey=${encodeURIComponent(process.env.TAGO_EXPRESS_ARRIVAL_KEY)}`
        + `&numOfRows=20&pageNo=1&_type=json`
        + `&depTmnCd=${encodeURIComponent(depart)}&arrTmnCd=${encodeURIComponent(arrive)}`;
      const r = await fetch(url);
      const data = await r.json();
      return res.json({ ok: true, items: extractItems(data) });
    }

    // ════════════════════════════════════════════
    // [6] 서울 버스 — TAGO엔 서울이 아예 없어서 별도 시스템 사용
    //     (한글 설명) data.go.kr 경유(서울특별시_정류소정보조회 서비스)라서
    //     상업적 이용 제한 없는 안전한 버전이에요. ws.bus.go.kr을 직접
    //     쓰는 것과 달리 여기는 표준 query-string 방식이에요.
    // ════════════════════════════════════════════
    if (type === 'seoulBusStopName') {
      if (!keyword) return res.json({ ok: false, message: '정류장 이름 없음' });
      const url = `http://ws.bus.go.kr/api/rest/stationinfo/getStationByName`
        + `?serviceKey=${encodeURIComponent(process.env.SEOUL_BUS_KEY)}`
        + `&stSrch=${encodeURIComponent(keyword)}`;
      const r = await fetch(url);
      const text = await r.text();
      // (한글 설명) 서울시 API는 응답이 XML로 와요(json 옵션이 안 보여서 XML 그대로 파싱).
      const items = (text.match(/<itemList>[\s\S]*?<\/itemList>/g) || []).map(function(chunk){
        function pick(tag){ const m = chunk.match(new RegExp('<'+tag+'>([\\s\\S]*?)<\\/'+tag+'>')); return m ? m[1].trim() : ''; }
        return { stId: pick('stId'), stNm: pick('stNm'), arsId: pick('arsId'), tmX: pick('tmX'), tmY: pick('tmY') };
      });
      return res.json({ ok: true, items });
    }

    if (type === 'seoulBusStopGps') {
      if (!tmX || !tmY) return res.json({ ok: false, message: 'GPS 좌표 없음' });
      const url = `http://ws.bus.go.kr/api/rest/stationinfo/getStaionsByPosList`
        + `?serviceKey=${encodeURIComponent(process.env.SEOUL_BUS_KEY)}`
        + `&tmX=${encodeURIComponent(tmX)}&tmY=${encodeURIComponent(tmY)}&radius=${encodeURIComponent(radius||'300')}`;
      const r = await fetch(url);
      const text = await r.text();
      const items = (text.match(/<itemList>[\s\S]*?<\/itemList>/g) || []).map(function(chunk){
        function pick(tag){ const m = chunk.match(new RegExp('<'+tag+'>([\\s\\S]*?)<\\/'+tag+'>')); return m ? m[1].trim() : ''; }
        return { stationId: pick('stationId'), stationNm: pick('stationNm'), arsId: pick('arsId'), dist: pick('dist') };
      });
      return res.json({ ok: true, items });
    }

    if (type === 'seoulBusArrival') {
      if (!arsId) return res.json({ ok: false, message: '정류소번호 없음' });
      const url = `http://ws.bus.go.kr/api/rest/stationinfo/getStationByUidItem`
        + `?serviceKey=${encodeURIComponent(process.env.SEOUL_BUS_KEY)}`
        + `&arsId=${encodeURIComponent(arsId)}`;
      const r = await fetch(url);
      const text = await r.text();
      const items = (text.match(/<itemList>[\s\S]*?<\/itemList>/g) || []).map(function(chunk){
        function pick(tag){ const m = chunk.match(new RegExp('<'+tag+'>([\\s\\S]*?)<\\/'+tag+'>')); return m ? m[1].trim() : ''; }
        return {
          busRouteNm: pick('rtNm'), arrmsg1: pick('arrmsg1'), arrmsg2: pick('arrmsg2'),
          busRouteId: pick('busRouteId'), congestion: pick('congestion1'), stationNm: pick('stNm'),
        };
      });
      return res.json({ ok: true, items, rawSample: text.slice(0,1500) });
    }

    // ════════════════════════════════════════════
    // [7] 서울 지하철 실시간 도착정보 — 완전히 다른 전용 인증키·주소 체계
    //     (한글 설명) 서울 열린데이터광장 자체 "실시간 지하철 인증키"를 써요
    //     (data.go.kr 키랑 다름). 주소도 물음표 방식이 아니라 슬래시로
    //     순서대로 나열하는 옛날 방식이에요.
    // ════════════════════════════════════════════
    if (type === 'seoulSubwayArrival') {
      if (!keyword) return res.json({ ok: false, message: '역 이름 없음' });
      const url = `http://swopenAPI.seoul.go.kr/api/subway/${encodeURIComponent(process.env.SEOUL_SUBWAY_KEY)}`
        + `/json/realtimeStationArrival/0/20/${encodeURIComponent(keyword)}`;
      const r = await fetch(url);
      const data = await r.json();
      const items = data?.realtimeArrivalList || [];
      return res.json({ ok: true, items });
    }

    return res.json({ ok: false, message: '알 수 없는 type' });

  } catch (e) {
    console.error('traffic API error:', e);
    return res.status(500).json({ ok: false, message: '서버 오류', error: e.message });
  }
}
