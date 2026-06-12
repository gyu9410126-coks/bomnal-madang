with open("index.html", "r", encoding="utf-8") as f:
    content = f.read()

old = '<a href="contact.html" class="footer-link">문의하기</a>\n</footer>'
new = '<a href="contact.html" class="footer-link">문의하기</a>\n  <span class="footer-dot">·</span>\n  <a href="about.html" class="footer-link">봄날마당 소개</a>\n</footer>'

if old in content:
    content = content.replace(old, new)
    with open("index.html", "w", encoding="utf-8") as f:
        f.write(content)
    print("index.html 소개 링크 추가 완료 ✅")
else:
    print("⚠️ 삽입 위치를 찾지 못했습니다!")