import { ok, fail, preflight, db, randomToken, sheetsAppend, verifyJWT, PRODUCT_NAMES, PACKAGES, PRINT_PRICE, RETAIL_ENABLED, FIRST_SERIES, firstSeriesUsed, packagePrice, commissionFor } from './_utils.js';

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'POST') return fail('Method not allowed', 405);

  let body;
  try { body = await request.json(); } catch { return fail('Invalid JSON'); }

  // Optional: a logged-in client placing a new order → link it to their account
  // right away (so it shows up in their cabinet without re-registering).
  let clientId = null;
  const authH = request.headers.get('Authorization') || '';
  if (authH.startsWith('Bearer ') && env.JWT_SECRET) {
    try {
      const claims = await verifyJWT(authH.slice(7), env.JWT_SECRET);
      if (claims.role === 'client') clientId = claims.id;
    } catch { /* invalid/expired token → just save as guest */ }
  }

  const {
    name, phone, product_type, message, source,
    client_instagram, photographer_id, free, card_signature,
    order_ref, photo_count, qty_total,
  } = body;

  if (!name?.trim())  return fail("Ім'я обов'язкове");
  if (!phone?.trim()) return fail('Телефон обов\'язковий');

  const client = db(env);
  const token  = randomToken(8);

  // A lead with no photos yet → fresh "new" order, not "uploaded".
  // The order.html path sends photos via Telegram first → "uploaded".
  const hasPhotos = Number(photo_count) > 0;

  // ── Server-authoritative price (mirrors /config.js) ─────────────────────
  // package → fixed price of the (auto-upgraded) набір; retail → qty × printPrice.
  const isPackage = source === 'package' || !!PACKAGES[product_type];
  let finalSource = 'retail';
  let finalType   = null;
  let finalTotal  = (Number(qty_total) || 0) * PRINT_PRICE;
  if (isPackage) {
    const pp = packagePrice(product_type, qty_total);
    if (pp) { finalSource = 'package'; finalType = pp.productType; finalTotal = pp.price; }
  }
  // Reusable referral link → attribute the order to the photographer.
  const photographerId = photographer_id || null;
  if (photographerId) finalSource = 'photographer';
  // Free trial print (self-serve onboarding) — owner fulfils, zero charge.
  if (free) finalTotal = 0;

  // Роздріб поштучно вимкнено (рішення 12.06.2026): приймаємо лише набори.
  // Пробний відбиток фотографа (free) — окремий онбординг-флоу, він живе.
  if (!RETAIL_ENABLED && !isPackage && !free) {
    return fail('Ми працюємо лише з наборами — оберіть формат на /nabir. Найменший «Момент» — 12 кадрів.', 422);
  }

  // ── «Перша серія» (П1.1): знижку рахує ЛИШЕ сервер ──────────────────────
  // Кожне платне package-замовлення отримує −discountPct, поки слотів < ліміту.
  let firstSeries = false;
  if (FIRST_SERIES.enabled && isPackage && !free && finalTotal > 0) {
    const used = await firstSeriesUsed(client).catch(() => FIRST_SERIES.slots);
    if (used < FIRST_SERIES.slots) {
      firstSeries = true;
      finalTotal  = Math.round(finalTotal * (100 - FIRST_SERIES.discountPct) / 100);
    }
  }

  // Optional card signature ("Кадр: …") the owner prints on the physical card.
  const signature = card_signature?.trim() || null;
  const signatureNote = signature ? `✍️ Підпис на картці: Кадр — ${signature}` : '';

  const baseNotes = [free ? '🎁 Безкоштовний пробний відбиток.' : '', signatureNote, message?.trim() || '']
    .filter(Boolean).join(' ').trim();

  const insertBody = {
    token,
    client_name:      name.trim(),
    client_phone:     phone.replace(/\D/g, ''),
    client_instagram: client_instagram?.trim().replace('@', '') || null,
    product_type:     finalType,
    source:           finalSource,
    status:           hasPhotos ? 'uploaded' : 'new',
    notes:            baseNotes || null,
    photo_count:      photo_count || null,
    qty_total:        qty_total   || null,
    total_amount:     finalTotal,
    uploaded_at:      hasPhotos ? new Date().toISOString() : null,
    client_id:        clientId,
    first_series:     firstSeries,
  };

  // ── Attribute the photographer only if the ?ph= value resolves to a real
  // photographer. A stale/invalid id from the URL must NEVER block the order
  // from saving (this was losing photographer orders entirely). ──
  if (photographerId) {
    const found = await client.query('photographers', {
      select: 'id', filters: { id: `eq.${photographerId}` }, limit: 1,
    }).catch(() => null);
    if (found && found.length) {
      insertBody.photographer_id = photographerId;
    } else {
      // Don't lose the attribution — keep finalSource='photographer' but stash the
      // raw ref in notes so the owner can link it manually in /admin.
      insertBody.notes = [insertBody.notes, `⚠ ref фотографа не знайдено: ${photographerId}`].filter(Boolean).join(' · ');
      console.warn('[retail] unknown photographer ref:', photographerId);
    }
  }

  let order = null;
  let dbError = null;
  try {
    order = await client.query('orders', { method: 'POST', single: true, body: insertBody });
  } catch (e) {
    dbError = e.message || String(e);
    console.error('[retail] Supabase INSERT failed:', dbError);
    // Last-resort recovery: if the photographer link is what broke the insert,
    // retry without it so the order is never lost. Note the reason for the owner.
    if (insertBody.photographer_id) {
      try {
        const retryBody = {
          ...insertBody,
          photographer_id: null,
          notes: [insertBody.notes, `⚠ збережено без прив'язки до фотографа (${insertBody.photographer_id}); причина: ${dbError}`].filter(Boolean).join(' · '),
        };
        order = await client.query('orders', { method: 'POST', single: true, body: retryBody });
        dbError = null; // recovered — order saved
        console.warn('[retail] recovered insert without photographer_id');
      } catch (e2) {
        dbError = e2.message || String(e2);
        console.error('[retail] retry INSERT also failed:', dbError);
      }
    }
  }

  const productLabel = finalType ? (PRODUCT_NAMES[finalType] || finalType) : 'Роздрібний друк';

  // ── Telegram notification to admin ──────────────────────────────────
  if (env.TG_TOKEN && env.TG_CHAT_ID) {
    const text = [
      dbError
        ? `⚠️ <b>[ПРОЯВ] Заявка НЕ записалась у базу!</b>\n<i>Помилка: ${dbError}</i>\nДані замовлення нижче — внесіть вручну в /admin`
        : `🛒 <b>[ПРОЯВ] Нова заявка з сайту</b>`,
      ``,
      `👤 <b>${name.trim()}</b>`,
      `📞 ${phone.trim()}`,
      client_instagram ? `📸 @${client_instagram.replace('@','')}` : null,
      `📦 ${productLabel} · ${finalSource === 'photographer' ? 'фотограф' : finalSource === 'package' ? 'пакет' : 'роздріб'}`,
      photo_count ? `🖼 Фото: ${photo_count} шт / ${qty_total || '?'} відбитків` : null,
      signature ? `✍️ Кадр: ${signature}` : null,
      free ? `🎁 Безкоштовний пробний відбиток` : `💰 Сума: ${finalTotal} грн${firstSeries ? ` (−${FIRST_SERIES.discountPct}% перша серія)` : ''}`,
      firstSeries ? `✨ ПЕРША СЕРІЯ` : null,
      order_ref ? `🆔 Ref: ${order_ref}` : null,
      message   ? `💬 ${message.trim()}` : null,
      ``,
      `🔗 Токен: <code>${token}</code>`,
      `📋 /admin → Замовлення`,
    ].filter(Boolean).join('\n');

    await fetch(`https://api.telegram.org/bot${env.TG_TOKEN}/sendMessage`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ chat_id: env.TG_CHAT_ID, text, parse_mode: 'HTML' }),
    }).catch(e => console.error('[retail] TG:', e.message));
  }

  // ── Telegram push to the photographer: a client ordered via their reusable
  // link (8.4). Skip the free trial (that's the photographer printing their own
  // sample, not a client order). Only fires if they connected Telegram. ──
  const attributedPhId = order && order.photographer_id;
  if (attributedPhId && !free && env.TG_TOKEN) {
    try {
      const ph = await client.query('photographers', {
        select: 'name,tg_chat_id', filters: { id: `eq.${attributedPhId}` }, single: true,
      }).catch(() => null);
      if (ph && ph.tg_chat_id) {
        const cnt = await client.query('orders', { select: 'id', filters: { photographer_id: `eq.${attributedPhId}` } }).catch(() => []);
        const pct  = commissionFor((cnt || []).length).pct;
        const comm = finalTotal ? Math.round(finalTotal * pct / 100) : 0;
        const text =
          `🆕 <b>Замовлення через ваше посилання!</b>\n\n` +
          `${name.trim()} замовив ${productLabel}${finalTotal ? ` на ${finalTotal}₴` : ''}.\n` +
          (comm ? `Очікувана комісія: <b>+${comm}₴</b> після оплати.\n` : '') +
          `\nМи беремо друк і доставку на себе — ви просто завершуєте досвід 🤍`;
        await fetch(`https://api.telegram.org/bot${env.TG_TOKEN}/sendMessage`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ chat_id: ph.tg_chat_id, text, parse_mode: 'HTML' }),
        });
      }
    } catch (e) { console.error('[retail] photographer notify:', e.message); }
  }

  // ── Google Sheets sync (non-fatal) ───────────────────────────────────
  const date = new Date().toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' });
  await sheetsAppend(env, [
    date,
    token.toUpperCase(),
    finalSource === 'package' ? 'Пакет (сайт)' : 'Роздріб (сайт)',
    name.trim(),
    phone.trim(),
    client_instagram ? '@' + client_instagram.replace('@','') : '',
    '',                                        // photographer name — n/a
    '',                                        // photographer city
    productLabel,
    photo_count || '',
    qty_total   || '',
    `${finalTotal} грн`,
    order_ref   || '',
    hasPhotos ? 'Фото отримано' : 'Нова заявка',
    '',
  ]);

  return ok({
    ok:        !dbError,
    saved_db:  !dbError,
    token,
    total_amount: finalTotal,
    source:    finalSource,
    message:   dbError ? 'Заявку отримано (надіслано в Telegram).' : 'Заявку збережено.',
  });
}
