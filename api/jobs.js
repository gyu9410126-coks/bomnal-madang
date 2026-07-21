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

  // (한글 설명) 지역코드 조회 전용 기능 - 시도/시군구 코드를 확인할 때 씀
  if (req.query.type === 'areaCodes') {
    const paramType = req.query.paramType || 'A'; // A:시도, B:시군구
    const contRegnStr1 = req.query.contRegnStr1 || '';
    const codeUrl =
      `https://apis.data.go.kr/B552474/OdsnCodeInquiryService2/getOdsnAreaCodeInquiryList2` +
      `?serviceKey=${encodeURIComponent(apiKey)}` +
      `&numOfRows=${req.query.numOfRows || '200'}&pageNo=1` +
      `&paramType=${paramType}` +
      (contRegnStr1 ? `&contRegnStr1=${encodeURIComponent(contRegnStr1)}` : '');
    try {
      const r = await fetch(codeUrl);
      const t = await r.text();
      if (req.query.debug === '1') {
        return res.status(200).json({ ok: true, debug: true, requestUrl: codeUrl.replace(apiKey, '(키-숨김)'), rawXmlSample: t.slice(0, 3000) });
      }
      const itemMatches = t.match(/<item>([\s\S]*?)<\/item>/g) || [];
      const codes = itemMatches.map(function(itemXml) {
        function get(tag) {
          var m = itemXml.match(new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)<\\/' + tag + '>'));
          return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : '';
        }
        return {
          code1: get('contRegnStr1Code'), name1: get('contRegnStr1Name'),
          code2: get('contRegnStr2Code'), name2: get('contRegnStr2Name'),
        };
      });
      return res.status(200).json({ ok: true, codes: codes });
    } catch (err) {
      return res.status(500).json({ ok: false, message: '서버 오류: ' + err.message });
    }
  }

  // ② 쿼리 파라미터에서 페이지 번호 받기 (기본값 1페이지)
  // 메인화면 → 3개, 복지탭 → 10개 가져오도록 구분
  const numOfRows = req.query.numOfRows || '10';
  const pageNo   = req.query.pageNo   || '1';
  // (한글 설명) 정식 활용가이드로 새로 확인한 지역 필터 - 근무지명(예: "수원시")으로
  //             걸러서 요청할 수 있어요. 없으면 전국 전체가 나와요.
  const workPlcNm = req.query.workPlcNm || '';
  // (한글 설명) workPlcNm(이름)이 실제로는 안 먹혀서, 결과에 있던 숫자코드(workPlc)로도
  //             테스트해볼 수 있게 추가함(문서엔 없지만 혹시 몰라서).
  const workPlc = req.query.workPlc || '';

  // ③ API 요청 주소 조립
  const url =
    `https://apis.data.go.kr/B552474/SenuriService/getJobList` +
    `?serviceKey=${encodeURIComponent(apiKey)}` +
    `&pageNo=${pageNo}` +
    `&numOfRows=${numOfRows}` +
    (workPlcNm ? `&workPlcNm=${encodeURIComponent(workPlcNm)}` : '') +
    (workPlc ? `&workPlc=${encodeURIComponent(workPlc)}` : '');

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
      const workPlcCodeMatches = xmlText.match(/<workPlc>([\s\S]*?)<\/workPlc>/g) || [];
      const workPlcCodeList = workPlcCodeMatches.map(function(m) { return m.replace(/<\/?workPlc>/g, ''); });
      const deadlineMatches = xmlText.match(/<deadline>([\s\S]*?)<\/deadline>/g) || [];
      const deadlineList = deadlineMatches.map(function(m) { return m.replace(/<\/?deadline>/g, ''); });
      const acceptingCount = deadlineList.filter(function(d) { return d === '접수중'; }).length;
      return res.status(200).json({
        ok: true, debug: true,
        requestUrl: url.replace(apiKey, '(키-숨김)'),
        totalCount: totalCountMatch ? totalCountMatch[1] : '확인불가',
        thisPageCount: workPlcList.length,
        acceptingCount: acceptingCount + ' / ' + deadlineList.length + ' (이 페이지 안에서 접수중 비율)',
        workPlcSample: workPlcList,
        workPlcCodeSample: workPlcCodeList,
        rawXmlSample: xmlText.slice(0, 3000),
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
