with open("index.html", "r", encoding="utf-8") as f:
    content = f.read()

footer = """
<footer class="site-footer">
  <a href="privacy.html" class="footer-link">개인정보처리방침 및 이용약관</a>
  <span class="footer-dot">·</span>
  <a href="mailto:bomnal.madang@gmail.com" class="footer-link">문의하기</a>
</footer>"""

old = "</script>\n</body>"
new = "</script>" + footer + "\n</body>"

if old in content:
    content = content.replace(old, new)
    with open("index.html", "w", encoding="utf-8") as f:
        f.write(content)
    print("index.html footer 추가 완료 ✅")
else:
    print("⚠️ 삽입 위치를 찾지 못했습니다. 확인 필요!")