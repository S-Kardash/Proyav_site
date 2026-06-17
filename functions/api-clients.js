import { ok, fail, preflight, authRequest, db, logAudit } from './_utils.js';

/**
 * api-clients.js — клієнтські акаунти для адмінки (CRM).
 *
 * GET                 → { clients:[{...,order_count,total_spent}] }   (список)
 * GET ?id=<uuid>      → { client, orders, events, notifications }      (картка)
 * PUT { id, notes?, tags? } → оновити CRM-поля профілю
 */
export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return preflight();
  let claims;
  try { claims = await authRequest(request, env); } catch { return fail('Unauthorized', 401); }
  if (claims.role !== 'admin') return fail('Forbidden', 403);

  const client = db(env);
  const url = new URL(request.url);

  // ── PUT: оновити нотатки/теги ──
  if (request.method === 'PUT') {
    let b; try { b = await request.json(); } catch { return fail('Invalid JSON'); }
    if (!b.id) return fail('id обов\'язковий');
    const updates = {};
    if (b.notes !== undefined) updates.notes = String(b.notes).slice(0, 2000);
    if (b.tags  !== undefined) updates.tags  = String(b.tags).slice(0, 300);
    if (!Object.keys(updates).length) return fail('Немає що оновлювати');
    const row = await client.query('clients', {
      method: 'PATCH', filters: { id: `eq.${b.id}` }, single: true,
      select: 'id,name,phone,instagram,email,notes,tags,created_at', body: updates,
    });
    await logAudit(env, 'client_edit', 'client:' + b.id, 'Оновлено профіль (' + Object.keys(updates).join(', ') + ')');
    return ok({ client: row });
  }

  if (request.method !== 'GET') return fail('Method not allowed', 405);

  // ── GET ?id=: картка клієнта ──
  const id = url.searchParams.get('id');
  if (id) {
    const c = await client.query('clients', {
      select: 'id,name,phone,instagram,email,notes,tags,last_seen,created_at',
      filters: { id: `eq.${id}` }, single: true,
    }).catch(() => null);
    if (!c) return fail('Клієнта не знайдено', 404);

    const orders = await client.query('orders', {
      select: 'id,token,status,product_type,qty_total,total_amount,source,ttn,created_at,paid_at,shipped_at',
      filters: { client_id: `eq.${id}` }, order: 'created_at.desc', limit: 100,
    }).catch(() => []);

    const events = await client.query('events', {
      select: 'ts,type,path,ref', filters: { client_id: `eq.${id}` },
      order: 'ts.desc', limit: 40,
    }).catch(() => []);

    const notifications = await client.query('client_notifications', {
      select: 'id,title,body,kind,read,created_at', filters: { client_id: `eq.${id}` },
      order: 'created_at.desc', limit: 30,
    }).catch(() => []);

    const spent = (orders || []).filter(o => o.status === 'paid').reduce((s, o) => s + (o.total_amount || 0), 0);
    return ok({ client: c, orders: orders || [], events: events || [], notifications: notifications || [], total_spent: spent });
  }

  // ── GET: список ──
  const clients = await client.query('clients', {
    select: 'id,name,phone,instagram,email,tags,created_at',
    order: 'created_at.desc', limit: 1000,
  }).catch(() => []);

  const orders = await client.query('orders', { select: 'client_id,status,total_amount', limit: 9999 }).catch(() => []);
  const agg = {};
  (orders || []).forEach(o => {
    if (!o.client_id) return;
    const a = agg[o.client_id] || (agg[o.client_id] = { count: 0, spent: 0 });
    a.count++; if (o.status === 'paid') a.spent += o.total_amount || 0;
  });

  return ok({
    clients: (clients || []).map(c => ({
      ...c, order_count: agg[c.id]?.count || 0, total_spent: agg[c.id]?.spent || 0,
    })),
  });
}
