import { ok, fail, preflight, authRequest, isStaff, db, randomToken, commissionFor, logAudit, siteOrigin, notifyPhotographer } from './_utils.js';

// Пінг фотографу в Telegram при оплаті його замовлення (8.4).
// Тариф — збережений commission_pct фотографа (саме його платить адмінка → один рахунок).
async function notifyPhotographerPaid(env, order, pct) {
  try {
    const ph = order.photographers;
    const chatId = ph && ph.tg_chat_id;
    if (!chatId) return; // фотограф не підключив Telegram — тихо пропускаємо
    pct = Number(pct) || 12;
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

  let claims; try { claims = await authRequest(request, env); } catch { return fail('Unauthorized', 401); }
  if (!isStaff(claims)) return fail('Forbidden', 403);

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

    const siteUrl = siteOrigin(env, request);
    return ok({ order: data, link: `${siteUrl}/order?t=${token}` }, 201);
  }

  // ── PUT: update order ─────────────────────────────────────────────────
  if (request.method === 'PUT') {
    let body;
    try { body = await request.json(); } catch { return fail('Invalid JSON'); }

    const { id, status, ttn, notes, total_amount } = body;
    if (!id) return fail('id обов\'язковий');
    const ALLOWED_STATUS = ['new', 'uploaded', 'in_progress', 'sent', 'paid'];
    if (status !== undefined && !ALLOWED_STATUS.includes(status)) return fail('Невідомий статус', 400);

    // Поточний статус ДО оновлення — щоб нотифікувати/штампувати лише при РЕАЛЬНІЙ зміні
    // (інакше пересейв уже-оплаченого замовлення дублює сповіщення й зсуває paid_at). 2B-4.
    let prevStatus = null;
    if (status !== undefined) {
      const cur = await client.query('orders', { select: 'status', filters: { id: `eq.${id}` }, single: true }).catch(() => null);
      prevStatus = cur && cur.status;
    }
    const statusChanged = status !== undefined && status !== prevStatus;

    const updates = {};
    if (status !== undefined) {
      updates.status = status;
      // Штампи воронки — лише при реальній зміні.
      if (statusChanged && status === 'paid') updates.paid_at    = new Date().toISOString();
      if (statusChanged && status === 'sent') updates.shipped_at = new Date().toISOString();
    }
    if (ttn          !== undefined) updates.ttn          = ttn;
    if (notes        !== undefined) updates.notes        = notes;
    if (total_amount !== undefined) updates.total_amount = total_amount;

    const data = await client.query('orders', {
      method:  'PATCH',
      filters: { id: `eq.${id}` },
      select:  '*,photographers(name,city,tg_chat_id,commission_pct)',
      single:  true,
      body:    updates,
    });

    // Оплата (реальна зміна): авто-зростання тарифу партнера за ВИКОНАНИМИ (оплаченими)
    // замовленнями — реалізує намір конституції й тримає ОДИН тариф (commission_pct), що
    // ним же платить адмінка. Потім — пінг із цим тарифом.
    if (statusChanged && status === 'paid') {
      let pct = Number(data.photographers && data.photographers.commission_pct) || 12;
      if (data.photographer_id) {
        try {
          const paidCnt = await client.count('orders', { photographer_id: `eq.${data.photographer_id}`, status: 'eq.paid' });
          const tierPct = commissionFor(paidCnt).pct;
          if (tierPct > pct) {
            pct = tierPct;
            await client.query('photographers', { method: 'PATCH', filters: { id: `eq.${data.photographer_id}` }, body: { commission_pct: pct } });
          }
        } catch (e) { console.error('[api-orders] tier bump:', e.message); }
      }
      // Сайтове сповіщення в кабінет автора — головний надійний канал (Telegram — бонус).
      if (data.photographer_id) {
        const amount = data.total_amount ? Math.round(data.total_amount * pct / 100) : 0;
        await notifyPhotographer(env, data.photographer_id, {
          kind: 'paid', orderToken: data.token,
          title: 'Оплата отримана',
          body: `${data.client_name || 'Ваш клієнт'} оплатив набір${data.total_amount ? ` на ${data.total_amount}₴` : ''}.`
              + (amount ? ` Ваша комісія +${amount}₴ (${pct}%).` : ''),
        });
      }
      if (env.TG_TOKEN) await notifyPhotographerPaid(env, data, pct);
    }

    // Журнал дій (CRM).
    const oidStr = 'ПРЯ-' + String(data.id || '').replace(/\D/g, '').padStart(6, '0').slice(-6);
    const what = [];
    if (updates.status !== undefined) what.push('статус → ' + updates.status);
    if (updates.ttn !== undefined && updates.ttn) what.push('ТТН ' + updates.ttn);
    if (updates.total_amount !== undefined) what.push('сума ' + updates.total_amount + '₴');
    if (updates.notes !== undefined) what.push('нотатки');
    await logAudit(env, updates.status !== undefined ? 'order_status' : 'order_edit',
      'order:' + oidStr, `${data.client_name || ''}: ${what.join(', ')}`);

    // Авто-сповіщення клієнту в кабінет — лише при РЕАЛЬНІЙ зміні статусу (CRM, non-fatal).
    if (statusChanged && data.client_id) {
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
