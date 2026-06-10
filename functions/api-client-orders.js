import { ok, fail, preflight, db, authRequest } from './_utils.js';

/**
 * GET /api-client-orders
 * Authorization: Bearer <client JWT>
 * Returns { orders: [...], client: {...} }
 */
export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'GET') return fail('Method not allowed', 405);

  let claims;
  try { claims = await authRequest(request, env); }
  catch (e) { return fail(e.message, 401); }
  if (claims.role !== 'client') return fail('Forbidden', 403);

  const client = db(env);

  let clientInfo;
  try {
    clientInfo = await client.query('clients', {
      select: 'id,name,phone,instagram,email,created_at',
      filters: { id: `eq.${claims.id}` },
      single: true,
    });
  } catch {
    return fail('Клієнта не знайдено', 404);
  }

  const orders = await client.query('orders', {
    select: 'id,token,status,product_type,photo_count,qty_total,total_amount,source,ttn,created_at,uploaded_at,paid_at,shipped_at',
    filters: { client_id: `eq.${claims.id}` },
    order: 'created_at.desc',
    limit: 50,
  }).catch(() => []);

  return ok({ orders: orders || [], client: clientInfo });
}
