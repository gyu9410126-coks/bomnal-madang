// 파일명: api/culture.js
// 역할: Vercel 서버리스 함수
//       브라우저 → 이 파일 → 국가유산청/문화포털/문화공공데이터광장 API
//       (브라우저 직접 호출 시 CORS 오류 발생 → 중간 다리 역할)

// ── 오늘 날짜 YYYYMMDD ──
function getTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
}

// ── 2달 후 날짜 YYYYMMDD ──
function getMonthLaterStr() {
  const d = new Date();
  d.setMonth(d.getMonth() + 2);
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
}

// ── XML에서 태그값 추출 공통 함수 ──
function getVal(xml, tag) {
  const m = xml.match(new RegExp('<'+tag+'>([\\s\\S]*?)<\\/'+tag+'>'));
  return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g,'').trim() : '';
}

// ── XML 아이템 목록 파싱 공통 함수 ──
function parseItems(xmlText, tag) {
  const t = tag || 'item';
  return (xmlText.match(new RegExp('<'+t+'>[\\s\\S]*?<\\/'+t+'>', 'g')) || []);
}

export default async function handler(req, res) {

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const type = req.query.type || 'event';

  try {

    // ════════════════════════════════
    // [A] 이달의 문화유산 행사목록 (국가유산청)
    // ════════════════════════════════
    if (type === 'event') {
      const now   = new Date();
      const year  = req.query.year  || now.getFullYear();
      const month = req.query.month || String(now.getMonth()+1).padStart(2,'0');
      const url   = `https://www.khs.go.kr/cha/openapi/selectEventListOpenapi.do?searchYear=${year}&searchMonth=${month}`;
      const xmlText = await (await fetch(url)).text();
      const items = parseItems(xmlText,'item').map(function(x){
        return {
          title    : getVal(x,'title'),
          place    : getVal(x,'place'),
          startDate: getVal(x,'startDate'),
          endDate  : getVal(x,'endDate'),
          subTitle : getVal(x,'subTitle'),
          imgUrl   : getVal(x,'imageUrl'),
          linkUrl  : getVal(x,'linkUrl'),
        };
      });
      res.setHeader('Cache-Control','s-maxage=3600');
      return res.status(200).json({ ok:true, type:'event', year, month, items });
    }

    // ════════════════════════════════
    // [B] 오늘의 문화재 목록 (국가유산청)
    // ════════════════════════════════
    if (type === 'list') {
      const ccbaKdcd  = req.query.ccbaKdcd  || '11';
      const pageUnit  = req.query.pageUnit  || '10';
      const pageIndex = req.query.pageIndex || '1';
      const url = `https://www.khs.go.kr/cha/SearchKindOpenapiList.do?ccbaKdcd=${ccbaKdcd}&pageUnit=${pageUnit}&pageIndex=${pageIndex}`;
      const xmlText = await (await fetch(url)).text();
      const items = parseItems(xmlText,'item').map(function(x){
        return {
          ccmaName : getVal(x,'ccmaName'),
          ccbaKdcd : getVal(x,'ccbaKdcd'),
          ccbaAsno : getVal(x,'ccbaAsno'),
          ccbaCtcd : getVal(x,'ccbaCtcd'),
          ccdeSijo : getVal(x,'ccdeSijo'),
          ccbaAdmin: getVal(x,'ccbaAdmin'),
          ccbaCpno : getVal(x,'ccbaCpno'),
        };
      });
      res.setHeader('Cache-Control','s-maxage=86400');
      return res.status(200).json({ ok:true, type:'list', items });
    }

    // ════════════════════════════════
    // [C] 문화재 이미지 검색 (국가유산청)
    // ════════════════════════════════
    if (type === 'image') {
      const ccbaKdcd = req.query.ccbaKdcd || '11';
      const ccbaAsno = req.query.ccbaAsno || '';
      const ccbaCtcd = req.query.ccbaCtcd || '';
      if (!ccbaAsno || !ccbaCtcd) {
        return res.status(400).json({ ok:false, message:'ccbaAsno, ccbaCtcd 필요' });
      }
      const url = `https://www.khs.go.kr/cha/SearchImageOpenapi.do?ccbaKdcd=${ccbaKdcd}&ccbaAsno=${ccbaAsno}&ccbaCtcd=${ccbaCtcd}`;
      const xmlText = await (await fetch(url)).text();
      const images = (xmlText.match(/<imageUrl>([\s\S]*?)<\/imageUrl>/g) || [])
        .map(function(m){ return m.replace(/<\/?imageUrl>/g,'').replace(/<!\[CDATA\[|\]\]>/g,'').trim(); })
        .filter(Boolean);
      res.setHeader('Cache-Control','s-maxage=86400');
      return res.status(200).json({ ok:true, type:'image', images });
    }

    // ════════════════════════════════
    // [D] 공연·전시 정보 (문화포털 culture.go.kr)
    // ════════════════════════════════
    if (type === 'performance') {
      const apiKey = process.env.CULTURE_API_KEY;
      if (!apiKey) return res.status(500).json({ ok:false, message:'CULTURE_API_KEY 없음' });
      const realmCode = req.query.realmCode || '';
      const from  = req.query.from  || getTodayStr();
      const to    = req.query.to    || getMonthLaterStr();
      const rows  = req.query.rows  || '10';
      const cPage = req.query.cPage || '1';
      const url = `https://apis.data.go.kr/B553457/cultureinfo/getCultureInfo`
        + `?serviceKey=${encodeURIComponent(apiKey)}`
        + `&pageNo=${cPage}&numOfRows=${rows}`
        + (realmCode ? `&realmCode=${realmCode}` : '')
        + `&from=${from}&to=${to}`;
      const xmlText = await (await fetch(url)).text();
      const items = parseItems(xmlText,'db').map(function(x){
        return {
          title    : getVal(x,'title'),
          startDate: getVal(x,'startDate'),
          endDate  : getVal(x,'endDate'),
          place    : getVal(x,'place'),
          realmName: getVal(x,'realmName'),
          thumbnail: getVal(x,'thumbnail'),
          url      : getVal(x,'url'),
          price    : getVal(x,'price'),
          phone    : getVal(x,'phone'),
        };
      });
      const totalCount = getVal(xmlText,'totalCount') || '0';
      res.setHeader('Cache-Control','s-maxage=3600');
      return res.status(200).json({ ok:true, type:'performance', totalCount, items });
    }

    // ════════════════════════════════
    // [E] 공연정보 통합 (api.kcisa.kr — API_CCA_144)
    // ════════════════════════════════
    if (type === 'perf2') {
      const apiKey = process.env.CULTURE_PERF_KEY;
      if (!apiKey) return res.status(500).json({ ok:false, message:'CULTURE_PERF_KEY 없음' });
      const numOfRows = req.query.rows   || '10';
      const pageNo    = req.query.cPage  || '1';
      const keyword   = req.query.keyword|| '';
      const url = `https://api.kcisa.kr/openapi/API_CCA_144/request`
        + `?serviceKey=${encodeURIComponent(apiKey)}`
        + `&numOfRows=${numOfRows}&pageNo=${pageNo}`
        + (keyword ? `&keyword=${encodeURIComponent(keyword)}` : '');
      const xmlText = await (await fetch(url)).text();
      const items = parseItems(xmlText,'item').map(function(x){
        return {
          title    : getVal(x,'TITLE'),       // 공연명
          period   : getVal(x,'PERIOD'),      // 기간
          place    : getVal(x,'EVENT_SITE'),  // 장소
          charge   : getVal(x,'CHARGE'),      // 요금
          thumbnail: getVal(x,'THUMBNAIL'),   // 이미지
          url      : getVal(x,'URL'),         // 상세링크
          duration : getVal(x,'DURATION'),    // 공연시간
        };
      });
      const totalCount = getVal(xmlText,'totalCount') || '0';
      res.setHeader('Cache-Control','s-maxage=3600');
      return res.status(200).json({ ok:true, type:'perf2', totalCount, items });
    }

    // ════════════════════════════════
    // [F] 전시정보 통합 (api.kcisa.kr — API_CCA_145)
    // ════════════════════════════════
    if (type === 'exhi') {
      const apiKey = process.env.CULTURE_EXHI_KEY;
      if (!apiKey) return res.status(500).json({ ok:false, message:'CULTURE_EXHI_KEY 없음' });
      const numOfRows = req.query.rows  || '10';
      const pageNo    = req.query.cPage || '1';
      const keyword   = req.query.keyword || '';
      const url = `https://api.kcisa.kr/openapi/API_CCA_145/request`
        + `?serviceKey=${encodeURIComponent(apiKey)}`
        + `&numOfRows=${numOfRows}&pageNo=${pageNo}`
        + (keyword ? `&keyword=${encodeURIComponent(keyword)}` : '');
      const xmlText = await (await fetch(url)).text();
      const items = parseItems(xmlText,'item').map(function(x){
        return {
          title    : getVal(x,'TITLE'),
          period   : getVal(x,'PERIOD'),
          place    : getVal(x,'EVENT_SITE'),
          charge   : getVal(x,'CHARGE'),
          thumbnail: getVal(x,'THUMBNAIL'),
          url      : getVal(x,'URL'),
          duration : getVal(x,'DURATION'),
        };
      });
      const totalCount = getVal(xmlText,'totalCount') || '0';
      res.setHeader('Cache-Control','s-maxage=3600');
      return res.status(200).json({ ok:true, type:'exhi', totalCount, items });
    }

    // ════════════════════════════════
    // [G] 국립지방박물관 문화행사 통합 (api.kcisa.kr — API_CNV_043)
    // ════════════════════════════════
    if (type === 'museum') {
      const apiKey = process.env.CULTURE_MUSEUM_KEY;
      if (!apiKey) return res.status(500).json({ ok:false, message:'CULTURE_MUSEUM_KEY 없음' });
      const numOfRows = req.query.rows  || '10';
      const pageNo    = req.query.cPage || '1';
      const keyword   = req.query.keyword || '';
      const url = `https://api.kcisa.kr/openapi/service/CNV/API_CNV_043/request`
        + `?serviceKey=${encodeURIComponent(apiKey)}`
        + `&numOfRows=${numOfRows}&pageNo=${pageNo}`
        + `&keyword=${encodeURIComponent(keyword)}`;
      const xmlText = await (await fetch(url)).text();
      const items = parseItems(xmlText,'item').map(function(x){
        return {
          title    : getVal(x,'TITLE'),
          period   : getVal(x,'PERIOD'),
          place    : getVal(x,'EVENT_SITE'),
          charge   : getVal(x,'CHARGE'),
          thumbnail: getVal(x,'THUMBNAIL'),
          url      : getVal(x,'URL'),
          organizer: getVal(x,'SPATIAL_COVERAGE'), // 주관기관
        };
      });
      const totalCount = getVal(xmlText,'totalCount') || '0';
      res.setHeader('Cache-Control','s-maxage=3600');
      return res.status(200).json({ ok:true, type:'museum', totalCount, items });
    }

    // ════════════════════════════════
    // [H] 소속 및 산하기관 교육정보 (api.kcisa.kr — conver3)
    // ════════════════════════════════
    if (type === 'edu') {
      const apiKey = process.env.CULTURE_EDU_KEY;
      if (!apiKey) return res.status(500).json({ ok:false, message:'CULTURE_EDU_KEY 없음' });
      const numOfRows = req.query.rows  || '10';
      const pageNo    = req.query.cPage || '1';
      const keyword   = req.query.keyword || '';
      const url = `https://api.kcisa.kr/openapi/service/rest/convergence/conver3`
        + `?serviceKey=${encodeURIComponent(apiKey)}`
        + `&numOfRows=${numOfRows}&pageNo=${pageNo}`
        + `&keyword=${encodeURIComponent(keyword)}`;
      const xmlText = await (await fetch(url)).text();
      const items = parseItems(xmlText,'item').map(function(x){
        return {
          title    : getVal(x,'TITLE'),
          period   : getVal(x,'PERIOD'),
          place    : getVal(x,'EVENT_SITE'),
          charge   : getVal(x,'CHARGE'),
          thumbnail: getVal(x,'THUMBNAIL'),
          url      : getVal(x,'URL'),
          organizer: getVal(x,'SPATIAL_COVERAGE'),
        };
      });
      const totalCount = getVal(xmlText,'totalCount') || '0';
      res.setHeader('Cache-Control','s-maxage=3600');
      return res.status(200).json({ ok:true, type:'edu', totalCount, items });
    }

    // ════════════════════════════════
    // [I] 전국 지역축제 (전국문화축제표준데이터, data.go.kr)
    // ════════════════════════════════
    if (type === 'festival') {
      const apiKey = process.env.FESTIVAL_STD_API_KEY;
      if (!apiKey) return res.status(500).json({ ok:false, message:'FESTIVAL_STD_API_KEY 없음' });

      const region = req.query.region || '';
      // (한글 설명) 화면에 최종적으로 내려줄 개수예요. 홈 미리보기는 rows=5로 부르고,
      //             전체 페이지는 안 넘기면 90개까지 넉넉히 내려줘요.
      const rows = parseInt(req.query.rows) || 90;

      const endpoint = 'https://api.data.go.kr/openapi/tn_pubr_public_cltur_fstvl_api';
      const keyEnc = encodeURIComponent(apiKey);

      // (한글 설명) 시/도 이름이 정식명칭 변경(강원특별자치도·전북특별자치도) 및
      //             2026.7.1 전남·광주 통합으로 옛 이름/새 이름이 섞여 있을 수 있어서,
      //             주소가 시작할 수 있는 후보 이름들을 같이 확인해요.
      const REGION_VARIANTS = {
        '강원특별자치도': ['강원특별자치도', '강원도'],
        '전북특별자치도': ['전북특별자치도', '전라북도'],
        '전라남도'      : ['전라남도', '전남광주통합특별시'],
        '광주광역시'    : ['광주광역시', '전남광주통합특별시'],
      };
      const variants = region ? (REGION_VARIANTS[region] || [region]) : null;

      // (한글 설명) 정부 서버에서 축제 데이터 한 페이지를 받아오는 공통 함수예요.
      //             extraQuery엔 rdnmadr 같은 추가 검색조건을 넣을 수 있어요.
      async function fetchFestivalPage(pageNo, extraQuery) {
        const url = `${endpoint}?serviceKey=${keyEnc}&pageNo=${pageNo}&numOfRows=1000&type=json${extraQuery || ''}`;
        let json;
        try {
          const r = await fetch(url);
          const text = await r.text();
          json = JSON.parse(text);
        } catch (e) {
          return []; // 응답이 JSON이 아니거나 통신 실패면 빈 배열로 처리(에러 대신 "데이터 없음"으로 보여줌)
        }
        const body = json && json.response && json.response.body;
        if (!body || !body.items) return [];
        const items = body.items;
        if (typeof items === 'string') return []; // 데이터 없을 때 items가 빈 문자열로 오는 경우 대비
        if (Array.isArray(items)) return items;         // [실제 확인됨] items 자체가 바로 목록 배열인 경우
        if (items.item) return Array.isArray(items.item) ? items.item : [items.item]; // items.item 형태인 경우도 대비
        return [];
      }

      function matchesRegion(it) {
        if (!variants) return true;
        const addr = it.rdnmadr || '';
        return variants.some(function(v){ return addr.indexOf(v) === 0; });
      }

      let rawItems = [];

      if (variants) {
        // [1차 시도] 정부 서버가 rdnmadr 파라미터로 직접 걸러주는지 시도해봐요.
        const filtered = await fetchFestivalPage(1, `&rdnmadr=${encodeURIComponent(region)}`);
        const matchCount = filtered.filter(matchesRegion).length;

        if (filtered.length > 0 && matchCount === filtered.length) {
          // 정부 서버가 정확히 걸러서 보내준 것으로 확인됨 → 그대로 사용 (빠르고 가벼움)
          rawItems = filtered;
        } else {
          // [자동 전환] 안 걸러졌음 → 여러 페이지를 동시에(병렬로) 받아서 우리가 직접 필터링
          //             안전장치: 시간초과 방지를 위해 최대 5페이지(5000건)까지만 시도
          const pages = await Promise.all([1, 2, 3, 4, 5].map(function(p){ return fetchFestivalPage(p, ''); }));
          rawItems = [].concat.apply([], pages).filter(matchesRegion);
        }
      } else {
        // 전체보기 — 한 페이지만 넉넉히 받아옴
        rawItems = await fetchFestivalPage(1, '');
      }

      // 오늘 이후에 끝나는 축제만 남기기 (이미 끝난 축제는 어르신께 혼란만 드려요)
      const now = new Date();
      const todayDash = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
      let items = rawItems.filter(function(it){
        return !it.fstvlEndDate || it.fstvlEndDate >= todayDash;
      });

      // 축제 시작일이 가까운 순으로 정렬
      items.sort(function(a, b){
        return (a.fstvlStartDate || '').localeCompare(b.fstvlStartDate || '');
      });

      items = items.slice(0, rows).map(function(it){
        return {
          title  : it.fstvlNm || '',
          place  : it.opar || '',
          period : (it.fstvlStartDate && it.fstvlEndDate) ? (it.fstvlStartDate + ' ~ ' + it.fstvlEndDate) : (it.fstvlStartDate || ''),
          region : it.rdnmadr ? it.rdnmadr.split(' ')[0] : '',
          address: it.rdnmadr || '',
          lat    : it.latitude  || '',
          lon    : it.longitude || '',
          url    : it.homepageUrl || '',
          phone  : it.phoneNumber || '',
        };
      });

      res.setHeader('Cache-Control', 's-maxage=43200'); // 12시간 캐시 (분기별 갱신 데이터라 넉넉히 늘림)
      return res.status(200).json({ ok:true, type:'festival', totalCount: items.length, items });
    }

    return res.status(400).json({ ok:false, message:'올바른 type: event/list/image/performance/perf2/exhi/museum/edu/festival' });

  } catch (err) {
    return res.status(500).json({ ok:false, message:'서버 오류: '+err.message });
  }
}
