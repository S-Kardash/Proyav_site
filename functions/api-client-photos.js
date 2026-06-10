import { ok, fail, preflight, db, authRequest } from './_utils.js';

/**
 * api-client-photos.js — кадри замовлення з R2-архіву для кабінету клієнта.
 *
 * GET ?t=<order_token>            (Authorization: Bearer <client JWT>)
 *   → { photos: [{ id, color, paper, qty, url }] }
 *   Перевіряє, що замовлення належить цьому клієнту. url — короткоживуче
 *   підписане посилання (1 год), бо <img> не вміє нести Bearer-заголовок.
 *
 * GET ?img=<storage_key>&exp=<unix>&sig=<hmac>   (без авторизації)
 *   → стрімить зображення з R2, якщо підпис валідний і не прострочений.
 */

const TTL = 3600; // 1 година життя підписаного URL

async function hmacHex(secret, msg) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'GET') return fail('Method not allowed', 405);

  const url = new URL(request.url);

  // ── Режим 2: віддати зображення за підписаним URL ────────────────────
  const imgKey = url.searchParams.get('img');
  if (imgKey) {
    if (!env.PHOTOS) return fail('Сховище не налаштовано', 500);
    const exp = Number(url.searchParams.get('exp') || 0);
    const sig = url.searchParams.get('sig') || '';
    if (!exp || exp < Math.floor(Date.now() / 1000)) return fail('Посилання прострочене', 403);
    const expect = await hmacHex(env.JWT_SECRET, `${imgKey}|${exp}`);
    if (sig !== expect) return fail('Невірний підпис', 403);

    const obj = await env.PHOTOS.get(imgKey);
    if (!obj) return fail('Кадр не знайдено', 404);
    return new Response(obj.body, {
      headers: {
        'Content-Type':  obj.httpMetadata?.contentType || 'image/jpeg',
        'Cache-Control': 'private, max-age=3600',
      },
    });
  }

  // ── Режим 1: список кадрів замовлення (потрібен client JWT) ──────────
  let claims;
  try { claims = await authRequest(request, env); }
  catch (e) { return fail(e.message, 401); }
  if (claims.role !== 'client') return fail('Forbidden', 403);

  const orderToken = url.searchParams.get('t') || '';
  if (!/^[a-z0-9]{4,64}$/i.test(orderToken)) return fail('Невірний токен замовлення');

  const client = db(env);
  let order;
  try {
    order = await client.query('orders', {
      select: 'token,client_id', filters: { token: `eq.${orderToken}` }, single: true,
    });
  } catch { return fail('Замовлення не знайдено', 404); }
  if (!order || order.client_id !== claims.id) return fail('Forbidden', 403);

  const rows = await client.query('order_photos', {
    select: 'id,storage_key,color,paper,qty,created_at',
    filters: { order_token: `eq.${orderToken}` },
    order: 'id.asc',
    limit: 100,
  }).catch(() => []);

  const exp = Math.floor(Date.now() / 1000) + TTL;
  const photos = await Promise.all((rows || []).map(async r => ({
    id:    r.id,
    color: r.color,
    paper: r.paper,
    qty:   r.qty,
    url:   `/api-client-photos?img=${encodeURIComponent(r.storage_key)}&exp=${exp}&sig=${await hmacHex(env.JWT_SECRET, `${r.storage_key}|${exp}`)}`,
  })));

  return ok({ photos });
}
