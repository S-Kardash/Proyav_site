import { ok, fail, preflight, db, randomToken } from './_utils.js';

const PRODUCTS = {
  small: 'Малий набір', medium: 'Середній набір',
  large: 'Великий набір', baby: 'Спогади малюка',
};

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'POST') return fail('Method not allowed', 405);

  let body;
  try { body = await request.json(); } catch { return fail('Invalid JSON'); }

  const { name, phone, product_type, message } = body;
  if (!name?.trim())  return fail("Ім'я обов'язкове");
  if (!phone?.trim()) return fail('Телефон обов\'язковий');

  const client = db(env);
  const token  = randomToken(8);

  const order = await client.query('orders', {
    method: 'POST',
    single: true,
    body: {
      token,
      client_name:  name.trim(),
      client_phone: phone.replace(/\D/g, ''),
      product_type: product_type || 'small',
      source:       'retail',
      status:       'new',
      notes:        message?.trim() || null,
    },
  });

  // Telegram notification to admin
  if (env.TG_TOKEN && env.TG_CHAT_ID) {
    const product = PRODUCTS[product_type] || 'Не вказано';
    const text = [
      `🛒 <b>[ПРОЯВ] Нова заявка з сайту</b>`,
      ``,
      `👤 <b>${name.trim()}</b>`,
      `📞 ${phone.trim()}`,
      `📦 ${product}`,
      message ? `💬 ${message.trim()}` : null,
      ``,
      `🆔 Токен: <code>${token}</code>`,
      `🔗 Створи посилання в адмінці → /admin`,
    ].filter(Boolean).join('\n');

    await fetch(`https://api.telegram.org/bot${env.TG_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: env.TG_CHAT_ID, text, parse_mode: 'HTML' }),
    }).catch(e => console.error('[retail] TG:', e.message));
  }

  return ok({ ok: true, message: 'Заявку отримано. Ми надішлемо вам посилання найближчим часом.' });
}
