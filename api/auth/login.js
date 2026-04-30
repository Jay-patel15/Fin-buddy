import bcrypt from 'bcryptjs';
import { call } from '../_lib/sheets.js';
import { signToken, setSessionCookie } from '../_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method not allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (_) { body = {}; }
  }
  const username = String((body?.username ?? '').toLowerCase().trim());
  const password = String(body?.password ?? '');
  if (!username || !password) {
    return res.status(400).json({ ok: false, error: 'username and password required' });
  }

  try {
    const result = await call('findUserByUsername', 'users', { username });
    const user = result?.user;
    // Constant-ish error to avoid username enumeration
    if (!user || !user.passwordHash) {
      return res.status(401).json({ ok: false, error: 'invalid credentials' });
    }
    const ok = await bcrypt.compare(password, String(user.passwordHash));
    if (!ok) return res.status(401).json({ ok: false, error: 'invalid credentials' });

    const token = signToken({ id: user.id, username: user.username });
    setSessionCookie(res, token);
    return res.status(200).json({ ok: true, user: { id: user.id, username: user.username } });
  } catch (err) {
    return res.status(err.status || 500).json({ ok: false, error: String(err.message || err) });
  }
}
