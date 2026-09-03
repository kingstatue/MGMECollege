const CACHE_PREFIX = 'mgmec-absentee-informer';
const CACHE_NAME = 'mgmec-absentee-informer-v120-bulk';

function isOwnCache(name) {
  return String(name || '').indexOf(CACHE_PREFIX) === 0;
}

function isOtherCollegeAppPath(pathname) {
  const p = String(pathname || '');
  return p.indexOf('/att_College_app/') !== -1
    || p.indexOf('/atbo/') !== -1
    || p.indexOf('/att_appAllstreams/') !== -1
    || p.indexOf('/aaaacrypt/') !== -1;
}

// Install Event - Instant non-blocking activation (0ms SW installation)
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// Activate Event - Claim clients immediately and purge ONLY this app's old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (isOwnCache(cache) && cache !== CACHE_NAME) {
            console.log('[PWA SW] Deleting old evening cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Listen for skip waiting messages
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Fetch Event - Network first with dynamic cache fallback
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // Bypass Google Apps Script & external APIs
  if (url.origin !== location.origin) return;

  // Never intercept the day college app if both are hosted on the same origin
  if (isOtherCollegeAppPath(url.pathname)) return;

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html') || caches.match('./');
          }
        });
      })
  );
});
