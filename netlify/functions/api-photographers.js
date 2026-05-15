// api-photographers.js — admin CRUD for photographers
// GET    → list all
// POST   → create (generates temp password, returns it once)
// PUT    → update (name, city, commission_pct, active, reset password)
const bcrypt = require('bcryptjs');
const { db, ok, fail, preflight, auth } = require('./_utils');

function randomPassword() {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight();

  try { auth(event); } catch { return fail('Unauthorized', 401); }

  const supabase = db();

  // ── GET: list photographers ───────────────────────────────────────────────
  if (event.httpMethod === 'GET') {
    const { data, error } = await supabase
      .from('photographers')
      .select('id, name, email, phone, city, commission_pct, active, created_at')
      .order('created_at', { ascending: false });

    if (error) return fail(error.message, 500);

    // Append order counts
    const { data: counts } = await supabase
      .from('orders')
      .select('photographer_id')
      .not('photographer_id', 'is', null);

    const countMap = {};
    (counts || []).forEach(o => {
      countMap[o.photographer_id] = (countMap[o.photographer_id] || 0) + 1;
    });

    const photographers = (data || []).map(p => ({
      ...p,
      order_count: countMap[p.id] || 0,
    }));

    return ok({ photographers });
  }

  // ── POST: create photographer ─────────────────────────────────────────────
  if (event.httpMethod === 'POST') {
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return fail('Invalid JSON'); }

    const { name, email, phone, city, commission_pct } = body;
    if (!name?.trim())  return fail('Ім\'я обов\'язкове');
    if (!email?.trim()) return fail('Email обов\'язковий');

    const tempPassword = randomPassword();
    const password_hash = await bcrypt.hash(tempPassword, 10);

    const { data, error } = await supabase
      .from('photographers')
      .insert({
        name:           name.trim(),
        email:          email.toLowerCase().trim(),
        password_hash,
        phone:          phone?.trim() || null,
        city:           city?.trim()  || null,
        commission_pct: commission_pct || 12,
        active:         true,
      })
      .select('id, name, email, phone, city, commission_pct, active, created_at')
      .single();

    if (error) {
      if (error.code === '23505') return fail('Фотограф з таким email вже існує');
      return fail(error.message, 500);
    }

    // Return temp password once — admin copies it and sends to photographer
    return ok({ photographer: data, temp_password: tempPassword }, 201);
  }

  // ── PUT: update photographer ──────────────────────────────────────────────
  if (event.httpMethod === 'PUT') {
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return fail('Invalid JSON'); }

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
      tempPassword = randomPassword();
      updates.password_hash = await bcrypt.hash(tempPassword, 10);
    }

    const { data, error } = await supabase
      .from('photographers')
      .update(updates)
      .eq('id', id)
      .select('id, name, email, phone, city, commission_pct, active')
      .single();

    if (error) return fail(error.message, 500);

    return ok({ photographer: data, ...(tempPassword ? { temp_password: tempPassword } : {}) });
  }

  return fail('Method Not Allowed', 405);
};
