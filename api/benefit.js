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
const SIDO_CODES = {
  '서울특별시': '11', '부산광역시': '26', '대구광역시': '27', '인천광역시': '28',
  '광주광역시': '29', '대전광역시': '30', '울산광역시': '31', '세종특별자치시': '36',
  '경기도': '41', '강원도': '42', '충청북도': '43', '충청남도': '44',
  '전라북도': '45', '전라남도': '46', '경상북도': '47', '경상남도': '48',
  '제주특별자치도': '50'
};

// (한글 설명) 시/군/구는 250개 가까이 되서 표로 다 외우지 않고, 그때그때 정부서버에
//             "이 시/도 안에 있는 시/군/구 목록 좀 줘"라고 물어봐서 정확한 코드를 찾아요.
//             (health.js와 동일한 검증된 로직)
async function resolveRegionCode(sido, sigungu, rawServiceKey) {
  if (!sido || !SIDO_CODES[sido]) return null;
  const ctprvnCd = SIDO_CODES[sido];
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

      let regionSido = sido;
      let regionSigungu = sigungu;

      if (lat && lng) {
        const geo = await reverseGeocodeSidoSigungu(lat, lng, process.env.KAKAO_API_KEY);
        if (geo) {
          regionSido = geo.sido;
          regionSigungu = geo.sigungu;
        }
      }

      // (한글 설명) [수정] 글자 이름(jrsdSggNm)으로 필터링하면 정부 서버가 제대로 못 걸러내는 것 같아서,
      //             더 확실한 숫자 코드(jrsdSggCd) 방식으로 바꿨어요. 이미 전통시장에서 검증된
      //             "시/군/구 이름 → 정확한 코드" 변환 기능(resolveRegionCode)을 그대로 재사용해요.
      //             예: 서울 중랑구 코드 "11260" + "00000" = "1126000000" (문서 예시와 정확히 일치)
      let jrsdSggCd = '';
      if (regionSido && regionSigungu) {
        const region = await resolveRegionCode(regionSido, regionSigungu, process.env.STORE_API_KEY);
        if (region && region.divId === 'signguCd') {
          jrsdSggCd = region.key + '00000';
        }
      }
      // (한글 설명) 시/군/구까지 정확히 알면 조금만 받고, 못 정했으면 넉넉히 받아서 뒤에서 걸러내요.
      const fetchCount = jrsdSggCd ? 15 : 50;

      const listKey = encodeURIComponent(process.env.WELFARE_API_KEY);
      const listUrl = `https://apis.data.go.kr/B554287/sclWlfrFcltInfoInqirService1/getFcltListInfoInqire`
        + `?serviceKey=${listKey}`
        + `&numOfRows=${fetchCount}&pageNo=1`
        + (jrsdSggCd    ? `&jrsdSggCd=${encodeURIComponent(jrsdSggCd)}`   : '')
        + (facilityType ? `&fcltKindNm=${encodeURIComponent(facilityType)}` : '');

      const listRes = await fetch(listUrl);
      const listXml = await listRes.text();

      // (한글 설명) 진단모드: &debug=1 을 붙이면 1단계(목록조회) 원본 응답을 그대로 보여줘요.
      if (req.query.debug === '1') {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.status(200).send(listXml);
      }

      let listItems = parseXmlItems(listXml, 'item');

      // (한글 설명) 시/군/구 코드를 못 정했을 때(=시/도만 골랐을 때)는, 결과 중에서
      //             시/도 이름으로 시작하는 것만 한 번 더 걸러줘요.
      if (regionSido && !jrsdSggCd) {
        const norm = (s) => (s || '').replace(/\s/g, '');
        listItems = listItems.filter((it) => norm(it.jrsdSggNm || '').startsWith(norm(regionSido)));
      }

      // (한글 설명) 화면엔 최대 10개만 보여주니까, 상세조회도 딱 그만큼만 해요 (불필요한 API 호출 절약)
      const topItems = listItems.slice(0, 10);
      const detailKey = encodeURIComponent(process.env.WELFARE_API_KEY);
      const kakaoKey = process.env.KAKAO_API_KEY;

      // (한글 설명) [신규] 시설 10개의 "상세정보 조회 + 주소→좌표 변환"을 Promise.all로 한꺼번에 실행해요.
      //             하나씩 순서대로 하면 10개면 10배 느려지는데, 동시에 하면 제일 느린 것 1개만큼만 걸려요.
      const enriched = await Promise.all(topItems.map(async (it) => {
        let detail = {};
        try {
          const detailUrl = `https://apis.data.go.kr/B554287/sclWlfrFcltInfoInqirService1/getFcltByBassInfoInqire`
            + `?serviceKey=${detailKey}&numOfRows=1&pageNo=1&fcltCd=${encodeURIComponent(it.fcltCd || '')}`;
          const detailRes = await fetch(detailUrl);
          const detailXml = await detailRes.text();
          const detailItems = parseXmlItems(detailXml, 'item');
          detail = detailItems[0] || {};
        } catch (e) {
          // 상세정보 조회가 실패해도 목록 정보(이름·종류)라도 보여줘요
        }

        // (한글 설명) 주소를 카카오 주소검색으로 좌표(위도/경도)로 바꿔서, 지도/길찾기 버튼에 써요.
        let itemLat = null, itemLon = null;
        const fullAddr = ((detail.fcltAddr || '') + ' ' + (detail.fcltDtl_1Addr || '')).trim();
        if (fullAddr && kakaoKey) {
          try {
            const geoUrl = `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(fullAddr)}`;
            const geoRes = await fetch(geoUrl, { headers: { Authorization: `KakaoAK ${kakaoKey}` } });
            const geoData = await geoRes.json();
            const doc = geoData.documents && geoData.documents[0];
            if (doc) { itemLat = doc.y; itemLon = doc.x; } // 카카오는 x=경도, y=위도예요
          } catch (e) {
            // 좌표 변환이 실패해도 주소·전화번호는 그대로 보여줘요
          }
        }

        return Object.assign({}, it, detail, { lat: itemLat, lon: itemLon, fullAddr });
      }));

      return res.status(200).json({ items: enriched });
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
      const { keyword, sido, sigungu, lat, lng, dong } = req.query;
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
        + `&numOfRows=20&pageNo=1&type=json`
        + indsParam;

      const r = await fetch(url);

      // (한글 설명) 진단모드: JSON을 미리 해석하지 않고 원본 텍스트 그대로 보여줌
      if (req.query.debug === '1') {
        const raw = await r.text();
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.status(200).send(raw);
      }

      const data = await r.json();
      return res.status(200).json(data);
    }

    return res.status(400).json({ error: 'type 파라미터가 필요합니다 (welfare/welfareKinds/benefit/lawyer/finance/dongList/store)' });

  } catch (err) {
    console.error('[benefit.js error]', err);
    return res.status(500).json({ error: '서버 오류가 발생했습니다', detail: err.message });
  }
}
