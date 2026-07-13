// api/benefit.js — 복지혜택 카테고리 API 프록시
// Vercel 서버리스 함수 (API 키를 클라이언트에 노출하지 않기 위한 중간 서버)

// XML 문자열에서 태그 값을 추출하는 헬퍼 함수
function parseXmlItems(xml, itemTag) {
  const items = [];
  const regex = new RegExp(`<${itemTag}[^>]*>([\\s\\S]*?)<\\/${itemTag}>`, 'g');
  let match;
  while ((match = regex.exec(xml)) !== null) {
    const block = match[1];
    const obj = {};
    const fieldRegex = /<([^\/>\s]+)[^>]*>([\s\S]*?)<\/\1>/g;
    let f;
    while ((f = fieldRegex.exec(block)) !== null) {
      obj[f[1]] = f[2].trim();
    }
    items.push(obj);
  }
  return items;
}

// (한글 설명) 전국 17개 시도 코드는 정부에서 정한 고정 번호라서 안전하게 표로 만들어둬요.
// health.js에서 이미 검증된 표를 그대로 가져왔어요.
// (한글 설명) [수정] 강원도는 2023.6 "강원특별자치도"로, 전라북도는 2024.1 "전북특별자치도"로
//             개편되면서 행정안전부 법정동코드도 각각 42→51, 45→52로 바뀌었어요(health.js에서
//             이미 확인·수정된 내용을 그대로 반영). 옛날 번호를 쓰고 있어서 이 두 지역만
//             시·군·구 목록이 항상 빈 목록으로 나오던 버그였어요.
const SIDO_CODES = {
  '서울특별시': '11', '부산광역시': '26', '대구광역시': '27', '인천광역시': '28',
  '광주광역시': '29', '대전광역시': '30', '울산광역시': '31', '세종특별자치시': '36',
  '경기도': '41', '강원특별자치도': '51', '충청북도': '43', '충청남도': '44',
  '전북특별자치도': '52', '전라남도': '46', '경상북도': '47', '경상남도': '48',
  '제주특별자치도': '50'
};

// (한글 설명) [신규] 옛날 이름(강원도/전라북도)으로 요청이 들어와도 최신 이름으로 바꿔서
//             처리해요. 캐시된 화면이나 PWA가 아직 옛날 드롭다운 값을 들고 있을 수 있어서 안전장치로 둬요.
const SIDO_ALIAS = { '강원도': '강원특별자치도', '전라북도': '전북특별자치도' };
function normalizeSido(s) {
  if (!s) return s;
  return SIDO_ALIAS[s] || s;
}

// (한글 설명) 시/군/구는 250개 가까이 되서 표로 다 외우지 않고, 그때그때 정부서버에
//             "이 시/도 안에 있는 시/군/구 목록 좀 줘"라고 물어봐서 정확한 코드를 찾아요.
//             (health.js와 동일한 검증된 로직)
async function resolveRegionCode(sido, sigungu, rawServiceKey) {
  const sidoFull = normalizeSido(sido);
  if (!sidoFull || !SIDO_CODES[sidoFull]) return null;
  const ctprvnCd = SIDO_CODES[sidoFull];
  if (!sigungu) return { divId: 'ctprvnCd', key: ctprvnCd };

  const key = encodeURIComponent(rawServiceKey);
  const url = `https://apis.data.go.kr/B553077/api/open/sdsc2/baroApi`
    + `?resId=dong&catId=cty&ctprvnCd=${ctprvnCd}&type=json&ServiceKey=${key}`;
  try {
    const r = await fetch(url);
    const data = await r.json();
    const items = (data.body && data.body.items) || [];
    const norm = (s) => (s || '').replace(/\s/g, '');
    const match = items.find((it) => norm(it.signguNm) === norm(sigungu));
    if (match) return { divId: 'signguCd', key: match.signguCd };
  } catch (e) {
    // 실패하면 시/도 단위로라도 검색되도록 아래에서 처리
  }
  return { divId: 'ctprvnCd', key: ctprvnCd };
}

