// =====================================================
// sw.js — 서비스워커 (항상 최신 파일 우선)
// 인터넷에서 최신 파일을 먼저 가져오고,
// 오프라인일 때만 저장된 파일을 씁니다
// =====================================================

const CACHE_NAME = 'bomnal-v6';

// ─────────────────────────────────────────
// 1. 설치 단계 — 기존 캐시 모두 삭제 후 즉시 활성화
// ─────────────────────────────────────────
self.addEventListener('install', function(e) {
  self.skipWaiting(); // 설치 즉시 바로 활성화
});

// ─────────────────────────────────────────
// 2. 활성화 단계 — 오래된 캐시 모두 삭제
// ─────────────────────────────────────────
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.map(function(key) {
          return caches.delete(key); // 모든 캐시 삭제
        })
      );
    })
  );
  self.clients.claim(); // 즉시 모든 탭에 적용
});

// ─────────────────────────────────────────
// 3. 요청 처리 — 항상 인터넷 최신 파일 우선
//    오프라인일 때만 캐시 백업 사용
// ─────────────────────────────────────────
self.addEventListener('fetch', function(e) {
  e.respondWith(
    fetch(e.request)
      .then(function(response) {
        // 인터넷에서 가져온 최신 파일을 캐시에도 저장
        var resClone = response.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(e.request, resClone);
        });
        return response; // 최신 파일 바로 사용
      })
      .catch(function() {
        // 오프라인일 때만 캐시에서 백업 파일 사용
        return caches.match(e.request);
      })
  );
});
