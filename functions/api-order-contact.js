import { ok, fail, preflight, db, rateLimited, tooMany } from './_utils.js';

/**
 * api-order-contact.js — клієнт лишає email для цифрових копій (Ітерація 3, 2B-6).
 * POST { token, email } → зберігаємо email у нотатки замовлення (token = capability),
 * щоб контакт не загубився (надсилання копій — ручне до появи email-провайдера).
 */
export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'POST') return fail('Method not allowed', 405);

  if (rateLimited(request, { key: 'contact', limit: 20, windowMs: 60000 })) return tooMany();

  let b; try { b = await request.json(); } catch { return fail('Invalid JSON'); }
  const token = String(b.token || '').trim();
  const email = String(b.email || '').trim().slice(0, 200);
  if (!token || !email) return fail('token і email обов\'язкові');

  const client = db(env);
  const rows = await client.query('orders', {
    select: 'id,notes', filters: { token: `eq.${token}` }, limit: 1,
  }).catch(() => []);
  if (!rows || !rows.length) return fail('Замовлення не знайдено', 404);

  const o = rows[0];
  if (String(o.notes || '').includes(email)) return ok({ ok: true }); // вже збережено
  const notes = [o.notes, `📧 ${email}`].filter(Boolean).join(' · ');
  await client.query('orders', { method: 'PATCH', filters: { id: `eq.${o.id}` }, body: { notes } });
  return ok({ ok: true });
}
