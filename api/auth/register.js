import bcrypt from 'bcryptjs';
import { call, uid } from '../_lib/sheets.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method not allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (_) { body = {}; }
  }
  const email    = String((body?.email ?? '').toLowerCase().trim());
  const password = String(body?.password ?? '');

  if (!EMAIL_RE.test(email))      return res.status(400).json({ ok: false, error: 'invalid email' });
  if (password.length < 8)        return res.status(400).json({ ok: false, error: 'password must be at least 8 characters' });
  if (password.length > 200)      return res.status(400).json({ ok: false, error: 'password too long' });

  try {
    // Look up existing user by email
    const existing = await call('findUserByEmail', 'users', { email });
    if (existing?.user) {
      return res.status(409).json({ ok: false, error: 'email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const now = Date.now();
    const user = {
      id: uid(),
      email,
      passwordHash,
      createdAt: now,
      updatedAt: now
    };
    await call('upsert', 'users', [user]);

    return res.status(200).json({ ok: true, user: { id: user.id, email: user.email } });
  } catch (err) {
    return res.status(err.status || 500).json({ ok: false, error: String(err.message || err) });
  }
}
