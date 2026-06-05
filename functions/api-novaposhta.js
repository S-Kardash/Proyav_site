/**
 * api-novaposhta.js — Cloudflare Pages Function
 * Proxy to Nova Poshta API. The API key stays server-side (env.NOVA_POSHTA_KEY),
 * never reaches the browser.
 *
 * GET /api-novaposhta?action=cities&q=Льв
 *   → { items: [{ ref, name, area, type }] }
 *
 * GET /api-novaposhta?action=warehouses&ref=<settlementRef>&q=12
 *   → { items: [{ ref, name, number }] }
 */

const CORS = {
  'Content-Type':                 'application/json',
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const ok   = (b) => new Response(JSON.stringify(b), { status: 200, headers: CORS });
const fail = (m, s = 400) => new Response(JSON.stringify({ error: m }), { status: s, headers: CORS });

const NP_URL = 'https://api.novaposhta.ua/v2.0/json/';

async function npCall(apiKey, modelName, calledMethod, methodProperties) {
  const res = await fetch(NP_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ apiKey, modelName, calledMethod, methodProperties }),
  });
  const data = await res.json();
  if (!data.success) {
    const msg = (data.errors && data.errors.join('; ')) || 'Nova Poshta error';
    throw new Error(msg);
  }
  return data.data || [];
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response('', { status: 200, headers: CORS });
  if (request.method !== 'GET')     return fail('Method not allowed', 405);

  const key = (env.NOVA_POSHTA_KEY || '').trim();
  if (!key) return fail('NOVA_POSHTA_KEY не налаштовано', 500);

  const url    = new URL(request.url);
  const action = url.searchParams.get('action');
  const q      = (url.searchParams.get('q') || '').trim();

  try {
    // ── Cities / settlements autocomplete ──────────────────────────────
    if (action === 'cities') {
      if (q.length < 2) return ok({ items: [] });

      const data = await npCall(key, 'Address', 'searchSettlements', {
        CityName: q,
        Limit:    '12',
      });

      // searchSettlements returns [{ Addresses: [...] }]
      const addresses = (data[0] && data[0].Addresses) || [];
      const items = addresses.map(a => ({
        ref:  a.DeliveryCity || a.Ref,          // settlement ref used by getWarehouses
        name: a.MainDescription || a.Present,
        area: a.Area || '',
        region: a.Region || '',
        present: a.Present || a.MainDescription,
      }));
      return ok({ items });
    }

    // ── Warehouses (відділення / поштомати) for a settlement ───────────
    if (action === 'warehouses') {
      const ref = (url.searchParams.get('ref') || '').trim();
      if (!ref) return fail('Потрібен ref міста');

      const base = { Limit: '50', Page: '1' };
      if (q) base.FindByString = q;

      // searchSettlements returns a DeliveryCity ref → getWarehouses expects CityRef.
      // Passing it as SettlementRef returned empty for most cities (the original bug).
      // Fall back to SettlementRef for villages / poshtomats indexed by settlement.
      let data = await npCall(key, 'Address', 'getWarehouses', { CityRef: ref, ...base });
      if (!data.length) {
        data = await npCall(key, 'Address', 'getWarehouses', { SettlementRef: ref, ...base });
      }
      const items = data.map(w => ({
        ref:    w.Ref,
        name:   w.Description,
        number: w.Number,
        type:   w.CategoryOfWarehouse || '',
        maxWeight: w.PlaceMaxWeightAllowed || '',
      }));
      return ok({ items });
    }

    return fail('Невідома дія (action)');
  } catch (e) {
    console.error('[novaposhta]', e.message);
    return fail(e.message, 502);
  }
}
