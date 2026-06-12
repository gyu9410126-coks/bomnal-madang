content = """{
  "routes": [
    { "handle": "filesystem" },
    { "src": "/(.*)", "dest": "/404.html", "status": 404 }
  ]
}"""

with open("vercel.json", "w", encoding="utf-8") as f:
    f.write(content)

print("vercel.json 재생성 완료 ✅")