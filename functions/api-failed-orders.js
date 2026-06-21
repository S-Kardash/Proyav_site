import { ok, fail, preflight, authRequest, isStaff, db } from './_utils.js';

/**
 * api-failed-orders.js — черга замовлень, що не записались у orders (B8, Ітерація 2).
 * GET            → { failed:[...] }  (невирішені, найновіші перші)
 * PUT { id, resolved? } → позначити опрацьованим (default true)
 * Staff-only (owner+manager).
 */
export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return preflight();
  let claims; try { claims = await authRequest(request, env); } catch { return fail('Unauthorized', 401); }
  if (!isStaff(claims)) return fail('Forbidden', 403);

  const client = db(env);

  if (request.method === 'GET') {
    const rows = await client.query('failed_orders', {
      select: '*', filters: { resolved: 'is.false' }, order: 'created_at.desc', limit: 200,
    }).catch(() => []);
    return ok({ failed: rows || [] });
  }

  if (request.method === 'PUT') {
    let b; try { b = await request.json(); } catch { return fail('Invalid JSON'); }
    if (!b.id) return fail('Потрібен id');
    await client.query('failed_orders', {
      method: 'PATCH', filters: { id: `eq.${b.id}` }, body: { resolved: b.resolved !== false },
    });
    return ok({ ok: true });
  }

  return fail('Method not allowed', 405);
}
