import { ok, fail, preflight, authRequest, db } from './_utils.js';

/**
 * api-clients.js — список клієнтських акаунтів для адмінки (read-only).
 *
 * GET → { clients: [{ id, name, phone, instagram, email, created_at,
 *                      order_count, total_spent }] }
 * Рахує замовлення й суму оплачених по кожному client_id.
 */
export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'GET') return fail('Method not allowed', 405);
  try { await authRequest(request, env); } catch { return fail('Unauthorized', 401); }

  const client = db(env);

  const clients = await client.query('clients', {
    select: 'id,name,phone,instagram,email,created_at',
    order: 'created_at.desc',
    limit: 1000,
  }).catch(() => []);

  // Агрегати по замовленнях (одним запитом, рахуємо на боці воркера).
  const orders = await client.query('orders', {
    select: 'client_id,status,total_amount',
    limit: 9999,
  }).catch(() => []);

  const agg = {};
  (orders || []).forEach(o => {
    if (!o.client_id) return;
    const a = agg[o.client_id] || (agg[o.client_id] = { count: 0, spent: 0 });
    a.count++;
    if (o.status === 'paid') a.spent += o.total_amount || 0;
  });

  return ok({
    clients: (clients || []).map(c => ({
      ...c,
      order_count: agg[c.id]?.count || 0,
      total_spent: agg[c.id]?.spent || 0,
    })),
  });
}
