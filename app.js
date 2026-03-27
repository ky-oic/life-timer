/**
 * LIFEFLOW — app.js
 * 生活タイマーアプリ
 */

'use strict';

/* ══════════════════════════════════════════
   STORAGE HELPERS
   ══════════════════════════════════════════ */
function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}
function save(key, val) {
  localStorage.setItem(key, JSON.stringify(val));
}

/* ══════════════════════════════════════════
   STATE
   ══════════════════════════════════════════ */
let schedules    = load('lf_schedules', []);
let inventory    = load('lf_inventory', []);
let memos        = load('lf_memos',     []);
let invFilter    = 'all';
let activeMemoId = memos.length ? memos[0].id : null;
let notified     = new Set(load('lf_notified', []));

/* ══════════════════════════════════════════
   DOM HELPERS
   ══════════════════════════════════════════ */
const $ = id => document.getElementById(id);

const create = (tag, cls, html) => {
  const el = document.createElement(tag);
  if (cls)              el.className = cls;
  if (html !== undefined) el.innerHTML = html;
  return el;
};

/* ══════════════════════════════════════════
   CLOCK — 秒まで表示 (HH:MM:SS)
   ══════════════════════════════════════════ */
function tickClock() {
  const now  = new Date();
  const hm   = now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  const hms  = now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const date = now.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', weekday: 'short' });

  $('status-time').textContent  = hm;
  $('header-clock').textContent = hms;
  $('header-date').textContent  = date;

  updateTimerDisplay(now);
  checkNotifications(now);
}

setInterval(tickClock, 1000);
tickClock();

/* ══════════════════════════════════════════
   NAVIGATION
   ══════════════════════════════════════════ */
function switchPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  $('page-' + page).classList.add('active');

  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.page === page);
  });
  document.querySelectorAll('.drawer-item').forEach(i => {
    i.classList.toggle('active', i.dataset.page === page);
  });

  closeDrawer();
  if (page === 'memo') renderMemoList();
}

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => switchPage(btn.dataset.page));
});
document.querySelectorAll('.drawer-item').forEach(item => {
  item.addEventListener('click', () => switchPage(item.dataset.page));
});

$('hamburger').addEventListener('click', toggleDrawer);
$('drawer-overlay').addEventListener('click', closeDrawer);

function toggleDrawer() {
  const open = $('drawer').classList.toggle('open');
  $('drawer-overlay').classList.toggle('open', open);
  $('hamburger').classList.toggle('open', open);
}
function closeDrawer() {
  $('drawer').classList.remove('open');
  $('drawer-overlay').classList.remove('open');
  $('hamburger').classList.remove('open');
}

/* ══════════════════════════════════════════
   SERVICE WORKER 登録 & 通知
   ══════════════════════════════════════════ */
let swReg = null;

async function initServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    swReg = await navigator.serviceWorker.register('./sw.js');
    navigator.serviceWorker.addEventListener('message', event => {
      const { type, page } = event.data || {};
      if (type === 'OPEN_PAGE' && page) switchPage(page);
      if (type === 'REQUEST_SCHEDULES') syncSchedulesToSW();
    });
  } catch (err) {
    console.warn('SW registration failed:', err);
  }
}

function syncSchedulesToSW() {
  if (!swReg || !swReg.active) return;
  swReg.active.postMessage({ type: 'SYNC_SCHEDULES', payload: { schedules } });
}

/* ══════════════════════════════════════════
   TOAST NOTIFICATION（アプリ前面時）
   ══════════════════════════════════════════ */
let toastTimer = null;

function showToast(title, body) {
  $('toast-title').textContent = title;
  $('toast-body').textContent  = body;
  $('toast').classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('show'), 4500);
}

/* ══════════════════════════════════════════
   PAGE 1: SCHEDULE
   ══════════════════════════════════════════ */
$('sch-add-btn').addEventListener('click', addSchedule);
$('sch-name').addEventListener('keydown', e => { if (e.key === 'Enter') addSchedule(); });

