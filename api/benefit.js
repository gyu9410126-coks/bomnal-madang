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
    // (한글 설명) 여기부터가 이번에 고친 부분이에요.
    //   - GPS 좌표(lat/lng)가 오면 카카오로 동네 이름을 알아내고 (예전엔 아예 무시하고 있었어요)
    //   - 이 API는 시/도, 시/군/구 "이름"을 그대로 받는 방식이라 별도 코드 변환은 필요 없어요
    //   - "동" 이름이 있으면, 주소에 그 동 이름이 포함된 것만 걸러서 보여줘요
    if (type === 'welfare') {
      // (한글 설명) 예전 코드는 'type: facilityType' 이라고 써서, req.query.type(=welfare, 카테고리 이름)을
      //             엉뚱하게 시설종류로 착각해서 읽고 있었어요. req.query.facilityType을 직접 읽도록 수정.
      const { sido, sigungu, facilityType, lat, lng, dong } = req.query;

      let regionSido = sido;
      let regionSigungu = sigungu;
      let regionDong = dong || null;

      if (lat && lng) {
        const geo = await reverseGeocodeSidoSigungu(lat, lng, process.env.KAKAO_API_KEY);
        if (geo) {
          regionSido = geo.sido;
          regionSigungu = geo.sigungu;
          regionDong = geo.dong;
        }
      }

      const key = encodeURIComponent(process.env.WELFARE_API_KEY);
      const url = `https://apis.data.go.kr/B554287/sclWlfrFcltInfoInqirService1/getNFcltBizInqire`
        + `?serviceKey=${key}`
        + `&pageNo=1&numOfRows=20`
        + (regionSido    ? `&ctpvNm=${encodeURIComponent(regionSido)}`       : '')
        + (regionSigungu ? `&signguNm=${encodeURIComponent(regionSigungu)}`  : '')
        + (facilityType  ? `&fcltyTy=${encodeURIComponent(facilityType)}` : '');

      const r = await fetch(url);
      const xml = await r.text();

      // (한글 설명) 2단계 진단모드: 주소 끝에 &debug=1 을 붙이면, 정부서버가 보낸
      //             원본 응답을 그대로 화면에 보여줘요. 실제 항목 이름표를 눈으로 확인하는 용도.
      if (req.query.debug === '1') {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.status(200).send(xml);
      }

      let items = parseXmlItems(xml, 'item');

      // (한글 설명) [신규] 이 API는 "동" 단위로 직접 걸러주는 기능이 없어서,
      //             주소 글자 안에 선택한 동 이름이 들어있는 것만 골라내는 방식으로 좁혀요.
      //             걸러냈는데 하나도 안 남으면(주소 표기가 다를 수 있어서), 빈 화면보다 나으니
      //             그냥 시/군/구 전체 결과를 그대로 보여줘요.
      if (regionDong) {
        const norm = (s) => (s || '').replace(/\s/g, '');
        const dongNorm = norm(regionDong);
        const filtered = items.filter((it) => {
          const addr = norm(it.rdnmadr || it.lotnoAddr || it.rdnmAdr || it.lnoAddr || '');
          return addr.includes(dongNorm);
        });
        if (filtered.length > 0) items = filtered;
      }
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

    return res.status(400).json({ error: 'type 파라미터가 필요합니다 (welfare/benefit/lawyer/finance/dongList/store)' });

  } catch (err) {
    console.error('[benefit.js error]', err);
    return res.status(500).json({ error: '서버 오류가 발생했습니다', detail: err.message });
  }
}
