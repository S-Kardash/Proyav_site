// api-orders.js — admin CRUD for orders
// GET  /?status=&search=  → list orders
// POST body               → create order + return magic link
// PUT  body {id, ...}     → update order (status, ttn, notes)
const { db, ok, fail, preflight, auth, PRODUCT_NAMES } = require('./_utils');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight();

  try { auth(event); } catch { return fail('Unauthorized', 401); }

  const supabase = db();

  // ── GET: list orders ──────────────────────────────────────────────────────
  if (event.httpMethod === 'GET') {
    const { status, search } = event.queryStringParameters || {};

    let q = supabase
      .from('orders')
      .select('*, photographers(name, city)')
      .order('created_at', { ascending: false })
      .limit(300);

    if (status && status !== 'all') q = q.eq('status', status);
    if (search) {
      const s = `%${search}%`;
      q = q.or(`client_name.ilike.${s},client_phone.ilike.${s},token.ilike.${s}`);
    }

    const { data, error } = await q;
    if (error) return fail(error.message, 500);
    return ok({ orders: data });
  }

  // ── POST: create order ────────────────────────────────────────────────────
  if (event.httpMethod === 'POST') {
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return fail('Invalid JSON'); }

    const { client_name, client_phone, client_instagram, product_type, photographer_id, source, notes } = body;

    if (!client_name?.trim()) return fail('Ім\'я клієнта обов\'язкове');
    if (!client_phone?.trim()) return fail('Телефон клієнта обов\'язковий');

    const { data, error } = await supabase
      .from('orders')
      .insert({
        client_name:       client_name.trim(),
        client_phone:      client_phone.replace(/\D/g, ''),
        client_instagram:  client_instagram?.trim() || null,
        product_type:      product_type || 'small',
        photographer_id:   photographer_id || null,
        source:            source || 'retail',
        notes:             notes?.trim() || null,
        status:            'new',
      })
      .select()
      .single();

    if (error) return fail(error.message, 500);

    const siteUrl = process.env.SITE_URL || 'https://proyav.com.ua';
    const link = `${siteUrl}/?t=${data.token}`;
    return ok({ order: data, link }, 201);
  }

  // ── PUT: update order ─────────────────────────────────────────────────────
  if (event.httpMethod === 'PUT') {
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return fail('Invalid JSON'); }

    const { id, status, ttn, notes, total_amount } = body;
    if (!id) return fail('id обов\'язковий');

    const updates = {};
    if (status       !== undefined) updates.status       = status;
    if (ttn          !== undefined) updates.ttn          = ttn;
    if (notes        !== undefined) updates.notes        = notes;
    if (total_amount !== undefined) updates.total_amount = total_amount;

    const { data, error } = await supabase
      .from('orders')
      .update(updates)
      .eq('id', id)
      .select('*, photographers(name, city)')
      .single();

    if (error) return fail(error.message, 500);
    return ok({ order: data });
  }

  return fail('Method Not Allowed', 405);
};
