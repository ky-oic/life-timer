/**
 * api/debug.js - 一時的なデバッグ用エンドポイント
 * 購読登録が成功しているか確認する
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return res.status(200).json({ error: 'Redis not configured', env: { url: !!url, token: !!token } });
  }

  try {
    // Upstashのキー一覧を取得
    const r = await fetch(`${url}/keys/sub_*`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await r.json();
    const keys = data.result || [];

    // 各キーの中身（subscriptionのendpointだけ）を返す
    const items = [];
    for (const key of keys) {
      const gr = await fetch(`${url}/get/${key}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const gd = await gr.json();
      if (gd.result) {
        const parsed = JSON.parse(gd.result);
        items.push({
          key,
          endpoint: parsed.subscription?.endpoint?.slice(0, 60) + '...',
          scheduleCount: parsed.schedules?.length || 0,
          updatedAt: new Date(parsed.updatedAt).toLocaleString('ja-JP'),
        });
      }
    }

    return res.status(200).json({ ok: true, subscriptionCount: keys.length, items });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
