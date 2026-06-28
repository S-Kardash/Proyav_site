import { ok, fail, preflight, authRequest, db } from './_utils.js';

/**
 * api-partner-notifications.js — сайтові сповіщення фотографу (кабінет partner.html).
 * Дзеркало api-notifications.js (клієнтських), але для ролі photographer.
 *
 * Фотограф (Bearer photographer):
 *   GET                       → { notifications:[...], unread }
 *   PUT { id } | { all:true } → позначити прочитаним
 *
 * Сповіщення створюються сервером (helper notifyPhotographer у _utils): нове
 * замовлення за посиланням (api-retail) / оплата (api-orders) / виплата (api-expenses).
 * Якщо міграцію (секція 12) ще не застосовано — GET тихо віддає порожній список.
 */
export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return preflight();

  let claims;
  try { claims = await authRequest(request, env); } catch (e) { return fail(e.message, 401); }
  if (claims.role !== 'photographer') return fail('Forbidden', 403);

  const client = db(env);

  if (request.method === 'GET') {
    const rows = await client.query('photographer_notifications', {
      select:  'id,title,body,kind,read,order_token,created_at',
      filters: { photographer_id: `eq.${claims.id}` },
      order:   'created_at.desc', limit: 50,
    }).catch(() => []);
    const unread = (rows || []).filter(n => !n.read).length;
    return ok({ notifications: rows || [], unread });
  }

  if (request.method === 'PUT') {
    let b; try { b = await request.json(); } catch { return fail('Invalid JSON'); }
    const filters = { photographer_id: `eq.${claims.id}` };
    if (!b.all) { if (!b.id) return fail('id обов\'язковий'); filters.id = `eq.${b.id}`; }
    await client.query('photographer_notifications', { method: 'PATCH', filters, body: { read: true } }).catch(() => {});
    return ok({ ok: true });
  }

  return fail('Method not allowed', 405);
}
