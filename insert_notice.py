with open("index.html", "r", encoding="utf-8") as f:
    content = f.read()

old = '<a href="mailto:bomnal.madang@gmail.com" class="footer-link">문의하기</a>'
new = '<a href="contact.html" class="footer-link">문의하기</a>'

if old in content:
    content = content.replace(old, new)
    with open("index.html", "w", encoding="utf-8") as f:
        f.write(content)
    print("index.html 문의하기 링크 교체 완료 ✅")
else:
    print("⚠️ 해당 문구를 찾지 못했습니다!")