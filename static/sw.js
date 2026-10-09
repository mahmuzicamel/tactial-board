const CACHE_NAME = 'tactical-coach-v201';
const ASSETS_TO_CACHE = [
  '/',
  '/static/index.html',
  '/static/app.js?v=196',
  '/static/js/app-module.js?v=196',
  '/static/js/state/store.js',
  '/static/js/core/constants.js',
  '/static/js/core/geometry.js',
  '/static/js/core/pitch.js',
  '/static/js/api/client.js',
  '/static/js/canvas/viewport.js',
  '/static/js/canvas/elements.js',
  '/static/js/canvas/lines.js',
  '/static/js/canvas/shapes.js',
  '/static/js/canvas/playback.js',
  '/static/js/canvas/view3d.js',
  '/static/vendor/three.min.js',
  '/static/vendor/OrbitControls.js',
  '/static/vendor/GLTFLoader.js',
  '/static/vendor/SkeletonUtils.js',
  '/static/vendor/CCapture.all.min.js',
  '/static/models/footballer.glb',
  '/static/animations/idle.glb',
  '/static/animations/walk.glb',
  '/static/animations/run.glb',
  '/static/animations/sprint.glb',
  '/static/animations/kick.glb',
  '/static/animations/shoot.glb',
  '/static/js/ui/popovers.js',
  '/static/js/ui/hud.js',
  '/static/js/ui/inspectors.js',
  '/static/js/ui/timeline.js',
  '/static/js/interaction/tools.js',
  '/static/js/interaction/curve-editor.js',
  '/static/js/interaction/pointer.js',
  '/static/js/api/client.js',
  '/static/manifest.json',
  '/static/icons/icon-192.png',
  '/static/icons/icon-512.png',
  '/static/icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Skip API requests and media
  if (event.request.url.includes('/api/') || event.request.url.includes('/media/')) {
    return;
  }

  // Handle SPA navigation for HTML documents (/exercise/... or /e/... or /)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/'))
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && event.request.method === 'GET') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});
