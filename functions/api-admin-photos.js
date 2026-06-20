import { ok, fail, preflight, authRequest, isStaff, db } from './_utils.js';

/**
 * api-admin-photos.js — перегляд архіву кадрів замовлення в адмінці.
 *
 * GET ?t=<order_token>   (Authorization: Bearer <admin JWT>)
 *   → { photos: [{ id, color, paper, qty, url }] }
 *   На відміну від api-client-photos, тут адмін бачить БУДЬ-ЯКЕ замовлення
 *   (без перевірки client_id). Стрім самих зображень — через той самий
 *   HMAC-підписаний маршрут `/api-client-photos?img=…` (підпис на JWT_SECRET),
 *   щоб не дублювати логіку віддачі з R2.
 */

const TTL = 3600; // 1 год життя підписаного URL

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

  let claims; try { claims = await authRequest(request, env); } catch { return fail('Unauthorized', 401); }
  if (!isStaff(claims)) return fail('Forbidden', 403);

  const orderToken = new URL(request.url).searchParams.get('t') || '';
  if (!/^[a-z0-9]{4,64}$/i.test(orderToken)) return fail('Невірний токен замовлення');

  const rows = await db(env).query('order_photos', {
    select: 'id,storage_key,color,paper,qty,created_at',
    filters: { order_token: `eq.${orderToken}` },
    order: 'id.asc',
    limit: 200,
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
