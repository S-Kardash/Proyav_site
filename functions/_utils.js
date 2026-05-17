/**
 * _utils.js — Shared utilities for Proyav Cloudflare Pages Functions
 * Zero npm dependencies — uses Web Crypto API + Supabase REST API
 */

// ── CORS ──────────────────────────────────────────────────────────────────
export const CORS = {
  'Content-Type':                'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':'Content-Type, Authorization',
  'Access-Control-Allow-Methods':'GET, POST, PUT, DELETE, OPTIONS',
};

export function ok(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS });
}

export function fail(msg, status = 400) {
  return new Response(JSON.stringify({ error: msg }), { status, headers: CORS });
}

export function preflight() {
  return new Response('', { status: 200, headers: CORS });
}

// ── Supabase REST client ──────────────────────────────────────────────────
export function db(env) {
  const base = (env.SUPABASE_URL || '').trim()
    .replace(/\/rest\/v1\/?$/, '')
    .replace(/\/$/, '');
  const key  = (env.SUPABASE_SERVICE_KEY || '').trim();

  if (!base) throw new Error('SUPABASE_URL не налаштовано');
  if (!key)  throw new Error('SUPABASE_SERVICE_KEY не налаштовано');

  const rest = `${base}/rest/v1`;
  const H    = {
    apikey:          key,
    Authorization:  `Bearer ${key}`,
    'Content-Type':  'application/json',
  };

  /**
   * query(table, opts)
   * opts: { method, select, filters, order, limit, single, body }
   * filters: object like { status: 'eq.new', token: 'eq.abc123' }
   */
  async function query(table, opts = {}) {
    const {
      method  = 'GET',
      select  = '*',
      filters = {},
      order,
      limit,
      single  = false,
      body,
    } = opts;

    const params = new URLSearchParams({ select });
    if (order) params.set('order', order);
    if (limit) params.set('limit', String(limit));
    for (const [k, v] of Object.entries(filters)) params.set(k, v);

    const headers = { ...H };
    if (single)       headers['Accept']  = 'application/vnd.pgrst.object+json';
    if (method !== 'GET') headers['Prefer'] = 'return=representation';

    const res = await fetch(`${rest}/${table}?${params}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (res.status === 204) return null;
    const data = await res.json();
    if (!res.ok) {
      const msg = data?.message || data?.hint || data?.details || JSON.stringify(data);
      throw new Error(msg);
    }
    return data;
  }

  return { query, rest, H };
}

// ── JWT (HS256) via Web Crypto ────────────────────────────────────────────
function b64url(obj) {
  return btoa(typeof obj === 'string' ? obj : JSON.stringify(obj))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function b64decode(str) {
  return atob(str.replace(/-/g, '+').replace(/_/g, '/'));
}

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']
  );
}

export async function signJWT(payload, secret, ttlSeconds = 43200) {
  const now = Math.floor(Date.now() / 1000);
  const claims = { ...payload, iat: now, exp: now + ttlSeconds };
  const header  = b64url({ alg: 'HS256', typ: 'JWT' });
  const body    = b64url(claims);
  const signing = `${header}.${body}`;
  const key     = await hmacKey(secret);
  const sigBuf  = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signing));
  const sig     = btoa(String.fromCharCode(...new Uint8Array(sigBuf)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${signing}.${sig}`;
}

export async function verifyJWT(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Невірний формат токена');
  const [h, p, s] = parts;
  const key = await hmacKey(secret);
  const sigBytes = Uint8Array.from(b64decode(s), c => c.charCodeAt(0));
  const valid = await crypto.subtle.verify(
    'HMAC', key, sigBytes, new TextEncoder().encode(`${h}.${p}`)
  );
  if (!valid) throw new Error('Невірний підпис токена');
  const payload = JSON.parse(b64decode(p));
  if (payload.exp < Math.floor(Date.now() / 1000)) throw new Error('Токен прострочений');
  return payload;
}

export async function authRequest(request, env) {
  const h = request.headers.get('Authorization') || '';
  if (!h.startsWith('Bearer ')) throw new Error('Unauthorized');
  if (!env.JWT_SECRET) throw new Error('JWT_SECRET не налаштовано');
  return verifyJWT(h.slice(7), env.JWT_SECRET);
}

// ── Password hashing (PBKDF2, Web Crypto) ────────────────────────────────
export async function hashPassword(password) {
  const salt    = crypto.getRandomValues(new Uint8Array(16));
  const keyMat  = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const bits    = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 120000, hash: 'SHA-256' }, keyMat, 256
  );
  const toHex   = (buf) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  return `pbkdf2:${toHex(salt)}:${toHex(bits)}`;
}

export async function verifyPassword(password, stored) {
  // Support legacy bcryptjs hashes for backward compat — treat as fail (need reset)
  if (!stored.startsWith('pbkdf2:')) return false;
  const [, saltHex, hashHex] = stored.split(':');
  const salt   = new Uint8Array(saltHex.match(/../g).map(h => parseInt(h, 16)));
  const keyMat = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const bits   = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 120000, hash: 'SHA-256' }, keyMat, 256
  );
  const computed = [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join('');
  // Constant-time comparison
  const a = new TextEncoder().encode(computed);
  const b_ = new TextEncoder().encode(hashHex);
  if (a.length !== b_.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b_[i];
  return diff === 0;
}

// Random token generator
export function randomToken(len = 8) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const buf   = crypto.getRandomValues(new Uint8Array(len));
  return [...buf].map(b => chars[b % chars.length]).join('');
}

// ── Google Sheets append ──────────────────────────────────────────────────
export async function sheetsAppend(env, rowValues) {
  if (!env.GOOGLE_SA_KEY_B64 || !env.GOOGLE_SHEET_ID) return;
  try {
    const sa  = JSON.parse(atob(env.GOOGLE_SA_KEY_B64));
    const now = Math.floor(Date.now() / 1000);

    // Build JWT for Google OAuth
    const gaHeader  = b64url({ alg: 'RS256', typ: 'JWT' });
    const gaClaims  = b64url({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/spreadsheets',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600, iat: now,
    });
    const gaSigning = `${gaHeader}.${gaClaims}`;

    // Sign with RS256 using service account private key
    const pemKey    = sa.private_key
      .replace(/-----BEGIN PRIVATE KEY-----/, '')
      .replace(/-----END PRIVATE KEY-----/, '')
      .replace(/\s+/g, '');
    const keyBuf    = Uint8Array.from(atob(pemKey), c => c.charCodeAt(0));
    const cryptoKey = await crypto.subtle.importKey(
      'pkcs8', keyBuf,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']
    );
    const sigBuf    = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(gaSigning)
    );
    const sig       = btoa(String.fromCharCode(...new Uint8Array(sigBuf)))
      .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const gaJwt     = `${gaSigning}.${sig}`;

    // Get access token
    const tokenRes  = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${gaJwt}`,
    });
    const { access_token } = await tokenRes.json();
    if (!access_token) throw new Error('Не вдалось отримати Google access_token');

    // Append row
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${env.GOOGLE_SHEET_ID}/values/Sheet1!A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: [rowValues] }),
      }
    );
  } catch (e) {
    console.error('[sheets]', e.message);
    // Non-fatal
  }
}

export const PRODUCT_NAMES = {
  small:  'Малий набір (10 фото)',
  medium: 'Середній набір (20 фото)',
  large:  'Великий набір (50 фото)',
  baby:   'Спогади малюка',
};
