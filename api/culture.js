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
  if (!m) return '';
  // (한글 설명) XML은 &·<·> 같은 특수문자를 &amp;·&lt;·&gt; 로 이스케이프해서 보내는데,
  //             그대로 두면 링크가 깨지거나 제목에 이상한 글자가 섞여요. 실제 데이터에서
  //             확인된 문제라 여기서 한 번에 다 풀어줘요(모든 API 공통 적용).
  return m[1]
    .replace(/<!\[CDATA\[|\]\]>/g,'')
    .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
    .replace(/&quot;/g,'"').replace(/&#39;/g,"'")
    .trim();
}

// ── XML 아이템 목록 파싱 공통 함수 ──
function parseItems(xmlText, tag) {
  const t = tag || 'item';
  return (xmlText.match(new RegExp('<'+t+'>[\\s\\S]*?<\\/'+t+'>', 'g')) || []);
}

// (한글 설명) 문화재청 원본 데이터에 <시군구>내용</sigungu> 처럼 여닫는 태그명이
//             서로 다르게 오는 오류가 있어서(실제 테스트로 확인됨), sigungu만
//             전용으로 한글/영문 태그명 둘 다 시도해서 안전하게 뽑아내요.
function getSigungu(xml) {
  let m = xml.match(/<sigungu>([\s\S]*?)<\/sigungu>/);
  if (!m) m = xml.match(/<시군구>([\s\S]*?)<\/sigungu>/);
  if (!m) m = xml.match(/<시군구>([\s\S]*?)<\/시군구>/);
  return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g,'').trim() : '';
}

// (한글 설명) [한국문화정보원_한눈에보는문화정보조회서비스] 공용 조회 함수예요.
//             3·4·6번(공연/전시/교육정보) 아이콘이 다 이 API 하나를 재사용해요.
//             realmCodes가 여러 개면(예: 공연 "전체" 탭) 동시에 다 불러와서 합쳐요.
//             ※ 실제 테스트로 확인된 것: sido는 "서울"처럼 짧은 이름만 통함,
//             _type=json 넣으면 응답이 비어버림(XML 그대로 받아야 함).
async function fetchCultureInfoRealm(apiKey, realmCodes, region, rows, pageNo, keyword) {
  const keyEnc = encodeURIComponent(apiKey);
  // (한글 설명) realmCodes가 비어있으면(예: 박물관행사처럼 분야코드 없이 검색어만
  //             쓰는 경우) realmCode 파라미터 없이 딱 1번만 요청해요.
  const codes = (realmCodes && realmCodes.length) ? realmCodes : [''];
  const results = await Promise.all(codes.map(async function(code){
    let url = `https://apis.data.go.kr/B553457/cultureinfo/realm2`
      + `?serviceKey=${keyEnc}&PageNo=${pageNo}&numOfrows=${rows}`;
    if (code) url += `&realmCode=${code}`;
    if (region) url += `&sido=${encodeURIComponent(region)}`;
    if (keyword) url += `&keyword=${encodeURIComponent(keyword)}`;
    try {
      const r = await fetch(url);
      const text = await r.text();
      const rawItems = parseItems(text, 'item');
      const totalM = text.match(/<totalCount>(\d+)<\/totalCount>/);
      const items = rawItems.map(function(x){
        return {
          seq      : getVal(x,'seq'),
          title    : getVal(x,'title'),
          startDate: getVal(x,'startDate'),
          endDate  : getVal(x,'endDate'),
          place    : getVal(x,'place'),
          realmName: getVal(x,'realmName'),
          area     : getVal(x,'area'),
          sigungu  : getSigungu(x),
          thumbnail: getVal(x,'thumbnail'),
          gpsX     : getVal(x,'gpsX'),
          gpsY     : getVal(x,'gpsY'),
        };
      });
      return { items, totalCount: totalM ? parseInt(totalM[1]) : items.length };
    } catch (e) {
      return { items: [], totalCount: 0 };
    }
  }));

  // (한글 설명) 여러 분야를 합칠 때는 seq(고유번호) 기준으로 중복을 제거해요.
  const seen = {};
  let merged = [];
  results.forEach(function(r){ merged = merged.concat(r.items); });
  merged = merged.filter(function(it){
    if (!it.seq || seen[it.seq]) return false;
    seen[it.seq] = true;
    return true;
  });

  const totalCount = realmCodes.length === 1 ? results[0].totalCount : merged.length;
  // (한글 설명) 하나라도 이번 페이지에 꽉 채워서(rows개) 왔으면, 다음 페이지도
  //             있을 가능성이 높다고 보고 "더보기"를 보여줘요.
  const hasMore = results.some(function(r){ return r.items.length >= rows; });

  return { items: merged, totalCount, hasMore };
}

