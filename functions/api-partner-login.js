import { ok, fail, preflight, db, verifyPassword, signJWT } from './_utils.js';

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'POST') return fail('Method not allowed', 405);

  let body;
  try { body = await request.json(); } catch { return fail('Invalid JSON'); }

  const { email, password } = body;
  if (!email || !password) return fail("Email і пароль обов'язкові");

  // Step-by-step with explicit error reporting
  let ph;
  try {
    const client = db(env);
    ph = await client.query('photographers', {
      filters: { email: `eq.${email.toLowerCase().trim()}`, active: 'eq.true' },
      single:  true,
    });
  } catch (e) {
    console.error('[partner-login] DB error:', e.message);
    return fail('Помилка сервера. Спробуйте ще раз.', 500);
  }

  if (!ph) return fail('Невірний email або пароль', 401);

  let valid = false;
  try {
    valid = await verifyPassword(password, ph.password_hash);
  } catch (e) {
    console.error('[partner-login] verify error:', e.message);
    return fail('Помилка входу. Спробуйте ще раз.', 500);
  }

  if (!valid) return fail('Невірний email або пароль', 401);

  if (!env.JWT_SECRET) return fail('JWT_SECRET не налаштовано', 500);

  let token;
  try {
    token = await signJWT(
      { role: 'photographer', id: ph.id, name: ph.name },
      env.JWT_SECRET,
      604800
    );
  } catch (e) {
    console.error('[partner-login] JWT error:', e.message);
    return fail('Помилка сервера. Спробуйте ще раз.', 500);
  }

  return ok({
    token,
    photographer: {
      id:             ph.id,
      name:           ph.name,
      city:           ph.city,
      commission_pct: ph.commission_pct,
    },
  });
}
