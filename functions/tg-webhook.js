import { db } from './_utils.js';

/**
 * tg-webhook.js — Telegram Bot webhook (MARKETING_CONTEXT 8.4).
 *
 * Receives updates from @proyavOrders_bot. The only thing we care about is the
 * deep-link start: when a photographer opens
 *     https://t.me/proyavOrders_bot?start=<tg_link_token>
 * Telegram delivers a message "/start <tg_link_token>". We look up the
 * photographer by that token and store their chat_id, so api-orders can later
 * ping them "ваш клієнт оплатив — +X₴".
 *
 * One-time owner setup (see end of file for the exact command):
 *   setWebhook → https://<domain>/tg-webhook  with a secret_token.
 *
 * Always returns 200 quickly so Telegram doesn't retry.
 */

async function tgSend(env, chatId, text) {
  if (!env.TG_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${env.TG_TOKEN}/sendMessage`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    });
  } catch (e) { console.error('[tg-webhook] send:', e.message); }
}

export async function onRequest(context) {
  const { request, env } = context;

  // Telegram only ever POSTs. Ignore everything else (incl. health checks).
  if (request.method !== 'POST') return new Response('ok', { status: 200 });

  // Shared-secret check ОБОВ'ЯЗКОВИЙ (AUDIT A3): без секрета будь-хто міг би
  // POST'ом підробити Telegram-апдейт і прив'язати свій chat_id до фотографа.
  // Якщо секрет не налаштовано — відмовляємо (форсує безпечне налаштування).
  if (!env.TG_WEBHOOK_SECRET) return new Response('forbidden: secret not configured', { status: 403 });
  if (request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.TG_WEBHOOK_SECRET) {
    return new Response('forbidden', { status: 403 });
  }

  let update;
  try { update = await request.json(); } catch { return new Response('ok', { status: 200 }); }

  const msg = update.message || update.edited_message;
  const text = (msg && msg.text || '').trim();
  const chatId = msg && msg.chat && msg.chat.id;

  // We only act on the deep-link start. Everything else → friendly nudge.
  if (!chatId) return new Response('ok', { status: 200 });

  const startMatch = text.match(/^\/start(?:\s+(\S+))?/);
  if (!startMatch) return new Response('ok', { status: 200 });

  const linkToken = startMatch[1];
  if (!linkToken) {
    await tgSend(env, chatId,
      'Вітаємо у <b>Прояв</b>! Щоб отримувати сповіщення про оплати, відкрийте посилання «Підключити Telegram» у своєму кабінеті фотографа.');
    return new Response('ok', { status: 200 });
  }

  try {
    const client = db(env);
    const found = await client.query('photographers', {
      select:  'id,name',
      filters: { tg_link_token: `eq.${linkToken}` },
      limit:   1,
    });
    const ph = found && found[0];
    if (!ph) {
      await tgSend(env, chatId, 'Посилання застаріле або недійсне. Відкрийте «Підключити Telegram» у кабінеті ще раз.');
      return new Response('ok', { status: 200 });
    }

    await client.query('photographers', {
      method:  'PATCH',
      filters: { id: `eq.${ph.id}` },
      body:    { tg_chat_id: String(chatId) },
    });

    await tgSend(env, chatId,
      `✅ Сповіщення підключено, ${ph.name || ''}!\n\nТепер ви отримаєте пінг тут щоразу, коли ваш клієнт оплатить набір. Дякуємо, що з нами 🤍`);
  } catch (e) {
    console.error('[tg-webhook]', e.message);
    await tgSend(env, chatId, 'Сталася помилка при підключенні. Спробуйте ще раз трохи згодом.');
  }

  return new Response('ok', { status: 200 });
}

/*
 ── ONE-TIME OWNER SETUP ──────────────────────────────────────────────────
 1) Cloudflare Pages → Settings → Environment variables:
      TG_BOT_USERNAME = proyavOrders_bot
      TG_WEBHOOK_SECRET = <будь-який довгий рядок, напр. 32 випадкові символи>
    (TG_TOKEN / SUPABASE_URL / SUPABASE_SERVICE_KEY вже налаштовані.)

 2) Зареєструвати webhook (один раз, підставивши TG_TOKEN і той самий secret):
      curl "https://api.telegram.org/bot<TG_TOKEN>/setWebhook" \
        -d "url=https://proyav.pages.dev/tg-webhook" \
        -d "secret_token=<TG_WEBHOOK_SECRET>"

 3) Застосувати міграцію (migrations/proyav_admin.sql, секція 6) у Supabase.
 ──────────────────────────────────────────────────────────────────────────
*/
