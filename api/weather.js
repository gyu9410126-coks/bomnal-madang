// ============================================================
// 📁 파일명: api/weather.js
// 📌 역할: GPS 위도/경도 → 카카오 주소변환 → 기상청/환경공단 날씨 통합 조회
// type 파라미터로 기능 구분:
//   (없음)   = 기존 현재날씨 (그대로 유지, 기존 화면 안 깨짐)
//   weekly   = 일주일 날씨(오늘~3일 단기예보 + 4~7일 중기예보)
//   warning  = 폭염·한파 등 기상특보 확인
//   dust     = 미세먼지·초미세먼지 실시간 정보
// ============================================================

const WARN_CODES = {"전국": "L1000000", "경기도": "L1010000", "광명시": "L1010200", "과천시": "L1010300", "안산시": "L1010400", "시흥시": "L1010500", "부천시": "L1010600", "김포시": "L1010700", "강화군": "L1010900", "동두천시": "L1011100", "연천군": "L1011200", "포천시": "L1011300", "가평군": "L1011400", "고양시": "L1011500", "양주시": "L1011600", "의정부시": "L1011700", "수원시": "L1011900", "성남시": "L1012000", "안양시": "L1012100", "구리시": "L1012200", "남양주시": "L1012300", "오산시": "L1012400", "평택시": "L1012500", "군포시": "L1012600", "의왕시": "L1012700", "하남시": "L1012800", "이천시": "L1013000", "안성시": "L1013100", "화성시": "L1013200", "광주시": "L1013400", "옹진군": "L1013600", "파주시": "L1013700", "파주시동북부": "L1013710", "파주시서북부": "L1013720", "파주시남부": "L1013730", "용인시": "L1013800", "용인시동북부": "L1013810", "용인시서북부": "L1013820", "용인시남부": "L1013830", "여주시": "L1013900", "여주시동남부": "L1013910", "여주시서부": "L1013920", "서해5도": "L1014000", "백령도.대청도": "L1014200", "연평도.우도": "L1014300", "양평군": "L1014400", "양평군동부": "L1014410", "양평군서부": "L1014420", "강원도": "L1020000", "태백시": "L1020300", "영월군": "L1020800", "횡성군": "L1021100", "원주시": "L1021200", "철원군": "L1021300", "화천군": "L1021400", "춘천시": "L1021600", "동해시": "L1021900", "동해시평지": "L1021910", "동해시산지": "L1021920", "삼척시": "L1022000", "삼척시평지": "L1022010", "삼척시산지": "L1022020", "속초시": "L1022100", "속초시평지": "L1022110", "속초시산지": "L1022120", "고성군": "L1082300", "고성군평지": "L1022210", "고성군산지": "L1022220", "양양군": "L1022300", "양양군평지": "L1022310", "양양군산지": "L1022320", "평창군": "L1022400", "평창군평지": "L1022410", "평창군산지": "L1022420", "강릉시": "L1022500", "강릉시평지": "L1022510", "강릉시산지": "L1022520", "정선군": "L1022600", "정선군평지": "L1022610", "정선군산지": "L1022620", "홍천군": "L1022700", "홍천군평지": "L1022710", "홍천군산지": "L1022720", "양구군": "L1022800", "양구군평지": "L1022810", "양구군산지": "L1022820", "인제군": "L1022900", "인제군평지": "L1022910", "인제군산지": "L1022920", "충청남도": "L1030000", "대전광역시": "L1120000", "천안시": "L1030200", "공주시": "L1030300", "아산시": "L1030400", "논산시": "L1030500", "금산군": "L1030600", "부여군": "L1030800", "청양군": "L1030900", "예산군": "L1031000", "태안군": "L1031100", "당진시": "L1031200", "서산시": "L1031300", "서천군": "L1031500", "계룡시": "L1031700", "보령시": "L1031900", "보령(도서제외)": "L1031910", "보령도서": "L1031920", "홍성군": "L1032000", "홍성군동부": "L1032010", "홍성군서부": "L1032020", "충청북도": "L1040000", "보은군": "L1040300", "괴산군": "L1040400", "옥천군": "L1040600", "영동군": "L1040700", "충주시": "L1040800", "제천시": "L1040900", "진천군": "L1041000", "음성군": "L1041100", "단양군": "L1041200", "증평군": "L1041300", "청주시": "L1041400", "청주시동부": "L1041410", "청주시서부": "L1041420", "전라남도": "L1050000", "담양군": "L1050300", "장성군": "L1050600", "화순군": "L1050700", "보성군": "L1050900", "여수시": "L1051000", "광양시": "L1051100", "순천시": "L1051200", "장흥군": "L1051300", "강진군": "L1051400", "영암군": "L1051700", "함평군": "L1051900", "목포시": "L1052100", "신안군(흑산면제외)": "L1052200", "진도군": "L1052300", "흑산도.홍도": "L1052500", "거문도.초도": "L1052600", "영광군": "L1052700", "영광군(낙월면 제외)": "L1052710", "영광낙월면": "L1052720", "나주시": "L1052800", "나주시동남부": "L1052810", "나주시서북부": "L1052820", "곡성군": "L1052900", "곡성군북부": "L1052910", "곡성군남부": "L1052920", "구례군": "L1053000", "구례군평지": "L1053010", "구례군산간": "L1053020", "고흥군": "L1053100", "고흥군북부": "L1053110", "고흥군남부": "L1053120", "해남군": "L1053200", "해남군북부": "L1053210", "해남군남부": "L1053220", "완도군": "L1053300", "완도군(여서도 제외)": "L1053310", "완도군여서도": "L1053320", "무안군": "L1053400", "무안군북부": "L1053410", "무안군남부": "L1053420", "전북자치도": "L1060000", "고창군": "L1060100", "김제시": "L1060400", "완주군": "L1060500", "진안군": "L1060600", "무주군": "L1060700", "장수군": "L1060800", "임실군": "L1060900", "순창군": "L1061000", "익산시": "L1061100", "정읍시": "L1061200", "전주시": "L1061300", "남원시": "L1061400", "부안군": "L1061500", "부안군(위도면 제외)": "L1061510", "부안위도면": "L1061520", "군산시": "L1061600", "군산시(옥도면 제외)": "L1061610", "군산옥도면(어청도 제외)": "L1061620", "군산어청도": "L1061630", "경상북도": "L1070000", "군위군": "L1070200", "구미시": "L1070300", "영천시": "L1070400", "경산시": "L1070500", "청도군": "L1070700", "고령군": "L1070800", "성주군": "L1070900", "칠곡군": "L1071000", "상주시": "L1071200", "문경시": "L1071300", "예천군": "L1071400", "영주시": "L1071600", "의성군": "L1071700", "청송군": "L1071800", "울릉도.독도": "L1600000", "영덕군": "L1072200", "포항시": "L1072400", "김천시": "L1072600", "김천시북부": "L1072610", "김천시남부": "L1072620", "안동시": "L1072700", "안동시북부": "L1072710", "안동시동남부": "L1072720", "안동시서부": "L1072730", "영양군": "L1072800", "영양군평지": "L1072810", "영양군산지": "L1072820", "봉화군": "L1072900", "봉화군평지": "L1072910", "봉화군산지": "L1072920", "울진군": "L1073000", "울진군평지": "L1073010", "울진군산지": "L1073020", "경주시": "L1073100", "경주시중북부": "L1073110", "경주시동부": "L1073120", "경주시남부": "L1073130", "경주시서부": "L1073140", "경상남도": "L1080000", "양산시": "L1080500", "창원시": "L1080600", "김해시": "L1080900", "밀양시": "L1081000", "의령군": "L1081100", "함안군": "L1081200", "창녕군": "L1081300", "진주시": "L1081400", "통영시": "L1082000", "사천시": "L1082100", "거제시": "L1082200", "남해군": "L1082400", "부산동부": "L1082500", "부산중부": "L1082600", "부산서부": "L1082700", "울산동부": "L1082800", "울산서부": "L1082900", "하동군": "L1083000", "하동군북부": "L1083010", "하동군남부": "L1083020", "산청군": "L1083100", "산청군북부": "L1083110", "산청군서남부": "L1083120", "산청군동남부": "L1083130", "함양군": "L1083200", "함양중부": "L1083210", "함양서북부": "L1083220", "거창군": "L1083300", "거창군북부": "L1083310", "거창군남부": "L1083320", "합천군": "L1083400", "합천군서북부": "L1083410", "합천군중부": "L1083420", "합천군남부": "L1083430", "제주도": "L1090000", "제주도산지": "L1090500", "추자도": "L1091000", "제주시(산지 제외)": "L1091300", "제주시서부": "L1091310", "제주시북부": "L1091320", "제주시동부": "L1091330", "제주시중산간": "L1091340", "서귀포시(산지 제외)": "L1091400", "서귀포시서부": "L1091410", "서귀포시남부": "L1091420", "서귀포시동부": "L1091430", "서귀포시중산간": "L1091440", "서울특별시": "L1100000", "서울동남권": "L1100100", "서울동북권": "L1100200", "서울서남권": "L1100300", "서울서북권": "L1100400", "인천광역시": "L1110100", "인천영종": "L1110110", "인천남부": "L1110120", "인천북부": "L1110130", "광주광역시": "L1130100", "광주서부": "L1130110", "광주동부": "L1130120", "대구광역시": "L1140000", "대구중부": "L1140100", "달성군": "L1140200", "달성군북부": "L1140210", "달성군남부": "L1140220", "부산광역시": "L1150000", "울산광역시": "L1160000", "세종특별자치시": "L1170100", "세종북부": "L1170110", "세종남부": "L1170120", "전해상": "S1000000", "동해전해상": "S1100000", "동해남부전해상": "S1130000", "동해남부앞바다": "S1131000", "울산앞바다": "S1131100", "경북남부앞바다": "S1131200", "경북북부앞바다": "S1131300", "동해남부남쪽안쪽먼바다": "S1132110", "동해남부남쪽바깥먼바다": "S1132120", "동해남부북쪽안쪽먼바다": "S1132210", "동해남부북쪽바깥먼바다": "S1132220", "동해중부전해상": "S1150000", "동해중부앞바다": "S1151000", "강원북부앞바다": "S1151100", "강원중부앞바다": "S1151200", "강원남부앞바다": "S1151300", "동해중부안쪽먼바다": "S1152010", "동해중부바깥먼바다": "S1152020", "서해전해상": "S1200000", "서해남부전해상": "S1230000", "서해남부앞바다": "S1231000", "전북북부앞바다": "S1231100", "전북남부앞바다": "S1231200", "전남북부서해앞바다": "S1231300", "전남중부서해앞바다": "S1231400", "전남남부서해앞바다": "S1231500", "서해남부북쪽안쪽먼바다": "S1232110", "서해남부북쪽바깥먼바다": "S1232120", "서해남부남쪽안쪽먼바다": "S1232210", "서해남부남쪽바깥먼바다": "S1232220", "서해중부전해상": "S1250000", "서해중부앞바다": "S1251000", "인천·경기북부앞바다": "S1251100", "인천·경기남부앞바다": "S1251200", "충남북부앞바다": "S1251300", "충남남부앞바다": "S1251400", "서해중부안쪽먼바다": "S1252010", "서해중부바깥먼바다": "S1252020", "남해전해상": "S1300000", "남해동부전해상": "S1310000", "남해동부앞바다": "S1311000", "부산앞바다": "S1311100", "경남서부남해앞바다": "S1311200", "경남중부남해앞바다": "S1311300", "거제시동부앞바다": "S1311400", "남해동부안쪽먼바다": "S1312010", "남해동부바깥먼바다": "S1312020", "남해서부전해상": "S1320000", "남해서부앞바다": "S1321000", "전남서부남해앞바다": "S1321100", "전남동부남해앞바다": "S1321200", "남해서부서쪽먼바다": "S1322100", "남해서부동쪽먼바다": "S1322200", "제주도앞바다": "S1323000", "제주도북부앞바다": "S1323100", "제주도동부앞바다": "S1323200", "제주도남부앞바다": "S1323300", "제주도서부앞바다": "S1323400", "제주도남쪽바깥먼바다": "S1324020", "제주도남동쪽안쪽먼바다": "S1324110", "제주도남서쪽안쪽먼바다": "S1324210", "제주도전해상": "S1330000", "연안바다/평수구역": "S2000000", "경북남부앞바다중 평수구역": "S2110100", "울산앞바다중 평수구역": "S2110200", "경북북부앞바다중 연안바다": "S2120100", "경북북부앞바다중 영덕연안바다": "S2120200", "경북남부앞바다중 연안바다": "S2120300", "울산앞바다중 연안바다": "S2120400", "강원중부앞바다중 연안바다": "S2120500", "강원북부앞바다중 연안바다": "S2120600", "강원남부앞바다중 연안바다": "S2120700", "울릉도울릉읍연안바다": "S2120800", "울릉도서면연안바다": "S2120900", "울릉도북면연안바다": "S2121000", "전북북부앞바다중 평수구역": "S2210100", "전북남부앞바다중 평수구역": "S2210200", "전남북부서해앞바다중 평수구역": "S2210300", "전남남부서해앞바다중 평수구역": "S2210500", "충남남부앞바다중 평수구역": "S2210700", "인천경기남부앞바다중 먼평수구역": "S2211100", "서해남부남쪽안쪽먼바다중 조도부근평수구역": "S2211200", "전남중부서해앞바다중 먼평수구역": "S2211300", "전남중부서해앞바다중 앞평수구역": "S2211400", "천수만 평수구역": "S2211500", "인천·경기남부앞바다중 북부앞평수구역": "S2211600", "인천·경기남부앞바다중 남부앞평수구역": "S2211700", "안면도 서쪽 평수구역": "S2211900", "인천·경기북부앞바다중 평수구역": "S2212000", "당진 평수구역": "S2212100", "태안·서산 북쪽 평수구역": "S2212200", "부산앞바다중 동부평수구역": "S2310100", "부산앞바다중 서부평수구역": "S2310200", "경남중부남해앞바다중 평수구역": "S2310300", "경남서부남해앞바다중 동부평수구역": "S2310400", "경남서부남해앞바다중 서부평수구역": "S2310500", "경남서부남해앞바다중 남부평수구역": "S2310600", "전남서부남해앞바다중 평수구역": "S2310700", "전남동부남해앞바다중 서부평수구역": "S2310800", "전남동부남해앞바다중 동부평수구역": "S2310900", "부산앞바다중 연안바다": "S2320100", "거제시동부앞바다중 연안바다": "S2320200", "경남서부남해앞바다중 남해군연안바다": "S2320300", "제주도북부앞바다중 연안바다": "S2320400", "제주도서부앞바다중 북서연안바다": "S2320610", "제주도서부앞바다중 남서연안바다": "S2320620", "제주도남부앞바다중 연안바다": "S2320700", "경남중부남해앞바다중 연안바다": "S2320800", "제주도동부앞바다중 북동연안바다": "S2320900", "제주도동부앞바다중 남동연안바다": "S2321000", "남해서부서쪽먼바다중 추자도연안바다": "S2330100", "제주도동부앞바다중 우도연안바다": "S2330200", "제주도서부앞바다중 가파도연안바다": "S2330300"};

