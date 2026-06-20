import { ok, fail, preflight, authRequest, isStaff, db } from './_utils.js';

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return preflight();

  let claims; try { claims = await authRequest(request, env); } catch { return fail('Unauthorized', 401); }
  if (!isStaff(claims)) return fail('Forbidden', 403);

  const client = db(env);

  // ── GET: list items (with low-stock flag) ───────────────────────────
  if (request.method === 'GET') {
    const items = await client.query('inventory', {
      select: '*',
      order:  'name.asc',
      limit:  500,
    });
    const list = (items || []).map(i => ({
      ...i,
      low: Number(i.qty) <= Number(i.min_qty),
    }));
    const lowCount = list.filter(i => i.low).length;
    return ok({ items: list, low_count: lowCount });
  }

  // ── POST: create item, OR adjust stock (action:'adjust') ─────────────
  if (request.method === 'POST') {
    let b; try { b = await request.json(); } catch { return fail('Invalid JSON'); }

    // Stock movement: { action:'adjust', item_id, delta, reason }
    if (b.action === 'adjust') {
      if (!b.item_id)          return fail('Потрібен item_id');
      if (b.delta == null)     return fail('Потрібен delta');

      const item = await client.query('inventory', {
        select: '*', single: true, filters: { id: `eq.${b.item_id}` },
      }).catch(() => null);
      if (!item) return fail('Позицію не знайдено', 404);

      const newQty = Number(item.qty) + Number(b.delta);
      await client.query('inventory', {
        method:  'PATCH',
        filters: { id: `eq.${b.item_id}` },
        body:    { qty: newQty, updated_at: new Date().toISOString() },
      });
      await client.query('inventory_log', {
        method: 'POST',
        body: {
          item_id: b.item_id,
          delta:   Number(b.delta),
          reason:  b.reason || (Number(b.delta) >= 0 ? 'Закупівля' : 'Списання'),
        },
      });
      return ok({ ok: true, qty: newQty });
    }

    // Create item
    if (!b.name?.trim()) return fail('Потрібна назва');
    const data = await client.query('inventory', {
      method: 'POST',
      single: true,
      body: {
        name:    b.name.trim(),
        unit:    b.unit || 'шт',
        qty:     Number(b.qty) || 0,
        min_qty: Number(b.min_qty) || 0,
        note:    b.note || '',
      },
    });
    return ok({ item: data }, 201);
  }

  // ── PUT: edit item meta ──────────────────────────────────────────────
  if (request.method === 'PUT') {
    let b; try { b = await request.json(); } catch { return fail('Invalid JSON'); }
    if (!b.id) return fail('Потрібен id');
    const updates = { updated_at: new Date().toISOString() };
    ['name', 'unit', 'note'].forEach(k => { if (b[k] !== undefined) updates[k] = b[k]; });
    if (b.qty     !== undefined) updates.qty     = Number(b.qty);
    if (b.min_qty !== undefined) updates.min_qty = Number(b.min_qty);

    const data = await client.query('inventory', {
      method: 'PATCH', filters: { id: `eq.${b.id}` }, single: true, body: updates,
    });
    return ok({ item: data });
  }

  // ── DELETE ───────────────────────────────────────────────────────────
  if (request.method === 'DELETE') {
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return fail('Потрібен id');
    await client.query('inventory', { method: 'DELETE', filters: { id: `eq.${id}` } });
    return ok({ ok: true });
  }

  return fail('Method not allowed', 405);
}
