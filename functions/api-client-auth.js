import { ok, fail, preflight, db, hashPassword, verifyPassword, signJWT, verifyJWT, randomToken, rateLimited, tooMany, logAudit } from './_utils.js';

/**
 * api-client-auth.js — клієнтські акаунти (кабінет клієнта).
 *
 * POST { action:'register', name, phone, password, instagram?, email?, order_token? }
 *   Створює акаунт (телефон — логін) і прив'язує до нього всі замовлення з цим
 *   телефоном + поточне замовлення за токеном (пропозиція реєстрації наприкінці
 *   order-флоу). Повертає JWT { role:'client' } — авто-вхід.
 *
 * POST { action:'login', phone, password }
 */
export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'POST') return fail('Method not allowed', 405);
  if (!env.JWT_SECRET) return fail('JWT_SECRET не налаштовано', 500);
  if (rateLimited(request, { key: 'client-auth', limit: 10, windowMs: 60000 })) return tooMany();

  let body;
  try { body = await request.json(); } catch { return fail('Invalid JSON'); }

  const client = db(env);
  const TTL = 2592000; // 30 днів

  // ── Адмін: скидання пароля клієнту (CRM) ────────────────────────────
  if (body.action === 'admin_reset') {
    const authH = request.headers.get('Authorization') || '';
    let isAdmin = false;
    if (authH.startsWith('Bearer ')) { try { isAdmin = (await verifyJWT(authH.slice(7), env.JWT_SECRET)).role === 'admin'; } catch {} }
    if (!isAdmin) return fail('Forbidden', 403);
    if (!body.client_id) return fail('client_id обов\'язковий');
    const temp = randomToken(8).toUpperCase();
    await client.query('clients', {
      method: 'PATCH', filters: { id: `eq.${body.client_id}` },
      body: { password_hash: await hashPassword(temp) },
    });
    await logAudit(env, 'client_reset', 'client:' + body.client_id, 'Скинуто пароль клієнта');
    return ok({ ok: true, temp_password: temp });
  }

  // ── Реєстрація ──────────────────────────────────────────────────────
  if (body.action === 'register') {
    const { name, password, instagram, email, order_token } = body;
    const phoneNorm = String(body.phone || '').replace(/\D/g, '');
    if (!name?.trim()) return fail("Ім'я обов'язкове");
    if (phoneNorm.length < 9) return fail('Введіть коректний телефон');
    if (!password || String(password).length < 6) return fail('Пароль — мінімум 6 символів');

    const existing = await client.query('clients', {
      select: 'id', filters: { phone: `eq.${phoneNorm}` }, limit: 1,
    }).catch(() => []);
    if (existing && existing.length) {
      return fail('Акаунт з таким телефоном вже існує — спробуйте увійти.', 409);
    }

    const password_hash = await hashPassword(String(password));
    let c;
    try {
      c = await client.query('clients', {
        method: 'POST', single: true,
        select: 'id,name,phone,instagram,email,created_at',
        body: {
          name:      name.trim(),
          phone:     phoneNorm,
          instagram: instagram?.trim().replace('@', '') || null,
          email:     email?.toLowerCase().trim() || null,
          password_hash,
        },
      });
    } catch (e) {
      if (/unique|duplicate/i.test(e.message || '')) return fail('Акаунт з таким телефоном вже існує.', 409);
      console.error('[client-auth] register:', e.message);
      return fail('Не вдалося створити акаунт. Спробуйте ще раз.', 500);
    }

    // Прив'язуємо історію: всі замовлення з цим телефоном без власника
    // + поточне замовлення за токеном (телефон міг відрізнятись).
    try {
      await client.query('orders', {
        method: 'PATCH',
        filters: { client_phone: `eq.${phoneNorm}`, client_id: 'is.null' },
        body: { client_id: c.id },
      });
      if (order_token) {
        await client.query('orders', {
          method: 'PATCH',
          filters: { token: `eq.${order_token}`, client_id: 'is.null' },
          body: { client_id: c.id },
        });
      }
    } catch (e) { console.error('[client-auth] link orders:', e.message); }

    const token = await signJWT({ role: 'client', id: c.id, name: c.name }, env.JWT_SECRET, TTL);
    return ok({ token, client: c }, 201);
  }

  // ── Вхід ────────────────────────────────────────────────────────────
  if (body.action === 'login') {
    const phoneNorm = String(body.phone || '').replace(/\D/g, '');
    if (!phoneNorm || !body.password) return fail("Телефон і пароль обов'язкові");

    let c;
    try {
      c = await client.query('clients', { filters: { phone: `eq.${phoneNorm}` }, single: true });
    } catch { return fail('Невірний телефон або пароль', 401); }
    if (!c) return fail('Невірний телефон або пароль', 401);

    const valid = await verifyPassword(body.password, c.password_hash).catch(() => false);
    if (!valid) return fail('Невірний телефон або пароль', 401);

    const token = await signJWT({ role: 'client', id: c.id, name: c.name }, env.JWT_SECRET, TTL);
    return ok({ token, client: { id: c.id, name: c.name, phone: c.phone, instagram: c.instagram, email: c.email } });
  }

  return fail('Unknown action');
}
