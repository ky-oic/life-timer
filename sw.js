/**
 * LIFEFLOW — sw.js
 * Service Worker: バックグラウンド通知 & オフラインキャッシュ
 *
 * ─ 仕組み ─
 * 1. app.js がスケジュールを保存するたびに sw.js へ postMessage で伝達
 * 2. sw.js 側で setTimeout / setInterval を使い、指定時刻に
 *    self.registration.showNotification() でOS通知を発火
 * 3. ページが閉じていても Service Worker は生きているので通知が届く
 *    ※ iOS Safari は PWA としてホーム画面に追加した場合のみ対応
 */

'use strict';

const CACHE_NAME = 'lifeflow-v2';
// GitHub Pages サブディレクトリ対応：相対パスで指定
const CACHE_FILES = [
  './index.html',
  './style.css',
  './app.js',
  './sw.js',
  './manifest.json'
];

/* ══════════════════════════════════════════
   INSTALL — 静的ファイルをキャッシュ
   ══════════════════════════════════════════ */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CACHE_FILES))
  );
  self.skipWaiting();
});

/* ══════════════════════════════════════════
   ACTIVATE — 古いキャッシュを削除
   ══════════════════════════════════════════ */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

/* ══════════════════════════════════════════
   FETCH — キャッシュ優先 / なければネット
   ══════════════════════════════════════════ */
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});

/* ══════════════════════════════════════════
   NOTIFICATION TIMER MANAGEMENT
   スケジュールデータを受け取り、各時刻に通知をセット
   ══════════════════════════════════════════ */

// タイマーIDを管理（再登録時にクリア）
const pendingTimers = new Map(); // scheduleId → timerId

/**
 * 指定されたスケジュール配列に基づきタイマーを再設定
 * @param {Array} schedules  [{id, time:"HH:MM", name, cat}, ...]
 */
function scheduleNotifications(schedules) {
  // 既存タイマーをすべてクリア
  pendingTimers.forEach(id => clearTimeout(id));
  pendingTimers.clear();

  const now = new Date();
  const today = now.toISOString().slice(0, 10); // "YYYY-MM-DD"

  schedules.forEach(s => {
    const [h, m] = s.time.split(':').map(Number);

    // 今日のその時刻の Date オブジェクト
    const fireAt = new Date(now);
    fireAt.setHours(h, m, 0, 0);

    const msUntil = fireAt.getTime() - now.getTime();

    // 過去の時刻はスキップ（1秒未満もスキップ）
    if (msUntil < 1000) return;

    const catEmoji = {
      general: '⏰', work: '💼', meal: '🍽️', exercise: '🏃', rest: '😴'
    }[s.cat] || '⏰';

    const catLabel = {
      general: '一般', work: '仕事', meal: '食事', exercise: '運動', rest: '休憩'
    }[s.cat] || '';

    const timerId = setTimeout(() => {
      self.registration.showNotification(`${catEmoji} ${s.time} — ${s.name}`, {
        body: `${catLabel}の時間です！`,
        icon: './icon-192.png',   // アイコンがあれば表示（なくてもエラーにならない）
        badge: './icon-96.png',
        tag: `lifeflow-${s.id}`,  // 同じtagは上書き（重複防止）
        requireInteraction: false,
        silent: false,
        data: { scheduleId: s.id, page: 'schedule' }
      });
      pendingTimers.delete(s.id);
    }, msUntil);

    pendingTimers.set(s.id, timerId);
  });
}

/* ══════════════════════════════════════════
   MESSAGE — app.js からの通信を受け取る
   ══════════════════════════════════════════ */
self.addEventListener('message', event => {
  const { type, payload } = event.data || {};

  if (type === 'SYNC_SCHEDULES') {
    // スケジュールが更新されたので通知タイマーを再設定
    scheduleNotifications(payload.schedules || []);
  }

  if (type === 'CANCEL_ALL') {
    pendingTimers.forEach(id => clearTimeout(id));
    pendingTimers.clear();
  }
});

/* ══════════════════════════════════════════
   NOTIFICATION CLICK — 通知タップでアプリを開く
   ══════════════════════════════════════════ */
self.addEventListener('notificationclick', event => {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // すでに開いているウィンドウがあればフォーカス
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          // スケジュールページへ遷移するよう伝達
          client.postMessage({ type: 'OPEN_PAGE', page: 'schedule' });
          return;
        }
      }
      // なければ新規タブで開く
      if (clients.openWindow) {
        return clients.openWindow('./');
      }
    })
  );
});

/* ══════════════════════════════════════════
   PERIODIC SYNC（対応ブラウザのみ）
   SW が停止しても定期的に起こして通知を再スケジュール
   ══════════════════════════════════════════ */
self.addEventListener('periodicsync', event => {
  if (event.tag === 'lifeflow-daily-reschedule') {
    event.waitUntil(rescheduleFromStorage());
  }
});

/**
 * IndexedDB ではなく Cache API 経由でスケジュールを取得して再スケジュール
 * （SW は localStorage に直接アクセスできないため）
 */
async function rescheduleFromStorage() {
  // ページが開いていれば postMessage で最新データを要求
  const allClients = await clients.matchAll({ includeUncontrolled: true });
  if (allClients.length > 0) {
    allClients[0].postMessage({ type: 'REQUEST_SCHEDULES' });
  }
}
