/**
 * api/vapid-public-key.js
 */
export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) {
    console.error('VAPID_PUBLIC_KEY is not set');
    return res.status(500).json({ error: 'VAPID_PUBLIC_KEY not configured' });
  }
  return res.status(200).json({ publicKey: key });
}
