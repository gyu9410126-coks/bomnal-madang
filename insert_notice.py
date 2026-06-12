with open("style.css", "r", encoding="utf-8") as f:
    content = f.read()

old = """.banner-img-slide {
  position: relative;
  overflow: hidden;
  padding: 0;
  height: 160px;
  cursor: pointer;
}
.banner-bg-img {
  position: absolute;
  top: 0; right: 0;
  width: 58%;
  height: 100%;
  object-fit: contain;
  object-position: right center;
}
.banner-overlay {
  position: absolute;
  top: 0; left: 0;
  width: 48%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 12px 0 12px 16px;
  background: linear-gradient(to right, rgba(255,255,255,1) 70%, rgba(255,255,255,0));
}
.banner-overlay .banner-title {
  font-size: 17px;
  font-weight: 900;
  color: #1a1a1a;
  margin-bottom: 4px;
  line-height: 1.3;
  word-break: keep-all;
  white-space: nowrap;
}
.banner-overlay .banner-desc {
  font-size: 12px;
  color: #555;
  margin-bottom: 8px;
  line-height: 1.4;
  word-break: keep-all;
}
.banner-btn {
  display: inline-block;
  background: #1a6fc4;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  padding: 5px 10px;
  border-radius: 20px;
  width: fit-content;
  white-space: nowrap;
}"""

new = """.banner-img-slide {
  position: relative;
  overflow: hidden;
  padding: 0;
  height: 200px;
  cursor: pointer;
  border-radius: 16px;
}
.banner-bg-img {
  position: absolute;
  top: 0; left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: right center;
}
.banner-overlay {
  position: absolute;
  top: 0; left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 20px 20px 20px 20px;
  background: linear-gradient(to right, rgba(255,255,255,0.95) 45%, rgba(255,255,255,0.3) 70%, rgba(255,255,255,0) 100%);
}
.banner-overlay .banner-title {
  font-size: 20px;
  font-weight: 900;
  color: #1a1a1a;
  margin-bottom: 6px;
  line-height: 1.3;
  word-break: keep-all;
  max-width: 55%;
}
.banner-overlay .banner-desc {
  font-size: 14px;
  color: #444;
  margin-bottom: 12px;
  line-height: 1.5;
  word-break: keep-all;
  max-width: 55%;
}
.banner-btn {
  display: inline-block;
  background: #1a6fc4;
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  padding: 8px 16px;
  border-radius: 20px;
  width: fit-content;
  white-space: nowrap;
}"""

if old in content:
    content = content.replace(old, new)
    with open("style.css", "w", encoding="utf-8") as f:
        f.write(content)
    print("style.css 배너 완벽 수정 완료 ✅")
else:
    print("⚠️ 해당 코드를 찾지 못했습니다!")