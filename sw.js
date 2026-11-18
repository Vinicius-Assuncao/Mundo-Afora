const CACHE = 'mundo-afora-v8';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'config.js', 'manifest.json', 'icon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // em localhost, sempre busca do servidor para facilitar o desenvolvimento
  if (url.origin === self.location.origin &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    e.respondWith(fetch(req));
    return;
  }

  // mapas, bandeiras, fontes e bibliotecas: cache primeiro
  const cacheFirst =
    url.hostname.endsWith('tile.openstreetmap.org') ||
    url.hostname.endsWith('arcgisonline.com') ||
    url.hostname === 'upload.wikimedia.org' ||
    url.hostname === 'flagcdn.com' ||
    url.hostname === 'unpkg.com' ||
    url.hostname === 'fonts.gstatic.com';

  if (cacheFirst) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok || res.type === 'opaque') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => hit))
    );
    return;
  }

  // arquivos do próprio app: rede, com cópia em cache para uso offline
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // rotas, busca e Wikipédia: rede; sem rede, usa o que estiver em cache
  e.respondWith(fetch(req).catch(() => caches.match(req)));
});