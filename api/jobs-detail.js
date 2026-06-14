// 파일명: api/jobs-detail.js
// 역할: 공고 하나의 상세정보를 가져오는 Vercel 서버리스 함수
//       공고 클릭 → 이 파일 → 노인인력개발원 getJobInfo API → 팝업으로 표시

export default async function handler(req, res) {

  // ① 환경변수에서 API 키 가져오기
  const apiKey = process.env.SENIOR_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ ok: false, message: 'API 키가 없습니다.' });
  }

  // ② 공고 ID 받기 (예: /api/jobs-detail?jobId=RECR_000000000013950)
  const jobId = req.query.jobId;
  if (!jobId) {
    return res.status(400).json({ ok: false, message: '공고 ID가 없습니다.' });
  }

  // ③ 상세정보 API 요청 주소 조립
  // ★ 핵심: 파라미터명이 'jobId'가 아니라 'id' 임!
  const url =
    `https://apis.data.go.kr/B552474/SenuriService/getJobInfo` +
    `?serviceKey=${encodeURIComponent(apiKey)}` +
    `&id=${jobId}`;

  try {
    // ④ 노인인력개발원 서버에 상세정보 요청
    const response = await fetch(url);
    const xmlText  = await response.text();

    // ⑤ XML 태그 안의 값을 꺼내는 함수
    function get(tag) {
      var m = xmlText.match(new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)<\\/' + tag + '>'));
      return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : '';
    }

    // ⑥ 접수방법 코드 → 한글 변환
    const applyMethodMap = {
      'CM0801': '온라인',
      'CM0802': '이메일',
      'CM0803': '팩스',
      'CM0804': '방문',
    };
    const applyCode = get('acptMthdCd');
    const applyMethod = applyMethodMap[applyCode] || applyCode || '-';

    // ⑦ 실제 API 응답 태그명에 맞게 추출
    const detail = {
      title:       get('wantedTitle'),  // 채용제목
      company:     get('plbizNm'),      // 사업장명
      address:     get('plDetAddr'),    // 사업장 주소
      headcount:   get('clltPrnnum'),   // 모집인원
      age:         get('age'),          // 연령
      ageLim:      get('ageLim'),       // 연령제한 여부
      startDate:   get('frAcptDd'),     // 시작접수일
      endDate:     get('toAcptDd'),     // 종료접수일
      manager:     get('clerk'),        // 담당자
      phone:       get('clerkContt'),   // 담당자 연락처
      contents:    get('detCnts'),      // 상세내용
      extra:       get('etcItm'),       // 기타사항
      homepage:    get('homepage'),     // 홈페이지
      applyMethod: applyMethod,         // 접수방법 (한글)
    };

    // ⑧ 상세정보가 없으면 오류 반환
    if (!detail.title) {
      return res.status(200).json({ ok: false, message: '상세정보를 찾을 수 없습니다.' });
    }

    // ⑨ CORS 헤더 설정
    res.setHeader('Access-Control-Allow-Origin', '*');

    // ⑩ 앱에 JSON으로 전달
    return res.status(200).json({ ok: true, detail: detail });

  } catch (err) {
    return res.status(500).json({ ok: false, message: '서버 오류: ' + err.message });
  }
}
