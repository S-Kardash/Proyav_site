import { ok, fail, preflight, db, sheetsAppend, PRODUCT_NAMES } from './_utils.js';

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'POST') return fail('Method not allowed', 405);

  let body;
  try { body = await request.json(); } catch { return fail('Invalid JSON'); }

  const { token, photo_count, qty_total, total_amount } = body;
  if (!token) return fail('token обов\'язковий');

  const client = db(env);

  const order = await client.query('orders', {
    select:  '*,photographers(name,city)',
    filters: { token: `eq.${token}` },
    single:  true,
  }).catch(() => null);

  if (!order) return fail('Замовлення не знайдено', 404);
  if (order.uploaded_at) return ok({ ok: true, already: true }); // idempotent

  await client.query('orders', {
    method:  'PATCH',
    filters: { token: `eq.${token}` },
    body: {
      status:       'uploaded',
      photo_count:  photo_count  || null,
      qty_total:    qty_total    || null,
      total_amount: total_amount || null,
      uploaded_at:  new Date().toISOString(),
    },
  });

  // Google Sheets sync (non-fatal)
  const date = new Date().toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' });
  await sheetsAppend(env, [
    date,
    order.token.toUpperCase(),
    order.source === 'photographer' ? 'Від фотографа' : 'Роздріб',
    order.client_name,
    order.client_phone,
    order.client_instagram ? '@' + order.client_instagram : '',
    order.photographers?.name || '',
    order.photographers?.city || '',
    PRODUCT_NAMES[order.product_type] || order.product_type,
    photo_count  || '',
    qty_total    || '',
    total_amount ? `${total_amount} грн` : '',
    'Фото отримано',
    '',
    '',
  ]);

  return ok({ ok: true });
}
