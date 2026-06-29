/* ================================================
   home-bar.js — 시니어 봄날마당 공통 홈으로 버튼
   카테고리 페이지(8개)에서만 사용
   헤더 바로 아래에 홈으로 버튼을 삽입
   ================================================ */
(function () {

  var homeBarHTML =
    '<div class="home-bar" id="common-home-bar">' +
      '<button onclick="location.href=\'index.html\'">🏠 홈으로</button>' +
    '</div>';

  /* 공통 헤더(#common-header) 바로 뒤에 삽입 */
  var header = document.getElementById('common-header');
  if (header) {
    header.insertAdjacentHTML('afterend', homeBarHTML);
  }

})();