function addSchedule() {
  const time = $('sch-time').value;
  const name = $('sch-name').value.trim();
  const cat  = $('sch-cat').value;

  if (!time || !name) {
    $('sch-name').style.borderColor = 'var(--danger)';
    setTimeout(() => $('sch-name').style.borderColor = '', 800);
    return;
  }

  schedules.push({ id: Date.now(), time, name, cat });
  schedules.sort((a, b) => a.time.localeCompare(b.time));
  save('lf_schedules', schedules);
  syncSchedulesToSW();
  $('sch-name').value = '';
  renderScheduleList();
}

function removeSchedule(id) {
  schedules = schedules.filter(s => s.id !== id);
  save('lf_schedules', schedules);
  syncSchedulesToSW();
  renderScheduleList();
}

function renderScheduleList() {
  const list = $('schedule-list');
  $('sch-count').textContent = schedules.length + '件';

  if (!schedules.length) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">&#x1F4C5;</div><div class="empty-text">スケジュールがありません</div></div>';
    return;
  }

  const now    = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const curIdx = getCurrentEventIndex(nowMin);

  list.innerHTML = '';
  schedules.forEach((s, i) => {
    const [h, m] = s.time.split(':').map(Number);
    const min    = h * 60 + m;
    const isCur  = i === curIdx;
    const isPast = min < nowMin && !isCur;

    const item = create('div', 'schedule-item' + (isCur ? ' is-current' : '') + (isPast ? ' is-past' : ''));
    const catBadge = { general: '一般', work: '仕事', meal: '食事', exercise: '運動', rest: '休憩' }[s.cat] || s.cat;

    item.innerHTML =
      '<span class="sch-time">' + s.time + '</span>' +
      '<span class="sch-name">' + escHtml(s.name) + '</span>' +
      '<span class="sch-badge ' + s.cat + '">' + catBadge + '</span>' +
      '<button class="sch-delete" aria-label="削除">&times;</button>';

    item.querySelector('.sch-delete').addEventListener('click', () => removeSchedule(s.id));
    list.appendChild(item);
  });
}

function updateTimerDisplay(now) {
  const nowSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  const nowMin = Math.floor(nowSec / 60);
  if (!schedules.length) return;

  const curIdx = getCurrentEventIndex(nowMin);
  const cur    = curIdx >= 0 ? schedules[curIdx] : null;
  const next   = schedules.find(s => {
    const [h, m] = s.time.split(':').map(Number);
    return h * 60 + m > nowMin;
  });

  const nameEl  = $('timer-event-name');
  const countEl = $('timer-countdown');
  const nextEl  = $('timer-next-label');
  const fillEl  = $('timer-progress-fill');

  if (cur) {
    nameEl.textContent = cur.name;
    if (next) {
      const [nh, nm] = next.time.split(':').map(Number);
      const targetSec = nh * 3600 + nm * 60;
      const diff = targetSec - nowSec;
      if (diff >= 0) {
        countEl.textContent = formatCountdown(diff);
        nextEl.textContent  = '次: ' + next.time + ' ' + next.name;
        const [ch, cm] = cur.time.split(':').map(Number);
        const startSec = ch * 3600 + cm * 60;
        const total    = targetSec - startSec;
        const elapsed  = nowSec - startSec;
        fillEl.style.width = (total > 0 ? Math.min(100, elapsed / total * 100) : 0) + '%';
      }
    } else {
      countEl.textContent = '終了';
      nextEl.textContent  = '本日のスケジュール終了';
      fillEl.style.width  = '100%';
    }
  } else if (next) {
    nameEl.textContent = '待機中...';
    const [nh, nm] = next.time.split(':').map(Number);
    const diff = nh * 3600 + nm * 60 - nowSec;
    countEl.textContent = diff >= 0 ? formatCountdown(diff) : '--:--';
    nextEl.textContent  = '次: ' + next.time + ' ' + next.name;
    fillEl.style.width  = '0%';
  } else {
    nameEl.textContent  = 'スケジュールを追加';
    countEl.textContent = '--:--';
    nextEl.textContent  = '';
    fillEl.style.width  = '0%';
  }
}

