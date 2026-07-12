// =============================================
// api/kakao.js — 카카오 주소검색 프록시
// 브라우저에 API 키 노출 없이 카카오 주소검색 API 호출
// =============================================

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { type, query, lat, lng } = req.query;

  try {
    let url = '';

    // type=coord : 역지오코딩 (GPS 좌표 → 주소)
    if (type === 'coord') {
      if (!lat || !lng) return res.status(400).json({ error: 'lat, lng 파라미터가 필요합니다.' });
      url = `https://dapi.kakao.com/v2/local/geo/coord2regioncode.json?x=${lng}&y=${lat}`;
    }
    // type=keyword : 장소(상호명) 검색 — 전화번호·좌표가 있으면 같이 돌려줌
    // (한글 설명) 요양시설찾기처럼 "전화번호를 정부 데이터에서 못 받는" 경우, 카카오가
    //             그 장소를 등록해뒀으면 전화번호를 대신 얻어오는 용도로 써요.
    else if (type === 'keyword') {
      if (!query) return res.status(400).json({ error: 'query 파라미터가 필요합니다.' });
      url = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}&size=1`;
    }
    // 기본 : 주소 텍스트 검색
    else {
      if (!query) return res.status(400).json({ error: 'query 파라미터가 필요합니다.' });
      url = `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(query)}&analyze_type=similar&size=10`;
    }

    const response = await fetch(url, {
      headers: {
        'Authorization': `KakaoAK ${process.env.KAKAO_API_KEY}`
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: '카카오 API 호출 실패', status: response.status });
    }

    const data = await response.json();
    return res.status(200).json(data);

  } catch (err) {
    console.error('[kakao proxy error]', err);
    return res.status(500).json({ error: '서버 오류', message: err.message });
  }
}
