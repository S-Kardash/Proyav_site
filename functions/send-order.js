/**
 * send-order.js — Cloudflare Pages Function
 * Secure Telegram proxy. TG_TOKEN and TG_CHAT_ID never reach the browser.
 *
 * POST { type: 'text',  text: '...' }
 * POST { type: 'photo', base64: '...', mimeType: 'image/jpeg', filename: 'photo.jpg', caption: '...' }
 */

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function r(body, status = 200) {
  return new Response(
    typeof body === 'string' ? body : JSON.stringify(body),
    { status, headers: CORS }
  );
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') return new Response('', { status: 200, headers: CORS });
  if (request.method !== 'POST') return r('Method Not Allowed', 405);

  if (!env.TG_TOKEN || !env.TG_CHAT_ID) {
    return r({ error: 'TG_TOKEN або TG_CHAT_ID не налаштовано' }, 500);
  }

  let payload;
  try { payload = await request.json(); } catch { return r({ error: 'Invalid JSON' }, 400); }

  const TG = `https://api.telegram.org/bot${env.TG_TOKEN}`;

  try {
    if (payload.type === 'text') {
      const res = await fetch(`${TG}/sendMessage`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id:    env.TG_CHAT_ID,
          text:       (payload.text || '').slice(0, 4096),
          parse_mode: 'HTML',
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(`Telegram: ${data.description}`);
      return r({ ok: true });
    }

    if (payload.type === 'photo') {
      if (!payload.base64) return r({ error: 'base64 required' }, 400);

      // Decode base64 → binary → Blob for multipart upload
      const binary  = atob(payload.base64);
      const bytes   = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      const form = new FormData();
      form.append('chat_id', env.TG_CHAT_ID);
      form.append('photo', new Blob([bytes], { type: payload.mimeType || 'image/jpeg' }), payload.filename || 'photo.jpg');
      if (payload.caption) form.append('caption', payload.caption.slice(0, 1024));
      form.append('parse_mode', 'HTML');

      const res = await fetch(`${TG}/sendPhoto`, { method: 'POST', body: form });
      const data = await res.json();
      if (!data.ok) throw new Error(`Telegram sendPhoto: ${data.description}`);
      return r({ ok: true });
    }

    return r({ error: 'Unknown type' }, 400);
  } catch (e) {
    console.error('[send-order]', e.message);
    return r({ error: e.message }, 500);
  }
}
