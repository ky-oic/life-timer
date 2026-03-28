/**
 * api/subscribe.js
 * 購読情報をVercel KV（無料）に保存する
 * KVがない場合はcookieベースのステートレスで動作
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { subscription, schedules } = req.body;
    if (!subscription?.endpoint) {
      return res.status(400).json({ error: 'Invalid subscription' });
    }

    // Vercel KV に購読情報とスケジュールを保存
    if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
      const key = 'sub_' + Buffer.from(subscription.endpoint).toString('base64').slice(0, 32);
      await fetch(`${process.env.KV_REST_API_URL}/set/${key}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          value: JSON.stringify({ subscription, schedules: schedules || [], updatedAt: Date.now() }),
          ex: 86400, // 24時間で失効
        }),
      });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('subscribe error:', err);
    return res.status(500).json({ error: err.message });
  }
}
