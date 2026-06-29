/* ================================================
   header.js — 시니어 봄날마당 공통 헤더
   모든 카테고리 페이지에서 공유하는 헤더 HTML + 날짜 표시
   ================================================ */
(function () {

  /* ── ① 헤더 HTML을 페이지 맨 위에 삽입 ── */
  var headerHTML =
    '<div class="app-header" id="common-header">' +
      '<div class="header-left">' +
        '<span style="font-size:22px;">🌸</span>' +
        '<div>' +
          '<span class="logo-senior">시니어</span> ' +
          '<span class="logo-bomnal">봄날마당</span>' +
        '</div>' +
      '</div>' +
      '<div class="header-date-box">' +
        '<span class="header-date-solar" id="date-solar">날짜 로딩중</span>' +
        '<span class="header-date-lunar" id="date-lunar"></span>' +
      '</div>' +
    '</div>';

  /* body 안의 첫 번째 .wrap div 앞에 헤더 삽입 */
  var wrap = document.querySelector('.wrap');
  if (wrap) {
    wrap.insertAdjacentHTML('afterbegin', headerHTML);
  }

  /* ── ② 날짜 표시 (양력) ── */
  var d = new Date();
  var days = ['일', '월', '화', '수', '목', '금', '토'];
  var solarEl = document.getElementById('date-solar');
  if (solarEl) {
    solarEl.textContent =
      (d.getMonth() + 1) + '월 ' + d.getDate() + '일 (' + days[d.getDay()] + ')';
  }

  /* ── ③ 날짜 표시 (음력) — lunar.js가 있으면 사용, 없으면 빈칸 ── */
  /* lunar.js를 별도로 로드하는 페이지는 그쪽에서 date-lunar를 채움 */
  /* 이 파일에서는 빈 상태로 두어 에러 없이 작동하게 함 */

})();
