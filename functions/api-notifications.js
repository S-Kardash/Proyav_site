import { ok, fail, preflight, authRequest, db } from './_utils.js';

/**
 * api-notifications.js — сповіщення клієнтам (показуються в кабінеті account.html).
 *
 * Адмін (Bearer admin):
 *   POST { client_id, title, body, kind?, order_token? } → створити сповіщення.
 * Клієнт (Bearer client):
 *   GET                       → { notifications:[...], unread }
 *   PUT { id } | { all:true } → позначити прочитаним
 */
export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return preflight();

  let claims;
  try { claims = await authRequest(request, env); } catch (e) { return fail(e.message, 401); }
  const client = db(env);

  // ── Адмін: створити сповіщення для клієнта ──
  if (request.method === 'POST') {
    if (claims.role !== 'admin') return fail('Forbidden', 403);
    let b; try { b = await request.json(); } catch { return fail('Invalid JSON'); }
    if (!b.client_id) return fail('client_id обов\'язковий');
    if (!b.title && !b.body) return fail('Порожнє сповіщення');
    const row = await client.query('client_notifications', {
      method: 'POST', single: true,
      body: {
        client_id:   b.client_id,
        order_token: b.order_token || null,
        title:       (b.title || '').slice(0, 120) || null,
        body:        (b.body || '').slice(0, 1000) || null,
        kind:        b.kind || 'info',
      },
    });
    return ok({ notification: row }, 201);
  }

  // ── Клієнт: свої сповіщення ──
  if (claims.role !== 'client') return fail('Forbidden', 403);

  if (request.method === 'GET') {
    const rows = await client.query('client_notifications', {
      select: 'id,title,body,kind,read,order_token,created_at',
      filters: { client_id: `eq.${claims.id}` },
      order: 'created_at.desc', limit: 50,
    }).catch(() => []);
    const unread = (rows || []).filter(n => !n.read).length;
    return ok({ notifications: rows || [], unread });
  }

  if (request.method === 'PUT') {
    let b; try { b = await request.json(); } catch { return fail('Invalid JSON'); }
    const filters = { client_id: `eq.${claims.id}` };
    if (!b.all) { if (!b.id) return fail('id обов\'язковий'); filters.id = `eq.${b.id}`; }
    await client.query('client_notifications', { method: 'PATCH', filters, body: { read: true } }).catch(() => {});
    return ok({ ok: true });
  }

  return fail('Method not allowed', 405);
}
