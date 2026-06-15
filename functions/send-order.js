import { db } from './_utils.js';

/**
 * send-order.js — Cloudflare Pages Function
 * Secure Telegram proxy. TG_TOKEN and TG_CHAT_ID never reach the browser.
 *
 * POST { type: 'text',  text: '...' }
 * POST { type: 'photo', base64, mimeType, filename, caption,
 *        order_token?, color?, paper?, qty? }
 *
 * Durability (кабінет клієнта): if the R2 binding PHOTOS is configured and the
 * payload carries order_token, the photo is archived to R2 + registered in
 * order_photos BEFORE forwarding to Telegram — so a Telegram hiccup can no
 * longer lose a client's frame. Without the binding everything works as before.
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

// Best-effort анти-абʼюз квоти Telegram (AUDIT A1). ~80 фото/хв на IP вистачає.
const _soRl = new Map();
function sendLimited(request, limit = 80, windowMs = 60000) {
  try {
    const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('x-forwarded-for') || 'x';
    const now = Date.now(); let b = _soRl.get(ip);
    if (!b || now > b.reset) { b = { count: 0, reset: now + windowMs }; _soRl.set(ip, b); }
    b.count++;
    if (_soRl.size > 5000) for (const [k, v] of _soRl) if (now > v.reset) _soRl.delete(k);
    return b.count > limit;
  } catch { return false; }
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') return new Response('', { status: 200, headers: CORS });
  if (request.method !== 'POST') return r('Method Not Allowed', 405);
  if (sendLimited(request)) return r({ error: 'Забагато запитів. Спробуйте за хвилину.' }, 429);

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

      // ── Archive to R2 first (durability) — non-fatal, never blocks Telegram ──
      let archived = false;
      const orderToken = String(payload.order_token || '');
      if (env.PHOTOS && /^[a-z0-9]{4,64}$/i.test(orderToken)) {
        try {
          const safeName = String(payload.filename || 'photo.jpg').replace(/[^\w.\-]+/g, '_').slice(-80);
          const key = `orders/${orderToken}/${Date.now()}_${safeName}`;
          await env.PHOTOS.put(key, bytes, {
            httpMetadata: { contentType: payload.mimeType || 'image/jpeg' },
          });
          archived = true;
          try {
            await db(env).query('order_photos', {
              method: 'POST',
              body: {
                order_token: orderToken,
                storage_key: key,
                color: payload.color || null,
                paper: payload.paper || null,
                qty:   Number(payload.qty) || 1,
              },
            });
          } catch (e) { console.error('[send-order] order_photos row:', e.message); }
        } catch (e) { console.error('[send-order] R2 archive:', e.message); }
      }

      const form = new FormData();
      form.append('chat_id', env.TG_CHAT_ID);
      form.append('photo', new Blob([bytes], { type: payload.mimeType || 'image/jpeg' }), payload.filename || 'photo.jpg');
      if (payload.caption) form.append('caption', payload.caption.slice(0, 1024));
      form.append('parse_mode', 'HTML');

      const res = await fetch(`${TG}/sendPhoto`, { method: 'POST', body: form });
      const data = await res.json();
      if (!data.ok) throw new Error(`Telegram sendPhoto: ${data.description}`);
      return r({ ok: true, archived });
    }

    return r({ error: 'Unknown type' }, 400);
  } catch (e) {
    console.error('[send-order]', e.message);
    return r({ error: e.message }, 500);
  }
}
