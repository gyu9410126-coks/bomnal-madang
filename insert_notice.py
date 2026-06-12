with open("style.css", "r", encoding="utf-8") as f:
    content = f.read()

new_styles = """
/* ===== 신규3: UI 전면 개편 스타일 ===== */

/* 섹션 헤더 */
.section-header {
  font-size: 20px;
  font-weight: 700;
  color: #1a6fc4;
  padding: 8px 16px;
  margin: 16px 0 8px 0;
  border-left: 4px solid #1a6fc4;
  background: #f0f6ff;
  border-radius: 0 8px 8px 0;
}

/* 슬라이드 배너 */
.banner-wrap {
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
}

/* 오늘의 한마디 */
.today-card {
  margin: 8px 16px;
  background: linear-gradient(135deg, #fff8e1, #fffde7);
  border: 1px solid #f59e0b;
  border-radius: 14px;
  padding: 16px 20px;
  text-align: center;
}
.today-label {
  font-size: 16px;
  color: #f59e0b;
  font-weight: 700;
  margin-bottom: 8px;
}
.today-quote {
  font-size: 20px;
  color: #333;
  font-weight: 700;
  line-height: 1.6;
}
"""

content = content + new_styles

with open("style.css", "w", encoding="utf-8") as f:
    f.write(content)

print("style.css 신규3 스타일 추가 완료 ✅")