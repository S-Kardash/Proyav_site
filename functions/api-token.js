import { ok, fail, preflight, db } from './_utils.js';

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'GET') return fail('Method not allowed', 405);

  const token = new URL(request.url).searchParams.get('t');
  if (!token) return fail('Токен відсутній', 400);

  const client = db(env);
  const data   = await client.query('orders', {
    select:  '*,photographers(name)',
    filters: { token: `eq.${token}` },
    single:  true,
  }).catch(() => null);

  if (!data) return fail('Недійсне посилання — зверніться до фотографа або менеджера', 404);

  if (data.uploaded_at) {
    return fail('Фото за цим посиланням вже надіслано. Якщо виникла помилка — напишіть нам.', 410);
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
}
