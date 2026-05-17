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
    return fail('DB error: ' + e.message, 500);
  }

  if (!ph) return fail('Невірний email або пароль', 401);

  let valid;
  try {
    valid = await verifyPassword(password, ph.password_hash);
  } catch (e) {
    return fail('Verify error: ' + e.message + ' | hash: ' + (ph.password_hash || '').slice(0, 20), 500);
  }

  if (!valid) {
    // Return hash prefix for debugging (remove after fix)
    return fail('Невірний email або пароль. Hash type: ' + (ph.password_hash || '').slice(0, 15), 401);
  }

  if (!env.JWT_SECRET) return fail('JWT_SECRET не налаштовано', 500);

  let token;
  try {
    token = await signJWT(
      { role: 'photographer', id: ph.id, name: ph.name },
      env.JWT_SECRET,
      604800
    );
  } catch (e) {
    return fail('JWT error: ' + e.message, 500);
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
