with open("style.css", "r", encoding="utf-8") as f:
    content = f.read()

old = "* { box-sizing: border-box; margin: 0; padding: 0; }"

new = """/* ===== 다크모드 강제 해제 — 항상 밝은 화면 유지 ===== */
/* 스마트폰을 다크모드로 설정해도 이 앱은 항상 흰 배경으로 보입니다 */
:root { color-scheme: light only; }
html, body {
  background-color: #ffffff !important;
  color: #222222 !important;
  -webkit-color-scheme: light !important; /* 아이폰 사파리 전용 */
}
@media (prefers-color-scheme: dark) {
  html, body {
    background-color: #ffffff !important;
    color: #222222 !important;
  }
  * {
    color: inherit !important;
    background-color: inherit !important;
    border-color: inherit !important;
  }
}

* { box-sizing: border-box; margin: 0; padding: 0; }"""

if old in content:
    content = content.replace(old, new)
    with open("style.css", "w", encoding="utf-8") as f:
        f.write(content)
    print("style.css 다크모드 강제 해제 완료 ✅")
else:
    print("⚠️ 삽입 위치를 찾지 못했습니다!")