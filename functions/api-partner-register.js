import { ok, fail, preflight, db, hashPassword, signJWT } from './_utils.js';

/**
 * api-partner-register.js — self-serve photographer onboarding (MARKETING_CONTEXT 8.3).
 * Creates an ACTIVE account, auto-logs in (JWT), returns a reusable referral link.
 * The free trial print is then placed via the normal order flow (/order?ph=<id>&trial=1).
 */
export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'POST') return fail('Method not allowed', 405);

  let body;
  try { body = await request.json(); } catch { return fail('Invalid JSON'); }

  const { name, email, password, phone, city } = body;
  if (!name?.trim())  return fail("Ім'я обов'язкове");
  if (!email?.trim()) return fail('Email обов\'язковий');
  if (!password || String(password).length < 6) return fail('Пароль — мінімум 6 символів');
  if (!env.JWT_SECRET) return fail('JWT_SECRET не налаштовано', 500);

  const client    = db(env);
  const emailNorm = email.toLowerCase().trim();

  // Unique email
  const existing = await client.query('photographers', {
    select: 'id', filters: { email: `eq.${emailNorm}` }, limit: 1,
  }).catch(() => []);
  if (existing && existing.length) {
    return fail('Фотограф з таким email вже зареєстрований — спробуйте увійти.', 409);
  }

  const password_hash = await hashPassword(String(password));
  let ph;
  try {
    ph = await client.query('photographers', {
      method: 'POST', single: true,
      select: 'id,name,email,phone,city,commission_pct,active,created_at',
      body: {
        name:           name.trim(),
        email:          emailNorm,
        password_hash,
        phone:          phone?.trim() || null,
        city:           city?.trim()  || null,
        commission_pct: 12,            // стартовий рівень; росте з активністю (config.js)
        active:         true,
      },
    });
  } catch (e) {
    if (/unique|duplicate/i.test(e.message || '')) {
      return fail('Фотограф з таким email вже зареєстрований.', 409);
    }
    console.error('[partner-register]', e.message);
    return fail('Не вдалося створити акаунт. Спробуйте ще раз.', 500);
  }

  const token = await signJWT({ role: 'photographer', id: ph.id, name: ph.name }, env.JWT_SECRET, 604800);

  // Notify owner about a new partner
  if (env.TG_TOKEN && env.TG_CHAT_ID) {
    const text = `🤝 <b>[ПРОЯВ] Новий фотограф-партнер</b>\n\n👤 ${ph.name}\n📧 ${ph.email}\n📞 ${ph.phone || '—'}\n📍 ${ph.city || '—'}`;
    await fetch(`https://api.telegram.org/bot${env.TG_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: env.TG_CHAT_ID, text, parse_mode: 'HTML' }),
    }).catch(e => console.error('[partner-register] TG:', e.message));
  }

  const siteUrl = (env.SITE_URL || '').replace(/\/$/, '');
  return ok({
    token,
    photographer: { id: ph.id, name: ph.name, city: ph.city, commission_pct: ph.commission_pct },
    ref_link: `${siteUrl}/order?ph=${ph.id}`,
  }, 201);
}
