// api-finalize.js — POST: called after all photos sent; marks order as uploaded
// Payload: { token, photo_count, qty_total, total_amount }
const { db, ok, fail, preflight, sheetsAppend, PRODUCT_NAMES } = require('./_utils');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight();
  if (event.httpMethod !== 'POST') return fail('Method Not Allowed', 405);

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return fail('Invalid JSON'); }

  const { token, photo_count, qty_total, total_amount } = body;
  if (!token) return fail('token обов\'язковий');

  const supabase = db();

  // Fetch order (with photographer)
  const { data: order, error: fetchErr } = await supabase
    .from('orders')
    .select('*, photographers(name, city)')
    .eq('token', token)
    .maybeSingle();

  if (fetchErr) return fail(fetchErr.message, 500);
  if (!order)   return fail('Замовлення не знайдено', 404);
  if (order.uploaded_at) return ok({ ok: true, already: true }); // idempotent

  // Update order
  const { error: updateErr } = await supabase
    .from('orders')
    .update({
      status:       'uploaded',
      photo_count:  photo_count  || null,
      qty_total:    qty_total    || null,
      total_amount: total_amount || null,
      uploaded_at:  new Date().toISOString(),
    })
    .eq('token', token);

  if (updateErr) return fail(updateErr.message, 500);

  // Google Sheets sync
  const date = new Date().toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' });
  await sheetsAppend([
    date,
    order.token.toUpperCase(),
    order.source === 'photographer' ? 'Від фотографа' : 'Роздріб',
    order.client_name,
    order.client_phone,
    order.client_instagram || '',
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
};
