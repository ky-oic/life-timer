/**
 * LIFEFLOW — sw.js
 * Service Worker: バックグラウンド通知 & オフラインキャッシュ
 *
 * iOS 16.4+ でホーム画面追加済みの PWA のみプッシュ通知が動作します。
 * ここでは「毎分 alarm チェック」を setInterval で行うシンプル実装です。
 */

'use strict';

const CACHE_NAME = 'lifeflow-v1';
const CACHE_URLS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
];

/* ══════════════════════════════════════════
   INSTALL — 静的アセットをキャッシュ
   ══════════════════════════════════════════ */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CACHE_URLS))
  );
  self.skipWaiting();
});

/* ══════════════════════════════════════════
   ACTIVATE — 古いキャッシュを削除
   ══════════════════════════════════════════ */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/* ══════════════════════════════════════════
   FETCH — キャッシュファースト
   ══════════════════════════════════════════ */
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});

/* ══════════════════════════════════════════
   STATE（SW 内）
   ══════════════════════════════════════════ */
let schedules = [];        // app.js から同期されるスケジュール配列
let notified  = new Set(); // 当日通知済み ID セット
let alarmInterval = null;

/* ══════════════════════════════════════════
   MESSAGE — app.js からのメッセージ受信
   ══════════════════════════════════════════ */
self.addEventListener('message', event => {
  const { type, payload } = event.data || {};

  if (type === 'SYNC_SCHEDULES') {
    schedules = payload.schedules || [];
    // notified をリセット（日付をまたいだ場合も含め再構築）
    const today = new Date().toISOString().slice(0, 10);
    notified = new Set(
      schedules.map(s => today + '_' + s.id).filter(() => false) // 空で開始
    );
    startAlarmLoop();
    // 受信確認を返す
    event.source && event.source.postMessage({ type: 'SCHEDULES_SYNCED' });
  }
});

/* ══════════════════════════════════════════
   ALARM LOOP — 毎分 :00 秒に通知チェック
   ══════════════════════════════════════════ */
function startAlarmLoop() {
  if (alarmInterval) clearInterval(alarmInterval);

  // 即時チェック + 毎分チェック
  checkAlarms();
  alarmInterval = setInterval(checkAlarms, 60 * 1000);
}

function checkAlarms() {
  if (!schedules.length) return;

  const now    = new Date();
  const today  = now.toISOString().slice(0, 10);
  const nowStr = pad(now.getHours()) + ':' + pad(now.getMinutes());

  schedules.forEach(s => {
    const nid = today + '_' + s.id;
    if (s.time === nowStr && !notified.has(nid)) {
      notified.add(nid);
      fireNotification(s);
    }
  });
}

/* ══════════════════════════════════════════
   NOTIFICATION 発火
   ══════════════════════════════════════════ */
function fireNotification(schedule) {
  const catEmoji = {
    general: '⏰', work: '💼', meal: '🍽️', exercise: '🏃', rest: '😴'
  }[schedule.cat] || '⏰';

  const title = catEmoji + ' ' + schedule.time + ' — ' + schedule.name;
  const body  = '時間になりました！';

  // アプリが前面にある場合はアプリ側の toast を使う
  self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
    if (clients.length > 0) {
      // フォアグラウンドのクライアントに通知を委譲
      clients.forEach(c => c.postMessage({ type: 'ALARM', title, body }));
    } else {
      // バックグラウンド or ホーム画面 → OS 通知を発火
      self.registration.showNotification(title, {
        body,
        icon:   './icon-192.png',
        badge:  './icon-192.png',
        tag:    'lifeflow-' + schedule.id,
        renotify: true,
        data:   { page: 'schedule' },
      });
    }
  });
}

/* ══════════════════════════════════════════
   NOTIFICATION CLICK — タップでアプリを開く
   ══════════════════════════════════════════ */
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const page = (event.notification.data || {}).page || 'schedule';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      // 既に開いているウィンドウがあればフォーカス
      const existing = clients.find(c => c.url.includes('life-timer') || c.url.includes('localhost'));
      if (existing) {
        existing.focus();
        existing.postMessage({ type: 'OPEN_PAGE', page });
      } else {
        // 新しいウィンドウで開く
        self.clients.openWindow('./').then(win => {
          if (win) win.postMessage({ type: 'OPEN_PAGE', page });
        });
      }
    })
  );
});

/* ══════════════════════════════════════════
   UTILITY
   ══════════════════════════════════════════ */
function pad(n) { return String(n).padStart(2, '0'); }
