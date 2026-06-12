with open("style.css", "r", encoding="utf-8") as f:
    content = f.read()

old = """.banner-img-slide {
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

new = """.banner-color-slide {
  position: relative;
  overflow: hidden;
  padding: 0;
  height: 220px;
  cursor: pointer;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.banner-text-area {
  position: relative;
  z-index: 2;
  padding: 24px 0 24px 24px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  width: 55%;
}
.banner-text-area .banner-title {
  font-size: 22px;
  font-weight: 900;
  color: #ffffff;
  margin-bottom: 8px;
  line-height: 1.3;
  word-break: keep-all;
  text-shadow: 0 1px 3px rgba(0,0,0,0.2);
}
.banner-text-area .banner-desc {
  font-size: 15px;
  color: rgba(255,255,255,0.9);
  margin-bottom: 14px;
  line-height: 1.5;
  word-break: keep-all;
}
.banner-btn {
  display: inline-block;
  background: rgba(255,255,255,0.25);
  border: 2px solid rgba(255,255,255,0.8);
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  padding: 8px 16px;
  border-radius: 20px;
  width: fit-content;
  white-space: nowrap;
  backdrop-filter: blur(4px);
}
.banner-char-img {
  position: absolute;
  right: 0;
  bottom: 0;
  height: 100%;
  width: 50%;
  object-fit: cover;
  object-position: left center;
  mask-image: linear-gradient(to left, rgba(0,0,0,1) 40%, rgba(0,0,0,0) 100%);
  -webkit-mask-image: linear-gradient(to left, rgba(0,0,0,1) 40%, rgba(0,0,0,0) 100%);
}"""

if old in content:
    content = content.replace(old, new)
    with open("style.css", "w", encoding="utf-8") as f:
        f.write(content)
    print("style.css 배너 이로움돌봄 스타일 완료 ✅")
else:
    print("⚠️ 해당 코드를 찾지 못했습니다!")