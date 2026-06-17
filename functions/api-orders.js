import { ok, fail, preflight, authRequest, db, randomToken, commissionFor } from './_utils.js';

// Пінг фотографу в Telegram при оплаті його замовлення (8.4).
// Комісія — за тим самим тарифом, що й у кабінеті (commissionFor за к-стю замовлень).
async function notifyPhotographerPaid(env, client, order) {
  try {
    const ph = order.photographers;
    const chatId = ph && ph.tg_chat_id;
    if (!chatId) return; // фотограф не підключив Telegram — тихо пропускаємо
    const phId = order.photographer_id;
    let pct = 12;
    if (phId) {
      const cnt = await client.query('orders', { select: 'id', filters: { photographer_id: `eq.${phId}` } }).catch(() => []);
      pct = commissionFor((cnt || []).length).pct;
    }
    const amount = order.total_amount ? Math.round(order.total_amount * pct / 100) : 0;
    const who = order.client_name || 'Ваш клієнт';
    const text =
      `💰 <b>Оплата!</b>\n\n` +
      `${who} оплатив набір${order.total_amount ? ` на ${order.total_amount}₴` : ''}.\n` +
      (amount ? `Ваша комісія: <b>+${amount}₴</b> (${pct}%).\n` : '') +
      `\nДякуємо, що рекомендуєте Прояв 🤍`;
    await fetch(`https://api.telegram.org/bot${env.TG_TOKEN}/sendMessage`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    });
  } catch (e) { console.error('[api-orders] notifyPhotographerPaid:', e.message); }
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return preflight();

  try { await authRequest(request, env); } catch { return fail('Unauthorized', 401); }

  const client = db(env);
  const url    = new URL(request.url);

  // ── GET: list orders ──────────────────────────────────────────────────
  if (request.method === 'GET') {
    const status = url.searchParams.get('status');
    const search = url.searchParams.get('search');

    const filters = {};
    if (status && status !== 'all') filters.status = `eq.${status}`;

    let orders = await client.query('orders', {
      select:  '*,photographers(name,city)',
      filters,
      order:   'created_at.desc',
      limit:   300,
    });

    // Client-side search filter (PostgREST `or` is simpler this way for small datasets)
    if (search && orders) {
      const s = search.toLowerCase();
      orders = orders.filter(o =>
        (o.client_name  || '').toLowerCase().includes(s) ||
        (o.client_phone || '').includes(s) ||
        (o.token        || '').toLowerCase().includes(s)
      );
    }

    // Stats — лічильники дешевим count, виручка лише по оплачених (AUDIT B1):
    // не тягнемо всю таблицю в воркер.
    const [total, newC, uploaded, paidRows] = await Promise.all([
      client.count('orders'),
      client.count('orders', { status: 'eq.new' }),
      client.count('orders', { status: 'eq.uploaded' }),
      client.query('orders', { select: 'total_amount', filters: { status: 'eq.paid' }, limit: 5000 }).catch(() => []),
    ]);
    const stats = {
      total, new: newC, uploaded,
      revenue: (paidRows || []).reduce((s, o) => s + (o.total_amount || 0), 0),
    };

    return ok({ orders: orders || [], stats });
  }

  // ── POST: create order ────────────────────────────────────────────────
  if (request.method === 'POST') {
    let body;
    try { body = await request.json(); } catch { return fail('Invalid JSON'); }

    const { client_name, client_phone, client_instagram, product_type, photographer_id, source, notes } = body;
    if (!client_name?.trim()) return fail("Ім'я клієнта обов'язкове");
    if (!client_phone?.trim()) return fail('Телефон клієнта обов\'язковий');

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
        photographer_id:  photographer_id || null,
        source:           source || 'retail',
        notes:            notes?.trim() || null,
        status:           'new',
      },
    });

    const siteUrl = (env.SITE_URL || '').replace(/\/$/, '');
    return ok({ order: data, link: `${siteUrl}/order?t=${token}` }, 201);
  }

  // ── PUT: update order ─────────────────────────────────────────────────
  if (request.method === 'PUT') {
    let body;
    try { body = await request.json(); } catch { return fail('Invalid JSON'); }

    const { id, status, ttn, notes, total_amount } = body;
    if (!id) return fail('id обов\'язковий');

    const updates = {};
    if (status !== undefined) {
      updates.status = status;
      // Stamp funnel timestamps for analytics (revenue/lead-time reporting).
      if (status === 'paid') updates.paid_at    = new Date().toISOString();
      if (status === 'sent') updates.shipped_at = new Date().toISOString();
    }
    if (ttn          !== undefined) updates.ttn          = ttn;
    if (notes        !== undefined) updates.notes        = notes;
    if (total_amount !== undefined) updates.total_amount = total_amount;

    const data = await client.query('orders', {
      method:  'PATCH',
      filters: { id: `eq.${id}` },
      select:  '*,photographers(name,city,tg_chat_id)',
      single:  true,
      body:    updates,
    });

    // Newly marked paid → ping the photographer (non-blocking, non-fatal).
    if (updates.status === 'paid' && env.TG_TOKEN) {
      await notifyPhotographerPaid(env, client, data);
    }

    // Авто-сповіщення клієнту в кабінет при зміні статусу (CRM, non-fatal).
    if (updates.status && data.client_id) {
      const MSG = {
        uploaded:    { title: 'Кадри отримано', body: 'Ми прийняли ваші кадри й беремося до роботи.' },
        in_progress: { title: 'Проявляємо',     body: 'Ваше замовлення в роботі — контролюємо друк.' },
        sent:        { title: 'Відправлено',    body: data.ttn ? `Замовлення в дорозі. ТТН: ${data.ttn}` : 'Ваше замовлення передано Новій Пошті.' },
        paid:        { title: 'Дякуємо!',        body: 'Оплату отримано. Сподіваємось, набір вас потішив 🤍' },
      };
      const m = MSG[updates.status];
      if (m) {
        client.query('client_notifications', {
          method: 'POST',
          body: { client_id: data.client_id, order_token: data.token, kind: 'status', title: m.title, body: m.body },
        }).catch(e => console.error('[api-orders] notify client:', e.message));
      }
    }

    return ok({ order: data });
  }

  return fail('Method not allowed', 405);
}
