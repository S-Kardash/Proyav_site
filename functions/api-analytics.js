import { ok, fail, preflight, authRequest, db } from './_utils.js';

/**
 * api-analytics.js — агрегована аналітика дій для адмінки (з таблиці `events`).
 * GET ?range=today|7d|30d|all  (Authorization: Bearer admin)
 *   → { range, visitors, pageviews, byDay, funnel, sources, topPaths, byType, total }
 *
 * Рахуємо у воркері на обмеженому вікні (cap 20000) — для старту достатньо;
 * при великому обсязі перенести на БД-в'юхи/RPC.
 */
function startFor(range) {
  const d = new Date();
  if (range === 'today') { d.setHours(0, 0, 0, 0); return d; }
  if (range === '7d')  { d.setDate(d.getDate() - 7);  return d; }
  if (range === '30d') { d.setDate(d.getDate() - 30); return d; }
  return new Date(0);
}

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'GET') return fail('Method not allowed', 405);
  try { await authRequest(request, env); } catch (e) { return fail(e.message, 401); }

  const range = new URL(request.url).searchParams.get('range') || '7d';
  const from  = startFor(range).toISOString();

  const rows = await db(env).query('events', {
    select: 'ts,session,type,path,ref',
    filters: range === 'all' ? {} : { ts: `gte.${from}` },
    order: 'ts.desc',
    limit: 20000,
  }).catch(() => []);

  const sessions = new Set();
  const byDay = {}, sources = {}, topPaths = {}, byType = {};
  let pageviews = 0;
  const funnel = { order_start: 0, order_submit: 0, format_select: 0, cta_click: 0 };

  for (const e of (rows || [])) {
    if (e.session) sessions.add(e.session);
    byType[e.type] = (byType[e.type] || 0) + 1;
    if (e.type === 'pageview') {
      pageviews++;
      const day = (e.ts || '').slice(0, 10);
      if (day) byDay[day] = (byDay[day] || 0) + 1;
      if (e.path) topPaths[e.path] = (topPaths[e.path] || 0) + 1;
    }
    if (funnel[e.type] !== undefined) funnel[e.type]++;
    // джерело: ph=<id> → «фотограф», інакше як є
    if (e.type === 'pageview') {
      let src = e.ref || 'direct';
      if (/^ph[:=]/.test(src) || /\bph\b/.test(src)) src = 'фотограф';
      sources[src] = (sources[src] || 0) + 1;
    }
  }

  const sortTop = (obj, n) => Object.entries(obj).map(([k, v]) => ({ key: k, value: v }))
    .sort((a, b) => b.value - a.value).slice(0, n);

  // динаміка по днях (відсортовано за датою)
  const days = Object.entries(byDay).map(([day, v]) => ({ day, value: v })).sort((a, b) => a.day < b.day ? -1 : 1);

  const conv = funnel.order_start ? Math.round(funnel.order_submit / funnel.order_start * 100) : 0;

  return ok({
    range,
    visitors:  sessions.size,
    pageviews,
    byDay:     days,
    funnel:    { ...funnel, conversion: conv },
    sources:   sortTop(sources, 6),
    topPaths:  sortTop(topPaths, 8),
    byType:    sortTop(byType, 12),
    total:     (rows || []).length,
    capped:    (rows || []).length >= 20000,
  });
}
