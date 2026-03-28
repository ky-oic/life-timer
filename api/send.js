/**
 * api/send.js
 * 即時プッシュ通知送信
 * app.js がスケジュール時刻の1秒前にここを呼ぶ
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
    const { subscription, title, body } = req.body;

    if (!subscription || !title) {
      return res.status(400).json({ error: 'subscription and title required' });
    }

    const payload = JSON.stringify({ title, body: body || '' });
    await webpush.sendNotification(subscription, payload);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('send error:', err);
    // 購読が無効になった場合（410）は正常扱いにして再購読を促す
    if (err.statusCode === 410) {
      return res.status(410).json({ error: 'subscription_expired' });
    }
    return res.status(500).json({ error: err.message });
  }
}
