files = ["index.html", "market.html", "benefit.html", "fortune.html"]

old = "이 링크로 구매하셔도 어르신이 내시는 금액은 똑같습니다. 작은 정성이 봄날마당을 더 좋게 만드는 데 쓰입니다 💛"
new = "이 링크로 구매 시 봄날마당이 쿠팡에서 소정의 수수료를 받습니다. 어르신께서 내시는 금액은 동일합니다."

for f in files:
    with open(f, "r", encoding="utf-8") as file:
        content = file.read()
    if old in content:
        content = content.replace(old, new)
        with open(f, "w", encoding="utf-8") as file:
            file.write(content)
        print(f + " 교체 완료 ✅")
    else:
        print(f + " ⚠️ 문구 없음 — 확인 필요")