import { ok, fail, preflight, db, randomToken, sheetsAppend, PRODUCT_NAMES } from './_utils.js';

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'POST') return fail('Method not allowed', 405);

  let body;
  try { body = await request.json(); } catch { return fail('Invalid JSON'); }

  const {
    name, phone, product_type, message,
    client_instagram,
    order_ref, photo_count, qty_total, total_amount,
  } = body;

  if (!name?.trim())  return fail("Ім'я обов'язкове");
  if (!phone?.trim()) return fail('Телефон обов\'язковий');

  const client = db(env);
  const token  = randomToken(8);

  let order = null;
  let dbError = null;
  try {
    order = await client.query('orders', {
      method: 'POST',
      single: true,
      body: {
        token,
        client_name:      name.trim(),
        client_phone:     phone.replace(/\D/g, ''),
        client_instagram: client_instagram?.trim().replace('@', '') || null,
        product_type:     product_type || 'small',
        source:           'retail',
        status:           'uploaded',           // photos already sent via TG
        notes:            message?.trim() || null,
        photo_count:      photo_count  || null,
        qty_total:        qty_total    || null,
        total_amount:     total_amount || null,
        uploaded_at:      new Date().toISOString(),
      },
    });
  } catch (e) {
    dbError = e.message || String(e);
    console.error('[retail] Supabase INSERT failed:', dbError);
  }

  // ── Telegram notification to admin ──────────────────────────────────
  if (env.TG_TOKEN && env.TG_CHAT_ID) {
    const product = PRODUCT_NAMES[product_type] || 'Не вказано';
    const text = [
      dbError
        ? `⚠️ <b>[ПРОЯВ] Заявка НЕ записалась у базу!</b>\n<i>Помилка: ${dbError}</i>\nДані замовлення нижче — внесіть вручну в /admin`
        : `🛒 <b>[ПРОЯВ] Нова заявка з сайту</b>`,
      ``,
      `👤 <b>${name.trim()}</b>`,
      `📞 ${phone.trim()}`,
      client_instagram ? `📸 @${client_instagram.replace('@','')}` : null,
      `📦 ${product}`,
      photo_count  ? `🖼 Фото: ${photo_count} шт / ${qty_total || '?'} відбитків` : null,
      total_amount ? `💰 Сума: ${total_amount} грн` : null,
      order_ref    ? `🆔 Ref: ${order_ref}` : null,
      message      ? `💬 ${message.trim()}` : null,
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

  // ── Google Sheets sync (non-fatal) ───────────────────────────────────
  const date = new Date().toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' });
  await sheetsAppend(env, [
    date,
    token.toUpperCase(),
    'Роздріб (сайт)',
    name.trim(),
    phone.trim(),
    client_instagram ? '@' + client_instagram.replace('@','') : '',
    '',                                        // photographer name — n/a for retail
    '',                                        // photographer city
    PRODUCT_NAMES[product_type] || product_type,
    photo_count  || '',
    qty_total    || '',
    total_amount ? `${total_amount} грн` : '',
    order_ref    || '',
    'Фото отримано',
    '',
  ]);

  return ok({
    ok:        !dbError,
    saved_db:  !dbError,
    token,
    message:   dbError ? 'Заявку отримано (надіслано в Telegram).' : 'Заявку збережено.',
  });
}
