with open("style.css", "r", encoding="utf-8") as f:
    content = f.read()

old = """.banner-wrap {
  position: relative;
  overflow: hidden;
  border-radius: 16px;
  margin: 12px 16px 0 16px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.12);
}
.banner-slider {
  display: flex;
  transition: transform 0.4s ease;
  will-change: transform;
}
.banner-slide {
  min-width: 100%;
  padding: 24px 20px;
  display: flex;
  align-items: center;
  gap: 14px;
  cursor: pointer;
  border-radius: 16px;
}
.banner-icon {
  font-size: 48px;
  flex-shrink: 0;
}
.banner-text {
  flex: 1;
}
.banner-title {
  font-size: 24px;
  font-weight: 700;
  color: #fff;
  margin-bottom: 4px;
}
.banner-desc {
  font-size: 17px;
  color: rgba(255,255,255,0.9);
}
.banner-arrow {
  font-size: 28px;
  color: rgba(255,255,255,0.8);
  flex-shrink: 0;
}
.banner-dots {
  display: flex;
  justify-content: center;
  gap: 8px;
  padding: 10px 0 6px 0;
  background: #f8faff;
}
.banner-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #c7d8f0;
  cursor: pointer;
  transition: background 0.3s;
}
.banner-dot.active {
  background: #1a6fc4;
  width: 24px;
  border-radius: 5px;
}"""

new = """.banner-wrap {
  position: relative;
  overflow: hidden;
  border-radius: 16px;
  margin: 12px 16px 0 16px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.15);
  max-width: 448px;
}
.banner-slider {
  display: flex;
  transition: transform 0.4s ease;
  will-change: transform;
}
.banner-slide {
  min-width: 100%;
  padding: 0;
  display: flex;
  align-items: stretch;
  cursor: pointer;
  border-radius: 16px;
  overflow: hidden;
}
.banner-icon {
  font-size: 48px;
  flex-shrink: 0;
}
.banner-text {
  flex: 1;
}
.banner-title {
  font-size: 24px;
  font-weight: 700;
  color: #fff;
  margin-bottom: 4px;
}
.banner-desc {
  font-size: 17px;
  color: rgba(255,255,255,0.9);
}
.banner-arrow {
  font-size: 28px;
  color: rgba(255,255,255,0.8);
  flex-shrink: 0;
}
.banner-dots {
  display: flex;
  justify-content: center;
  gap: 8px;
  padding: 10px 0 6px 0;
  background: #f8faff;
}
.banner-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #c7d8f0;
  cursor: pointer;
  transition: background 0.3s;
}
.banner-dot.active {
  background: #1a6fc4;
  width: 24px;
  border-radius: 5px;
}"""

old2 = """.banner-color-slide {
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

new2 = """.banner-color-slide {
  position: relative;
  overflow: hidden;
  padding: 0;
  height: 200px;
  cursor: pointer;
  border-radius: 16px;
  display: flex;
  align-items: stretch;
  width: 100%;
}
.banner-text-area {
  position: relative;
  z-index: 2;
  padding: 24px 16px 24px 24px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  width: 52%;
  flex-shrink: 0;
}
.banner-text-area .banner-title {
  font-size: 20px;
  font-weight: 900;
  color: #ffffff;
  margin-bottom: 6px;
  line-height: 1.3;
  word-break: keep-all;
  text-shadow: 0 1px 3px rgba(0,0,0,0.2);
}
.banner-text-area .banner-desc {
  font-size: 14px;
  color: rgba(255,255,255,0.9);
  margin-bottom: 12px;
  line-height: 1.5;
  word-break: keep-all;
}
.banner-btn {
  display: inline-block;
  background: rgba(255,255,255,0.25);
  border: 2px solid rgba(255,255,255,0.8);
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  padding: 7px 14px;
  border-radius: 20px;
  width: fit-content;
  white-space: nowrap;
}
.banner-char-img {
  position: absolute;
  right: 0;
  top: 0;
  height: 100%;
  width: 52%;
  object-fit: cover;
  object-position: left top;
}"""

if old in content and old2 in content:
    content = content.replace(old, new)
    content = content.replace(old2, new2)
    with open("style.css", "w", encoding="utf-8") as f:
        f.write(content)
    print("style.css 배너 완벽 수정 완료 ✅")
elif old not in content:
    print("⚠️ 첫번째 코드를 찾지 못했습니다!")
elif old2 not in content:
    print("⚠️ 두번째 코드를 찾지 못했습니다!")