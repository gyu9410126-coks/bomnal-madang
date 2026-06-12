with open("index.html", "r", encoding="utf-8") as f:
    content = f.read()

# 헤더 로고 중복 제거 (🌸 두 번 나오는 것 수정)
old1 = '''    <span class="header-logo" onclick="switchTab('home')" style="cursor:pointer">🌸</span>
    <div class="header-title">🌸 시니어 봄날마당</div>'''

new1 = '''    <span class="header-logo" onclick="switchTab('home')" style="cursor:pointer">🌸</span>
    <div class="header-title">시니어 봄날마당</div>'''

if old1 in content:
    content = content.replace(old1, new1)
    print("헤더 로고 중복 제거 완료 ✅")
else:
    print("⚠️ 헤더 코드를 찾지 못했습니다!")

with open("index.html", "w", encoding="utf-8") as f:
    f.write(content)

# style.css 수정
with open("style.css", "r", encoding="utf-8") as f:
    css = f.read()

# 1. 전체 컨테이너 max-width 추가
old2 = """* { box-sizing: border-box; margin: 0; padding: 0; }"""

new2 = """* { box-sizing: border-box; margin: 0; padding: 0; }

/* ===== PC 전체창 레이아웃 중앙정렬 ===== */
body {
  max-width: 1200px;
  margin: 0 auto;
}
@media (min-width: 600px) {
  .app-header {
    max-width: 1200px;
    margin: 0 auto;
    left: 50%;
    transform: translateX(-50%);
    width: 100%;
  }
  .bottom-nav {
    max-width: 1200px;
    margin: 0 auto;
    left: 50%;
    transform: translateX(-50%);
  }
  .banner-wrap {
    max-width: 600px;
    margin: 12px auto 0 auto;
  }
}"""

if old2 in css:
    css = css.replace(old2, new2)
    print("PC 레이아웃 max-width 추가 완료 ✅")
else:
    print("⚠️ CSS 컨테이너 코드를 찾지 못했습니다!")

# 2. 퀵메뉴 텍스트 잘림 방지
old3 = """.quick-menu-grid {"""

# 퀵메뉴 관련 CSS 찾아서 텍스트 잘림 방지 추가
import re
pattern = r'(\.quick-menu-item\s*\{[^}]*\})'
match = re.search(pattern, css)
if match:
    old_item = match.group(0)
    if 'overflow' not in old_item:
        new_item = old_item.rstrip('}') + '''
  overflow: hidden;
}'''
        css = css.replace(old_item, new_item)
        print("퀵메뉴 텍스트 잘림 방지 완료 ✅")
else:
    print("⚠️ 퀵메뉴 CSS를 찾지 못했습니다!")

with open("style.css", "w", encoding="utf-8") as f:
    f.write(css)

print("\n전체 작업 완료!")