import { ok, fail, preflight, authRequest, db, randomToken, commissionFor, siteOrigin } from './_utils.js';

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

    const all  = orders || [];
    const paid = all.filter(o => o.status === 'paid');

    // Фотограф (тариф + tg-стан) — фетчимо ОДИН раз.
    let me = null;
    try {
      me = await client.query('photographers', {
        select: 'id,tg_chat_id,tg_link_token,commission_pct', filters: { id: `eq.${phId}` }, single: true,
      });
    } catch (e) { console.error('[partner-orders] photographer:', e.message); }

    // Тариф = збережений commission_pct (саме його платить адмінка → кабінет показує те
    // саме число). Рівень (для прогресу) росте з ВИКОНАНИМИ (оплаченими) замовленнями.
    const commPct = Number(me && me.commission_pct) || commissionFor(paid.length).pct || 12;
    const tier    = commissionFor(paid.length);

    const now = new Date();
    const isThisMonth = d => { const x = new Date(d); return x.getMonth() === now.getMonth() && x.getFullYear() === now.getFullYear(); };
    const paidMonth = paid.filter(o => isThisMonth(o.paid_at || o.created_at));

    // Зароблено — ЛИШЕ з оплачених (2A-1). Очікує — з ще не оплачених.
    const monthEarned   = Math.round(paidMonth.reduce((s, o) => s + (o.total_amount || 0), 0) * commPct / 100);
    const alltimeEarned = Math.round(paid.reduce((s, o) => s + (o.total_amount || 0), 0) * commPct / 100);
    const pendingComm   = Math.round(all.filter(o => o.status !== 'paid').reduce((s, o) => s + (o.total_amount || 0), 0) * commPct / 100);

    // Виплачено партнеру (expenses «Комісія фотографу», прив'язані до нього — секція 7).
    let paidOut = 0;
    try {
      const exp = await client.query('expenses', {
        select: 'amount', filters: { category: 'eq.Комісія фотографу', photographer_id: `eq.${phId}` },
      });
      paidOut = (exp || []).reduce((s, e) => s + (Number(e.amount) || 0), 0);
    } catch {}
    const balance = Math.max(0, alltimeEarned - paidOut); // до виплати (net)

    // ── Telegram link state (8.4): lazily mint a stable link token. ──
    let telegram = { connected: false, link_token: null, bot_username: env.TG_BOT_USERNAME || null };
    try {
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
      orders: all,
      telegram,
      stats: {
        total:              all.length,
        paid:               paid.length,
        this_month:         all.filter(o => isThisMonth(o.created_at)).length,
        commission_pct:     commPct,
        tier:               tier,
        month_commission:   monthEarned,
        alltime_commission: alltimeEarned,
        pending_commission: pendingComm,
        paid_out:           paidOut,
        balance:            balance,
      },
    });
  }

  // ── POST: create order for client ─────────────────────────────────────
  if (request.method === 'POST') {
    let body;
    try { body = await request.json(); } catch { return fail('Invalid JSON'); }

    const { client_name, client_phone, client_instagram, product_type, notes, card_signature } = body;
    if (!client_name?.trim())  return fail("Ім'я клієнта обов'язкове");
    if (!client_phone?.trim()) return fail('Телефон обов\'язковий');

    // Підпис фотографа на картці (8.8): «Кадр: …» — у нотатки для майстра.
    const signature = card_signature?.trim() || null;
    const fullNotes = [signature ? `✍️ Підпис на картці: Кадр — ${signature}` : '', notes?.trim() || '']
      .filter(Boolean).join(' · ') || null;

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
        notes:            fullNotes,
        status:           'new',
      },
    });

    const siteUrl = siteOrigin(env, request);
    return ok({ order: data, link: `${siteUrl}/order?t=${token}` }, 201);
  }

  return fail('Method not allowed', 405);
}
