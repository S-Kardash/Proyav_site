import { ok, fail, preflight, db, PRODUCT_NAMES } from './_utils.js';

/**
 * api-order-status.js — public, read-only order tracking (MARKETING_CONTEXT 6/7).
 *
 * GET /api-order-status?t=<order token>
 * The token is the random per-order secret (8 chars). Only someone holding the
 * status link sees it. We return a deliberately small, non-sensitive subset —
 * no phone, no full name, no photographer details — just enough for a timeline.
 */
export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'GET') return fail('Method not allowed', 405);

  const token = (new URL(request.url).searchParams.get('t') || '').trim();
  if (!token) return fail('Посилання некоректне');

  let order;
  try {
    const client = db(env);
    order = await client.query('orders', {
      select:  'status,product_type,source,total_amount,created_at,uploaded_at,paid_at,shipped_at,ttn,client_name',
      filters: { token: `eq.${token}` },
      single:  true,
    });
  } catch {
    return fail('Замовлення не знайдено', 404);
  }
  if (!order) return fail('Замовлення не знайдено', 404);

  // Privacy: first name only.
  const firstName = (order.client_name || '').trim().split(/\s+/)[0] || '';
  const product = PRODUCT_NAMES[order.product_type]
    || (order.source === 'retail' ? 'Роздрібний друк' : order.product_type)
    || 'Друк';

  return ok({
    status:       order.status || 'new',
    product,
    total_amount: order.total_amount ?? null,
    created_at:   order.created_at,
    uploaded_at:  order.uploaded_at,
    paid_at:      order.paid_at,
    shipped_at:   order.shipped_at,
    ttn:          order.ttn || null,
    first_name:   firstName,
  });
}
