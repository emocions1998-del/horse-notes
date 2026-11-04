// GitHub Pagesの別リポジトリー等のキャッシュに干渉しないよう、公開パスごとに分離する。
const CACHE_PREFIX = `horse-notes:${self.registration.scope}:`;
const CACHE = `${CACHE_PREFIX}ver2-1-4-search-mode`;
// Pin HTML dependencies to this release so old unversioned HTTP/SW caches cannot mix UI versions.
const ASSETS = ['./', './index.html', './style.css?v=2.1.4', './data.js?v=2.1.4', './csv-import.js?v=2.1.4', './google-config.js?v=2.1.4', './google-sheets.js?v=2.1.4', './app.js?v=2.1.4', './manifest.webmanifest?v=2.1.4', './icon.svg', './icons/icon-192.png', './icons/icon-512.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS.map(path => new Request(path,{cache:'reload'})))));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  // アプリ本体だけをキャッシュする。取り込んだデータや任意のURLは対象にしない。
  if (!ASSETS.some(path => new URL(path,self.location.href).href === event.request.url)) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok) { const copy = response.clone(); event.waitUntil(caches.open(CACHE).then(cache => cache.put(event.request, copy))); }
    return response;
  }).catch(async () => {
    const cache = await caches.open(CACHE);
    return (await cache.match(event.request)) || (event.request.mode === 'navigate' ? await cache.match(new URL('./index.html',self.registration.scope).href) : Response.error());
  }));
});
