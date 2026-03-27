/**
 * LIFEFLOW — sw.js  (Web Push API 対応版)
 */
'use strict';

const CACHE_NAME = 'lifeflow-v3';
const CACHE_FILES = ['./index.html','./style.css','./app.js','./sw.js','./manifest.json'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(CACHE_FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});

/* プッシュ通知受信 */
self.addEventListener('push', event => {
  let data = { title: 'LIFEFLOW', body: '時間になりました！' };
  if (event.data) { try { data = event.data.json(); } catch {} }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: './icon-192.png',
      badge: './icon-96.png',
      tag: 'lifeflow-schedule',
    })
  );
});

/* 通知タップでアプリを開く */
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) { if ('focus' in c) { c.focus(); return; } }
      if (clients.openWindow) return clients.openWindow('./');
    })
  );
});
