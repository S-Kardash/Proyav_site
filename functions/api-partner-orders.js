import { ok, fail, preflight, authRequest, db, randomToken, commissionFor } from './_utils.js';

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

    // Tier-based commission — grows with lifetime activity (config.js / _utils).
    const totalOrders = (orders || []).length;
    const tier    = commissionFor(totalOrders);
    const commPct = tier.pct;
    const now     = new Date();
    const thisMonth = (orders || []).filter(o => {
      const d = new Date(o.created_at);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const monthRevenue   = thisMonth.reduce((s, o) => s + (o.total_amount || 0), 0);
    const allTimeRevenue = (orders || []).reduce((s, o) => s + (o.total_amount || 0), 0);

    // ── Telegram link state (8.4): lazily mint a stable link token so the
    // cabinet can build t.me/<bot>?start=<token>; report connected status. ──
    let telegram = { connected: false, link_token: null, bot_username: env.TG_BOT_USERNAME || null };
    try {
      const me = await client.query('photographers', {
        select: 'id,tg_chat_id,tg_link_token', filters: { id: `eq.${phId}` }, single: true,
      });
      let linkToken = me && me.tg_link_token;
      if (!linkToken) {
        linkToken = randomToken(16);
        await client.query('photographers', {
          method: 'PATCH', filters: { id: `eq.${phId}` }, body: { tg_link_token: linkToken },
        });
      }
      telegram = { connected: !!(me && me.tg_chat_id), link_token: linkToken, bot_username: env.TG_BOT_USERNAME || null };
    } catch (e) { console.error('[partner-orders] telegram state:', e.message); }

    return ok({
      orders: orders || [],
      telegram,
      stats: {
        total:              totalOrders,
        this_month:         thisMonth.length,
        commission_pct:     commPct,
        tier:               tier,
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
    return ok({ order: data, link: `${siteUrl}/order?t=${token}` }, 201);
  }

  return fail('Method not allowed', 405);
}
