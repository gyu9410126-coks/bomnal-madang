// 파일명: api/jobs-detail.js
// 역할: 공고 하나의 상세정보를 가져오는 Vercel 서버리스 함수
//       공고 클릭 → 이 파일 → 노인인력개발원 상세정보 API → 팝업으로 표시

export default async function handler(req, res) {

  // ① 환경변수에서 API 키 가져오기
  const apiKey = process.env.SENIOR_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ ok: false, message: 'API 키가 없습니다.' });
  }

  // ② 공고 ID 받기 (예: /api/jobs-detail?jobId=ABC123)
  const jobId = req.query.jobId;
  if (!jobId) {
    return res.status(400).json({ ok: false, message: '공고 ID가 없습니다.' });
  }

  // ③ 상세정보 API 요청 주소 조립
  const url =
    `https://apis.data.go.kr/B552474/SenuriService/getJobInfo` +
    `?serviceKey=${encodeURIComponent(apiKey)}` +
    `&jobId=${jobId}`;

  try {
    // ④ 노인인력개발원 서버에 상세정보 요청
    const response = await fetch(url);
    const xmlText  = await response.text();

    // ⑤ 태그 안의 값을 꺼내는 함수
    function get(tag) {
      var m = xmlText.match(new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)<\\/' + tag + '>'));
      return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : '';
    }

    // ⑥ 필요한 상세정보 추출
    const detail = {
      id:          get('jobId'),        // 공고 ID
      title:       get('recrtTitle'),   // 공고 제목
      company:     get('oranNm'),       // 사업장명
      address:     get('oranAdres'),    // 사업장 주소
      workType:    get('emplymShpNm'),  // 고용형태
      location:    get('workPlcNm'),    // 근무지역
      headcount:   get('recrtPnum'),    // 모집인원
      ageLimit:    get('ageLmtt'),      // 구인 연령대
      startDate:   get('frDd'),         // 접수 시작일
      endDate:     get('toDd'),         // 접수 마감일
      manager:     get('picNm'),        // 담당자 이름
      phone:       get('picTelno'),     // 담당자 전화번호
      contents:    get('recrtCn'),      // 공고 상세내용
      homepage:    get('homepageAdres'),// 홈페이지 주소
      applyMethod: get('acptMthdNm'),   // 접수방법
    };

    // ⑦ 상세정보가 없으면 오류 반환
    if (!detail.title) {
      return res.status(200).json({ ok: false, message: '상세정보를 찾을 수 없습니다.' });
    }

    // ⑧ CORS 헤더 설정
    res.setHeader('Access-Control-Allow-Origin', '*');

    // ⑨ 앱에 JSON으로 전달
    return res.status(200).json({ ok: true, detail: detail });

  } catch (err) {
    return res.status(500).json({ ok: false, message: '서버 오류: ' + err.message });
  }
}
