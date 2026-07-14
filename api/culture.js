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
      // (한글 설명) &debug=1을 붙이면, 우리가 가공하기 전에 정부 서버가 실제로
      //             보내주는 원본 데이터(영문 필드명 그대로)를 3개만 화면에 찍어줘요.
      //             새 필드(축제내용 등)를 추가하기 전에 진짜 필드명을 확인하는 용도예요.
      const debug = req.query.debug === '1';

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

      // (한글 설명) debug=1이면 여기서 멈추고, 정부 서버 원본 데이터 3개를
      //             가공 없이 그대로 보여줘요. (필드명 확인용, 평소엔 절대 실행 안 됨)
      if (debug) {
        return res.status(200).json({
          ok: true,
          debug: true,
          totalRawCount: rawItems.length,
          sample: rawItems.slice(0, 3),
        });
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
          content: it.fstvlCo || '', // 축제 소개글 (자세히 보기에서 사용)
        };
      });

      res.setHeader('Cache-Control', 's-maxage=43200'); // 12시간 캐시 (분기별 갱신 데이터라 넉넉히 늘림)
      return res.status(200).json({ ok:true, type:'festival', totalCount: items.length, items });
    }

    // ════════════════════════════════════════════════════
    // [J] 전국 지역축제 - "사진으로 보는 축제" 보너스 섹션 (한국관광공사 TourAPI)
    //     (한글 설명) [I]번 기존 축제 목록과는 완전히 별도로, 사진이 등록된
    //     축제 몇 개만 추가로 보여주는 보너스 섹션이에요. 이 지역에 TourAPI
    //     데이터가 없으면 화면(culture.html)에서 그냥 섹션 자체를 숨겨요.
    //     기존 [I]번 축제 목록은 이 블록과 무관하게 그대로 유지돼요.
    // ════════════════════════════════════════════════════
    if (type === 'festivalTour') {
      const apiKey = process.env.TOURAPI_KEY;
      if (!apiKey) return res.status(500).json({ ok:false, message:'TOURAPI_KEY 없음' });

      const region = req.query.region || '';
      const debug = req.query.debug === '1';
      const keyEnc = encodeURIComponent(apiKey);

      // (한글 설명) health.js의 SIDO_CODES와 완전히 같은 표예요(법정동코드 체계).
      //             이미 검증된 표를 그대로 재사용해요.
      const SIDO_CODES = {
        '서울특별시': '11', '부산광역시': '26', '대구광역시': '27', '인천광역시': '28',
        '광주광역시': '29', '대전광역시': '30', '울산광역시': '31', '세종특별자치시': '36',
        '경기도': '41', '강원특별자치도': '51', '충청북도': '43', '충청남도': '44',
        '전북특별자치도': '52', '전라남도': '46', '경상북도': '47', '경상남도': '48',
        '제주특별자치도': '50',
      };
      const lDongRegnCd = region ? (SIDO_CODES[region] || '') : '';

      const today = getTodayStr();
      // (한글 설명) 오늘부터 1년 뒤까지의 축제를 넉넉히 찾아봐요.
      const oneYearLater = (function(){
        const d = new Date();
        d.setFullYear(d.getFullYear() + 1);
        return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
      })();

      // (한글 설명) arrange=O → "대표이미지가 반드시 있는 것만" 정렬(활용매뉴얼로 확인됨).
      //             lclsSystm1=EV & lclsSystm2=EV01 → 공연·전시 말고 "축제"만.
      //             보너스 섹션이라 numOfRows는 10개면 충분해요.
      let url = `https://apis.data.go.kr/B551011/KorService2/searchFestival2`
        + `?serviceKey=${keyEnc}&numOfRows=10&pageNo=1&MobileOS=ETC&MobileApp=BomnalMadang`
        + `&_type=json&arrange=O&eventStartDate=${today}&eventEndDate=${oneYearLater}`
        + `&lclsSystm1=EV&lclsSystm2=EV01`;
      if (lDongRegnCd) url += `&lDongRegnCd=${lDongRegnCd}`;

      let json;
      try {
        const r = await fetch(url);
        const text = await r.text();
        json = JSON.parse(text);
      } catch (e) {
        // (한글 설명) 보너스 섹션이라, 실패해도 에러 대신 "빈 목록"으로 조용히 처리해요.
        //             기존 축제 목록([I]번)은 이 실패와 무관하게 정상 작동해요.
        return res.status(200).json({ ok:true, type:'festivalTour', totalCount:0, items:[] });
      }

      const body = json && json.response && json.response.body;
      const rawItems = (body && body.items && (Array.isArray(body.items.item) ? body.items.item : (body.items.item ? [body.items.item] : []))) || [];

      if (debug) {
        return res.status(200).json({ ok:true, debug:true, totalRawCount: rawItems.length, sample: rawItems.slice(0, 5) });
      }

      // (한글 설명) YYYYMMDD → YYYY-MM-DD로 보기 좋게 바꿔주는 작은 함수예요.
      function fmtYmd(s) {
        if (!s || s.length !== 8) return '';
        return s.slice(0,4) + '-' + s.slice(4,6) + '-' + s.slice(6,8);
      }

      const items = rawItems
        .filter(function(it){ return !!it.firstimage; }) // 혹시 몰라 사진 없는 건 한 번 더 방어
        .slice(0, 5)
        .map(function(it){
          return {
            title  : it.title || '',
            address: it.addr1 || '',
            place  : it.addr2 || '',
            period : (it.eventstartdate && it.eventenddate) ? (fmtYmd(it.eventstartdate) + ' ~ ' + fmtYmd(it.eventenddate)) : '',
            phone  : it.tel || '',
            photo  : it.firstimage,
            lat    : it.mapy || '',
            lon    : it.mapx || '',
          };
        });

      res.setHeader('Cache-Control', 's-maxage=43200'); // 12시간 캐시
      return res.status(200).json({ ok:true, type:'festivalTour', totalCount: items.length, items });
    }

    // ════════════════════════════════════════════════════
    // [K] 문화시설 안내 - 박물관·미술관 / 문화원·도서관 (한국관광공사 TourAPI)
    //     (한글 설명) [J]번 축제 사진 기능과 같은 TOURAPI_KEY를 재사용해요(새 키 필요없음).
    //     신분류체계(lclsSystm) 코드로 필터링: VE07=박물관·미술관, VE09=도서관·문화원
    //     ⚠️ areaBasedList2 라는 주소가 맞는지 아직 실제로 테스트 전이에요.
    //        &debug=1을 붙이면 정부 서버가 실제로 보내주는 원본 데이터를 그대로 보여줘요.
    //        이 debug 모드로 먼저 확인한 다음에만 화면(culture.html)에 정식으로 붙일 거예요.
    // ════════════════════════════════════════════════════
    if (type === 'facilityTour') {
      const apiKey = process.env.TOURAPI_KEY;
      if (!apiKey) return res.status(500).json({ ok:false, message:'TOURAPI_KEY 없음' });

      // category: 'museum'(박물관·미술관) 또는 'center'(문화원·도서관)
      const category = req.query.category || '';
      const LCLS_MAP = { museum: 'VE07', center: 'VE09' };
      const lclsSystm2 = LCLS_MAP[category];
      if (!lclsSystm2) {
        return res.status(400).json({ ok:false, message:'category 파라미터가 필요해요 (museum 또는 center)' });
      }

      const region = req.query.region || '';
      const rows   = parseInt(req.query.rows) || 15;
      const debug  = req.query.debug === '1';
      const keyEnc = encodeURIComponent(apiKey);

      // (한글 설명) festivalTour와 완전히 같은 법정동코드 표예요(health.js SIDO_CODES와 동일 체계).
      const SIDO_CODES = {
        '서울특별시': '11', '부산광역시': '26', '대구광역시': '27', '인천광역시': '28',
        '광주광역시': '29', '대전광역시': '30', '울산광역시': '31', '세종특별자치시': '36',
        '경기도': '41', '강원특별자치도': '51', '충청북도': '43', '충청남도': '44',
        '전북특별자치도': '52', '전라남도': '46', '경상북도': '47', '경상남도': '48',
        '제주특별자치도': '50',
      };
      const lDongRegnCd = region ? (SIDO_CODES[region] || '') : '';

      let url = `https://apis.data.go.kr/B551011/KorService2/areaBasedList2`
        + `?serviceKey=${keyEnc}&numOfRows=${rows}&pageNo=1&MobileOS=ETC&MobileApp=BomnalMadang`
        + `&_type=json&arrange=O`
        + `&lclsSystm1=VE&lclsSystm2=${lclsSystm2}`;
      if (lDongRegnCd) url += `&lDongRegnCd=${lDongRegnCd}`;

      let json;
      try {
        const r = await fetch(url);
        const text = await r.text();
        json = JSON.parse(text);
      } catch (e) {
        return res.status(200).json({ ok:true, type:'facilityTour', totalCount:0, items:[], warning:'정부 서버 응답을 받지 못했거나 JSON이 아니었어요: ' + e.message });
      }

      const header = json && json.response && json.response.header;
      const body   = json && json.response && json.response.body;
      const rawItems = (body && body.items && (Array.isArray(body.items.item) ? body.items.item : (body.items.item ? [body.items.item] : []))) || [];

      // (한글 설명) &debug=1 이면 여기서 멈추고, 가공하기 전 원본 데이터를 그대로 보여줘요.
      //             정식 필드명·데이터 개수를 눈으로 직접 확인하는 용도예요(평소엔 실행 안 됨).
      if (debug) {
        return res.status(200).json({
          ok: true,
          debug: true,
          requestUrl   : url.replace(keyEnc, '(서비스키-숨김)'),
          resultCode   : header ? header.resultCode : null,
          resultMsg    : header ? header.resultMsg  : null,
          totalCount   : body ? body.totalCount : 0,
          totalRawCount: rawItems.length,
          sample       : rawItems.slice(0, 5),
        });
      }

      const items = rawItems.map(function(it){
        return {
          contentid: it.contentid    || '',
          title    : it.title       || '',
          address  : it.addr1       || '',
          place    : it.addr2       || '',
          tel      : it.tel         || '',
          photo    : it.firstimage  || '',
          lat      : it.mapy        || '',
          lon      : it.mapx        || '',
        };
      });

      res.setHeader('Cache-Control', 's-maxage=43200'); // 12시간 캐시
      return res.status(200).json({ ok:true, type:'facilityTour', totalCount: (body ? body.totalCount : items.length), items });
    }

    // ════════════════════════════════════════════════════
    // [L] 문화시설 자세히보기 - 전화번호·홈페이지 (한국관광공사 TourAPI, detailCommon2)
    //     (한글 설명) [K]번 목록에는 전화번호가 안 들어있어서, "자세히보기"를
    //     눌렀을 때만 딱 한 번 더 불러오는 지연호출(lazy call)이에요.
    //     처음부터 다 불러오면 느리고 트래픽도 낭비되니까, 필요할 때만 호출해요.
    //     ⚠️ 이것도 debug=1로 먼저 실제 응답을 확인해야 해요.
    // ════════════════════════════════════════════════════
    if (type === 'facilityDetail') {
      const apiKey = process.env.TOURAPI_KEY;
      if (!apiKey) return res.status(500).json({ ok:false, message:'TOURAPI_KEY 없음' });

      const contentId = req.query.contentid || '';
      if (!contentId) return res.status(400).json({ ok:false, message:'contentid 파라미터가 필요해요' });

      const debug  = req.query.debug === '1';
      const keyEnc = encodeURIComponent(apiKey);

      // (한글 설명) 한국관광공사 공식 활용매뉴얼(v4.4) 표28로 확인했어요.
      //             detailCommon2가 실제로 받는 파라미터는 이게 전부예요:
      //             serviceKey·MobileOS·MobileApp·_type·numOfRows·pageNo·contentId
      //             (defaultYN·firstImageYN·areacodeYN·addrinfoYN·contentTypeId 등은
      //              이 API엔 아예 없는 파라미터였어요 — 넣으면 오류남, 실제 테스트로 확인)
      //             tel·telname·homepage·overview는 파라미터 없이 항상 기본으로 같이 와요.
      const url = `https://apis.data.go.kr/B551011/KorService2/detailCommon2`
        + `?serviceKey=${keyEnc}&contentId=${encodeURIComponent(contentId)}`
        + `&MobileOS=ETC&MobileApp=BomnalMadang&_type=json&numOfRows=1&pageNo=1`;

      let json;
      try {
        const r = await fetch(url);
        const text = await r.text();
        json = JSON.parse(text);
      } catch (e) {
        return res.status(200).json({ ok:true, type:'facilityDetail', tel:'', homepage:'', overview:'', warning:'상세정보를 받지 못했어요' });
      }

      const header = json && json.response && json.response.header;
      const body   = json && json.response && json.response.body;
      const rawItems = (body && body.items && (Array.isArray(body.items.item) ? body.items.item : (body.items.item ? [body.items.item] : []))) || [];
      const it = rawItems[0] || {};

      if (debug) {
        return res.status(200).json({
          ok: true,
          debug: true,
          requestUrl: url.replace(keyEnc, '(서비스키-숨김)'),
          resultCode: header ? header.resultCode : null,
          resultMsg : header ? header.resultMsg  : null,
          sample    : it,
          // (한글 설명) 위 sample이 비어있을 때 원인을 눈으로 확인하기 위해
          //             정부 서버가 보낸 원본 응답을 가공 없이 통째로 같이 보여줘요.
          rawJson   : json,
        });
      }

      // (한글 설명) homepage 필드는 3가지 형태로 올 수 있어요(실제 테스트로 확인됨):
      //             ① <a href="주소">글자</a> 형태의 HTML
      //             ② https://... 처럼 http로 시작하는 순수 주소
      //             ③ www.sgnc.or.kr 처럼 http:// 없이 도메인만 오는 경우
      //             세 경우 다 놓치지 않고 "누르면 바로 열리는" 완전한 주소로 만들어줘요.
      const homepageRaw = (it.homepage || '').trim();
      const hrefMatch = homepageRaw.match(/href="([^"]+)"/);
      let homepage = '';
      if (hrefMatch) {
        homepage = hrefMatch[1];
      } else if (homepageRaw.indexOf('http') === 0) {
        homepage = homepageRaw;
      } else if (homepageRaw && homepageRaw.indexOf('<') === -1) {
        // HTML 태그가 안 섞인 순수 텍스트인데 http로 시작 안 하면, 도메인만 온 것으로 보고 https:// 붙여줘요.
        homepage = 'https://' + homepageRaw;
      }

      res.setHeader('Cache-Control', 's-maxage=86400'); // 24시간 캐시 (전화번호는 자주 안 바뀜)
      return res.status(200).json({
        ok: true,
        type: 'facilityDetail',
        tel     : it.tel      || '',
        homepage: homepage,
        overview: it.overview || '',
      });
    }

    return res.status(400).json({ ok:false, message:'올바른 type: event/list/image/performance/perf2/exhi/museum/edu/festival/festivalTour/facilityTour/facilityDetail' });

  } catch (err) {
    return res.status(500).json({ ok:false, message:'서버 오류: '+err.message });
  }
}