const LAND_CODES = {"서울": "11B00000", "인천": "11B00000", "경기도": "11B00000", "강원도영서": "11D10000", "강원도영동": "11D20000", "대전": "11C20000", "세종": "11C20000", "충청남도": "11C20000", "충청북도": "11C10000", "광주": "11F20000", "전라남도": "11F20000", "전북자치도": "11F10000", "대구": "11H10000", "경상북도": "11H10000", "부산": "11H20000", "울산": "11H20000", "경상남도": "11H20000", "제주도": "11G00000"};

const TEMP_CODES = {"백령도": "11A00101", "서울": "11B10101", "과천": "11B10102", "광명": "11B10103", "강화": "11B20101", "김포": "11B20102", "인천": "11B20201", "시흥": "11B20202", "안산": "11B20203", "부천": "11B20204", "의정부": "11B20301", "고양": "11B20302", "양주": "11B20304", "파주": "11B20305", "동두천": "11B20401", "연천": "11B20402", "포천": "11B20403", "가평": "11B20404", "구리": "11B20501", "남양주": "11B20502", "양평": "11B20503", "하남": "11B20504", "수원": "11B20601", "안양": "11B20602", "오산": "11B20603", "화성": "11B20604", "성남": "11B20605", "평택": "11B20606", "의왕": "11B20609", "군포": "11B20610", "안성": "11B20611", "용인": "11B20612", "이천": "11B20701", "광주": "11F20501", "여주": "11B20703", "충주": "11C10101", "진천": "11C10102", "음성": "11C10103", "제천": "11C10201", "단양": "11C10202", "청주": "11C10301", "보은": "11C10302", "괴산": "11C10303", "증평": "11C10304", "추풍령": "11C10401", "영동": "11C10402", "옥천": "11C10403", "서산": "11C20101", "태안": "11C20102", "당진": "11C20103", "홍성": "11C20104", "보령": "11C20201", "서천": "11C20202", "천안": "11C20301", "아산": "11C20302", "예산": "11C20303", "대전": "11C20401", "공주": "11C20402", "계룡": "11C20403", "세종": "11C20404", "부여": "11C20501", "청양": "11C20502", "금산": "11C20601", "논산": "11C20602", "철원": "11D10101", "화천": "11D10102", "인제": "11D10201", "양구": "11D10202", "춘천": "11D10301", "홍천": "11D10302", "원주": "11D10401", "횡성": "11D10402", "영월": "11D10501", "정선": "11D10502", "평창": "11D10503", "대관령": "11D20201", "태백": "11D20301", "속초": "11D20401", "고성": "11H20404", "양양": "11D20403", "강릉": "11D20501", "동해": "11D20601", "삼척": "11D20602", "울릉도": "11E00101", "독도": "11E00102", "전주": "11F10201", "익산": "11F10202", "정읍": "11F10203", "완주": "11F10204", "장수": "11F10301", "무주": "11F10302", "진안": "11F10303", "남원": "11F10401", "임실": "11F10402", "순창": "11F10403", "완도": "11F20301", "해남": "11F20302", "강진": "11F20303", "장흥": "11F20304", "여수": "11F20401", "광양": "11F20402", "고흥": "11F20403", "보성": "11F20404", "순천시": "11F20405", "장성": "11F20502", "나주": "11F20503", "담양": "11F20504", "화순": "11F20505", "구례": "11F20601", "곡성": "11F20602", "순천": "11F20603", "흑산도": "11F20701", "성산": "11G00101", "제주": "11G00201", "성판악": "11G00302", "서귀포": "11G00401", "고산": "11G00501", "이어도": "11G00601", "추자도": "11G00800", "산천단": "11G00901", "한남": "11G01001", "울진": "11H10101", "영덕": "11H10102", "포항": "11H10201", "경주": "11H10202", "문경": "11H10301", "상주": "11H10302", "예천": "11H10303", "영주": "11H10401", "봉화": "11H10402", "영양": "11H10403", "안동": "11H10501", "의성": "11H10502", "청송": "11H10503", "김천": "11H10601", "구미": "11H10602", "고령": "11H10604", "성주": "11H10605", "대구": "11H10701", "영천": "11H10702", "경산": "11H10703", "청도": "11H10704", "칠곡": "11H10705", "군위": "11H10707", "울산": "11H20101", "양산": "11H20102", "부산": "11H20201", "창원": "11H20301", "김해": "11H20304", "통영": "11H20401", "사천": "11H20402", "거제": "11H20403", "남해": "11H20405", "함양": "11H20501", "거창": "11H20502", "합천": "11H20503", "밀양": "11H20601", "의령": "11H20602", "함안": "11H20603", "창녕": "11H20604", "진주": "11H20701", "산청": "11H20703", "하동": "11H20704", "사리원": "11I10001", "신계": "11I10002", "해주": "11I20001", "개성": "11I20002", "장연(용연)": "11I20003", "신의주": "11J10001", "삭주(수풍)": "11J10002", "구성": "11J10003", "자성(중강)": "11J10004", "강계": "11J10005", "희천": "11J10006", "평양": "11J20001", "진남포(남포)": "11J20002", "안주": "11J20004", "양덕": "11J20005", "청진": "11K10001", "웅기(선봉)": "11K10002", "성진(김책)": "11K10003", "무산(삼지연)": "11K10004", "함흥": "11K20001", "장진": "11K20002", "북청(신포)": "11K20003", "혜산": "11K20004", "풍산": "11K20005", "원산": "11L10001", "고성(장전)": "11L10002", "평강": "11L10003", "군산": "21F10501", "김제": "21F10502", "고창": "21F10601", "부안": "21F10602", "함평": "21F20101", "영광": "21F20102", "진도": "21F20201", "목포": "21F20801", "영암": "21F20802", "신안": "21F20803", "무안": "21F20804"};

