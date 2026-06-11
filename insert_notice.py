import re

files = ["index.html", "market.html", "benefit.html", "fortune.html"]
notice = '<p class="coupang-notice">이 링크로 구매 시 봄날마당이 쿠팡에서 소정의 수수료를 받습니다. 어르신께서 내시는 금액은 동일합니다.</p>\n'

for f in files:
    with open(f, "r", encoding="utf-8") as file:
        content = file.read()
    new_content = re.sub(r'(<a [^>]*href="https://link\.coupang\.com)', notice + r'\1', content)
    with open(f, "w", encoding="utf-8") as file:
        file.write(new_content)
    print(f + " 완료 ✅")