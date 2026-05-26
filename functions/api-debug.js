import { ok, db } from './_utils.js';

export async function onRequest(context) {
  const { env } = context;

  const url = (env.SUPABASE_URL || '').trim();
  const key = (env.SUPABASE_SERVICE_KEY || '').trim();

  const report = {
    env: {
      SUPABASE_URL_set:          !!url,
      SUPABASE_URL_preview:      url ? url.slice(0, 40) + '...' : 'ВІДСУТНІЙ',
      SUPABASE_URL_has_rest_v1:  url.includes('/rest/v1'),
      SUPABASE_SERVICE_KEY_set:  !!key,
      SUPABASE_SERVICE_KEY_preview: key ? key.slice(0, 20) + '...' : 'ВІДСУТНІЙ',
      JWT_SECRET_set:            !!env.JWT_SECRET,
      ADMIN_PASSWORD_set:        !!env.ADMIN_PASSWORD,
      SITE_URL:                  env.SITE_URL || 'ВІДСУТНІЙ',
      TG_TOKEN_set:              !!env.TG_TOKEN,
      TG_CHAT_ID_set:            !!env.TG_CHAT_ID,
      GOOGLE_SA_KEY_B64_set:     !!env.GOOGLE_SA_KEY_B64,
      GOOGLE_SHEET_ID:           env.GOOGLE_SHEET_ID || 'ВІДСУТНІЙ',
      NOVA_POSHTA_KEY_set:       !!env.NOVA_POSHTA_KEY,
    },
  };

  if (url && key) {
    try {
      const client = db(env);
      const data = await client.query('orders', { select: 'id', limit: 1 });
      report.supabase = { connected: true, orders_table: 'OK' };
    } catch (e) {
      report.supabase = { connected: false, error: e.message };
    }
  } else {
    report.supabase = { connected: false, error: 'URL або ключ відсутні' };
  }

  return ok(report);
}
