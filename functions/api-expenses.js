import { ok, fail, preflight, authRequest, isOwner, db, logAudit } from './_utils.js';

const CATEGORIES = [
  'Матеріали', 'Доставка', 'Оренда', 'Маркетинг',
  'Комісія фотографу', 'Підписки', 'Зарплата (собі)', 'Інше',
];

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return preflight();

  let claims; try { claims = await authRequest(request, env); } catch { return fail('Unauthorized', 401); }
  if (!isOwner(claims)) return fail('Лише власник', 403);

  const client = db(env);

  // ── GET: list (optional ?from=YYYY-MM-DD&to=YYYY-MM-DD) ──────────────
  if (request.method === 'GET') {
    const url  = new URL(request.url);
    const from = url.searchParams.get('from');
    const to   = url.searchParams.get('to');

    const filters = {};
    if (from) filters['date'] = `gte.${from}`;
    // PostgREST: combine two conditions on same column via 'and'
    let rows;
    if (from && to) {
      rows = await client.query('expenses', {
        select: '*',
        order:  'date.desc,id.desc',
        limit:  2000,
        filters: { 'and': `(date.gte.${from},date.lte.${to})` },
      });
    } else {
      rows = await client.query('expenses', {
        select:  '*',
        filters,
        order:   'date.desc,id.desc',
        limit:   2000,
      });
    }
    return ok({ expenses: rows || [], categories: CATEGORIES });
  }

  // ── POST: create ─────────────────────────────────────────────────────
  if (request.method === 'POST') {
    let b; try { b = await request.json(); } catch { return fail('Invalid JSON'); }
    if (!b.date)                       return fail('Потрібна дата');
    if (b.amount == null || b.amount < 0) return fail('Потрібна сума ≥ 0');

    const body = {
      date:     b.date,
      category: b.category || 'Інше',
      descr:    b.descr || '',
      amount:   Number(b.amount),
      payment:  b.payment || 'Готівка',
      note:     b.note || '',
    };
    // Виплату комісії лінкуємо до фотографа (для чистого балансу, секція 7 міграції).
    if (b.photographer_id) body.photographer_id = b.photographer_id;
    let data;
    try {
      data = await client.query('expenses', { method: 'POST', single: true, body });
    } catch (e) {
      // Якщо колонку photographer_id ще не додано (міграцію не застосовано) — пишемо
      // витрату без неї, щоб облік не ламався (graceful degradation).
      if (body.photographer_id && /photographer_id|column/i.test(e.message || '')) {
        delete body.photographer_id;
        data = await client.query('expenses', { method: 'POST', single: true, body });
      } else { throw e; }
    }
    const isPayout = (b.category || '') === 'Комісія фотографу';
    await logAudit(env, isPayout ? 'payout' : 'expense', 'expense:' + data.id,
      `${b.category || 'Інше'} ${Number(b.amount)}₴${b.descr ? ' · ' + b.descr : ''}`);
    return ok({ expense: data }, 201);
  }

  // ── PUT: update ──────────────────────────────────────────────────────
  if (request.method === 'PUT') {
    let b; try { b = await request.json(); } catch { return fail('Invalid JSON'); }
    if (!b.id) return fail('Потрібен id');

    const updates = {};
    ['date', 'category', 'descr', 'payment', 'note'].forEach(k => {
      if (b[k] !== undefined) updates[k] = b[k];
    });
    if (b.amount !== undefined) updates.amount = Number(b.amount);

    const data = await client.query('expenses', {
      method:  'PATCH',
      filters: { id: `eq.${b.id}` },
      single:  true,
      body:    updates,
    });
    return ok({ expense: data });
  }

  // ── DELETE ───────────────────────────────────────────────────────────
  if (request.method === 'DELETE') {
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return fail('Потрібен id');
    await client.query('expenses', { method: 'DELETE', filters: { id: `eq.${id}` } });
    return ok({ ok: true });
  }

  return fail('Method not allowed', 405);
}
