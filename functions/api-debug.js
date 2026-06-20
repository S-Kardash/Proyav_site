import { ok, fail, preflight, authRequest, isOwner, db } from './_utils.js';

/**
 * api-debug.js — configuration health check.
 * ADMIN-ONLY. Reveals which secrets are configured (boolean flags only —
 * never the values or previews) plus a live Supabase connectivity probe.
 */
export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return preflight();

  // Gate behind owner auth — this endpoint discloses configuration state.
  let claims; try { claims = await authRequest(request, env); } catch { return fail('Unauthorized', 401); }
  if (!isOwner(claims)) return fail('Лише власник', 403);

  const url = (env.SUPABASE_URL || '').trim();
  const key = (env.SUPABASE_SERVICE_KEY || '').trim();

  const report = {
    env: {
      SUPABASE_URL_set:         !!url,
      SUPABASE_URL_has_rest_v1: url.includes('/rest/v1'),
      SUPABASE_SERVICE_KEY_set: !!key,
      JWT_SECRET_set:           !!env.JWT_SECRET,
      ADMIN_PASSWORD_set:       !!env.ADMIN_PASSWORD,
      SITE_URL_set:             !!env.SITE_URL,
      TG_TOKEN_set:             !!env.TG_TOKEN,
      TG_CHAT_ID_set:           !!env.TG_CHAT_ID,
      GOOGLE_SA_KEY_B64_set:    !!env.GOOGLE_SA_KEY_B64,
      GOOGLE_SHEET_ID_set:      !!env.GOOGLE_SHEET_ID,
      NOVA_POSHTA_KEY_set:      !!env.NOVA_POSHTA_KEY,
    },
  };

  if (url && key) {
    try {
      const client = db(env);
      await client.query('orders', { select: 'id', limit: 1 });
      report.supabase = { connected: true, orders_table: 'OK' };
    } catch (e) {
      report.supabase = { connected: false, error: e.message };
    }
  } else {
    report.supabase = { connected: false, error: 'URL або ключ відсутні' };
  }

  return ok(report);
}
