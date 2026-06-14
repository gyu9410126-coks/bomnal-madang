// =====================================================
// sw.js — 서비스워커 (오프라인 캐시 담당)
// 캐시 = 자주 쓰는 파일을 핸드폰에 미리 저장해두는 것
// 마치 편의점에서 자주 먹는 빵을 미리 쟁여두는 것처럼!
// =====================================================

const CACHE_NAME = 'bomnal-v4';
// 캐시 이름 — 나중에 코드 수정하면 'bomnal-v4'로 숫자 올리면 새로 갱신됨

// 미리 저장해둘 파일 목록
const CACHE_FILES = [
  '/',
  '/index.html',
  '/style.css',
  '/fortune.html',
  '/game.html',
  '/benefit.html',
  '/health.html',
  '/talk.html',
  '/market.html',
  '/trot.html',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// ─────────────────────────────────────────
// 1. 설치 단계 — 앱 설치할 때 파일들을 미리 저장
// ─────────────────────────────────────────
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(CACHE_FILES);
    })
  );
  self.skipWaiting(); // 설치 즉시 바로 활성화
});

// ─────────────────────────────────────────
// 2. 활성화 단계 — 오래된 캐시(구버전 파일) 삭제
// ─────────────────────────────────────────
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) {
          return key !== CACHE_NAME; // 현재 버전 빼고 다 삭제
        }).map(function(key) {
          return caches.delete(key);
        })
      );
    })
  );
  self.clients.claim(); // 즉시 모든 탭에 적용
});

// ─────────────────────────────────────────
// 3. 요청 처리 — 저장된 파일 먼저 쓰고, 없으면 인터넷에서 가져옴
// ─────────────────────────────────────────
self.addEventListener('fetch', function(e) {
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      return cached || fetch(e.request);
      // cached = 저장된 파일이 있으면 그걸 씀
      // fetch  = 없으면 인터넷에서 새로 가져옴
    })
  );
});
