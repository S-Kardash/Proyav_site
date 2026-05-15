// api-admin-login.js — POST: verifies admin password, returns JWT
const jwt = require('jsonwebtoken');
const { ok, fail, preflight } = require('./_utils');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight();
  if (event.httpMethod !== 'POST') return fail('Method Not Allowed', 405);

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return fail('Invalid JSON'); }

  if (!body.password || body.password !== process.env.ADMIN_PASSWORD) {
    return fail('Невірний пароль', 401);
  }

  const token = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '12h' });
  return ok({ token });
};
