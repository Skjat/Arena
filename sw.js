// Service worker: офлайн-кэш всех файлов игры.
const VERSION = 'arena-v4';
const FILES = [
  './', './index.html', './style.css', './manifest.webmanifest',
  './vendor/three.module.min.js',
  './src/main.js', './src/arena.js', './src/audio.js', './src/battle.js', './src/beast.js', './src/character.js', './src/hazards.js',
  './src/data.js', './src/enemy.js', './src/fx.js', './src/gesture.js', './src/input.js',
  './src/physics.js', './src/player.js', './src/save.js', './src/spells.js', './src/ui.js', './src/weapons3d.js',
  './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Сначала кэш, параллельно обновляем из сети (stale-while-revalidate).
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.open(VERSION).then(async (cache) => {
    const cached = await cache.match(req, { ignoreSearch: true });
    const net = fetch(req).then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
    return cached || (await net) || new Response('offline', { status: 503 });
  }));
});
