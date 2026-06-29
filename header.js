/* ================================================
   header.js — 시니어 봄날마당 공통 헤더
   ================================================ */

/* document.write로 헤더 HTML 즉시 출력
   (script 태그가 실행되는 그 자리에 바로 삽입됨)
   비유: 도장을 찍는 순간 그 자리에 바로 도장이 찍힘 */
document.write(
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
  '</div>'
);

/* 날짜 표시 (양력) */
(function(){
  var d = new Date();
  var days = ['일','월','화','수','목','금','토'];
  var el = document.getElementById('date-solar');
  if (el) {
    el.textContent = (d.getMonth()+1)+'월 '+d.getDate()+'일 ('+days[d.getDay()]+')';
  }
})();
