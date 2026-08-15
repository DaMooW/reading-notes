/* 拾页 · Service Worker：离线缓存 + 更新策略 */
const CACHE = 'shiye-v4';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/db.js',
  './js/ui.js',
  './js/timeline.js',
  './js/charts.js',
  './js/graph.js',
  './js/ai.js',
  './js/library-parse.js',
  './js/library.js',
  './js/library-ui.js',
  './js/app.js',
  './vendor/echarts.min.js',
  './vendor/jszip.min.js',
  './vendor/pdf.min.js',
  './vendor/pdf.worker.min.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon.svg',
];

// 运行时按需缓存的 CDN 域名（OCR 模型、按需加载的库）
const CDN_HOSTS = [
  'cdn.jsdelivr.net',
  'tessdata.projectnaptha.com',
  'cdnjs.cloudflare.com',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  const sameOrigin = url.origin === location.origin;
  const isCdn = CDN_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith('.' + h));
  if (!sameOrigin && !isCdn) return;

  // 页面导航：网络优先，失败回退缓存（离线可打开）
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((r) => {
          const copy = r.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy));
          return r;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // 静态资源与 CDN 按需资源：缓存优先（首次从网络拉取后自动缓存，之后离线可用）
  e.respondWith(
    caches.match(e.request).then((hit) => {
      if (hit) return hit;
      return fetch(e.request).then((r) => {
        if (r.ok || r.type === 'opaque') {
          const copy = r.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return r;
      });
    })
  );
});
