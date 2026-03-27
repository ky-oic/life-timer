/**
 * api/vapid-public-key.js
 * クライアントが購読登録に使うVAPID公開鍵を返す
 */
export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({
    publicKey: process.env.VAPID_PUBLIC_KEY
  });
}
