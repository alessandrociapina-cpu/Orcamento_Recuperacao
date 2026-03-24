const CACHE_NAME = 'ovms-orcamento-v16'; 

const urlsToCache = [
  './',
  './index.html',
  './documentacao.html',
  './style.css?v=16',
  './script.js?v=16',
  './manifest.json',
  './sabesp-logo.png',
  './Sinplan_MAR_2026_planilha-UTF8.json',
  'https://cdn.jsdelivr.net/npm/exif-js'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache)));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) return caches.delete(cacheName);
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, clone);
        });
        return response;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});
