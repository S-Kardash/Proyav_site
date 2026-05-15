// _utils.js — shared helpers for all Proyav API functions

const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

function db() {
  let url = (process.env.SUPABASE_URL || '').trim();
  const key = (process.env.SUPABASE_SERVICE_KEY || '').trim();

  if (!url) throw new Error('SUPABASE_URL не задано в Netlify Environment Variables');
  if (!key) throw new Error('SUPABASE_SERVICE_KEY не задано в Netlify Environment Variables');

  // Auto-fix: remove /rest/v1 or trailing slash if user pasted wrong URL
  url = url.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');

  return createClient(url, key);
}

function ok(body, code = 200) {
  return { statusCode: code, headers: CORS, body: JSON.stringify(body) };
}

function fail(msg, code = 400) {
  return { statusCode: code, headers: CORS, body: JSON.stringify({ error: msg }) };
}

function preflight() {
  return { statusCode: 200, headers: CORS, body: '' };
}

function auth(event) {
  const h = event.headers['authorization'] || event.headers['Authorization'] || '';
  if (!h.startsWith('Bearer ')) throw new Error('Unauthorized');
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET не задано в Netlify Environment Variables');
  return jwt.verify(h.slice(7), process.env.JWT_SECRET);
}

async function sheetsAppend(rowValues) {
  if (!process.env.GOOGLE_SA_KEY_B64 || !process.env.GOOGLE_SHEET_ID) return;
  try {
    const sa = JSON.parse(Buffer.from(process.env.GOOGLE_SA_KEY_B64, 'base64').toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    const saJwt = jwt.sign(
      {
        iss: sa.client_email,
        scope: 'https://www.googleapis.com/auth/spreadsheets',
        aud: 'https://oauth2.googleapis.com/token',
        exp: now + 3600,
        iat: now,
      },
      sa.private_key,
      { algorithm: 'RS256' }
    );

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${saJwt}`,
    });
    const { access_token } = await tokenRes.json();

    const sheetId = process.env.GOOGLE_SHEET_ID;
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Sheet1!A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: [rowValues] }),
      }
    );
  } catch (e) {
    console.error('[sheets] sync error:', e.message);
  }
}

const PRODUCT_NAMES = {
  small:  'Малий набір (10 фото)',
  medium: 'Середній набір (20 фото)',
  large:  'Великий набір (50 фото)',
  baby:   'Спогади малюка',
};

const STATUS_NAMES = {
  new:         'Нове',
  uploaded:    'Фото отримано',
  in_progress: 'В роботі',
  sent:        'Відправлено',
  paid:        'Оплачено',
};

module.exports = { db, ok, fail, preflight, auth, sheetsAppend, PRODUCT_NAMES, STATUS_NAMES };
