/* Сервис-воркер ATB-Diet: офлайн-режим для установленного приложения (iOS/Android).
   Меняйте VERSION при каждом обновлении index.html, чтобы устройства подхватили новую версию. */
const VERSION = 'atb-diet-v1';
const CORE = ['./', './index.html', './manifest.json', './icon-180.png', './icon-192.png', './icon-512.png', './icon-maskable-512.png'];
const CATALOG = 'cart_files/atb_diet_list.json';

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // allSettled: отсутствие одного файла не должно ломать установку
    await Promise.allSettled(CORE.map(url => cache.add(url)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('atb-diet-') && k !== VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

// сначала сеть, при отсутствии сети отдаём копию из кэша
async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(VERSION);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch (e) {
    const hit = await cache.match(request, { ignoreSearch: true });
    if (hit) return hit;
    if (fallbackUrl) { const fb = await cache.match(fallbackUrl); if (fb) return fb; }
    throw e;
  }
}

// сначала кэш, в фоне обновляем (картинки продуктов и прочие файлы того же сайта)
async function staleWhileRevalidate(request) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(request);
  const refresh = fetch(request).then(res => { if (res && res.ok) cache.put(request, res.clone()); return res; }).catch(() => null);
  return hit || (await refresh) || Response.error();
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // чужие сайты (картинки магазинов) не трогаем
  if (req.mode === 'navigate') { event.respondWith(networkFirst(req, './index.html')); return; }
  if (url.pathname.endsWith(CATALOG)) { event.respondWith(networkFirst(req)); return; }
  event.respondWith(staleWhileRevalidate(req));
});
