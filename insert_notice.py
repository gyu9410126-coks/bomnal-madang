with open("style.css", "r", encoding="utf-8") as f:
    content = f.read()

new_styles = """
/* ===== 배너 이미지 스타일 ===== */
.banner-img-slide {
  position: relative;
  overflow: hidden;
  padding: 0;
  height: 180px;
  cursor: pointer;
}
.banner-bg-img {
  position: absolute;
  top: 0; right: 0;
  width: 65%;
  height: 100%;
  object-fit: cover;
  object-position: center;
}
.banner-overlay {
  position: absolute;
  top: 0; left: 0;
  width: 50%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 16px 0 16px 20px;
  background: linear-gradient(to right, rgba(255,255,255,1) 60%, rgba(255,255,255,0));
}
.banner-overlay .banner-title {
  font-size: 22px;
  font-weight: 900;
  color: #1a1a1a;
  margin-bottom: 6px;
  line-height: 1.3;
}
.banner-overlay .banner-desc {
  font-size: 14px;
  color: #555;
  margin-bottom: 10px;
  line-height: 1.4;
}
.banner-btn {
  display: inline-block;
  background: #1a6fc4;
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  padding: 6px 12px;
  border-radius: 20px;
  width: fit-content;
}
"""

content = content + new_styles

with open("style.css", "w", encoding="utf-8") as f:
    f.write(content)

print("style.css 배너 이미지 스타일 추가 완료 ✅")