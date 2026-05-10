/**
 * Netlify Function: send-order
 *
 * Secure proxy between the browser and Telegram Bot API.
 * TG_TOKEN and TG_CHAT_ID never leave the server.
 *
 * Environment variables (set in Netlify Dashboard → Site → Environment variables):
 *   TG_TOKEN   — your Telegram Bot token
 *   TG_CHAT_ID — your personal Telegram chat ID
 *
 * Endpoints (all POST):
 *   { type: 'text',  text: '...' }
 *   { type: 'photo', base64: '...', mimeType: 'image/jpeg', filename: 'photo.jpg', caption: '...' }
 */

const TG_API = `https://api.telegram.org/bot${process.env.TG_TOKEN}`;

/* ── CORS headers ── */
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/* ── Main handler ── */
exports.handler = async (event) => {
  /* Preflight */
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' };
  }

  /* Guard: env vars must be set */
  if (!process.env.TG_TOKEN || !process.env.TG_CHAT_ID) {
    console.error('[send-order] TG_TOKEN or TG_CHAT_ID env var is missing');
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Server misconfigured' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  try {
    switch (payload.type) {
      case 'text':  return await handleText(payload);
      case 'photo': return await handlePhoto(payload);
      default:
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Unknown type' }) };
    }
  } catch (err) {
    console.error('[send-order] Error:', err.message);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};

/* ── Send text message ── */
async function handleText({ text }) {
  if (!text || typeof text !== 'string') {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'text is required' }) };
  }

  const res  = await fetch(`${TG_API}/sendMessage`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      chat_id:    process.env.TG_CHAT_ID,
      text:       text.slice(0, 4096), // Telegram limit
      parse_mode: 'HTML',
    }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram sendMessage: ${data.description}`);

  return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true }) };
}

/* ── Send photo ── */
async function handlePhoto({ base64, mimeType, filename, caption }) {
  if (!base64) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'base64 is required' }) };
  }

  /* Validate base64 size — Netlify body limit is 6 MB */
  const approxBytes = Math.round(base64.length * 0.75);
  if (approxBytes > 5 * 1024 * 1024) {
    return {
      statusCode: 413,
      headers: CORS,
      body: JSON.stringify({ error: 'Photo too large (max 5 MB after compression)' }),
    };
  }

  const buffer   = Buffer.from(base64, 'base64');
  const boundary = 'B' + Date.now().toString(36);
  const mime     = mimeType || 'image/jpeg';
  const name     = filename || 'photo.jpg';
  const cap      = (caption || '').slice(0, 1024);

  /* Build multipart/form-data manually (no external deps) */
  const CRLF    = '\r\n';
  const pre     = [
    `--${boundary}${CRLF}`,
    `Content-Disposition: form-data; name="chat_id"${CRLF}${CRLF}`,
    `${process.env.TG_CHAT_ID}${CRLF}`,

    `--${boundary}${CRLF}`,
    `Content-Disposition: form-data; name="caption"${CRLF}${CRLF}`,
    `${cap}${CRLF}`,

    `--${boundary}${CRLF}`,
    `Content-Disposition: form-data; name="photo"; filename="${name}"${CRLF}`,
    `Content-Type: ${mime}${CRLF}${CRLF}`,
  ].join('');

  const post    = `${CRLF}--${boundary}--${CRLF}`;
  const body    = Buffer.concat([
    Buffer.from(pre,  'utf8'),
    buffer,
    Buffer.from(post, 'utf8'),
  ]);

  const res  = await fetch(`${TG_API}/sendPhoto`, {
    method:  'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body,
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram sendPhoto: ${data.description}`);

  return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true }) };
}
