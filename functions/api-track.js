import { ok, fail, preflight, db, rateLimited, tooMany } from './_utils.js';

/**
 * api-track.js — first-party аналітика дій (приватна, без кук, без передачі третім).
 * Публічний POST — приймає легку подію й пише в таблицю `events`.
 *
 * POST { type, path, ref, session, meta }
 *   type    — pageview | cta_click | format_select | order_start | order_submit | photo_added | …
 *   session — анонімний id з localStorage (НЕ PII)
 *   ref     — джерело (?ph=<id> / direct / utm)
 *   meta    — невеликий об'єкт деталей (без PII; обрізаємо)
 *
 * Жодних персональних даних не приймаємо й не зберігаємо. Тихо ковтаємо помилки,
 * щоб трекінг ніколи не впливав на UX.
 */
const ALLOWED = new Set([
  'pageview', 'cta_click', 'format_select', 'order_start', 'order_submit',
  'photo_added', 'partner_view', 'register', 'login', 'status_view',
]);

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'POST') return fail('Method not allowed', 405);
  // М'який ліміт: трекінг не критичний, але захищаємо від флуду.
  if (rateLimited(request, { key: 'track', limit: 240, windowMs: 60000 })) return ok({ ok: false });

  let b;
  try { b = await request.json(); } catch { return ok({ ok: false }); }

  const type = String(b.type || '').slice(0, 40);
  if (!ALLOWED.has(type)) return ok({ ok: false });

  // meta — лише невеликий безпечний об'єкт (обрізаємо рядки, ніякого PII).
  let meta = null;
  if (b.meta && typeof b.meta === 'object') {
    meta = {};
    let n = 0;
    for (const [k, v] of Object.entries(b.meta)) {
      if (n++ >= 10) break;
      const key = String(k).slice(0, 30);
      meta[key] = typeof v === 'number' ? v : String(v).slice(0, 80);
    }
  }

  try {
    await db(env).query('events', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: {
        type,
        path:    String(b.path || '').slice(0, 200) || null,
        ref:     String(b.ref || '').slice(0, 120) || null,
        session: String(b.session || '').slice(0, 64) || null,
        meta,
      },
    });
  } catch (e) { /* трекінг ніколи не ламає UX */ }

  return ok({ ok: true });
}
