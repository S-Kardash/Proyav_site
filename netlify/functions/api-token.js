// api-token.js — GET ?t=TOKEN: validate magic link and return client info
const { db, ok, fail, preflight } = require('./_utils');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight();
  if (event.httpMethod !== 'GET') return fail('Method Not Allowed', 405);

  const { t } = event.queryStringParameters || {};
  if (!t) return fail('Токен відсутній', 400);

  const supabase = db();
  const { data, error } = await supabase
    .from('orders')
    .select('*, photographers(name)')
    .eq('token', t)
    .maybeSingle();

  if (error)  return fail(error.message, 500);
  if (!data)  return fail('Недійсне посилання — зверніться до фотографа або менеджера', 404);

  if (data.uploaded_at) {
    return fail('Фото за цим посиланням вже було надіслано. Якщо виникла помилка — напишіть нам.', 410);
  }
  if (new Date(data.expires_at) < new Date()) {
    return fail('Термін дії посилання закінчився (72 год). Попросіть нове посилання.', 410);
  }

  return ok({
    valid:            true,
    client_name:      data.client_name,
    client_phone:     data.client_phone,
    client_instagram: data.client_instagram,
    product_type:     data.product_type,
    source:           data.source,
    photographer:     data.photographers?.name || null,
    order_id:         data.id,
  });
};
