import { ok, fail, preflight, signJWT, rateLimited, tooMany } from './_utils.js';

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'POST') return fail('Method not allowed', 405);

  // Брутфорс-захист: адмін-пароль — майстер-ключ до всіх даних (AUDIT A1/A2).
  if (rateLimited(request, { key: 'admin-login', limit: 8, windowMs: 60000 })) return tooMany();

  let body;
  try { body = await request.json(); } catch { return fail('Invalid JSON'); }

  if (!env.JWT_SECRET) return fail('JWT_SECRET не налаштовано', 500);

  // Дві ролі: ADMIN_PASSWORD → 'admin' (власник, повний доступ);
  // MANAGER_PASSWORD (опційно) → 'manager' (замовлення/клієнти/склад/завдання,
  // без грошей, аналітики, налаштувань і партнерів).
  let role = null;
  if (body.password && body.password === env.ADMIN_PASSWORD) role = 'admin';
  else if (body.password && env.MANAGER_PASSWORD && body.password === env.MANAGER_PASSWORD) role = 'manager';
  if (!role) return fail('Невірний пароль', 401);

  const token = await signJWT({ role }, env.JWT_SECRET, 43200); // 12h
  return ok({ token, role });
}
