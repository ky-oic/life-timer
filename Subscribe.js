/**
 * api/subscribe.js
 * プッシュ通知の購読情報を受け取って保存する
 */

// Vercel の KV ストアを使う（無料プランで使用可能）
// 購読情報をメモリに保持（Vercel Edge の場合は KV が必要だが、まず動作確認用）
export default async function handler(req, res) {
  // CORS ヘッダー
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { subscription } = req.body;
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Invalid subscription' });
    }

    // Vercel KV に保存（環境変数 KV_REST_API_URL / KV_REST_API_TOKEN が必要）
    // ない場合はそのまま 200 を返す（ステートレスモード）
    if (process.env.KV_REST_API_URL) {
      await fetch(`${process.env.KV_REST_API_URL}/set/push_sub_${Date.now()}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ value: JSON.stringify(subscription) }),
      });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('subscribe error:', err);
    return res.status(500).json({ error: err.message });
  }
}