function getCurrentEventIndex(nowMin) {
  let idx = -1;
  schedules.forEach((s, i) => {
    const [h, m] = s.time.split(':').map(Number);
    if (h * 60 + m <= nowMin) idx = i;
  });
  return idx;
}

function formatCountdown(totalSec) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return pad(h) + ':' + pad(m) + ':' + pad(s);
  return pad(m) + ':' + pad(s);
}

function checkNotifications(now) {
  if (now.getSeconds() !== 0) return;
  const key    = now.toISOString().slice(0, 10);
  const nowStr = pad(now.getHours()) + ':' + pad(now.getMinutes());
  schedules.forEach(s => {
    const nid = key + '_' + s.id;
    if (s.time === nowStr && !notified.has(nid)) {
      notified.add(nid);
      save('lf_notified', [...notified]);
      showToast(s.time + ' — ' + s.name, '時間になりました！');
    }
  });
}

/* ══════════════════════════════════════════
   PAGE 2: INVENTORY
   ══════════════════════════════════════════ */
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    invFilter = tab.dataset.tab;
    renderInventory();
  });
});

$('inv-add-btn').addEventListener('click', addInventory);
$('inv-name').addEventListener('keydown', e => { if (e.key === 'Enter') addInventory(); });

function addInventory() {
  const name = $('inv-name').value.trim();
  const qty  = parseInt($('inv-qty').value) || 0;
  const cat  = $('inv-cat').value;
  if (!name) {
    $('inv-name').style.borderColor = 'var(--danger)';
    setTimeout(() => $('inv-name').style.borderColor = '', 800);
    return;
  }
  inventory.push({ id: Date.now(), name, qty, cat, threshold: 2 });
  save('lf_inventory', inventory);
  $('inv-name').value = '';
  $('inv-qty').value  = '1';
  renderInventory();
}

function changeQty(id, delta) {
  const item = inventory.find(i => i.id === id);
  if (!item) return;
  item.qty = Math.max(0, item.qty + delta);
  save('lf_inventory', inventory);
  renderInventory();
}

function removeInventory(id) {
  inventory = inventory.filter(i => i.id !== id);
  save('lf_inventory', inventory);
  renderInventory();
}

function renderInventory() {
  const grid = $('inventory-grid');
  const catLabel    = { food: '食材', daily: '日用品' };
  const filterLabel = { all: 'すべてのアイテム', food: '食材', daily: '日用品' };
  const filtered = invFilter === 'all' ? inventory : inventory.filter(i => i.cat === invFilter);

  $('inv-count').textContent        = filtered.length + '件';
  $('inv-filter-label').textContent = filterLabel[invFilter];

  const lowItems = inventory.filter(i => i.qty <= i.threshold);
  const banner   = $('low-stock-banner');
  if (lowItems.length) {
    banner.classList.add('visible');
    $('low-stock-text').textContent = '在庫少: ' + lowItems.map(i => i.name).join('、');
  } else {
    banner.classList.remove('visible');
  }

  if (!filtered.length) {
    grid.innerHTML = '<div class="empty-state full-col"><div class="empty-icon">&#x1F4E6;</div><div class="empty-text">アイテムがありません</div></div>';
    return;
  }

  grid.innerHTML = '';
  filtered.forEach(item => {
    const isLow = item.qty <= item.threshold;
    const card  = create('div', 'inv-card' + (isLow ? ' low' : ''));
    card.innerHTML =
      (isLow ? '<span class="inv-low-badge">残り少</span>' : '') +
      '<div class="inv-card-name">' + escHtml(item.name) + '</div>' +
      '<div class="inv-card-cat">' + (catLabel[item.cat] || item.cat) + '</div>' +
      '<div><span class="inv-card-qty">' + item.qty + '</span><span class="inv-card-unit">個</span></div>' +
      '<div class="inv-card-controls">' +
        '<button class="qty-btn" data-action="minus">&minus;</button>' +
        '<button class="qty-btn" data-action="plus">&#xFF0B;</button>' +
        '<button class="inv-delete-btn" aria-label="削除">&#x1F5D1;</button>' +
      '</div>';
    card.querySelector('[data-action="minus"]').addEventListener('click', () => changeQty(item.id, -1));
    card.querySelector('[data-action="plus"]').addEventListener('click',  () => changeQty(item.id, +1));
    card.querySelector('.inv-delete-btn').addEventListener('click', () => removeInventory(item.id));
    grid.appendChild(card);
  });
}

