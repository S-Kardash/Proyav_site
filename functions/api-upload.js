import { ok, fail, preflight, db, verifyJWT, rateLimited, tooMany } from './_utils.js';

/**
 * api-upload.js — пряме бінарне завантаження кадру в R2 (без base64/Telegram).
 *
 * POST /api-upload?t=<order_token>
 *   Body: сирі байти зображення (Content-Type: image/*)
 *   Headers: X-Filename, X-Color, X-Paper, X-Qty (опційно)
 *   → { ok:true, key }
 *
 * Доступ: токен замовлення = ключ-здатність (клієнт завантажує у своє замовлення).
 * Адмін (Bearer admin JWT) може завантажувати в будь-яке замовлення.
 * Замінює старий шлях base64→/send-order→Telegram: зберігає ОРИГІНАЛ у R2 +
 * реєструє в order_photos. Telegram лишається тільки для текстових сповіщень.
 */

const MAX_BYTES = 30 * 1024 * 1024; // 30 МБ на кадр (ліміт тіла Pages Functions — 100 МБ)

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'POST') return fail('Method not allowed', 405);
  if (!env.PHOTOS) return fail('Сховище R2 (PHOTOS) не налаштовано', 500);
  if (rateLimited(request, { key: 'upload', limit: 300, windowMs: 60000 })) return tooMany();

  const url = new URL(request.url);
  const token = url.searchParams.get('t') || '';
  if (!/^[a-z0-9]{4,64}$/i.test(token)) return fail('Невірний токен замовлення');

  const ct = request.headers.get('content-type') || 'image/jpeg';
  if (!/^image\//i.test(ct)) return fail('Дозволені лише зображення');

  const client = db(env);

  // Замовлення має існувати (token-as-capability). Адмін з Bearer — будь-яке.
  let isAdmin = false;
  const authH = request.headers.get('Authorization') || '';
  if (authH.startsWith('Bearer ') && env.JWT_SECRET) {
    try { const c = await verifyJWT(authH.slice(7), env.JWT_SECRET); isAdmin = (c.role === 'admin' || c.role === 'manager'); } catch {}
  }
  if (!isAdmin) {
    const order = await client.query('orders', {
      select: 'token', filters: { token: `eq.${token}` }, limit: 1,
    }).catch(() => null);
    if (!order || !order.length) return fail('Замовлення не знайдено', 404);
  }

  // Читаємо тіло (бінарно). ArrayBuffer надійніший за стрім для R2.put з відомою довжиною.
  const buf = await request.arrayBuffer();
  if (!buf.byteLength) return fail('Порожнє тіло');
  if (buf.byteLength > MAX_BYTES) return fail('Файл завеликий (макс. 30 МБ)', 413);

  const rawName = request.headers.get('X-Filename') || 'photo.jpg';
  let safeName = 'photo.jpg';
  try { safeName = decodeURIComponent(rawName); } catch { safeName = rawName; }
  safeName = safeName.replace(/[^\w.\-]+/g, '_').slice(-80) || 'photo.jpg';

  const key = `orders/${token}/${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${safeName}`;
  try {
    await env.PHOTOS.put(key, buf, { httpMetadata: { contentType: ct } });
  } catch (e) {
    console.error('[upload] R2 put:', e.message);
    return fail('Не вдалося зберегти файл', 502);
  }

  // Реєстр кадру (не фатально — файл уже в R2).
  client.query('order_photos', {
    method: 'POST',
    body: {
      order_token: token,
      storage_key: key,
      color: request.headers.get('X-Color') || null,
      paper: request.headers.get('X-Paper') || null,
      qty:   Number(request.headers.get('X-Qty')) || 1,
    },
  }).catch(e => console.error('[upload] order_photos:', e.message));

  return ok({ ok: true, key });
}
