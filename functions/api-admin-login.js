import { ok, fail, preflight, signJWT, rateLimited, tooMany } from './_utils.js';

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'POST') return fail('Method not allowed', 405);

  // Брутфорс-захист: адмін-пароль — майстер-ключ до всіх даних (AUDIT A1/A2).
  if (rateLimited(request, { key: 'admin-login', limit: 8, windowMs: 60000 })) return tooMany();

  let body;
  try { body = await request.json(); } catch { return fail('Invalid JSON'); }

  if (!body.password || body.password !== env.ADMIN_PASSWORD) {
    return fail('Невірний пароль', 401);
  }
  if (!env.JWT_SECRET) return fail('JWT_SECRET не налаштовано', 500);

  const token = await signJWT({ role: 'admin' }, env.JWT_SECRET, 43200); // 12h
  return ok({ token });
}
