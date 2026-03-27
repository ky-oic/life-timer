/**
 * api/schedule.js
 * スケジュールを受け取り、各時刻にWeb Pushを送信する
 * Vercel はサーバーレスなので setTimeout で予約する
 */
import webpush from 'web-push';

webpush.setVapidDetails(
  'mailto:lifeflow@example.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { subscription, schedules } = req.body;

    if (!subscription || !Array.isArray(schedules)) {
      return res.status(400).json({ error: 'subscription and schedules are required' });
    }

    const now    = new Date();
    const pushed = [];

    // 各スケジュールに対してタイマーをセット
    for (const s of schedules) {
      const [h, m] = s.time.split(':').map(Number);
      const fireAt = new Date(now);
      fireAt.setHours(h, m, 0, 0);
      const msUntil = fireAt.getTime() - now.getTime();

      // 過去 or 10秒未満はスキップ
      if (msUntil < 10000) continue;

      const catEmoji = { general:'⏰', work:'💼', meal:'🍽️', exercise:'🏃', rest:'😴' }[s.cat] || '⏰';
      const catLabel = { general:'一般', work:'仕事', meal:'食事', exercise:'運動', rest:'休憩' }[s.cat] || '';

      const payload = JSON.stringify({
        title: `${catEmoji} ${s.time} — ${s.name}`,
        body:  `${catLabel}の時間です！`,
      });

      // Vercel のサーバーレス関数は最大10秒で終了するので
      // msUntil が小さいものだけ直接 setTimeout で送信
      // 大きいものは Vercel Cron / KV で管理する（今回は10分以内のみ直接送信）
      if (msUntil <= 10 * 60 * 1000) {
        setTimeout(async () => {
          try {
            await webpush.sendNotification(subscription, payload);
          } catch (e) {
            console.error('push error:', e.message);
          }
        }, msUntil);
        pushed.push({ time: s.time, name: s.name, msUntil });
      }
    }

    return res.status(200).json({ ok: true, scheduled: pushed.length, items: pushed });

  } catch (err) {
    console.error('schedule error:', err);
    return res.status(500).json({ error: err.message });
  }
}
