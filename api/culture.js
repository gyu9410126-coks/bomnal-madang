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
    // [I] 지역축제 정보 (api.kcisa.kr — meta4/getKCPG0504)
    // ════════════════════════════════
    if (type === 'festival') {
      const apiKey = process.env.CULTURE_FESTIVAL_KEY;
      if (!apiKey) return res.status(500).json({ ok:false, message:'CULTURE_FESTIVAL_KEY 없음' });
      const numOfRows = req.query.rows    || '10';
      const pageNo    = req.query.cPage   || '1';
      const keyword   = req.query.keyword || '';
      const url = `https://api.kcisa.kr/openapi/service/rest/meta4/getKCPG0504`
        + `?serviceKey=${encodeURIComponent(apiKey)}`
        + `&numOfRows=${numOfRows}&pageNo=${pageNo}`
        + `&keyword=${encodeURIComponent(keyword)}`;
      const xmlText = await (await fetch(url)).text();
      const items = parseItems(xmlText,'item').map(function(x){
        return {
          title      : getVal(x,'TITLE'),            // 축제명
          period     : getVal(x,'PERIOD'),           // 기간
          place      : getVal(x,'EVENT_SITE'),       // 장소
          region     : getVal(x,'SPATIAL_COVERAGE'), // 지역
          thumbnail  : getVal(x,'THUMBNAIL'),        // 이미지
          url        : getVal(x,'URL'),              // 상세링크
          charge     : getVal(x,'CHARGE'),           // 요금
          description: getVal(x,'DESCRIPTION'),     // 설명
        };
      });
      const totalCount = getVal(xmlText,'totalCount') || '0';
      res.setHeader('Cache-Control','s-maxage=3600');
      return res.status(200).json({ ok:true, type:'festival', totalCount, items });
    }

    return res.status(400).json({ ok:false, message:'올바른 type: event/list/image/performance/perf2/exhi/museum/edu/festival' });

  } catch (err) {
    return res.status(500).json({ ok:false, message:'서버 오류: '+err.message });
  }
}
