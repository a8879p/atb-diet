// ATB-Diet Service Worker
// Кэширует оболочку приложения для офлайн-доступа.
// Данные пользователя (профиль, список покупок, прогресс) хранятся в localStorage
// и к service worker'у отношения не имеют — их кэшировать не нужно.

const APP_VERSION = '2.1'; // держать синхронно с CONFIG.APP_VERSION в index.html
const CACHE_NAME = `atb-diet-shell-v${APP_VERSION}`;

// Явный белый список — предсказуемее, чем cache.addAll([self.registration.scope])
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Путь к каталогу продуктов: обновляем "по сети", но не роняем офлайн-режим
const CATALOG_PATH = './cart_files/atb_diet_list.json';

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith('atb-diet-shell-') && key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;

  // Обрабатываем только GET-запросы этого источника; всё остальное (сторонние
  // API вроде OpenFoodFacts, POST-запросы) уходит напрямую в сеть.
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) {
    return;
  }

  const isCatalog = req.url.includes('atb_diet_list.json') || req.url.endsWith(CATALOG_PATH.replace('./', ''));

  if (isCatalog) {
    // network-first: пробуем получить свежий каталог, но при отсутствии сети
    // отдаём то, что закэшировалось при прошлой успешной загрузке.
    event.respondWith(
      fetch(req)
        .then(res => {
          if (res && res.ok) {
            const resClone = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(req, resClone));
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Навигация (открытие/обновление страницы) и статика оболочки: cache-first
  // с фолбэком в сеть и последующим обновлением кэша.
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        if (res && res.ok) {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, resClone));
        }
        return res;
      }).catch(() => {
        // Офлайн и в кэше нет — для навигационных запросов отдаём index.html
        // как SPA-фолбэк, чтобы приложение хотя бы открылось.
        if (req.mode === 'navigate') return caches.match('./index.html');
        return undefined;
      });
    })
  );
});
