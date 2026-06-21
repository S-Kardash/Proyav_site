import { ok, fail, preflight, db, sheetsAppend, PRODUCT_NAMES, packagePrice, rateLimited, tooMany } from './_utils.js';

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'POST') return fail('Method not allowed', 405);
  if (rateLimited(request, { key: 'finalize', limit: 30, windowMs: 60000 })) return tooMany();

  let body;
  try { body = await request.json(); } catch { return fail('Invalid JSON'); }

  const { token, photo_count, qty_total, total_amount, product_type } = body;
  if (!token) return fail('token обов\'язковий');

  const client = db(env);

  const order = await client.query('orders', {
    select:  '*,photographers(name,city)',
    filters: { token: `eq.${token}` },
    single:  true,
  }).catch(() => null);

  if (!order) return fail('Замовлення не знайдено', 404);
  if (order.uploaded_at) return ok({ ok: true, already: true }); // idempotent

  // ── Server-authoritative price ──────────────────────────────────────────
  // A magic-link order is always a fixed package. Recompute price + the
  // (auto-upgraded) package server-side — never trust the client total.
  const chosenType = product_type || order.product_type || 'small';
  const pp = packagePrice(chosenType, qty_total);
  const finalType  = pp ? pp.productType : (order.product_type || null);
  const finalTotal = pp ? pp.price : (total_amount || null);

  await client.query('orders', {
    method:  'PATCH',
    filters: { token: `eq.${token}` },
    body: {
      status:       'uploaded',
      photo_count:  photo_count || null,
      qty_total:    qty_total   || null,
      total_amount: finalTotal,
      product_type: finalType,
      uploaded_at:  new Date().toISOString(),
    },
  });

  // Google Sheets sync — не блокує відповідь (AUDIT B2).
  const date = new Date().toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' });
  const sheetsRow = sheetsAppend(env, [
    date,
    order.token.toUpperCase(),
    order.source === 'photographer' ? 'Від фотографа' : 'Роздріб',
    order.client_name,
    order.client_phone,
    order.client_instagram ? '@' + order.client_instagram : '',
    order.photographers?.name || '',
    order.photographers?.city || '',
    PRODUCT_NAMES[finalType] || finalType || '',
    photo_count || '',
    qty_total   || '',
    finalTotal ? `${finalTotal} грн` : '',
    'Фото отримано',
    '',
    '',
  ]).catch(e => console.error('[finalize] sheets:', e.message));
  if (context.waitUntil) context.waitUntil(sheetsRow); else await sheetsRow;

  return ok({ ok: true, total_amount: finalTotal, product_type: finalType });
}
