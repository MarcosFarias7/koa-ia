/* sw.js — service worker simples: guarda os arquivos para o Koa funcionar offline.
 * Ao mudar qualquer arquivo do app, aumente a VERSION para atualizar o cache. */
const VERSION = 'koa-v6';
const ASSETS = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'brain.js',
  'koala.svg.js',
  'llm.js',
  'research.js',
  'world3d.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== VERSION + '-cdn').map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Bibliotecas de CDN com versão fixa (Three.js do mundo 3D): guarda na primeira vez.
const CDN = 'https://cdn.jsdelivr.net';

// Arquivos do app
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const origin = new URL(req.url).origin;
  if (origin === CDN) {
    event.respondWith(
      caches.open(VERSION + '-cdn').then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      })
    );
    return;
  }
  if (origin !== self.location.origin) return;

  // Rede primeiro: com internet, sempre pega a versão mais nova do Koa.
  // Sem internet (ou se a rede demorar mais de 4s), usa a cópia guardada.
  event.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const network = fetch(req, { cache: 'no-cache' })
        .then((res) => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);
      const slow = new Promise((r) => setTimeout(() => r(null), 4000));
      const res = await Promise.race([network, slow]);
      if (res) return res;
      const cached = await cache.match(req, { ignoreSearch: true });
      if (cached) return cached;
      const late = await network;
      if (late) return late;
      if (req.mode === 'navigate') return cache.match('index.html');
      return new Response('', { status: 504, statusText: 'offline' });
    })
  );
});
