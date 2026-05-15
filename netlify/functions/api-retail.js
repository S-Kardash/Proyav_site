// api-retail.js — POST: public retail order request (no auth)
// Client fills a short form → admin gets TG notification → sends magic link
const { db, ok, fail, preflight } = require('./_utils');

const TG_API = () => `https://api.telegram.org/bot${process.env.TG_TOKEN}`;
const PRODUCTS = { small: 'Малий набір', medium: 'Середній набір', large: 'Великий набір', baby: 'Спогади малюка' };

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight();
  if (event.httpMethod !== 'POST') return fail('Method Not Allowed', 405);

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return fail('Invalid JSON'); }

  const { name, phone, product_type, message } = body;
  if (!name?.trim())  return fail('Ім\'я обов\'язкове');
  if (!phone?.trim()) return fail('Телефон обов\'язковий');

  const supabase = db();
  const { data: order, error } = await supabase
    .from('orders')
    .insert({
      client_name:  name.trim(),
      client_phone: phone.replace(/\D/g, ''),
      product_type: product_type || 'small',
      source:       'retail',
      status:       'new',
      notes:        message?.trim() || null,
    })
    .select()
    .single();

  if (error) return fail(error.message, 500);

  // Notify admin in Telegram
  const product = PRODUCTS[product_type] || product_type || 'Не вказано';
  const tgText = [
    `🛒 <b>[ПРОЯВ] Нова заявка з сайту</b>`,
    ``,
    `👤 <b>${name.trim()}</b>`,
    `📞 ${phone.trim()}`,
    `📦 ${product}`,
    message ? `💬 ${message.trim()}` : null,
    ``,
    `🔗 Згенеруй посилання в адмінці → /admin`,
    `🆔 Токен: <code>${order.token}</code>`,
  ].filter(l => l !== null).join('\n');

  try {
    if (process.env.TG_TOKEN && process.env.TG_CHAT_ID) {
      await fetch(`${TG_API()}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id:    process.env.TG_CHAT_ID,
          text:       tgText,
          parse_mode: 'HTML',
        }),
      });
    }
  } catch (e) {
    console.error('[retail] TG notify failed:', e.message);
  }

  return ok({ ok: true, message: 'Заявку отримано. Ми надішлемо вам посилання найближчим часом.' });
};