const GANGWON_YEONGDONG = ['강릉시','속초시','동해시','삼척시','고성군','양양군'];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');

  const WEATHER_KEY = process.env.WEATHER_API_KEY;
  const KAKAO_KEY   = process.env.KAKAO_API_KEY;
  const DUST_KEY    = process.env.AIRKOREA_API_KEY;

  if (!WEATHER_KEY) {
    return res.status(500).json({ ok: false, error: '날씨 API 키 없음' });
  }

  const type = req.query.type || 'current';
  const lat = parseFloat(req.query.lat) || 37.5665;
  const lon = parseFloat(req.query.lon) || 126.9780;

  // ── 공통 함수: GPS → 카카오 주소변환 ──
  async function resolveRegion() {
    let sido = '', sigu = '', dong = '', cityName = '내 지역';
    if (KAKAO_KEY) {
      try {
        const kakaoUrl = `https://dapi.kakao.com/v2/local/geo/coord2regioncode.json?x=${lon}&y=${lat}`;
        const kakaoRes = await fetch(kakaoUrl, { headers: { 'Authorization': 'KakaoAK ' + KAKAO_KEY } });
        const kakaoData = await kakaoRes.json();
        const docs = kakaoData?.documents;
        if (docs && docs.length > 0) {
          const region = docs.find(d => d.region_type === 'H') || docs[0];
          sido = region.region_1depth_name || '';
          sigu = region.region_2depth_name || '';
          dong = region.region_3depth_name || '';
          const sidoShort = sido.replace('특별자치시','').replace('특별자치도','').replace('특별시','').replace('광역시','').trim();
          cityName = [sidoShort, sigu, dong].filter(Boolean).join(' ');
        }
      } catch (e) { /* 기본값 유지 */ }
    }
    return { sido, sigu, dong, cityName };
  }

  // ── 공통 함수: 위도/경도 → 기상청 격자 좌표(nx, ny) ──
  function latLonToGrid(lat, lon) {
    const RE = 6371.00877, GRID = 5.0, SLAT1 = 30.0, SLAT2 = 60.0, OLON = 126.0, OLAT = 38.0, XO = 43, YO = 136;
    const DEGRAD = Math.PI / 180.0;
    const re = RE / GRID, slat1 = SLAT1 * DEGRAD, slat2 = SLAT2 * DEGRAD, olon = OLON * DEGRAD, olat = OLAT * DEGRAD;
    let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
    sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
    let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
    sf = Math.pow(sf, sn) * Math.cos(slat1) / sn;
    let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
    ro = re * sf / Math.pow(ro, sn);
    let ra = Math.tan(Math.PI * 0.25 + lat * DEGRAD * 0.5);
    ra = re * sf / Math.pow(ra, sn);
    let theta = lon * DEGRAD - olon;
    if (theta > Math.PI) theta -= 2.0 * Math.PI;
    if (theta < -Math.PI) theta += 2.0 * Math.PI;
    theta *= sn;
    const nx = Math.floor(ra * Math.sin(theta) + XO + 0.5);
    const ny = Math.floor(ro - ra * Math.cos(theta) + YO + 0.5);
    return { nx, ny };
  }

  // ── 공통 함수: 한국시간(KST) 계산 ──
  function getKst() {
    const now = new Date();
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    return {
      year: kst.getUTCFullYear(),
      month: String(kst.getUTCMonth() + 1).padStart(2, '0'),
      day: String(kst.getUTCDate()).padStart(2, '0'),
      hour: kst.getUTCHours(),
      min: kst.getUTCMinutes(),
      dateObj: kst,
    };
  }

  try {
    // ════════════════════════════════════════════
    // [기본] 현재 날씨 (기존 기능, 100% 그대로 유지)
    // ════════════════════════════════════════════
    if (type === 'current') {
      const { cityName } = await resolveRegion();
      const { nx, ny } = latLonToGrid(lat, lon);
      const kst = getKst();

      let baseDate = `${kst.year}${kst.month}${kst.day}`;
      const releaseTimes = [2, 5, 8, 11, 14, 17, 20, 23];
      let baseHour = 23;
      for (let i = releaseTimes.length - 1; i >= 0; i--) {
        if (kst.hour > releaseTimes[i] || (kst.hour === releaseTimes[i] && kst.min >= 10)) { baseHour = releaseTimes[i]; break; }
      }
      if (kst.hour < 2 || (kst.hour === 2 && kst.min < 10)) {
        const yesterday = new Date(kst.dateObj.getTime() - 24 * 60 * 60 * 1000);
        baseDate = `${yesterday.getUTCFullYear()}${String(yesterday.getUTCMonth()+1).padStart(2,'0')}${String(yesterday.getUTCDate()).padStart(2,'0')}`;
        baseHour = 23;
      }
      const baseTime = String(baseHour).padStart(2, '0') + '00';

      const url = `http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst`
        + `?serviceKey=${encodeURIComponent(WEATHER_KEY)}&pageNo=1&numOfRows=100&dataType=JSON`
        + `&base_date=${baseDate}&base_time=${baseTime}&nx=${nx}&ny=${ny}`;

      const apiRes = await fetch(url);
      const apiData = await apiRes.json();
      const items = apiData?.response?.body?.items?.item;
      if (!items || items.length === 0) return res.status(200).json({ ok: false, error: '날씨 데이터 없음' });

      let tmp = null, sky = null, pty = null, pop = null;
      const targetHour = String(kst.hour).padStart(2, '0') + '00';
      items.forEach(function(item) {
        if (item.fcstTime === targetHour || tmp === null) {
          if (item.category === 'TMP') tmp = item.fcstValue;
          if (item.category === 'SKY') sky = item.fcstValue;
          if (item.category === 'PTY') pty = item.fcstValue;
          if (item.category === 'POP') pop = item.fcstValue;
        }
      });

      let icon = '☀️', state = '맑음';
      if (pty === '1') { icon = '🌧️'; state = '비'; }
      else if (pty === '3') { icon = '❄️'; state = '눈'; }
      else if (pty === '4') { icon = '🌦️'; state = '소나기'; }
      else if (sky === '4') { icon = '☁️'; state = '흐림'; }
      else if (sky === '3') { icon = '⛅'; state = '구름많음'; }

      let msg;
      if (kst.hour < 6) msg = '이른 새벽, 건강 챙기세요!';
      else if (kst.hour < 12) msg = '상쾌한 아침입니다! 😊';
      else if (kst.hour < 18) msg = '오늘도 좋은 하루 되세요!';
      else msg = '편안한 저녁 되세요! 🌙';

      return res.status(200).json({
        ok: true, icon, temp: tmp ? tmp + '°C' : '--°C', state, pop: pop ? pop + '%' : '0%', msg, city: cityName
      });
    }

    // ════════════════════════════════════════════
    // [warning] 폭염·한파 등 기상특보 확인
    // ════════════════════════════════════════════
    if (type === 'warning') {
      const { sigu, sido, cityName } = await resolveRegion();
      // (한글 설명) 시/군/구 이름으로 먼저 찾아보고, 없으면 시/도 이름으로 찾아요
      const stnId = WARN_CODES[sigu] || WARN_CODES[sido] || WARN_CODES['전국'];

      const kst = getKst();
      const now = kst.dateObj;
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const fmt = (d) => `${d.getUTCFullYear()}${String(d.getUTCMonth()+1).padStart(2,'0')}${String(d.getUTCDate()).padStart(2,'0')}${String(d.getUTCHours()).padStart(2,'0')}${String(d.getUTCMinutes()).padStart(2,'0')}`;
      const fromTmFc = fmt(yesterday);
      const toTmFc = fmt(now);

      const url = `http://apis.data.go.kr/1360000/WthrWrnInfoService/getWthrWrnList`
        + `?serviceKey=${encodeURIComponent(WEATHER_KEY)}&pageNo=1&numOfRows=10&dataType=JSON`
        + `&stnId=${stnId}&fromTmFc=${fromTmFc}&toTmFc=${toTmFc}`;

      if (req.query.debug === '1') {
        const r = await fetch(url);
        const t = await r.text();
        return res.status(200).json({ ok: true, debug: true, stnId, requestUrl: url.replace(WEATHER_KEY, '(키-숨김)'), rawSample: t.slice(0, 2000) });
      }

      const apiRes = await fetch(url);
      const apiData = await apiRes.json();
      const items = apiData?.response?.body?.items?.item;
      const list = items ? (Array.isArray(items) ? items : [items]) : [];

      // (한글 설명) title(제목) 글자 안에서 "폭염"·"한파" + "경보"·"주의보" 글자를 직접 찾아요.
      //             제일 최근(첫번째) 항목만 확인하면 돼요(발표시각 내림차순으로 옴).
      let result = { ok: true, hasWarning: false };
      if (list.length > 0) {
        const title = list[0].title || '';
        let wtype = null;
        if (title.includes('폭염')) wtype = 'heat';
        else if (title.includes('한파')) wtype = 'cold';
        if (wtype) {
          const level = title.includes('경보') ? '경보' : (title.includes('주의보') ? '주의보' : '특보');
          result.hasWarning = true;
          result.warnType = wtype;
          result.level = level;
          result.title = title;
        }
      }
      result.city = cityName;
      return res.status(200).json(result);
    }

    // ════════════════════════════════════════════
    // [dust] 미세먼지·초미세먼지 실시간 정보
    // ════════════════════════════════════════════
    if (type === 'dust') {
      if (!DUST_KEY) return res.status(200).json({ ok: false, error: '미세먼지 API 키 없음' });
      const { sido, cityName } = await resolveRegion();
      const sidoShort = sido.replace('특별자치시','').replace('특별자치도','').replace('특별시','').replace('광역시','').trim() || '서울';

      // (한글 설명) TM좌표 변환 없이, 시/도 이름으로 그 지역 측정소들을 검색해서
      //             WGS84 좌표(GPS와 같은 방식)로 제일 가까운 곳을 직접 골라요.
      const listUrl = `http://apis.data.go.kr/B552584/MsrstnInfoInqireSvc/getMsrstnList`
        + `?serviceKey=${encodeURIComponent(DUST_KEY)}&returnType=json&numOfRows=100&pageNo=1`
        + `&addr=${encodeURIComponent(sidoShort)}&ver=1.1`;

      const listRes = await fetch(listUrl);
      const listData = await listRes.json();
      const stations = listData?.response?.body?.items || [];

      if (!stations.length) return res.status(200).json({ ok: false, error: '측정소를 찾을 수 없어요', city: cityName });

      // (한글 설명) ver=1.1이면 dmX=경도, dmY=위도예요(활용가이드로 확인함).
      function dist(sLat, sLon) {
        return Math.sqrt(Math.pow(sLat - lat, 2) + Math.pow(sLon - lon, 2));
      }
      let nearest = null, minDist = Infinity;
      stations.forEach(function(s) {
        const sLon = parseFloat(s.dmX), sLat = parseFloat(s.dmY);
        if (isNaN(sLon) || isNaN(sLat)) return;
        const d = dist(sLat, sLon);
        if (d < minDist) { minDist = d; nearest = s; }
      });

      if (!nearest) return res.status(200).json({ ok: false, error: '가까운 측정소를 찾을 수 없어요', city: cityName });

      const rtUrl = `http://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getMsrstnAcctoRltmMesureDnsty`
        + `?serviceKey=${encodeURIComponent(DUST_KEY)}&returnType=json&numOfRows=1&pageNo=1`
        + `&stationName=${encodeURIComponent(nearest.stationName)}&dataTerm=DAILY&ver=1.3`;

      if (req.query.debug === '1') {
        const r = await fetch(rtUrl);
        const t = await r.text();
        return res.status(200).json({ ok: true, debug: true, nearestStation: nearest.stationName, requestUrl: rtUrl.replace(DUST_KEY, '(키-숨김)'), rawSample: t.slice(0, 2000) });
      }

      const rtRes = await fetch(rtUrl);
      const rtData = await rtRes.json();
      const rtItems = rtData?.response?.body?.items || [];
      const latest = rtItems[0];

      if (!latest) return res.status(200).json({ ok: false, error: '측정값을 찾을 수 없어요', city: cityName });

      const GRADE_TEXT = { '1': '좋음', '2': '보통', '3': '나쁨', '4': '매우나쁨' };
      const GRADE_COLOR = { '1': '#2e7d32', '2': '#f9a825', '3': '#e65100', '4': '#c62828' };

      return res.status(200).json({
        ok: true,
        city: cityName,
        stationName: nearest.stationName,
        pm10: latest.pm10Value || '-',
        pm10Grade: GRADE_TEXT[latest.pm10Grade] || '정보없음',
        pm10Color: GRADE_COLOR[latest.pm10Grade] || '#888',
        pm25: latest.pm25Value || '-',
        pm25Grade: GRADE_TEXT[latest.pm25Grade] || '정보없음',
        pm25Color: GRADE_COLOR[latest.pm25Grade] || '#888',
        dataTime: latest.dataTime || '',
      });
    }

    // ════════════════════════════════════════════
    // [weekly] 일주일 날씨 (오늘~3일 단기예보 + 4~7일 중기예보)
    // ════════════════════════════════════════════
    if (type === 'weekly') {
      const { sido, sigu, cityName } = await resolveRegion();
      const { nx, ny } = latLonToGrid(lat, lon);
      const kst = getKst();

      // ── 1) 오늘~3일: 단기예보(시간별)를 날짜별로 묶어서 최고/최저 뽑기 ──
      let baseDate = `${kst.year}${kst.month}${kst.day}`;
      const releaseTimes = [2, 5, 8, 11, 14, 17, 20, 23];
      let baseHour = 23;
      for (let i = releaseTimes.length - 1; i >= 0; i--) {
        if (kst.hour > releaseTimes[i] || (kst.hour === releaseTimes[i] && kst.min >= 10)) { baseHour = releaseTimes[i]; break; }
      }
      if (kst.hour < 2 || (kst.hour === 2 && kst.min < 10)) {
        const yesterday = new Date(kst.dateObj.getTime() - 24 * 60 * 60 * 1000);
        baseDate = `${yesterday.getUTCFullYear()}${String(yesterday.getUTCMonth()+1).padStart(2,'0')}${String(yesterday.getUTCDate()).padStart(2,'0')}`;
        baseHour = 23;
      }
      const baseTime = String(baseHour).padStart(2, '0') + '00';

      const shortUrl = `http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst`
        + `?serviceKey=${encodeURIComponent(WEATHER_KEY)}&pageNo=1&numOfRows=1000&dataType=JSON`
        + `&base_date=${baseDate}&base_time=${baseTime}&nx=${nx}&ny=${ny}`;

      const shortRes = await fetch(shortUrl);
      const shortData = await shortRes.json();
      const shortItems = shortData?.response?.body?.items?.item || [];

      // 날짜별로 그룹핑
      const byDate = {};
      shortItems.forEach(function(it) {
        if (!byDate[it.fcstDate]) byDate[it.fcstDate] = {};
        const d = byDate[it.fcstDate];
        if (it.category === 'TMP') {
          const v = parseFloat(it.fcstValue);
          if (d.tmin === undefined || v < d.tmin) d.tmin = v;
          if (d.tmax === undefined || v > d.tmax) d.tmax = v;
        }
        if (it.category === 'SKY' && it.fcstTime === '1200') d.sky = it.fcstValue;
        if (it.category === 'PTY' && it.fcstTime === '1200') d.pty = it.fcstValue;
        if (it.category === 'POP') {
          const v = parseInt(it.fcstValue, 10);
          if (d.pop === undefined || v > d.pop) d.pop = v;
        }
      });

      function skyIcon(sky, pty) {
        if (pty === '1') return '🌧️';
        if (pty === '3') return '❄️';
        if (pty === '4') return '🌦️';
        if (sky === '4') return '☁️';
        if (sky === '3') return '⛅';
        return '☀️';
      }

      const dayLabels = ['오늘','내일','모레'];
      const dates = Object.keys(byDate).sort().slice(0, 3);
      const days = dates.map(function(dt, idx) {
        const d = byDate[dt];
        return {
          label: dayLabels[idx] || dt,
          date: dt,
          icon: skyIcon(d.sky, d.pty),
          tmax: d.tmax !== undefined ? Math.round(d.tmax) : null,
          tmin: d.tmin !== undefined ? Math.round(d.tmin) : null,
          pop: d.pop !== undefined ? d.pop : null,
          predicted: false,
        };
      });

      // ── 2) 4~7일: 중기예보(육상+기온) ──
      // (한글 설명) LAND_CODES는 시/도 단위 이름표라서 시/군/구 이름으로는 못 찾아요.
      //             강원도만 영동/영서로 나뉘어서 시/군/구까지 봐야 하고, 나머지는 시/도만 보면 돼요.
      let landCode;
      if (sido.includes('강원')) {
        landCode = GANGWON_YEONGDONG.includes(sigu) ? LAND_CODES['강원도영동'] : LAND_CODES['강원도영서'];
      } else {
        const sidoNorm = sido.replace('특별자치도','').replace('특별자치시','').replace('특별시','').replace('광역시','').trim();
        landCode = LAND_CODES[sido] || LAND_CODES[sidoNorm]
          || (sidoNorm === '전북' ? LAND_CODES['전북자치도'] : null)
          || LAND_CODES['서울'];
      }
      const tempCode = TEMP_CODES[sigu ? sigu.replace(/(광역시|특별시|시|군|구)$/, '') : ''] || TEMP_CODES['서울'];

      // 중기예보 발표시각(최근 06 또는 18시 KST, 최근 24시간만 제공)
      let midHour = kst.hour >= 18 ? 18 : (kst.hour >= 6 ? 6 : 18);
      let midDateObj = kst.dateObj;
      if (kst.hour < 6) {
        midDateObj = new Date(kst.dateObj.getTime() - 24 * 60 * 60 * 1000);
      }
      const midTmFc = `${midDateObj.getUTCFullYear()}${String(midDateObj.getUTCMonth()+1).padStart(2,'0')}${String(midDateObj.getUTCDate()).padStart(2,'0')}${String(midHour).padStart(2,'0')}00`;

      const dayNames = ['일','월','화','수','목','금','토'];
      const midDays = [];
      try {
        const landUrl = `http://apis.data.go.kr/1360000/MidFcstInfoService/getMidLandFcst`
          + `?serviceKey=${encodeURIComponent(WEATHER_KEY)}&numOfRows=10&pageNo=1&dataType=JSON`
          + `&regId=${landCode}&tmFc=${midTmFc}`;
        const taUrl = `http://apis.data.go.kr/1360000/MidFcstInfoService/getMidTa`
          + `?serviceKey=${encodeURIComponent(WEATHER_KEY)}&numOfRows=10&pageNo=1&dataType=JSON`
          + `&regId=${tempCode}&tmFc=${midTmFc}`;

        if (req.query.debug === '1') {
          const [lr, tr] = await Promise.all([fetch(landUrl), fetch(taUrl)]);
          const [lt, tt] = await Promise.all([lr.text(), tr.text()]);
          return res.status(200).json({
            ok: true, debug: true, landCode, tempCode, midTmFc,
            landUrl: landUrl.replace(WEATHER_KEY, '(키-숨김)'), landRaw: lt.slice(0, 1500),
            taUrl: taUrl.replace(WEATHER_KEY, '(키-숨김)'), taRaw: tt.slice(0, 1500),
          });
        }

        const [landRes, taRes] = await Promise.all([fetch(landUrl), fetch(taUrl)]);
        const [landData, taData] = await Promise.all([landRes.json(), taRes.json()]);
        const landItem = (landData?.response?.body?.items?.item || [])[0] || {};
        const taItem = (taData?.response?.body?.items?.item || [])[0] || {};

        for (let n = 4; n <= 7; n++) {
          const wfAm = landItem['wf' + n + 'Am'] || landItem['wf' + n] || '';
          const wfPm = landItem['wf' + n + 'Pm'] || landItem['wf' + n] || '';
          const wfText = wfPm || wfAm || '';
          let icon = '☀️';
          if (wfText.includes('비') && wfText.includes('눈')) icon = '🌨️';
          else if (wfText.includes('소나기')) icon = '🌦️';
          else if (wfText.includes('비')) icon = '🌧️';
          else if (wfText.includes('눈')) icon = '❄️';
          else if (wfText.includes('흐림')) icon = '☁️';
          else if (wfText.includes('구름')) icon = '⛅';

          const popAm = landItem['rnSt' + n + 'Am'];
          const popPm = landItem['rnSt' + n + 'Pm'];
          const popSingle = landItem['rnSt' + n];
          const pop = popPm !== undefined ? popPm : (popAm !== undefined ? popAm : popSingle);

          const targetDate = new Date(kst.dateObj.getTime() + (n - (kst.hour < 6 ? 1 : 0)) * 24 * 60 * 60 * 1000);
          const label = dayNames[targetDate.getUTCDay()] + '요일';

          midDays.push({
            label: label,
            icon: icon,
            tmax: taItem['taMax' + n] !== undefined ? taItem['taMax' + n] : null,
            tmin: taItem['taMin' + n] !== undefined ? taItem['taMin' + n] : null,
            pop: pop !== undefined ? pop : null,
            predicted: true,
          });
        }
      } catch (e) {
        // 중기예보 실패해도 단기예보(3일)까지는 보여줄 수 있게 조용히 넘어가요
      }

      return res.status(200).json({ ok: true, city: cityName, days: days.concat(midDays) });
    }

    return res.status(400).json({ ok: false, error: '알 수 없는 type' });

  } catch (err) {
    return res.status(200).json({ ok: false, error: err.message });
  }
}
