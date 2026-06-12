with open("style.css", "r", encoding="utf-8") as f:
    content = f.read()

# 잘못된 다크모드 코드 제거 후 올바른 코드로 교체
old = """:root { color-scheme: light only; }
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
}"""

new = """:root { color-scheme: light only; }
html, body {
  background-color: #ffffff !important;
  color: #222222 !important;
}
@media (prefers-color-scheme: dark) {
  html { background-color: #ffffff !important; }
  body { background-color: #ffffff !important; color: #222222 !important; }
}"""

if old in content:
    content = content.replace(old, new)
    with open("style.css", "w", encoding="utf-8") as f:
        f.write(content)
    print("style.css 다크모드 코드 수정 완료 ✅")
else:
    print("⚠️ 해당 코드를 찾지 못했습니다!")