import { ok, fail, preflight, authRequest, db } from './_utils.js';

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return preflight();

  try { await authRequest(request, env); } catch { return fail('Unauthorized', 401); }

  const client = db(env);

  // ── GET: all settings as an object ───────────────────────────────────
  if (request.method === 'GET') {
    const rows = await client.query('settings', { select: 'key,value', limit: 200 });
    const obj = {};
    (rows || []).forEach(r => { obj[r.key] = r.value; });
    return ok({ settings: obj });
  }

  // ── PUT: upsert one or many { key:value } pairs ──────────────────────
  if (request.method === 'PUT') {
    let b; try { b = await request.json(); } catch { return fail('Invalid JSON'); }
    const pairs = b.settings || b; // accept { settings:{...} } or raw {...}
    const entries = Object.entries(pairs).filter(([k]) => k !== 'settings');
    if (!entries.length) return fail('Немає що оновлювати');

    // Upsert each key: PATCH if it exists, else INSERT
    for (const [key, value] of entries) {
      const existing = await client.query('settings', {
        select: 'key', filters: { key: `eq.${key}` }, limit: 1,
      }).catch(() => []);
      if (existing && existing.length) {
        await client.query('settings', {
          method: 'PATCH', filters: { key: `eq.${key}` }, body: { value: String(value) },
        });
      } else {
        await client.query('settings', {
          method: 'POST', body: { key, value: String(value) },
        });
      }
    }
    return ok({ ok: true });
  }

  return fail('Method not allowed', 405);
}