/* ══════════════════════════════════════════
   PAGE 3: MEMO
   ══════════════════════════════════════════ */
$('memo-new-btn').addEventListener('click', newMemo);
$('memo-delete-btn').addEventListener('click', deleteMemo);
$('memo-title').addEventListener('input', saveMemo);
$('memo-body').addEventListener('input', saveMemo);

function newMemo() {
  const m = { id: Date.now(), title: '', body: '', updated: new Date().toISOString() };
  memos.unshift(m);
  save('lf_memos', memos);
  activeMemoId = m.id;
  renderMemoList();
  loadMemoEditor(m);
  $('memo-title').focus();
}

function deleteMemo() {
  if (!activeMemoId) return;
  memos = memos.filter(m => m.id !== activeMemoId);
  save('lf_memos', memos);
  activeMemoId = memos.length ? memos[0].id : null;
  renderMemoList();
  if (activeMemoId) {
    loadMemoEditor(memos.find(m => m.id === activeMemoId));
  } else {
    $('memo-title').value = '';
    $('memo-body').value  = '';
    $('memo-updated').textContent = '';
    $('memo-chars').textContent   = '0文字';
  }
}

function saveMemo() {
  if (!activeMemoId) return;
  const m = memos.find(m => m.id === activeMemoId);
  if (!m) return;
  m.title   = $('memo-title').value || '無題';
  m.body    = $('memo-body').value;
  m.updated = new Date().toISOString();
  save('lf_memos', memos);
  renderMemoList();
  $('memo-updated').textContent = fmtDate(m.updated);
  $('memo-chars').textContent   = m.body.length + '文字';
}

function loadMemoEditor(m) {
  if (!m) return;
  $('memo-title').value = m.title === '無題' ? '' : m.title;
  $('memo-body').value  = m.body;
  $('memo-updated').textContent = fmtDate(m.updated);
  $('memo-chars').textContent   = m.body.length + '文字';
}

function selectMemo(id) {
  activeMemoId = id;
  const m = memos.find(m => m.id === id);
  renderMemoList();
  if (m) loadMemoEditor(m);
}

function renderMemoList() {
  const list = $('memo-list');
  if (!memos.length) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">&#x1F4DD;</div><div class="empty-text">メモがありません</div></div>';
    return;
  }
  list.innerHTML = '';
  memos.forEach(m => {
    const item = create('div', 'memo-list-item' + (m.id === activeMemoId ? ' active' : ''));
    item.innerHTML =
      '<div class="memo-list-title">' + escHtml(m.title || '無題') + '</div>' +
      '<div class="memo-list-preview">' + escHtml(m.body.slice(0, 50) || '内容なし') + '</div>' +
      '<div class="memo-list-date">' + fmtDate(m.updated) + '</div>';
    item.addEventListener('click', () => selectMemo(m.id));
    list.appendChild(item);
  });
}

/* ══════════════════════════════════════════
   UTILITIES
   ══════════════════════════════════════════ */
function pad(n) { return String(n).padStart(2, '0'); }

function escHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDate(iso) {
  return new Date(iso).toLocaleString('ja-JP', {
    month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

/* ══════════════════════════════════════════
   INIT
   ══════════════════════════════════════════ */
(async function init() {
  renderScheduleList();
  renderInventory();
  renderMemoList();
  if (activeMemoId) {
    const m = memos.find(m => m.id === activeMemoId);
    if (m) loadMemoEditor(m);
  }

  // Service Worker 登録
  await initServiceWorker();

  // 通知許可ダイアログを表示
  if ('Notification' in window && Notification.permission === 'default') {
    await Notification.requestPermission();
  }
  // 許可済みならSWにスケジュールを同期
  if ('Notification' in window && Notification.permission === 'granted') {
    syncSchedulesToSW();
  }
})();
