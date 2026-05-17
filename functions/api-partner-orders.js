import { ok, fail, preflight, authRequest, db, randomToken } from './_utils.js';

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return preflight();

  let claim;
  try {
    claim = await authRequest(request, env);
    if (claim.role !== 'photographer' && claim.role !== 'admin') throw new Error();
  } catch { return fail('Unauthorized', 401); }

  const client = db(env);
  const phId   = claim.id;

  // ── GET: own orders + stats ───────────────────────────────────────────
  if (request.method === 'GET') {
    const orders = await client.query('orders', {
      filters: { photographer_id: `eq.${phId}` },
      order:   'created_at.desc',
      limit:   200,
    });

    const ph = await client.query('photographers', {
      filters: { id: `eq.${phId}` },
      select:  'commission_pct',
      single:  true,
    }).catch(() => null);

    const commPct = ph?.commission_pct || 12;
    const now     = new Date();
    const thisMonth = (orders || []).filter(o => {
      const d = new Date(o.created_at);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const monthRevenue    = thisMonth.reduce((s, o) => s + (o.total_amount || 0), 0);
    const allTimeRevenue  = (orders || []).reduce((s, o) => s + (o.total_amount || 0), 0);

    return ok({
      orders: orders || [],
      stats: {
        total:              (orders || []).length,
        this_month:         thisMonth.length,
        commission_pct:     commPct,
        month_revenue:      monthRevenue,
        month_commission:   Math.round(monthRevenue * commPct / 100),
        alltime_commission: Math.round(allTimeRevenue * commPct / 100),
      },
    });
  }

  // ── POST: create order for client ─────────────────────────────────────
  if (request.method === 'POST') {
    let body;
    try { body = await request.json(); } catch { return fail('Invalid JSON'); }

    const { client_name, client_phone, client_instagram, product_type, notes } = body;
    if (!client_name?.trim())  return fail("Ім'я клієнта обов'язкове");
    if (!client_phone?.trim()) return fail('Телефон обов\'язковий');

    const token = randomToken(8);
    const data  = await client.query('orders', {
      method: 'POST',
      single: true,
      body: {
        token,
        client_name:      client_name.trim(),
        client_phone:     client_phone.replace(/\D/g, ''),
        client_instagram: client_instagram?.trim().replace('@', '') || null,
        product_type:     product_type || 'small',
        photographer_id:  phId,
        source:           'photographer',
        notes:            notes?.trim() || null,
        status:           'new',
      },
    });

    const siteUrl = (env.SITE_URL || '').replace(/\/$/, '');
    return ok({ order: data, link: `${siteUrl}/?t=${token}` }, 201);
  }

  return fail('Method not allowed', 405);
}
