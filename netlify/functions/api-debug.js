// api-debug.js — тимчасова діагностика, видалити після налаштування
exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_KEY || '';

  const report = {
    env: {
      SUPABASE_URL_set:         !!url,
      SUPABASE_URL_value:       url ? url.slice(0, 40) + '...' : 'ВІДСУТНІЙ',
      SUPABASE_URL_has_rest_v1: url.includes('/rest/v1'),
      SUPABASE_URL_trailing_slash: url.endsWith('/'),
      SUPABASE_SERVICE_KEY_set: !!key,
      SUPABASE_SERVICE_KEY_starts: key ? key.slice(0, 12) + '...' : 'ВІДСУТНІЙ',
      JWT_SECRET_set:           !!process.env.JWT_SECRET,
      ADMIN_PASSWORD_set:       !!process.env.ADMIN_PASSWORD,
      SITE_URL_set:             !!process.env.SITE_URL,
      TG_TOKEN_set:             !!process.env.TG_TOKEN,
    },
  };

  // Try Supabase connection
  if (url && key) {
    const cleanUrl = url.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
    try {
      const { createClient } = require('@supabase/supabase-js');
      const sb = createClient(cleanUrl, key);
      const { data, error } = await sb.from('orders').select('count').limit(1);
      report.supabase = {
        url_used: cleanUrl,
        connected: !error,
        error: error ? error.message : null,
        tables_exist: !error,
      };
    } catch (e) {
      report.supabase = { connected: false, error: e.message };
    }
  } else {
    report.supabase = { connected: false, error: 'URL або ключ відсутні' };
  }

  return { statusCode: 200, headers, body: JSON.stringify(report, null, 2) };
};
