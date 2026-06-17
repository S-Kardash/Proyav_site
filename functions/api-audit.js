import { ok, fail, preflight, authRequest, db } from './_utils.js';

/**
 * api-audit.js — журнал дій адміна для CRM (read-only, admin).
 * GET ?limit=200&action=<filter>  → { entries:[{ts,actor,action,entity,detail}] }
 */
export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'GET') return fail('Method not allowed', 405);
  let claims;
  try { claims = await authRequest(request, env); } catch (e) { return fail(e.message, 401); }
  if (claims.role !== 'admin') return fail('Forbidden', 403);

  const url = new URL(request.url);
  const limit = Math.min(500, Number(url.searchParams.get('limit')) || 200);
  const action = url.searchParams.get('action');
  const filters = {};
  if (action && action !== 'all') filters.action = `eq.${action}`;

  const entries = await db(env).query('audit_log', {
    select: 'id,ts,actor,action,entity,detail',
    filters,
    order: 'ts.desc',
    limit,
  }).catch(() => []);

  return ok({ entries: entries || [] });
}
