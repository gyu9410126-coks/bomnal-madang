// api/traffic.js — 교통정보 Vercel 서버리스 프록시
// 환경변수: TAGO_BUS_ARRIVAL_KEY, TAGO_BUS_STOP_KEY, TAGO_EXPRESS_KEY, TAGO_SUBWAY_KEY, KORAIL_TRAIN_KEY

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { type, keyword, nodeId, cityCode, dir, depart, arrive, date } = req.query;

  try {
    // ── 1. 버스 정류장 검색 ──
    if (type === 'busStop') {
      if (!keyword) return res.json({ ok: false, message: '키워드 없음' });

      // 주요 도시코드 목록으로 검색 (서울·부산·대구·인천·광주·대전·울산)
      const cityCodes = ['25', '21', '22', '23', '24', '26', '27'];
      let allItems = [];

      for (const code of cityCodes) {
        const url = `http://apis.data.go.kr/1613000/BusSttnInfoInqireService/getSttnNoList`
          + `?serviceKey=${encodeURIComponent(process.env.TAGO_BUS_STOP_KEY)}`
          + `&numOfRows=5&pageNo=1&_type=json`
          + `&cityCode=${code}&nodeNm=${encodeURIComponent(keyword)}`;
        const r = await fetch(url);
        const data = await r.json();
        const body = data?.response?.body;
        if (body?.items?.item) {
          const items = Array.isArray(body.items.item) ? body.items.item : [body.items.item];
          items.forEach(i => allItems.push({ ...i, cityCode: code }));
        }
        if (allItems.length >= 10) break;
      }

      return res.json({ ok: true, items: allItems.slice(0, 10) });
    }

    // ── 2. 버스 도착 정보 ──
    if (type === 'busArrival') {
      if (!nodeId || !cityCode) return res.json({ ok: false, message: '파라미터 없음' });

      const url = `http://apis.data.go.kr/1613000/ArvlInfoInqireService/getSttnAcctoArvlPrearngeInfoList`
        + `?serviceKey=${encodeURIComponent(process.env.TAGO_BUS_ARRIVAL_KEY)}`
        + `&numOfRows=10&pageNo=1&_type=json`
        + `&cityCode=${cityCode}&nodeId=${encodeURIComponent(nodeId)}`;
      const r = await fetch(url);
      const data = await r.json();
      const body = data?.response?.body;
      if (!body?.items?.item) return res.json({ ok: true, items: [] });
      const items = Array.isArray(body.items.item) ? body.items.item : [body.items.item];
      return res.json({ ok: true, items });
    }

    // ── 3. 지하철 조회 ──
    if (type === 'subway') {
      if (!keyword) return res.json({ ok: false, message: '키워드 없음' });

      // TAGO 지하철 정보 API
      const url = `http://apis.data.go.kr/1613000/SubwayInfoService/getSubwaySttnAcctoArvlPrearngeInfoList`
        + `?serviceKey=${encodeURIComponent(process.env.TAGO_SUBWAY_KEY)}`
        + `&numOfRows=10&pageNo=1&_type=json`
        + `&subwayStationName=${encodeURIComponent(keyword)}`
        + `&upDownTypeCode=${dir === 'up' ? 'U' : 'D'}`;
      const r = await fetch(url);
      const data = await r.json();
      const body = data?.response?.body;
      if (!body?.items?.item) return res.json({ ok: true, items: [] });
      const items = Array.isArray(body.items.item) ? body.items.item : [body.items.item];
      return res.json({ ok: true, items });
    }

    // ── 4. 기차(코레일) 조회 ──
    if (type === 'train') {
      if (!depart || !arrive || !date) return res.json({ ok: false, message: '파라미터 없음' });

      const url = `http://apis.data.go.kr/1613000/TrainInfoService/getStrtpntAlocFndTrainInfo`
        + `?serviceKey=${encodeURIComponent(process.env.KORAIL_TRAIN_KEY)}`
        + `&numOfRows=10&pageNo=1&_type=json`
        + `&depPlaceId=${encodeURIComponent(depart)}`
        + `&arrPlaceId=${encodeURIComponent(arrive)}`
        + `&depPlandTime=${date}`;
      const r = await fetch(url);
      const data = await r.json();
      const body = data?.response?.body;
      if (!body?.items?.item) return res.json({ ok: true, items: [] });
      const items = Array.isArray(body.items.item) ? body.items.item : [body.items.item];
      return res.json({ ok: true, items });
    }

    // ── 5. 고속버스 조회 ──
    if (type === 'express') {
      if (!depart || !arrive) return res.json({ ok: false, message: '파라미터 없음' });

      const today = new Date();
      const dateStr = today.getFullYear()
        + String(today.getMonth()+1).padStart(2,'0')
        + String(today.getDate()).padStart(2,'0');

      const url = `http://apis.data.go.kr/1613000/ExpBusInfoService/getExpBusTimeTable`
        + `?serviceKey=${encodeURIComponent(process.env.TAGO_EXPRESS_KEY)}`
        + `&numOfRows=10&pageNo=1&_type=json`
        + `&depTerminalId=${encodeURIComponent(depart)}`
        + `&arrTerminalId=${encodeURIComponent(arrive)}`
        + `&depPlandTime=${dateStr}`;
      const r = await fetch(url);
      const data = await r.json();
      const body = data?.response?.body;
      if (!body?.items?.item) return res.json({ ok: true, items: [] });
      const items = Array.isArray(body.items.item) ? body.items.item : [body.items.item];
      return res.json({ ok: true, items });
    }

    return res.json({ ok: false, message: '알 수 없는 type' });

  } catch (e) {
    console.error('traffic API error:', e);
    return res.status(500).json({ ok: false, message: '서버 오류', error: e.message });
  }
}
