// api-partner-orders.js
// GET  → own orders + stats
// POST → create new order for client, return magic link
const { db, ok, fail, preflight, auth } = require('./_utils');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight();

  let claim;
  try {
    claim = auth(event);
    if (claim.role !== 'photographer' && claim.role !== 'admin') throw new Error();
  } catch {
    return fail('Unauthorized', 401);
  }

  const supabase = db();
  const phId = claim.id;

  // ── GET: list own orders + stats ──────────────────────────────────────────
  if (event.httpMethod === 'GET') {
    const { data: orders, error } = await supabase
      .from('orders')
      .select('*')
      .eq('photographer_id', phId)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) return fail(error.message, 500);

    const { data: ph } = await supabase
      .from('photographers')
      .select('commission_pct')
      .eq('id', phId)
      .single();

    const commPct = ph?.commission_pct || 12;

    const now = new Date();
    const thisMonth = orders.filter(o => {
      const d = new Date(o.created_at);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const monthRevenue   = thisMonth.reduce((s, o) => s + (o.total_amount || 0), 0);
    const monthCommission = Math.round(monthRevenue * commPct / 100);
    const allTimeRevenue  = orders.reduce((s, o) => s + (o.total_amount || 0), 0);
    const allTimeComm     = Math.round(allTimeRevenue * commPct / 100);

    return ok({
      orders,
      stats: {
        total:             orders.length,
        this_month:        thisMonth.length,
        commission_pct:    commPct,
        month_revenue:     monthRevenue,
        month_commission:  monthCommission,
        alltime_commission: allTimeComm,
      },
    });
  }

  // ── POST: create order + magic link ───────────────────────────────────────
  if (event.httpMethod === 'POST') {
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return fail('Invalid JSON'); }

    const { client_name, client_phone, client_instagram, product_type, notes } = body;

    if (!client_name?.trim()) return fail('Ім\'я клієнта обов\'язкове');
    if (!client_phone?.trim()) return fail('Телефон клієнта обов\'язковий');

    const { data, error } = await supabase
      .from('orders')
      .insert({
        client_name:      client_name.trim(),
        client_phone:     client_phone.replace(/\D/g, ''),
        client_instagram: client_instagram?.trim() || null,
        product_type:     product_type || 'small',
        photographer_id:  phId,
        source:           'photographer',
        notes:            notes?.trim() || null,
        status:           'new',
      })
      .select()
      .single();

    if (error) return fail(error.message, 500);

    const siteUrl = process.env.SITE_URL || 'https://proyav.com.ua';
    const link = `${siteUrl}/?t=${data.token}`;
    return ok({ order: data, link }, 201);
  }

  return fail('Method Not Allowed', 405);
};
