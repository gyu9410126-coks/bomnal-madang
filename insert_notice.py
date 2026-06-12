with open("index.html", "r", encoding="utf-8") as f:
    content = f.read()

# switchTab 함수 안에 pushState 추가
old = """function switchTab(tabId) {
  // 모든 탭 콘텐츠 숨기기"""

new = """function switchTab(tabId, fromPopState) {
  // 뒤로가기 히스토리 기록 (popstate에서 호출된 경우 제외)
  if (!fromPopState) {
    history.pushState({ tab: tabId }, '', '#' + tabId);
  }
  // 모든 탭 콘텐츠 숨기기"""

# popstate 이벤트 리스너 추가 (</script> 바로 앞에)
old2 = """  result.style.display = 'block';
}
</script>"""

new2 = """  result.style.display = 'block';
}

// 뒤로가기 누르면 이전 탭으로 이동
window.addEventListener('popstate', function(e) {
  if (e.state && e.state.tab) {
    switchTab(e.state.tab, true);
  } else {
    switchTab('home', true);
  }
});

// 최초 진입 시 홈탭 히스토리 기록
window.addEventListener('DOMContentLoaded', function() {
  history.replaceState({ tab: 'home' }, '', '#home');
});
</script>"""

if old in content and old2 in content:
    content = content.replace(old, new)
    content = content.replace(old2, new2)
    with open("index.html", "w", encoding="utf-8") as f:
        f.write(content)
    print("index.html 뒤로가기 튕김 방지 완료 ✅")
else:
    if old not in content:
        print("⚠️ switchTab 함수를 찾지 못했습니다!")
    if old2 not in content:
        print("⚠️ popstate 삽입 위치를 찾지 못했습니다!")