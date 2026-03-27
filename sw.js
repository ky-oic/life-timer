/**
 * LIFEFLOW — sw.js
 * ・Push受信 → OS通知表示
 * ・app.js から SYNC_SCHEDULES を受け取り、時刻タイマーで /api/send を呼ぶ
 */
'use strict';

const CACHE_NAME = 'lifeflow-v4';
const CACHE_FILES = ['./index.html','./style.css','./app.js','./sw.js','./manifest.json'];

/* ── INSTALL ── */
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(CACHE_FILES)));
  self.skipWaiting();
});

/* ── ACTIVATE ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/* ── FETCH ── */
self.addEventListener('fetch', event => {
  // APIへのリクエストはキャッシュしない
  if (event.request.url.includes('/api/')) return;
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});

/* ════════════════════════════════════════
   スケジュールタイマー管理
   ════════════════════════════════════════ */
const timers = new Map(); // scheduleId → timeoutId

function clearAllTimers() {
  timers.forEach(id => clearTimeout(id));
  timers.clear();
}

/**
 * スケジュール配列と購読情報を受け取りタイマーをセット
 */
function setupTimers(schedules, subscription) {
  clearAllTimers();

  const now = Date.now();

  schedules.forEach(s => {
    const [h, m] = s.time.split(':').map(Number);
    const today  = new Date();
    today.setHours(h, m, 0, 0);
    const msUntil = today.getTime() - now;

    // 過去 or 5秒未満はスキップ
    if (msUntil < 5000) return;

    const catEmoji = { general:'⏰', work:'💼', meal:'🍽️', exercise:'🏃', rest:'😴' }[s.cat] || '⏰';
    const catLabel = { general:'一般', work:'仕事', meal:'食事', exercise:'運動', rest:'休憩' }[s.cat] || '';

    const timerId = setTimeout(() => {
      timers.delete(s.id);
      // Vercel API経由でプッシュ通知を送信
      fetch('/api/send', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription,
          title: `${catEmoji} ${s.time} — ${s.name}`,
          body:  `${catLabel}の時間です！`,
        }),
      }).catch(err => console.warn('SW send error:', err));
    }, msUntil);

    timers.set(s.id, timerId);
  });
}

/* ── app.js からのメッセージ受信 ── */
self.addEventListener('message', event => {
  const { type, schedules, subscription } = event.data || {};
  if (type === 'SYNC_SCHEDULES') {
    setupTimers(schedules || [], subscription);
  }
});

/* ── Pushイベント受信（サーバーからのプッシュ） ── */
self.addEventListener('push', event => {
  let data = { title: 'LIFEFLOW', body: '時間になりました！' };
  if (event.data) { try { data = event.data.json(); } catch {} }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body:  data.body,
      icon:  './icon-192.png',
      badge: './icon-96.png',
      tag:   'lifeflow-schedule',
    })
  );
});

/* ── 通知タップ → アプリを開く ── */
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) { if ('focus' in c) { c.focus(); return; } }
      if (clients.openWindow) return clients.openWindow('./');
    })
  );
});
