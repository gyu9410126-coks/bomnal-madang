// 파일명: api/jobs.js
// 역할: Vercel 서버리스 함수
//       브라우저 → 이 파일 → 노인인력개발원 API 순서로 데이터를 가져옴
//       (브라우저에서 직접 API를 부르면 CORS 오류가 나기 때문에 중간 다리 역할)

export default async function handler(req, res) {

  // ① 환경변수에서 API 키 가져오기
  const apiKey = process.env.SENIOR_API_KEY;

  // API 키가 없으면 오류 반환
  if (!apiKey) {
    return res.status(500).json({ ok: false, message: 'API 키가 설정되지 않았습니다.' });
  }

  // ② 쿼리 파라미터에서 페이지 번호 받기 (기본값 1페이지)
  // 메인화면 → 3개, 복지탭 → 10개 가져오도록 구분
  const numOfRows = req.query.numOfRows || '10';
  const pageNo   = req.query.pageNo   || '1';
  // (한글 설명) 정식 활용가이드로 새로 확인한 지역 필터 - 근무지명(예: "수원시")으로
  //             걸러서 요청할 수 있어요. 없으면 전국 전체가 나와요.
  const workPlcNm = req.query.workPlcNm || '';

  // ③ API 요청 주소 조립
  const url =
    `https://apis.data.go.kr/B552474/SenuriService/getJobList` +
    `?serviceKey=${encodeURIComponent(apiKey)}` +
    `&pageNo=${pageNo}` +
    `&numOfRows=${numOfRows}` +
    (workPlcNm ? `&workPlcNm=${encodeURIComponent(workPlcNm)}` : '');

  try {
    // ④ 노인인력개발원 서버에 데이터 요청
    const response = await fetch(url);

    // ⑤ 응답이 XML 형식이므로 텍스트로 받기
    const xmlText = await response.text();

    // (한글 설명) 진단용 - 전체 공고 수와 지역 분포를 확인하고 싶을 때
    //             ?debug=1 을 붙이면 원본 그대로 보여줘요.
    if (req.query.debug === '1') {
      const totalCountMatch = xmlText.match(/<totalCount>(\d+)<\/totalCount>/);
      const workPlcMatches = xmlText.match(/<workPlcNm>([\s\S]*?)<\/workPlcNm>/g) || [];
      const workPlcList = workPlcMatches.map(function(m) { return m.replace(/<\/?workPlcNm>/g, ''); });
      return res.status(200).json({
        ok: true, debug: true,
        requestUrl: url.replace(apiKey, '(키-숨김)'),
        totalCount: totalCountMatch ? totalCountMatch[1] : '확인불가',
        thisPageCount: workPlcList.length,
        workPlcSample: workPlcList,
      });
    }

    // ⑥ XML에서 <item> 태그 하나씩 꺼내기
    const itemMatches = xmlText.match(/<item>([\s\S]*?)<\/item>/g) || [];

    // ⑦ 공고가 없을 때 처리
    if (itemMatches.length === 0) {
      return res.status(200).json({ ok: false, message: '현재 등록된 공고가 없습니다.' });
    }

    // ⑧ 각 공고에서 필요한 값만 추출
    const items = itemMatches.map(function(itemXml) {

      // 태그 안의 값을 꺼내는 함수
      function get(tag) {
        var m = itemXml.match(new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)<\\/' + tag + '>'));
        return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : '';
      }

      // 고용형태 코드 → 한글 변환표
      const workTypeMap = {
        'CM0101': '정규직',
        'CM0102': '계약직',
        'CM0103': '파트타임',
        'CM0104': '일용직',
        'CM0105': '시간제',
        'CM0106': '기타',
      };
      const rawCode = get('emplymShp') || get('emplymShpNm');
      const workTypeLabel = workTypeMap[rawCode] || rawCode || '-';

      return {
        id:       get('jobId'),       // 채용공고 ID
        title:    get('recrtTitle'),  // 채용 제목
        company:  get('oranNm'),      // 기업명
        workType: workTypeLabel,      // 고용형태 (한글 변환)
        location: get('workPlcNm'),   // 근무지역
        startDate:get('frDd'),        // 접수 시작일
        endDate:  get('toDd'),        // 접수 마감일
      };
    });

    // ⑨ CORS 헤더 설정 (어디서든 요청 가능하게)
    res.setHeader('Access-Control-Allow-Origin', '*');

    // ⑩ 앱에 JSON 형태로 결과 전달
    return res.status(200).json({ ok: true, items: items });

  } catch (err) {
    // ⑪ 오류 발생 시 에러 메시지 전달
    return res.status(500).json({ ok: false, message: '서버 오류: ' + err.message });
  }
}
