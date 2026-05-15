// api-partner-login.js — POST: photographer email+password login
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { db, ok, fail, preflight } = require('./_utils');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight();
  if (event.httpMethod !== 'POST') return fail('Method Not Allowed', 405);

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return fail('Invalid JSON'); }

  const { email, password } = body;
  if (!email || !password) return fail('Email і пароль обов\'язкові');

  const supabase = db();
  const { data: ph, error } = await supabase
    .from('photographers')
    .select('*')
    .eq('email', email.toLowerCase().trim())
    .eq('active', true)
    .maybeSingle();

  if (error) return fail(error.message, 500);
  if (!ph)   return fail('Невірний email або пароль', 401);

  const valid = await bcrypt.compare(password, ph.password_hash);
  if (!valid) return fail('Невірний email або пароль', 401);

  const token = jwt.sign(
    { role: 'photographer', id: ph.id, name: ph.name },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  return ok({
    token,
    photographer: {
      id:             ph.id,
      name:           ph.name,
      city:           ph.city,
      commission_pct: ph.commission_pct,
    },
  });
};
