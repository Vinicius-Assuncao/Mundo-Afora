const CACHE = 'mundo-afora-v17';
const SHELL = ['./', 'index.html', 'config.js', 'manifest.json', 'icon.png',
  'css/base.css', 'css/home.css', 'css/itinerary.css', 'css/map.css', 'css/dialogs.css', 'css/responsive.css',
  'js/state.js', 'js/services.js', 'js/routing.js', 'js/views.js', 'js/map.js', 'js/dialogs.js', 'js/cloud.js', 'js/events.js', 'js/wikimedia-ui.js', 'css/cloud.css',
  'css/layout-refinements.css', 'css/offline.css', 'js/offline.js',
  'css/export.css', 'css/export-templates.css',
  'js/export-model.js', 'js/export-assets.js', 'js/export-files.js', 'js/export-templates.js', 'js/export-engine.js', 'js/export-ui.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    e.respondWith(fetch(req)); return;
  }
  const cacheFirst = url.hostname.endsWith('tile.openstreetmap.org')
    || url.hostname.endsWith('arcgisonline.com') || url.hostname.endsWith('cartocdn.com')
    || url.hostname === 'upload.wikimedia.org' || url.hostname === 'flagcdn.com'
    || url.hostname === 'unpkg.com' || url.hostname === 'cdn.jsdelivr.net' || url.hostname === 'cdnjs.cloudflare.com'
    || url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (cacheFirst) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok || res.type === 'opaque') caches.open(CACHE).then((c) => c.put(req, res.clone()));
      return res;
    }).catch(() => hit)));
    return;
  }
  if (url.origin === self.location.origin) {
    e.respondWith(fetch(req).then((res) => {
      if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
      return res;
    }).catch(() => caches.match(req).then((hit) => hit || (req.mode === 'navigate' ? caches.match('index.html') : undefined))));
    return;
  }
  e.respondWith(fetch(req).catch(() => caches.match(req)));
});
