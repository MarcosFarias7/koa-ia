/* sw.js — service worker simples: guarda os arquivos para o Koa funcionar offline.
 * Ao mudar qualquer arquivo do app, aumente a VERSION para atualizar o cache. */
const VERSION = 'koa-v4';
const ASSETS = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'brain.js',
  'koala.svg.js',
  'llm.js',
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

// Responde do cache na hora e atualiza em segundo plano (stale-while-revalidate).
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

  event.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);
      if (cached) {
        event.waitUntil(network);
        return cached;
      }
      const res = await network;
      if (res) return res;
      if (req.mode === 'navigate') return cache.match('index.html');
      return new Response('', { status: 504, statusText: 'offline' });
    })
  );
});
