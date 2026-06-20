import { ok, fail, preflight, authRequest, isOwner, db, hashPassword, randomToken, logAudit } from './_utils.js';

function randomPassword() {
  return randomToken(8).toUpperCase();
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return preflight();
  let claims; try { claims = await authRequest(request, env); } catch { return fail('Unauthorized', 401); }
  if (!isOwner(claims)) return fail('Лише власник', 403);

  const client = db(env);

  // ── GET: list ─────────────────────────────────────────────────────────
  if (request.method === 'GET') {
    const photographers = await client.query('photographers', {
      select: 'id,name,email,phone,city,commission_pct,active,created_at',
      order:  'created_at.desc',
    });

    // Append order counts — тягнемо ЛИШЕ атрибутовані рядки, не всю таблицю (AUDIT B1).
    const counts = await client.query('orders', {
      select:  'photographer_id',
      filters: { photographer_id: 'not.is.null' },
      limit:   9999,
    }).catch(() => []);

    const countMap = {};
    (counts || []).forEach(o => {
      if (o.photographer_id) countMap[o.photographer_id] = (countMap[o.photographer_id] || 0) + 1;
    });

    return ok({
      photographers: (photographers || []).map(p => ({
        ...p,
        order_count: countMap[p.id] || 0,
      })),
    });
  }

  // ── POST: create ──────────────────────────────────────────────────────
  if (request.method === 'POST') {
    let body;
    try { body = await request.json(); } catch { return fail('Invalid JSON'); }

    const { name, email, phone, city, commission_pct } = body;
    if (!name?.trim())  return fail("Ім'я обов'язкове");
    if (!email?.trim()) return fail('Email обов\'язковий');

    const tempPwd       = randomPassword();
    const password_hash = await hashPassword(tempPwd);

    const data = await client.query('photographers', {
      method: 'POST',
      single: true,
      select: 'id,name,email,phone,city,commission_pct,active,created_at',
      body: {
        name:           name.trim(),
        email:          email.toLowerCase().trim(),
        password_hash,
        phone:          phone?.trim() || null,
        city:           city?.trim()  || null,
        commission_pct: commission_pct || 12,
        active:         true,
      },
    }).catch(e => {
      if (e.message.includes('unique') || e.message.includes('duplicate')) {
        throw new Error('Фотограф з таким email вже існує');
      }
      throw e;
    });

    await logAudit(env, 'photographer', 'photographer:' + data.id, 'Додано партнера: ' + data.name);
    return ok({ photographer: data, temp_password: tempPwd }, 201);
  }

  // ── PUT: update ───────────────────────────────────────────────────────
  if (request.method === 'PUT') {
    let body;
    try { body = await request.json(); } catch { return fail('Invalid JSON'); }

    const { id, name, phone, city, commission_pct, active, reset_password } = body;
    if (!id) return fail('id обов\'язковий');

    const updates = {};
    if (name           !== undefined) updates.name           = name.trim();
    if (phone          !== undefined) updates.phone          = phone?.trim() || null;
    if (city           !== undefined) updates.city           = city?.trim()  || null;
    if (commission_pct !== undefined) updates.commission_pct = commission_pct;
    if (active         !== undefined) updates.active         = active;

    let tempPassword = null;
    if (reset_password) {
      tempPassword          = randomPassword();
      updates.password_hash = await hashPassword(tempPassword);
    }

    const data = await client.query('photographers', {
      method:  'PATCH',
      filters: { id: `eq.${id}` },
      select:  'id,name,email,phone,city,commission_pct,active',
      single:  true,
      body:    updates,
    });

    await logAudit(env, 'photographer', 'photographer:' + id,
      (data.name || '') + ': ' + (reset_password ? 'скинуто пароль' : active !== undefined ? (active ? 'увімкнено' : 'вимкнено') : 'редаговано'));
    return ok({ photographer: data, ...(tempPassword ? { temp_password: tempPassword } : {}) });
  }

  return fail('Method not allowed', 405);
}
