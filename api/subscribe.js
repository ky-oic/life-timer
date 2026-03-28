/**
 * api/subscribe.js
 * 購読情報とスケジュールをUpstash Redisに保存
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

    const url   = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) {
      return res.status(500).json({ error: 'Redis not configured' });
    }

    // エンドポイントからユニークキーを生成
    const key = 'sub_' + Buffer.from(subscription.endpoint).toString('base64').slice(-24).replace(/[^a-zA-Z0-9]/g, '_');
    const value = JSON.stringify({ subscription, schedules: schedules || [], updatedAt: Date.now() });

    // Upstash REST API で SET（24時間で失効）
    const r = await fetch(`${url}/set/${key}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ value, ex: 86400 }),
    });

    if (!r.ok) {
      const text = await r.text();
      console.error('Upstash set error:', r.status, text);
      return res.status(500).json({ error: 'Redis set failed' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('subscribe error:', err);
    return res.status(500).json({ error: err.message });
  }
}
