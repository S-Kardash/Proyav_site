import { rateLimited, tooMany } from './_utils.js';

/**
 * send-order.js — захищений Telegram-проксі для ТЕКСТОВИХ сповіщень.
 * TG_TOKEN/TG_CHAT_ID ніколи не потрапляють у браузер.
 *
 * POST { type: 'text', text: '...' }
 *
 * Кадри більше НЕ йдуть сюди: вони завантажуються напряму в R2 через /api-upload
 * (старий base64→sendPhoto шлях прибрано — order.html шле лише текст-пінг).
 */

const CORS = {
  'Content-Type':                 'application/json',
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const r = (body, status = 200) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: CORS });

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return new Response('', { status: 200, headers: CORS });
  if (request.method !== 'POST') return r('Method Not Allowed', 405);
  // Best-effort анти-абʼюз квоти Telegram (спільний лічильник, AUDIT A1).
  if (rateLimited(request, { key: 'send-order', limit: 80, windowMs: 60000 })) return tooMany();

  if (!env.TG_TOKEN || !env.TG_CHAT_ID) {
    return r({ error: 'TG_TOKEN або TG_CHAT_ID не налаштовано' }, 500);
  }

  let payload;
  try { payload = await request.json(); } catch { return r({ error: 'Invalid JSON' }, 400); }
  if (payload.type !== 'text') return r({ error: 'Unknown type' }, 400);

  try {
    const res = await fetch(`https://api.telegram.org/bot${env.TG_TOKEN}/sendMessage`, {
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
  } catch (e) {
    console.error('[send-order]', e.message);
    return r({ error: e.message }, 500);
  }
}
