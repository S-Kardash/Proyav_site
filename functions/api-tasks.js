import { ok, fail, preflight, authRequest, db } from './_utils.js';

/**
 * api-tasks.js — завдання/нагадування для адмінки (CRM).
 * GET                         → { tasks:[...] }   (відкриті спершу, за датою)
 * POST { title, due?, priority?, entity? } → створити
 * PUT  { id, done? | title? | due? | priority? }  → оновити
 * DELETE ?id=                 → видалити
 */
export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return preflight();
  let claims;
  try { claims = await authRequest(request, env); } catch (e) { return fail(e.message, 401); }
  if (claims.role !== 'admin') return fail('Forbidden', 403);

  const client = db(env);

  if (request.method === 'GET') {
    const tasks = await client.query('tasks', {
      select: 'id,title,due,done,priority,entity,created_at',
      order: 'done.asc,due.asc.nullslast,created_at.desc',
      limit: 300,
    }).catch(() => []);
    return ok({ tasks: tasks || [] });
  }

  if (request.method === 'POST') {
    let b; try { b = await request.json(); } catch { return fail('Invalid JSON'); }
    if (!b.title?.trim()) return fail('Потрібен текст завдання');
    const row = await client.query('tasks', {
      method: 'POST', single: true,
      body: {
        title:    b.title.trim().slice(0, 200),
        due:      b.due || null,
        priority: ['low', 'normal', 'high'].includes(b.priority) ? b.priority : 'normal',
        entity:   b.entity || null,
      },
    });
    return ok({ task: row }, 201);
  }

  if (request.method === 'PUT') {
    let b; try { b = await request.json(); } catch { return fail('Invalid JSON'); }
    if (!b.id) return fail('id обов\'язковий');
    const updates = {};
    if (b.done     !== undefined) updates.done     = !!b.done;
    if (b.title    !== undefined) updates.title    = String(b.title).slice(0, 200);
    if (b.due      !== undefined) updates.due      = b.due || null;
    if (b.priority !== undefined) updates.priority = b.priority;
    const row = await client.query('tasks', { method: 'PATCH', filters: { id: `eq.${b.id}` }, single: true, body: updates });
    return ok({ task: row });
  }

  if (request.method === 'DELETE') {
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return fail('Потрібен id');
    await client.query('tasks', { method: 'DELETE', filters: { id: `eq.${id}` } });
    return ok({ ok: true });
  }

  return fail('Method not allowed', 405);
}