export default async function handler(req, res) {

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const type = req.query.type || 'event';

  try {

    // ════════════════════════════════
    // [A] 이달의 문화유산 행사목록 (국가유산청)
    //     (한글 설명) 실제 테스트로 확인한 정확한 XML 필드명으로 전면 수정했어요.
    //     예전엔 title·place·startDate 등 "있을 것 같은" 이름을 썼는데, 실제로는
    //     subTitle·sDate·eDate·sido·subPath 였어서 계속 빈칸이 나왔던 거예요.
    //     지역필터는 정부 서버가 지원하는지 불확실해서, 우리 서버에서 sido 값을
    //     직접 비교해 걸러내는 안전한 방식으로 했어요(항상 정확하게 작동함).
    //     752개를 한번에 다 안 주고, rows·pageNo로 나눠서 "더보기"가 가능해요.
    // ════════════════════════════════
    if (type === 'event') {
      const now    = new Date();
      const year   = req.query.year  || now.getFullYear();
      const month  = req.query.month || String(now.getMonth()+1).padStart(2,'0');
      const debug  = req.query.debug === '1';
      const region = req.query.region || ''; // sido 값 그대로 (예: 서울특별시)
      const rows   = parseInt(req.query.rows)   || 10;
      const pageNo = parseInt(req.query.pageNo) || 1;

      let url = `https://www.khs.go.kr/cha/openapi/selectEventListOpenapi.do?searchYear=${year}&searchMonth=${month}`;
      // (한글 설명) 실험용: 사람이 보는 웹페이지(evInfo/selectInfoList.do)에서
      //             sidoCode 파라미터를 쓰는 걸 발견해서, 이 API도 같은 파라미터를
      //             지원하는지 테스트해봐요.
      if (req.query.sidoCode) url += `&sidoCode=${req.query.sidoCode}`;
      const xmlText = await (await fetch(url)).text();
      const rawItems = parseItems(xmlText,'item');

      if (debug) {
        return res.status(200).json({
          ok: true, debug: true, requestUrl: url,
          totalRawCount: rawItems.length,
          rawXmlSample: xmlText.slice(0, 3000),
        });
      }

      let allItems = rawItems.map(function(x){
        const subContent = getVal(x,'subContent');
        const imgMatch = subContent.match(/<img[^>]*src=['"]([^'"]+)['"]/i);
        const contactRaw = getVal(x,'contact');
        // (한글 설명) linkUrl(subPath)이 "culturethebom.com"처럼 https:// 없이 오는
        //             경우가 실제로 있어서(테스트로 확인), 자동으로 붙여줘요.
        let linkUrlRaw = getVal(x,'subPath');
        if (linkUrlRaw && !/^https?:\/\//i.test(linkUrlRaw)) linkUrlRaw = 'https://' + linkUrlRaw;
        return {
          title    : getVal(x,'subTitle'),
          content  : subContent.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,150),
          place    : getVal(x,'subDesc'),
          sido     : getVal(x,'sido'),
          gugun    : getVal(x,'gugun'),
          startDate: getVal(x,'sDate'),
          endDate  : getVal(x,'eDate'),
          dateStr  : getVal(x,'subDate'),
          // (한글 설명) contact 필드가 값이 없을 때 "."(점 하나)만 오는 경우가 있어서 걸러내요.
          contact  : (contactRaw && contactRaw !== '.') ? contactRaw : '',
          imgUrl   : imgMatch ? imgMatch[1] : '',
          linkUrl  : linkUrlRaw,
        };
      });

      if (region) {
        // (한글 설명) region 값에 "|"가 있으면 여러 후보 중 하나라도 맞으면 통과시켜요.
        //             (예: "전라북도|전북특별자치도" → 옛날 이름·새 이름 둘 다 걸림)
        //             ⚠️ "충북"은 "충청북도" 안에 그대로 안 들어있어요(충[청]북도라서
        //             중간에 "청"이 껴있음) — 실제 테스트로 발견한 버그를 고쳤어요.
        //             경북·경남도 마찬가지("경[상]북도")라서 전체 이름을 그대로 써요.
        const candidates = region.split('|');
        allItems = allItems.filter(function(it){
          if (!it.sido) return false;
          return candidates.some(function(c){ return it.sido.indexOf(c) !== -1; });
        });
      }

      const totalCount = allItems.length;
      const start = (pageNo-1)*rows;
      const items = allItems.slice(start, start+rows);

      res.setHeader('Cache-Control','s-maxage=3600');
      return res.status(200).json({ ok:true, type:'event', year, month, totalCount, pageNo, items });
    }

    // ════════════════════════════════
    // [B] 오늘의 문화재 목록 (국가유산청)
    //     (한글 설명) 실제 테스트로 확인한 정확한 필드명으로 전면 수정했어요.
    //     ccmaName(문화재 "종류")을 이름 자리에 쓰던 게 제일 큰 문제였어요 —
    //     이제 진짜 이름인 ccbaMnm1을 써요. 위도·경도도 추가해서 지도 연결이
    //     가능해졌고, ccbaCtcd 지역필터는 실제 테스트로 작동 확인했어요.
    //     totalCnt(전체 개수)도 받아서 "더보기"가 정확하게 작동해요.
    // ════════════════════════════════
    if (type === 'list') {
      const ccbaKdcd  = req.query.ccbaKdcd  || '11';
      const ccbaCtcd  = req.query.ccbaCtcd  || '';
      const pageUnit  = parseInt(req.query.pageUnit)  || 10;
      const pageIndex = parseInt(req.query.pageIndex) || 1;
      const debug     = req.query.debug === '1';

      let url = `https://www.khs.go.kr/cha/SearchKindOpenapiList.do?ccbaKdcd=${ccbaKdcd}&pageUnit=${pageUnit}&pageIndex=${pageIndex}`;
      if (ccbaCtcd) url += `&ccbaCtcd=${ccbaCtcd}`;

      const xmlText = await (await fetch(url)).text();
      const rawItems = parseItems(xmlText,'item');

      if (debug) {
        return res.status(200).json({
          ok: true, debug: true, requestUrl: url,
          totalRawCount: rawItems.length,
          rawXmlSample: xmlText.slice(0, 3000),
        });
      }

      const totalCntMatch = xmlText.match(/<totalCnt>(\d+)<\/totalCnt>/);
      const totalCnt = totalCntMatch ? parseInt(totalCntMatch[1]) : rawItems.length;

      const items = rawItems.map(function(x){
        return {
          name     : getVal(x,'ccbaMnm1'),
          nameHanja: getVal(x,'ccbaMnm2'),
          ccmaName : getVal(x,'ccmaName'),
          sido     : getVal(x,'ccbaCtcdNm'),
          gugun    : getVal(x,'ccsiName'),
          admin    : getVal(x,'ccbaAdmin'),
          ccbaKdcd : getVal(x,'ccbaKdcd'),
          ccbaCtcd : getVal(x,'ccbaCtcd'),
          ccbaAsno : getVal(x,'ccbaAsno'),
          ccbaCpno : getVal(x,'ccbaCpno'),
          lat      : getVal(x,'latitude'),
          lon      : getVal(x,'longitude'),
        };
      });

      res.setHeader('Cache-Control','s-maxage=86400');
      return res.status(200).json({ ok:true, type:'list', totalCnt, pageIndex, items });
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

    // ════════════════════════════════════════════════════
    // [O-2] (임시 진단용) 오늘의 문화재 - 지역코드/종목코드 전체 탐색
    //     (한글 설명) 세종의 진짜 지역코드, "천연기념물"의 진짜 종목코드를 추측
    //     없이 직접 찾는 도구예요. ccbaKdcd(종목)=13(사적, 거의 모든 지역에
    //     있음)으로 고정하고 ccbaCtcd(지역)를 11~60까지 다 훑어서, 응답에 실제로
    //     담겨오는 sido(지역명 텍스트)를 그대로 보여줘요 — 코드가 실제로 어느
    //     지역인지 눈으로 바로 확인 가능해요. &mode=kdcd 로 바꾸면 반대로
    //     종목코드 11~19를 훑어서 ccmaName(종목명)을 확인해요(지역은 11=서울 고정).
    // ════════════════════════════════════════════════════
    if (type === 'heritageCodeDiscovery') {
      const mode = req.query.mode || 'ctcd'; // 'ctcd' 또는 'kdcd'
      const jobs = [];
      if (mode === 'ctcd') {
        for (let c = 11; c <= 60; c++) jobs.push({ kdcd:'13', ctcd:String(c) });
      } else {
        for (let k = 11; k <= 19; k++) jobs.push({ kdcd:String(k), ctcd:'' });
      }

      const BATCH_SIZE = 8;
      const results = [];
      for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
        const batch = jobs.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(batch.map(async function(j){
          let url = `https://www.khs.go.kr/cha/SearchKindOpenapiList.do?ccbaKdcd=${j.kdcd}&pageUnit=1&pageIndex=1`;
          if (j.ctcd) url += `&ccbaCtcd=${j.ctcd}`;
          try {
            const r = await fetch(url);
            const text = await r.text();
            const totalM = text.match(/<totalCnt>(\d+)<\/totalCnt>/);
            const sidoM  = text.match(/<ccbaCtcdNm><!\[CDATA\[([^\]]*)\]\]><\/ccbaCtcdNm>/);
            const nameM  = text.match(/<ccmaName><!\[CDATA\[([^\]]*)\]\]><\/ccmaName>/);
            return {
              ccbaKdcd: j.kdcd, ccbaCtcd: j.ctcd || '(전체)',
              totalCnt: totalM ? parseInt(totalM[1]) : 0,
              sido: sidoM ? sidoM[1] : '',
              ccmaName: nameM ? nameM[1] : '',
            };
          } catch (e) {
            return { ccbaKdcd:j.kdcd, ccbaCtcd:j.ctcd||'(전체)', totalCnt:-1, 오류:e.message };
          }
        }));
        results.push(...batchResults);
      }

      const nonZero = results.filter(function(x){ return x.totalCnt > 0; });
      return res.status(200).json({ ok:true, type:'heritageCodeDiscovery', mode, nonZeroCount: nonZero.length, nonZero });
    }

    // ════════════════════════════════════════════════════
    // [O] 오늘의 문화재 "자세히 보기" - 국가유산포털(heritage.go.kr) 설명 가져오기
    //     (한글 설명) 레거시 상세 API는 없어서(SearchDetailOpenapi.do → 404 확인됨),
    //     국가유산포털의 실제 상세페이지에서 og:description(설명글)과
    //     og:image(사진)를 가져와요. 이미 확인된 우리 데이터(ccbaKdcd/ccbaAsno/
    //     ccbaCtcd/ccbaCpno)로 바로 접근 가능해요.
    // ════════════════════════════════════════════════════
    if (type === 'heritageDetail') {
      const ccbaKdcd = req.query.ccbaKdcd || '';
      const ccbaAsno = req.query.ccbaAsno || '';
      const ccbaCtcd = req.query.ccbaCtcd || '';
      const ccbaCpno = req.query.ccbaCpno || '';
      if (!ccbaAsno || !ccbaCtcd) {
        return res.status(200).json({ ok:true, overview:'', imgUrl:'' });
      }
      const url = `https://my.heritage.go.kr/public/commentary/culSelectDetail.do`
        + `?ccbaKdcd=${ccbaKdcd}&ccbaAsno=${ccbaAsno}&ccbaCtcd=${ccbaCtcd}&ccbaCpno=${ccbaCpno}&menuId=01_06`;
      try {
        const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BomnalMadangBot/1.0)' } });
        const html = await r.text();
        const ogImage = (html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) || [])[1] || '';
        let ogDesc = (html.match(/<meta[^>]+property=["']og:description["'][^>]+content=['"]([\s\S]*?)['"]\s*>/i) || [])[1] || '';
        // (한글 설명) &lt;br /&gt; 같은 HTML 엔티티를 실제 줄바꿈으로 바꾸고,
        //             남은 HTML 태그·엔티티를 정리해서 깔끔한 글로 만들어요.
        ogDesc = ogDesc
          .replace(/&lt;br\s*\/?&gt;/gi, '\n')
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/&lt;[^&]*?&gt;/g, '')
          .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
          .replace(/\n{3,}/g, '\n\n')
          .trim();

        // (한글 설명) og태그에는 전화번호가 없어서, 페이지 본문 전체에서 전화번호
        //             패턴("02-1234-5678"류)이 혹시 있는지도 찾아봐요.
        const phoneMatch = html.match(/0\d{1,2}-\d{3,4}-\d{4}/);
        const phone = phoneMatch ? phoneMatch[0] : '';

        res.setHeader('Cache-Control','s-maxage=2592000'); // 문화재 설명은 거의 안 바뀌니 30일 캐시
        // (한글 설명) 우리가 방금 긁어온 이 페이지 자체가 국가유산포털의 공식 상세페이지라서,
        //             "홈페이지 방문" 버튼으로 그대로 연결해줄 수 있어요.
        return res.status(200).json({ ok:true, overview: ogDesc, imgUrl: ogImage, phone, homepage: url });
      } catch (e) {
        // (한글 설명) 설명글은 못 가져왔어도, 링크 자체는 유효하니 홈페이지 버튼은 살려둬요.
        return res.status(200).json({ ok:true, overview:'', imgUrl:'', homepage: url });
      }
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
    // [E] 공연정보 통합 (한국문화정보원 한눈에보는문화정보조회서비스, realmCode 기반)
    //     (한글 설명) 예전엔 api.kcisa.kr에서 키워드로 대충 검색했는데, 오늘 확인한
    //     정확한 realmCode로 교체했어요. 연극=A000, 콘서트=B000, 국악=B002,
    //     무용=C000, 뮤지컬/오페라=B003. "전체" 탭은 이 5개를 한번에 합쳐서 보여줘요.
    // ════════════════════════════════
    if (type === 'perf2') {
      const apiKey = process.env.TOURAPI_KEY;
      if (!apiKey) return res.status(500).json({ ok:false, message:'TOURAPI_KEY 없음' });
      const realmCodeParam = req.query.realmCode || 'A000,B000,B002,C000,B003';
      const realmCodes = realmCodeParam.split(',');
      const region  = req.query.region || '';
      const rows    = parseInt(req.query.rows)   || 10;
      const pageNo  = parseInt(req.query.pageNo) || 1;

      const { items, totalCount, hasMore } = await fetchCultureInfoRealm(apiKey, realmCodes, region, rows, pageNo);
      res.setHeader('Cache-Control','s-maxage=3600');
      return res.status(200).json({ ok:true, type:'perf2', totalCount, hasMore, pageNo, items });
    }

    // ════════════════════════════════
    // [E-2] 문화정보 상세정보 (한눈에보는문화정보조회서비스 /detail2, 3·4·6번 공용)
    //     (한글 설명) 목록엔 없는 가격·설명·전화번호·홈페이지를 "자세히보기" 눌렀을
    //     때만 지연호출로 가져와요(오늘 확인한 Swagger 명세로 정확히 검증됨).
    // ════════════════════════════════
    if (type === 'cultureInfoDetail') {
      const apiKey = process.env.TOURAPI_KEY;
      if (!apiKey) return res.status(500).json({ ok:false, message:'TOURAPI_KEY 없음' });
      const seq = req.query.seq || '';
      if (!seq) return res.status(200).json({ ok:true, overview:'', phone:'', homepage:'', price:'', imgUrl:'' });
      const keyEnc = encodeURIComponent(apiKey);
      const url = `https://apis.data.go.kr/B553457/cultureinfo/detail2?serviceKey=${keyEnc}&seq=${encodeURIComponent(seq)}`;
      try {
        const r = await fetch(url);
        const text = await r.text();
        const item = parseItems(text, 'item')[0] || '';
        // (한글 설명) 이달의 문화행사 때처럼, url/placeUrl이 https:// 없이
        //             오는 경우가 있을 수 있어서 미리 보정해요.
        function fixUrl(u){
          u = (u||'').trim();
          if (u && !/^https?:\/\//i.test(u)) u = 'https://' + u;
          return u;
        }
        res.setHeader('Cache-Control','s-maxage=86400');
        const phoneRaw = getVal(item,'phone');
        // (한글 설명) phone 필드가 "국립기상박물관 070-7850-8493"처럼 "기관이름 + 전화번호"
        //             형태로 오는 경우가 많아서(실제 데이터로 확인함), place가 비어있을 때
        //             전화번호 앞의 기관이름을 대신 뽑아 써요 — "서울" 같은 넓은 범위보다
        //             훨씬 정확한 장소로 지도 검색이 가능해져요.
        const orgNameMatch = phoneRaw.match(/^([^\d]+?)\s*0\d{1,2}[-.]?\d{3,4}/);
        const orgName = orgNameMatch ? orgNameMatch[1].trim() : '';

        const placeAddr = getVal(item,'placeAddr');
        const place = getVal(item,'place');
        const area  = getVal(item,'area');
        // (한글 설명) placeAddr(정확한 주소) → place(장소명 단독) → 기관이름(단독) →
        //             area(지역명만) 순서로 시도해요. "경기도어린이박물관 경기"처럼
        //             이미 구체적인 이름 뒤에 지역명을 붙이면 오히려 카카오맵 검색이
        //             안 되는 걸 실제로 확인해서, 이름이 있으면 지역명은 안 붙여요.
        const mapKeyword = placeAddr || place || orgName || area;

        // (한글 설명) 1단계: 상세정보(/detail2) 자체에 좌표가 있는지 먼저 확인해요
        //             (목록(realm2)엔 없어도 상세정보엔 있는 경우가 있어서요).
        let lat = getVal(item,'gpsY');
        let lon = getVal(item,'gpsX');

        // (한글 설명) "영종역사관 티켓 발권"처럼, 가격 정보 안에 진짜 장소이름이
        //             숨어있는 경우를 실제로 발견했어요(place 필드는 "아트허브 온라인
        //             갤러리"처럼 온라인 접수처 이름이라 지도에 없는 경우가 있었음).
        const priceRaw = getVal(item,'price');
        const priceVenueMatch = priceRaw.match(/^([^\d]+?)\s*(?:티켓|입장|발권|요금|관람료|입장료)/);
        const priceVenue = priceVenueMatch ? priceVenueMatch[1].trim() : '';

        // (한글 설명) 2단계: 그래도 좌표가 없으면, 오늘 여러 번 성공했던 방법대로
        //             TourAPI에서 다시 검색해서 좌표를 우회로 찾아봐요. place 필드가
        //             실제 장소가 아닐 수 있어서, 가격정보 속 장소이름·기관이름까지
        //             여러 후보를 순서대로 시도해요. 엉뚱한 곳이 안 걸리도록, 검색
        //             결과 제목에 후보 단어가 실제로 포함될 때만 채택해요.
        let coordSource = (parseFloat(lat) > 0 && parseFloat(lon) > 0) ? 'detail2' : '';
        const candidates = [place, priceVenue, orgName].filter(function(v, i, arr){
          return v && arr.indexOf(v) === i; // 중복 제거
        });
        for (const cand of candidates) {
          if (coordSource) break;
          try {
            const tourUrl = `https://apis.data.go.kr/B551011/KorService2/searchKeyword2`
              + `?serviceKey=${keyEnc}&numOfRows=3&pageNo=1&MobileOS=ETC&MobileApp=BomnalMadang`
              + `&_type=json&arrange=O&keyword=${encodeURIComponent(cand)}`;
            const tr = await fetch(tourUrl);
            const tj = await tr.json();
            const tBody = tj && tj.response && tj.response.body;
            const tItems = (tBody && tBody.items && (Array.isArray(tBody.items.item) ? tBody.items.item : (tBody.items.item ? [tBody.items.item] : []))) || [];
            const coreWord = cand.split(/[\s,·()]+/)[0];
            const tMatch = tItems.find(function(it){
              return it.mapx && it.mapy && it.title && coreWord && it.title.indexOf(coreWord) !== -1;
            });
            if (tMatch) {
              lat = tMatch.mapy;
              lon = tMatch.mapx;
              coordSource = 'tourapi:' + cand;
            }
          } catch (e) { /* 이 후보가 실패해도 다음 후보로 계속 시도해요 */ }
        }

        // (한글 설명) 3단계: 기관 홈페이지도 별도로 보강해요(좌표를 이미 찾았어도
        //             실행돼요 — 국립중앙박물관처럼 좌표는 있는데 홈페이지 링크만
        //             죽어있는 경우를 발견해서요). orgName(전화번호 속 기관이름)으로
        //             TourAPI에서 검색 → 정확히 일치하는 곳을 찾으면 그 기관의 공식
        //             홈페이지(detailCommon2)를 대신 가져와요. 개별 행사 링크보다
        //             기관 대표 홈페이지가 훨씬 안정적으로 열려요.
        let orgHomepage = '';
        if (orgName) {
          try {
            const oUrl = `https://apis.data.go.kr/B551011/KorService2/searchKeyword2`
              + `?serviceKey=${keyEnc}&numOfRows=3&pageNo=1&MobileOS=ETC&MobileApp=BomnalMadang`
              + `&_type=json&arrange=O&keyword=${encodeURIComponent(orgName)}`;
            const or_ = await fetch(oUrl);
            const oj = await or_.json();
            const oBody = oj && oj.response && oj.response.body;
            const oItems = (oBody && oBody.items && (Array.isArray(oBody.items.item) ? oBody.items.item : (oBody.items.item ? [oBody.items.item] : []))) || [];
            const oCoreWord = orgName.split(/[\s,·()]+/)[0];
            const oMatch = oItems.find(function(it){ return it.title && oCoreWord && it.title.indexOf(oCoreWord) !== -1; });
            if (oMatch && oMatch.contentid) {
              const dUrl = `https://apis.data.go.kr/B551011/KorService2/detailCommon2`
                + `?serviceKey=${keyEnc}&contentId=${oMatch.contentid}&MobileOS=ETC&MobileApp=BomnalMadang&_type=json&numOfRows=1&pageNo=1`;
              const dr = await fetch(dUrl);
              const dj = await dr.json();
              const dBody = dj && dj.response && dj.response.body;
              const dItems = (dBody && dBody.items && (Array.isArray(dBody.items.item) ? dBody.items.item : (dBody.items.item ? [dBody.items.item] : []))) || [];
              const dItem = dItems[0];
              if (dItem && dItem.homepage) {
                const hpRaw = String(dItem.homepage).trim();
                const hrefM = hpRaw.match(/href="([^"]+)"/);
                orgHomepage = hrefM ? hrefM[1] : (hpRaw.indexOf('http') === 0 ? hpRaw : (hpRaw && hpRaw.indexOf('<') === -1 ? 'https://' + hpRaw : ''));
              }
            }
          } catch (e) { /* 실패해도 화면은 안 깨지게 그냥 넘어가요 */ }
        }

        res.setHeader('Cache-Control','s-maxage=86400');
        // (한글 설명) 기관 대표 홈페이지를 찾았으면 그걸 우선으로 써요 — 개별 행사
        //             링크(url)는 오래돼서 죽어있는 경우가 많았어요(실제 확인함).
        const finalHomepage = orgHomepage || fixUrl(getVal(item,'url'));
        return res.status(200).json({
          ok: true,
          overview: getVal(item,'contents1'),
          phone   : phoneRaw,
          homepage: finalHomepage,
          price   : getVal(item,'price'),
          imgUrl  : getVal(item,'imgUrl'),
          placeAddr: placeAddr,
          placeUrl : fixUrl(getVal(item,'placeUrl')),
          mapKeyword: mapKeyword,
          lat: lat, lon: lon, coordSource: coordSource,
        });
      } catch (e) {
        return res.status(200).json({ ok:true, overview:'', phone:'', homepage:'', price:'', imgUrl:'' });
      }
    }
    // ════════════════════════════════════════════════════
    // [E-3] (임시 진단용) 공연 제목으로 seq 찾아서 상세정보 원본 확인
    //     (한글 설명) "관련설명"이 왜 안 나오는지 확인하려고, 제목으로 검색해서
    //     seq를 찾고 바로 detail2 원본까지 같이 보여주는 도구예요.
    // ════════════════════════════════════════════════════
    if (type === 'perf2DetailDebug') {
      const apiKey = process.env.TOURAPI_KEY;
      if (!apiKey) return res.status(500).json({ ok:false, message:'TOURAPI_KEY 없음' });
      const keyword = req.query.keyword || '';
      const keyEnc = encodeURIComponent(apiKey);

      const listUrl = `https://apis.data.go.kr/B553457/cultureinfo/realm2`
        + `?serviceKey=${keyEnc}&PageNo=1&numOfrows=3&realmCode=A000&keyword=${encodeURIComponent(keyword)}`;
      const listText = await (await fetch(listUrl)).text();
      const firstItem = parseItems(listText,'item')[0] || '';
      const seq = getVal(firstItem,'seq');
      if (!seq) {
        return res.status(200).json({ ok:true, message:'검색결과 없음', listRaw: listText.slice(0,1000) });
      }
      const detailUrl = `https://apis.data.go.kr/B553457/cultureinfo/detail2?serviceKey=${keyEnc}&seq=${seq}`;
      const detailText = await (await fetch(detailUrl)).text();
      return res.status(200).json({ ok:true, seq, detailRaw: detailText });
    }

    // ════════════════════════════════
    // ════════════════════════════════
    // [F] 전시정보 통합 (api.kcisa.kr — API_CCA_145)
    // ════════════════════════════════
    // ════════════════════════════════
    // [F] 전시정보 통합 (한국문화정보원 한눈에보는문화정보조회서비스, realmCode=D000)
    //     (한글 설명) 3번(공연정보)과 완전히 같은 API·같은 방식이에요. D000(전시)
    //     하나만 쓰면 되니까 여러 개 합칠 필요 없이 간단해요.
    // ════════════════════════════════
    if (type === 'exhi') {
      const apiKey = process.env.TOURAPI_KEY;
      if (!apiKey) return res.status(500).json({ ok:false, message:'TOURAPI_KEY 없음' });
      const region = req.query.region || '';
      const rows   = parseInt(req.query.rows)   || 10;
      const pageNo = parseInt(req.query.pageNo) || 1;

      const { items, totalCount, hasMore } = await fetchCultureInfoRealm(apiKey, ['D000'], region, rows, pageNo);
      res.setHeader('Cache-Control','s-maxage=3600');
      return res.status(200).json({ ok:true, type:'exhi', totalCount, hasMore, pageNo, items });
    }

    // ════════════════════════════════
    // [G] 국립지방박물관 문화행사 통합 (api.kcisa.kr — API_CNV_043)
    // ════════════════════════════════
    // ════════════════════════════════
    // [E-museum] 박물관문화행사 (한국문화정보원 한눈에보는문화정보조회서비스, keyword=박물관)
    //     (한글 설명) 이 API엔 "박물관행사" 전용 분류코드가 없어서, keyword=박물관으로
    //     검색해요(실제 테스트로 30건, 사진·좌표 다 갖춘 좋은 결과 확인함).
    // ════════════════════════════════
    if (type === 'museum') {
      const apiKey = process.env.TOURAPI_KEY;
      if (!apiKey) return res.status(500).json({ ok:false, message:'TOURAPI_KEY 없음' });
      const region = req.query.region || '';
      const rows   = parseInt(req.query.rows)   || 10;
      const pageNo = parseInt(req.query.pageNo) || 1;

      const { items, totalCount, hasMore } = await fetchCultureInfoRealm(apiKey, [], region, rows, pageNo, '박물관');
      res.setHeader('Cache-Control','s-maxage=3600');
      return res.status(200).json({ ok:true, type:'museum', totalCount, hasMore, pageNo, items });
    }

    // ════════════════════════════════
    // [H] 소속 및 산하기관 교육정보 (api.kcisa.kr — conver3)
    // ════════════════════════════════
    // ════════════════════════════════
    // [G] 문화기관 교육정보 (한국문화정보원 한눈에보는문화정보조회서비스, realmCode=G000)
    //     (한글 설명) 3·4번과 완전히 같은 API·같은 방식이에요. G000(교육/체험)
    //     하나만 쓰면 되니까 4번(전시)이랑 구조가 똑같아요.
    // ════════════════════════════════
    if (type === 'edu') {
      const apiKey = process.env.TOURAPI_KEY;
      if (!apiKey) return res.status(500).json({ ok:false, message:'TOURAPI_KEY 없음' });
      const region = req.query.region || '';
      const rows   = parseInt(req.query.rows)   || 10;
      const pageNo = parseInt(req.query.pageNo) || 1;

      const { items, totalCount, hasMore } = await fetchCultureInfoRealm(apiKey, ['G000'], region, rows, pageNo);
      res.setHeader('Cache-Control','s-maxage=3600');
      return res.status(200).json({ ok:true, type:'edu', totalCount, hasMore, pageNo, items });
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
    // [K] 문화시설 안내 - 박물관·미술관 / 문화원 / 도서관 / 유적지 (한국관광공사 TourAPI)
    //     (한글 설명) [J]번 축제 사진 기능과 같은 TOURAPI_KEY를 재사용해요(새 키 필요없음).
    //     신분류체계(lclsSystm) 코드로 필터링:
    //       museum  = VE07 (박물관·미술관)
    //       center  = VE09 + VE090100 (문화원만, 도서관 제외)
    //       library = VE09 + VE090300 (도서관만)
    //       heritage= HS01 (역사유적지: 고궁·성곽·고택·사적지·고분·사당 등, 신분류체계정의서 엑셀로 확인)
    //     areaBasedList2 엔드포인트, 공식 활용매뉴얼(v4.4) 표8로 파라미터 확인 완료.
    // ════════════════════════════════════════════════════
    if (type === 'facilityTour') {
      const apiKey = process.env.TOURAPI_KEY;
      if (!apiKey) return res.status(500).json({ ok:false, message:'TOURAPI_KEY 없음' });

      // category별로 대/중/소분류가 다 달라서 표로 관리해요.
      const CATEGORY_MAP = {
        museum : { l1:'VE', l2:'VE07', l3:''       },
        center : { l1:'VE', l2:'VE09', l3:'VE090100' },
        library: { l1:'VE', l2:'VE09', l3:'VE090300' },
        heritage:{ l1:'HS', l2:'HS01', l3:''       },
      };
      const category = req.query.category || '';
      const cat = CATEGORY_MAP[category];
      if (!cat) {
        return res.status(400).json({ ok:false, message:'category 파라미터가 올바르지 않아요 (museum/center/library/heritage)' });
      }

      const region = req.query.region || '';
      const rows   = parseInt(req.query.rows)   || 10;
      const pageNo = parseInt(req.query.pageNo) || 1;
      const debug  = req.query.debug === '1';
      const keyEnc = encodeURIComponent(apiKey);

      // (한글 설명) festivalTour와 완전히 같은 법정동코드 표예요(health.js SIDO_CODES와 동일 체계).
      //             2026.7.1부로 광주광역시+전라남도가 "전남광주통합특별시"로 합쳐졌어요.
      //             실제 TourAPI 응답에서 새 코드(12)로 오는 걸 확인해서 반영했어요.
      const SIDO_CODES = {
        '서울특별시': '11', '부산광역시': '26', '대구광역시': '27', '인천광역시': '28',
        '전남광주통합특별시': '12',
        '대전광역시': '30', '울산광역시': '31', '세종특별자치시': '36110',
        '경기도': '41', '강원특별자치도': '51', '충청북도': '43', '충청남도': '44',
        '전북특별자치도': '52', '경상북도': '47', '경상남도': '48',
        '제주특별자치도': '50',
      };
      const lDongRegnCd = region ? (SIDO_CODES[region] || '') : '';

      let url = `https://apis.data.go.kr/B551011/KorService2/areaBasedList2`
        + `?serviceKey=${keyEnc}&numOfRows=${rows}&pageNo=${pageNo}&MobileOS=ETC&MobileApp=BomnalMadang`
        + `&_type=json&arrange=O`
        + `&lclsSystm1=${cat.l1}&lclsSystm2=${cat.l2}`;
      if (cat.l3)      url += `&lclsSystm3=${cat.l3}`;
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
      return res.status(200).json({ ok:true, type:'facilityTour', totalCount: (body ? body.totalCount : items.length), pageNo, items });
    }

    // ════════════════════════════════════════════════════
    // [K-2] (임시 진단용) 궁궐·유적 사진 찾기 — 이름으로 검색해서 contentid·사진·좌표 확인
    //     (한글 설명) 궁궐·유적 8곳의 정확한 사진을 하나씩 확인하기 위한 일회성 도구예요.
    //     화면에는 안 쓰고, 저(Claude)와 경아오빠가 확인용으로만 쓰는 용도예요.
    //     &keywords=경복궁,창덕궁,덕수궁 처럼 쉼표로 여러 개를 한 번에 검색할 수 있어요.
    // ════════════════════════════════════════════════════
    if (type === 'keywordDebug') {
      const apiKey = process.env.TOURAPI_KEY;
      if (!apiKey) return res.status(500).json({ ok:false, message:'TOURAPI_KEY 없음' });
      const keywordsParam = req.query.keywords || '';
      if (!keywordsParam) return res.status(400).json({ ok:false, message:'keywords 파라미터가 필요해요 (쉼표로 구분)' });
      const keywords = keywordsParam.split(',').map(function(s){ return s.trim(); }).filter(Boolean);
      const keyEnc = encodeURIComponent(apiKey);

      const results = {};
      const arrange = req.query.arrange || 'O';
      const kwRows  = parseInt(req.query.rows) || 5;
      for (const kw of keywords) {
        const url = `https://apis.data.go.kr/B551011/KorService2/searchKeyword2`
          + `?serviceKey=${keyEnc}&numOfRows=${kwRows}&pageNo=1&MobileOS=ETC&MobileApp=BomnalMadang`
          + `&_type=json&arrange=${arrange}&keyword=${encodeURIComponent(kw)}`;
        try {
          const r = await fetch(url);
          const text = await r.text();
          const j = JSON.parse(text);
          const b = j && j.response && j.response.body;
          const raw = (b && b.items && (Array.isArray(b.items.item) ? b.items.item : (b.items.item ? [b.items.item] : []))) || [];
          results[kw] = raw.map(function(it){
            return {
              contentid: it.contentid, title: it.title, addr1: it.addr1,
              firstimage: it.firstimage, mapx: it.mapx, mapy: it.mapy,
              contenttypeid: it.contenttypeid, lDongRegnCd: it.lDongRegnCd,
            };
          });
        } catch (e) {
          results[kw] = { error: e.message };
        }
      }
      return res.status(200).json({ ok:true, type:'keywordDebug', results });
    }

    // ════════════════════════════════════════════════════
    // [N] (임시 진단용) 한국문화정보원 "한눈에보는문화정보조회서비스" 확인 도구
    //     (한글 설명) 3·4·5·6번 아이콘(공연/전시/박물관행사/교육정보) 재작업 전에,
    //     Swagger 문서로 확인한 realmCode·sido 파라미터가 실제로 잘 작동하는지
    //     확인하는 일회성 도구예요. 화면에는 안 쓰고 확인용으로만 써요.
    //     예: &endpoint=realm2&realmCode=G000&sido=서울특별시
    // ════════════════════════════════════════════════════
    if (type === 'cultureInfoDebug') {
      const apiKey = process.env.TOURAPI_KEY; // 경아오빠 확인: TourAPI와 같은 공통 인증키
      if (!apiKey) return res.status(500).json({ ok:false, message:'TOURAPI_KEY 없음' });

      const endpoint = req.query.endpoint || 'realm2'; // period2 | area2 | detail2 | realm2
      const keyEnc = encodeURIComponent(apiKey);

      let url = `https://apis.data.go.kr/B553457/cultureinfo/${endpoint}`
        + `?serviceKey=${keyEnc}&PageNo=1&numOfrows=5`;
      // (한글 설명) _type=json이 이 API에서도 되는지 확실치 않아서 일단 빼고
      //             기본 응답(아마 XML)을 그대로 받아봐요.

      // (한글 설명) 문서에 나온 파라미터들을 있으면 그대로 붙여서 테스트해봐요.
      const passthroughParams = ['realmCode','serviceTp','sido','sigungu','from','to','place','keyword','sortStdr','seq','gpsxfrom','gpsyfrom','gpsxto','gpsyto'];
      passthroughParams.forEach(function(p){
        if (req.query[p]) url += `&${p}=${encodeURIComponent(req.query[p])}`;
      });

      try {
        const r = await fetch(url);
        const text = await r.text();
        return res.status(200).json({
          ok: true, debug: true,
          requestUrl: url.replace(keyEnc, '(서비스키-숨김)'),
          httpStatus: r.status,
          httpStatusText: r.statusText,
          contentType: r.headers.get('content-type'),
          responseLength: text.length,
          rawResponseSample: text.slice(0, 3000),
        });
      } catch (e) {
        return res.status(200).json({ ok:false, message: e.message });
      }
    }

    // ════════════════════════════════════════════════════
    // [M-1] 이달의 문화행사용 "링크 미리보기 사진" (og:image 방식)
    //     (한글 설명) 카카오톡에 링크를 붙여넣으면 자동으로 대표사진이 뜨는 것과
    //     같은 원리예요. 행사의 홈페이지 링크(linkUrl) 페이지 안에 있는
    //     og:image 메타태그를 읽어서, 그 행사를 실제로 홍보한 진짜 사진을 가져와요.
    //     장소 참고사진(TourAPI)보다 더 정확해서 1순위로 먼저 시도해요.
    //     ⚠️ 페이지 전체를 다 안 받고 앞부분(약 100KB)만 읽어요 — og:image는
    //     보통 <head> 안, 즉 페이지 맨 앞쪽에 있어서 이걸로 충분하고, 서버 응답도
    //     훨씬 빨라져요.
    // ════════════════════════════════════════════════════
    if (type === 'linkPreview') {
      const targetUrl = req.query.url || '';
      if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
        return res.status(200).json({ ok:true, imgUrl:'' });
      }
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(function(){ controller.abort(); }, 5000);
        const r = await fetch(targetUrl, {
          signal: controller.signal,
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BomnalMadangBot/1.0; +https://bomnal-madang.vercel.app)' },
        });
        clearTimeout(timeoutId);

        let html = '';
        if (r.body && r.body.getReader) {
          const reader = r.body.getReader();
          let received = 0;
          const maxBytes = 100000; // 약 100KB
          while (received < maxBytes) {
            const chunk = await reader.read();
            if (chunk.done) break;
            html += Buffer.from(chunk.value).toString('utf-8');
            received += chunk.value.length;
          }
          try { reader.cancel(); } catch(e){}
        } else {
          html = (await r.text()).slice(0, 100000);
        }

        // (한글 설명) 속성 순서가 사이트마다 달라서(og:image가 먼저/content가 먼저)
        //             두 가지 순서 다 시도해요.
        let m = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
        if (!m) m = html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
        const imgUrl = m ? m[1] : '';

        res.setHeader('Cache-Control','s-maxage=604800'); // 1주일 캐시
        return res.status(200).json({ ok:true, imgUrl });
      } catch (e) {
        // (한글 설명) 상대방 사이트가 느리거나, 접속을 막거나, og:image가 없어도
        //             에러로 화면이 깨지지 않고 그냥 "사진 없음"으로 처리돼요.
        return res.status(200).json({ ok:true, imgUrl:'' });
      }
    }

    // ════════════════════════════════════════════════════
    // [M-2] 이달의 문화행사용 "장소 참고사진" (한국관광공사 TourAPI 재사용)
    //     (한글 설명) 이달의 문화행사 API는 사진이 거의 없어서, 행사 장소명으로
    //     TourAPI에 검색해 "그 장소가 어떤 곳인지 보여주는 참고사진"을 대신 가져와요.
    //     행사 자체 사진이 아니므로, 화면에는 반드시 "장소 참고사진"이라고
    //     표시해서 착각하지 않게 해야 해요.
    //     ⚠️ 엉뚱한 사진을 잘못 보여주지 않도록, 검색어의 핵심 단어(첫 단어)가
    //     실제로 결과 제목에 포함될 때만 채택해요(실제 테스트로 "고가"처럼 흔한
    //     단어는 엉뚱한 결과가 나오는 걸 확인해서, 안전장치를 넣었어요).
    // ════════════════════════════════════════════════════
    if (type === 'placePhoto') {
      const apiKey = process.env.TOURAPI_KEY;
      if (!apiKey) return res.status(200).json({ ok:true, imgUrl:'' }); // 키 없어도 화면이 안 깨지게

      const keyword = (req.query.keyword || '').trim();
      if (!keyword) return res.status(200).json({ ok:true, imgUrl:'' });

      const keyEnc = encodeURIComponent(apiKey);
      const url = `https://apis.data.go.kr/B551011/KorService2/searchKeyword2`
        + `?serviceKey=${keyEnc}&numOfRows=3&pageNo=1&MobileOS=ETC&MobileApp=BomnalMadang`
        + `&_type=json&arrange=O&keyword=${encodeURIComponent(keyword)}`;

      try {
        const r = await fetch(url);
        const text = await r.text();
        const j = JSON.parse(text);
        const body = j && j.response && j.response.body;
        const rawItems = (body && body.items && (Array.isArray(body.items.item) ? body.items.item : (body.items.item ? [body.items.item] : []))) || [];

        // (한글 설명) 콤마나 공백으로 나눈 첫 단어를 핵심 단어로 봐요.
        //             (예: "손대식,손병순 고가" → "손대식")
        const coreWord = keyword.split(/[\s,·]+/)[0];
        const match = rawItems.find(function(it){
          return it.firstimage && it.title && coreWord && it.title.indexOf(coreWord) !== -1;
        });

        res.setHeader('Cache-Control','s-maxage=604800'); // 장소 사진은 자주 안 바뀌니 1주일 캐시
        return res.status(200).json({
          ok: true,
          imgUrl: match ? match.firstimage : '',
          matchedTitle: match ? match.title : '',
        });
      } catch (e) {
        return res.status(200).json({ ok:true, imgUrl:'' });
      }
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

    return res.status(400).json({ ok:false, message:'올바른 type: event/list/image/performance/perf2/exhi/museum/edu/festival/festivalTour/facilityTour/facilityDetail/keywordDebug/placePhoto/linkPreview/cultureInfoDebug/heritageDetail/heritageCodeDiscovery/cultureInfoDetail/perf2DetailDebug' });

  } catch (err) {
    return res.status(500).json({ ok:false, message:'서버 오류: '+err.message });
  }
}
