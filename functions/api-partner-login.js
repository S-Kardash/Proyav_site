import { ok, fail, preflight, db, verifyPassword, signJWT } from './_utils.js';

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'POST') return fail('Method not allowed', 405);

  let body;
  try { body = await request.json(); } catch { return fail('Invalid JSON'); }

  const { email, password } = body;
  if (!email || !password) return fail("Email і пароль обов'язкові");

  const client = db(env);
  const ph = await client.query('photographers', {
    filters: { email: `eq.${email.toLowerCase().trim()}`, active: 'eq.true' },
    single:  true,
  }).catch(() => null);

  if (!ph) return fail('Невірний email або пароль', 401);

  const valid = await verifyPassword(password, ph.password_hash);
  if (!valid) return fail('Невірний email або пароль', 401);

  if (!env.JWT_SECRET) return fail('JWT_SECRET не налаштовано', 500);

  const token = await signJWT(
    { role: 'photographer', id: ph.id, name: ph.name },
    env.JWT_SECRET,
    604800 // 7 days
  );

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
