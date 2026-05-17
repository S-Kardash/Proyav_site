/**
 * api-reset-ph-pwd.js — ТИМЧАСОВА функція для скидання пароля фотографа
 * Використати один раз, потім видалити з репозиторію
 *
 * POST { secret: "ADMIN_PASSWORD значення", email: "фотограф@email.com" }
 * Повертає новий тимчасовий пароль
 */
import { ok, fail, preflight, db, hashPassword, randomToken } from './_utils.js';

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'POST') return fail('Method not allowed', 405);

  let body;
  try { body = await request.json(); } catch { return fail('Invalid JSON'); }

  // Guard: requires admin password to prevent misuse
  if (!body.secret || body.secret !== env.ADMIN_PASSWORD) {
    return fail('Unauthorized', 401);
  }

  const email = (body.email || '').toLowerCase().trim();
  if (!email) return fail('email обов\'язковий');

  const client = db(env);

  // Check photographer exists
  const ph = await client.query('photographers', {
    filters: { email: `eq.${email}` },
    single: true,
  }).catch(() => null);

  if (!ph) return fail(`Фотографа з email ${email} не знайдено`, 404);

  // Generate new password + PBKDF2 hash
  const newPassword   = randomToken(8).toUpperCase();
  const password_hash = await hashPassword(newPassword);

  await client.query('photographers', {
    method:  'PATCH',
    filters: { email: `eq.${email}` },
    body:    { password_hash },
  });

  return ok({
    ok:           true,
    email:        email,
    name:         ph.name,
    new_password: newPassword,
    message:      'Пароль скинуто. Збережіть і надішліть фотографу. Потім видаліть цю функцію.',
  });
}