// (한글 설명) "내 위치로 찾기" GPS 버튼용: 좌표를 카카오 API에 보내서
//             "여기가 어느 시/도, 어느 시/군/구인지" 이름을 알아내요.
//             (수정) region_3depth_name = "동" 이름도 같이 받아오도록 추가했어요.
//             예전에는 이 값이 있었는데도 그냥 버리고 있었어요. (health.js와 동일한 검증된 로직)
async function reverseGeocodeSidoSigungu(lat, lng, kakaoKey) {
  if (!kakaoKey) return null;
  const url = `https://dapi.kakao.com/v2/local/geo/coord2regioncode.json?x=${lng}&y=${lat}`;
  try {
    const r = await fetch(url, { headers: { Authorization: `KakaoAK ${kakaoKey}` } });
    const data = await r.json();
    const docs = data.documents || [];
    const doc = docs.find((d) => d.region_type === 'H') || docs[0];
    if (!doc) return null;
    return { sido: doc.region_1depth_name, sigungu: doc.region_2depth_name, dong: doc.region_3depth_name };
  } catch (e) {
    return null;
  }
}

// (한글 설명) [신규 추가] 시/군/구 코드 안에 있는 "동" 이름을 진짜 "동 코드(adongCd)"로 바꿔주는 함수예요.
//             정부의 공식 "행정동 조회" API(baroApi, catId=admi)를 그대로 사용해요.
//             (health.js와 동일한 검증된 로직)
async function resolveAdongCode(signguCd, dongName, rawServiceKey) {
  if (!signguCd || !dongName) return null;
  const key = encodeURIComponent(rawServiceKey);
  const url = `https://apis.data.go.kr/B553077/api/open/sdsc2/baroApi`
    + `?resId=dong&catId=admi&signguCd=${signguCd}&type=json&ServiceKey=${key}`;
  try {
    const r = await fetch(url);
    const data = await r.json();
    const items = (data.body && data.body.items) || [];
    const norm = (s) => (s || '').replace(/\s/g, '');
    const match = items.find((it) => norm(it.adongNm) === norm(dongName));
    if (match) return match.adongCd;
  } catch (e) {
    // 실패하면 그냥 null을 돌려줘서, 시/군/구 단위로라도 검색되게 해요
  }
  return null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  // (한글 설명) 로딩시간 최적화: 완전히 같은 검색(같은 주소창 URL)이 10분 안에 또 들어오면,
  //             정부 API를 다시 호출하지 않고 Vercel이 저장해둔 응답을 바로 돌려줘요.
  //             health.js에서 이미 검증된 방식을 그대로 가져왔어요.
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1200');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { type } = req.query;

  try {

    // ── 1. 사회복지시설 현황 (복지시설찾기) ─────────────────────────
    // (한글 설명) [전면 수정] 예전엔 완전히 다른 기능(통신요금감면대상조회)을 쓰고 있어서
    //             지역을 아무리 골라도 항상 같은 결과만 나왔어요. 진짜 정답인
    //             "시설 목록정보 조회" + "시설별 기본정보 조회" 2단계로 교체했어요.
    //   1단계: 시/군/구로 시설 목록(이름·종류)을 받아오고
    //   2단계: 화면에 보여줄 만큼만(최대 10개) 주소·전화번호를 동시에(병렬로) 받아오고
    //   3단계: 받아온 주소를 카카오로 좌표로 바꿔서 지도/길찾기 버튼용 좌표까지 만들어요
    //   (이 API는 "동" 단위 필터는 지원하지 않아요 - 시/군/구까지만 가능해요)
    if (type === 'welfare') {
      const { sido, sigungu, facilityType, lat, lng } = req.query;
      const pageNo = parseInt(req.query.pageNo || '1', 10) || 1;

      let regionSido = sido;
      let regionSigungu = sigungu;

      if (lat && lng) {
        const geo = await reverseGeocodeSidoSigungu(lat, lng, process.env.KAKAO_API_KEY);
        if (geo) {
          regionSido = geo.sido;
          regionSigungu = geo.sigungu;
        }
      }

      // (한글 설명) [버그 수정] 시/도만 고르고 시/군/구를 안 골랐을 때, 예전엔 지역 필터를 아예
      //             안 걸고 전국에서 무작위로 50개만 받아온 다음 이름으로 걸러냈어요. 그 50개 안에
      //             하필 그 시/도 시설이 거의 없으면 결과가 0~2개만 나오는 버그였어요(전 지역에서
      //             재현 가능). resolveRegionCode가 시/군/구를 못 찾아도 시/도 코드(ctprvnCd)는
      //             돌려주므로, 그 코드로 "시/도 전체"를 정확히 필터링해서 요청하도록 고쳤어요.
      let jrsdSggCd = '';
      if (regionSido) {
        const region = await resolveRegionCode(regionSido, regionSigungu, process.env.STORE_API_KEY);
        if (region && region.divId === 'signguCd') {
          jrsdSggCd = region.key + '00000';       // 시/군/구 단위 (5자리 + 00000)
        } else if (region && region.divId === 'ctprvnCd') {
          jrsdSggCd = region.key + '00000000';    // 시/도 전체 단위 (2자리 + 00000000)
        }
      }
      // (한글 설명) [수정] "더보기" 지원을 위해, 지역 코드를 확보했을 때는 화면에 보여줄 만큼(10개)만
      //             딱 맞춰 요청해서 페이지 번호가 그대로 맞아떨어지게 했어요. 코드를 전혀 못 구했을
      //             때만(예: 지원하지 않는 지역명) 예외적으로 넉넉히(50개) 받아서 이름으로 걸러내요.
      const fetchCount = jrsdSggCd ? 10 : 50;

      const listKey = encodeURIComponent(process.env.WELFARE_API_KEY);
      const listUrl = `https://apis.data.go.kr/B554287/sclWlfrFcltInfoInqirService1/getFcltListInfoInqire`
        + `?serviceKey=${listKey}`
        + `&numOfRows=${fetchCount}&pageNo=${pageNo}`
        + (jrsdSggCd    ? `&jrsdSggCd=${encodeURIComponent(jrsdSggCd)}`   : '')
        + (facilityType ? `&fcltKindNm=${encodeURIComponent(facilityType)}` : '');

      const listRes = await fetch(listUrl);
      const listXml = await listRes.text();

      // (한글 설명) 진단모드: &debug=1 을 붙이면 1단계(목록조회) 원본 응답을 그대로 보여줘요.
      if (req.query.debug === '1') {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.status(200).send(listXml);
      }

      let allItems = parseXmlItems(listXml, 'item');
      const rawCount = allItems.length;

      // (한글 설명) [수정] 이제 시/도 코드까지 확보되면 서버가 이미 정확히 걸러줘서 이 필터는
      //             필요 없어요. 코드를 아예 못 구했을 때만(예외 상황) 안전장치로 이름으로 걸러요.
      //             옛 지역명(강원도/전라북도)이 섞여 들어와도 놓치지 않도록 normalizeSido로 맞춰요.
      if (regionSido && !jrsdSggCd) {
        const norm = (s) => (s || '').replace(/\s/g, '');
        const sidoNorm = norm(normalizeSido(regionSido));
        allItems = allItems.filter((it) => norm(it.jrsdSggNm || '').startsWith(sidoNorm));
      }

      // (한글 설명) [신규] "더보기" 판단: 이번에 정부서버가 준 원본 개수가 요청한 개수와 같으면
      //             다음 페이지에도 더 있을 가능성이 있다고 봐요(다른 카테고리와 동일한 방식).
      const hasMore = rawCount === fetchCount;

      // (한글 설명) 시/군/구를 알 때는 이미 정확히 10개만 받아오니 그대로 쓰고,
      //             시/도만 알 때는 걸러낸 것 중 앞 10개만 화면에 보여줘요.
      const topItems = jrsdSggCd ? allItems : allItems.slice(0, 10);
      const detailKey = encodeURIComponent(process.env.WELFARE_API_KEY);

      // (한글 설명) [수정] 로딩시간 최적화: 예전엔 검색할 때마다 시설 10개 전부 미리
      //             카카오로 좌표 변환까지 끝내고 나서야 결과를 보여줬어요. 이게 제일 느린
      //             부분이었는데, 사용자가 "지도로 보기"를 누를지 안 누를지도 모르는 채로
      //             매번 10번씩 미리 해두던 거였어요. 이제 좌표 변환은 빼고 주소·전화번호만
      //             바로 돌려주고, 좌표는 사용자가 지도 버튼을 실제로 눌렀을 때(geocode
      //             타입) 그 시설 하나만 그때 변환해요.
      const enriched = await Promise.all(topItems.map(async (it) => {
        let detail = {};
        try {
          const detailUrl = `https://apis.data.go.kr/B554287/sclWlfrFcltInfoInqirService1/getFcltByBassInfoInqire`
            + `?serviceKey=${detailKey}&numOfRows=1&pageNo=1`
            + `&fcltCd=${encodeURIComponent(it.fcltCd || '')}`
            + (it.jrsdSggCd ? `&jrsdSggCd=${encodeURIComponent(it.jrsdSggCd)}`   : '')
            + (it.fcltKindCd ? `&fcltKindCd=${encodeURIComponent(it.fcltKindCd)}` : '');
          const detailRes = await fetch(detailUrl);
          const detailXml = await detailRes.text();
          const detailItems = parseXmlItems(detailXml, 'item');
          const candidate = detailItems[0] || {};
          // (한글 설명) [안전장치] 혹시 정부 서버가 엉뚱한 시설 정보를 줬을 경우를 대비해서,
          //             시설코드가 우리가 요청한 것과 일치할 때만 사용해요. 다르면 목록 정보만 써요.
          if (!candidate.fcltCd || candidate.fcltCd === it.fcltCd) {
            detail = candidate;
          }
        } catch (e) {
          // 상세정보 조회가 실패해도 목록 정보(이름·종류)라도 보여줘요
        }

        const fullAddr = ((detail.fcltAddr || '') + ' ' + (detail.fcltDtl_1Addr || '')).trim();
        return Object.assign({}, it, detail, { fullAddr });
      }));

      return res.status(200).json({ items: enriched, hasMore, pageNo });
    }

    // ── 1-2. 주소 → 좌표 변환 (신규, 지도 버튼을 눌렀을 때만 호출) ─────
    // (한글 설명) 복지시설찾기의 "지도로 보기"/"길찾기" 버튼을 누른 그 순간에만 호출해서,
    //             그 시설 하나만 좌표로 바꿔요. 검색할 때 10개를 전부 미리 바꾸지 않아서
    //             검색 자체가 훨씬 빨라져요.
    if (type === 'geocode') {
      const addr = req.query.addr || '';
      const kakaoKey = process.env.KAKAO_API_KEY;
      if (!addr || !kakaoKey) {
        return res.status(200).json({ lat: null, lon: null });
      }
      try {
        const geoUrl = `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(addr)}`;
        const geoRes = await fetch(geoUrl, { headers: { Authorization: `KakaoAK ${kakaoKey}` } });
        const geoData = await geoRes.json();
        const doc = geoData.documents && geoData.documents[0];
        if (doc) {
          return res.status(200).json({ lat: doc.y, lon: doc.x }); // 카카오는 x=경도, y=위도예요
        }
      } catch (e) {
        // 실패하면 아래에서 null로 응답
      }
      return res.status(200).json({ lat: null, lon: null });
    }

    // ── 1-1. 시설종류 목록 조회 (신규) ───────────────────────────────
    // (한글 설명) 시설종류 이름을 추측해서 드롭다운에 넣으면 정부 데이터의 정확한 명칭과
    //             안 맞을 수 있어서, 정부가 실제로 쓰는 "정확한 시설종류 이름"을 직접 가져와요.
    //             이걸로 화면의 시설종류 드롭다운을 채우면, 검색이 항상 정확히 맞아요.
    if (type === 'welfareKinds') {
      const key = encodeURIComponent(process.env.WELFARE_API_KEY);
      const url = `https://apis.data.go.kr/B554287/sclWlfrFcltInfoInqirService1/getFcltKindCodeInfoInqire`
        + `?serviceKey=${key}&numOfRows=100&pageNo=1`;

      const r = await fetch(url);
      const xml = await r.text();

      if (req.query.debug === '1') {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.status(200).send(xml);
      }

      const rawItems = parseXmlItems(xml, 'item');
      // (한글 설명) 같은 이름이 여러 번 나올 수 있어서(세부종류가 여러 개인 경우) 이름 기준으로 중복 제거
      const seen = new Set();
      const items = [];
      rawItems.forEach((it) => {
        if (it.fcltKindNm && !seen.has(it.fcltKindNm)) {
          seen.add(it.fcltKindNm);
          items.push({ fcltKindNm: it.fcltKindNm });
        }
      });
      return res.status(200).json({ items });
    }

    // ── 2. 중앙부처복지서비스 (복지혜택검색) ────────────────────────
    if (type === 'benefit') {
      const { keyword } = req.query;
      const key = encodeURIComponent(process.env.BENEFIT_API_KEY);
      const url = `https://apis.data.go.kr/B554287/NationalWelfareInformationsV001/NationalWelfarelistV001`
        + `?serviceKey=${key}`
        + `&callTp=L`
        + `&pageNo=1&numOfRows=10`
        + (keyword ? `&searchWrd=${encodeURIComponent(keyword)}` : '')
        + `&srchKeyCode=001`;

      const r = await fetch(url);
      const xml = await r.text();
      const items = parseXmlItems(xml, 'servList');
      return res.status(200).json({ items });
    }

    // ── 3. 마을변호사 지역별 현황 ───────────────────────────────────
    if (type === 'lawyer') {
      const { sido, sigungu } = req.query;
      const key = encodeURIComponent(process.env.LAWYER_API_KEY);
      const url = `https://apis.data.go.kr/1270000/mojmabyun/mabyun`
        + `?serviceKey=${key}`
        + `&pageNo=1&numOfRows=20`
        + (sido    ? `&ctpvNm=${encodeURIComponent(sido)}`     : '')
        + (sigungu ? `&signguNm=${encodeURIComponent(sigungu)}` : '');

      const r = await fetch(url);
      const xml = await r.text();
      const items = parseXmlItems(xml, 'item');
      return res.status(200).json({ items });
    }

    // ── 4. 서민금융교육 콘텐츠 ─────────────────────────────────────
    if (type === 'finance') {
      const { pageNo } = req.query;
      const key = encodeURIComponent(process.env.FINANCE_EDU_KEY);
      const url = `https://apis.data.go.kr/B553701/SeominFinancialEducationContentsInfoService/getFinancialEducationContentsInfo`
        + `?serviceKey=${key}`
        + `&pageNo=${pageNo || 1}&numOfRows=10`;

      const r = await fetch(url);
      const xml = await r.text();

      if (req.query.debug === '1') {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.status(200).send(xml);
      }

      const items = parseXmlItems(xml, 'item');
      return res.status(200).json({ items });
    }

    // ── 5-1. 읍/면/동 목록 조회 (신규) ───────────────────────────────
    // (한글 설명) 화면에서 시/도, 시/군/구를 선택하면, 그 안에 있는 "동" 목록을
    //             전부 가져와서 세 번째 드롭다운(읍/면/동 선택)을 채우는 데 써요.
    if (type === 'dongList') {
      const { sido, sigungu } = req.query;
      const rawKey = process.env.STORE_API_KEY;

      const region = await resolveRegionCode(sido, sigungu, rawKey);
      // (한글 설명) 시/군/구까지 정확히 못 찾았으면(=시/도만 찾았으면) 동 목록을 줄 수 없어요
      if (!region || region.divId !== 'signguCd') {
        return res.status(200).json({ items: [] });
      }

      const key = encodeURIComponent(rawKey);
      const url = `https://apis.data.go.kr/B553077/api/open/sdsc2/baroApi`
        + `?resId=dong&catId=admi&signguCd=${region.key}&type=json&ServiceKey=${key}`;

      try {
        const r = await fetch(url);
        const data = await r.json();
        const rawItems = (data.body && data.body.items) || [];
        const items = rawItems.map((it) => ({ adongCd: it.adongCd, adongNm: it.adongNm }));
        return res.status(200).json({ items });
      } catch (e) {
        return res.status(200).json({ items: [] });
      }
    }

    // ── 5-2. [임시/확인용] 시·군·구 실제 이름 확인 ───────────────────
    // (한글 설명) [임시 코드] "구가 있는 시"(수원시·성남시 등) 지역선택 오류의 원인을
    //             확인하기 위해 만든 확인 전용 기능이에요. 화면(UI)에는 연결하지 않았고,
    //             주소창에 직접 입력해서 확인할 때만 써요. 확인이 끝나면 삭제할 예정이에요.
    //             사용법: /api/benefit?type=sigunguList&sido=경기도
    if (type === 'sigunguList') {
      const { sido } = req.query;
      const sidoFull = normalizeSido(sido);
      if (!sidoFull || !SIDO_CODES[sidoFull]) {
        return res.status(200).json({ error: '알 수 없는 시·도입니다', sido });
      }
      const ctprvnCd = SIDO_CODES[sidoFull];
      const key = encodeURIComponent(process.env.STORE_API_KEY);
      const url = `https://apis.data.go.kr/B553077/api/open/sdsc2/baroApi`
        + `?resId=dong&catId=cty&ctprvnCd=${ctprvnCd}&type=json&ServiceKey=${key}`;
      try {
        const r = await fetch(url);
        const data = await r.json();
        const items = (data.body && data.body.items) || [];
        const names = items.map((it) => ({ signguCd: it.signguCd, signguNm: it.signguNm }));
        return res.status(200).json({ sido: sidoFull, ctprvnCd, count: names.length, names });
      } catch (e) {
        return res.status(200).json({ error: '정부 서버 확인 실패', detail: e.message });
      }
    }

    // ── 5-3. [임시/확인용] 복지시설 DB의 원본 데이터 구조 확인 ────────
    // (한글 설명) [임시 코드] 주소로 "수원"을 찾아봤더니 1,000개 중 하나도 없었어요.
    //             그래서 이번엔 글자를 찾는 대신, 시설 하나의 정보를 통째로 그대로 보여주고
    //             (어떤 항목들이 들어있는지 확인), 1,000개 안에서 jrsdSggCd(관할코드)가
    //             실제로 어떤 값들로, 몇 개씩 나오는지 통계를 내서 보여줘요.
    //             확인이 끝나면 삭제할 예정이에요.
    //             사용법: /api/benefit?type=welfareDebugRegion
    if (type === 'welfareDebugRegion') {
      const { maxPages } = req.query;
      const pages = Math.min(parseInt(maxPages || '10', 10) || 10, 30);
      const listKey = encodeURIComponent(process.env.WELFARE_API_KEY);
      const all = [];
      for (let p = 1; p <= pages; p += 1) {
        const listUrl = `https://apis.data.go.kr/B554287/sclWlfrFcltInfoInqirService1/getFcltListInfoInqire`
          + `?serviceKey=${listKey}&numOfRows=100&pageNo=${p}`;
        const r = await fetch(listUrl);
        const xml = await r.text();
        const items = parseXmlItems(xml, 'item');
        if (items.length === 0) break;
        all.push(...items);
      }
      const codeCount = {};
      all.forEach((it) => {
        const c = it.jrsdSggCd || '(코드없음)';
        codeCount[c] = (codeCount[c] || 0) + 1;
      });
      const topCodes = Object.entries(codeCount).sort((a, b) => b[1] - a[1]).slice(0, 20);
      return res.status(200).json({ totalFetched: all.length, sampleRawItem: all[0], topCodes });
    }

    // ── 6. 소상공인 상가정보 (전통시장·상가) ────────────────────────
    // (한글 설명) 여기부터가 이번에 고친 부분이에요.
    //   - GPS 좌표(lat/lng)가 오면 카카오로 동네 이름을 알아내고
    //   - 동네 이름(경기도, 수원시 등)은 정부가 원하는 지역 코드로 정확히 바꾸고
    //   - 업종 코드(G20404 등)는 이름 검색 칸이 아니라 진짜 업종코드 칸에 넣어요
    if (type === 'store') {
      // keyword = 업종코드 (예: I2, G20404 등, 화면 선택 상자 값 그대로)
      // sido/sigungu = 지역 이름 글자 (예: "부산광역시", "기장군")
      // dong = 읍/면/동 이름 (지역 선택 드롭다운에서 직접 고른 경우)
      // lat/lng = GPS 좌표(선택), 있으면 dong 파라미터보다 우선 사용
      // pageNo = 더보기 페이지 번호(선택, 기본 1)
      const { keyword, sido, sigungu, lat, lng, dong } = req.query;
      const pageNo = parseInt(req.query.pageNo || '1', 10) || 1;
      const rawKey = process.env.STORE_API_KEY;
      const serviceKey = encodeURIComponent(rawKey);

      let regionSido = sido;
      let regionSigungu = sigungu;
      let regionDong = dong || null; // (한글 설명) 지역 선택 드롭다운에서 동을 직접 골랐으면 여기 채워져요

      if (lat && lng) {
        const geo = await reverseGeocodeSidoSigungu(lat, lng, process.env.KAKAO_API_KEY);
        if (geo) {
          regionSido = geo.sido;
          regionSigungu = geo.sigungu;
          regionDong = geo.dong; // GPS가 있으면 GPS로 찾은 동 이름을 우선 사용
        }
      }

      const region = await resolveRegionCode(regionSido, regionSigungu, rawKey);
      if (!region) {
        return res.status(200).json({ body: { items: [] }, message: '지역을 확인할 수 없습니다.' });
      }

      // (한글 설명) [신규 추가] GPS로 "동" 이름까지 알고 있으면(=region.divId가 signguCd일 때),
      //             동 코드로 한 번 더 좁혀봐요. 동 코드를 못 찾으면 그냥 시/군/구 단위를 그대로 써요.
      let finalDivId = region.divId;
      let finalKey = region.key;
      if (regionDong && region.divId === 'signguCd') {
        const adongCd = await resolveAdongCode(region.key, regionDong, rawKey);
        if (adongCd) {
          finalDivId = 'adongCd';
          finalKey = adongCd;
        }
      }

      // (한글 설명) 업종코드가 2글자면 대분류(indsLclsCd), 그보다 길면 소분류(indsSclsCd)로 판단
      let indsParam = '';
      if (keyword) {
        indsParam = keyword.length <= 2
          ? `&indsLclsCd=${encodeURIComponent(keyword)}`
          : `&indsSclsCd=${encodeURIComponent(keyword)}`;
      }

      const url = `https://apis.data.go.kr/B553077/api/open/sdsc2/storeListInDong`
        + `?serviceKey=${serviceKey}`
        + `&divId=${finalDivId}&key=${finalKey}`
        + `&numOfRows=20&pageNo=${pageNo}&type=json`
        + indsParam;

      const r = await fetch(url);

      // (한글 설명) 진단모드: JSON을 미리 해석하지 않고 원본 텍스트 그대로 보여줌
      if (req.query.debug === '1') {
        const raw = await r.text();
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.status(200).send(raw);
      }

      const data = await r.json();
      // (한글 설명) [신규] "더보기" 판단: 이번에 받아온 개수가 요청한 20개와 같으면
      //             다음 페이지에도 더 있을 가능성이 있다고 봐요.
      const dataItems = (data.body && data.body.items) || [];
      const hasMore = (Array.isArray(dataItems) ? dataItems.length : (dataItems ? 1 : 0)) === 20;
      return res.status(200).json(Object.assign({}, data, { hasMore, pageNo }));
    }

    return res.status(400).json({ error: 'type 파라미터가 필요합니다 (welfare/welfareKinds/benefit/lawyer/finance/dongList/sigunguList/store)' });

  } catch (err) {
    console.error('[benefit.js error]', err);
    return res.status(500).json({ error: '서버 오류가 발생했습니다', detail: err.message });
  }
}
