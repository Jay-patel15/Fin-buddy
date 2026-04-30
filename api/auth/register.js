import bcrypt from 'bcryptjs';
import { call, uid } from '../_lib/sheets.js';

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

  if (!/^[a-z0-9_-]{3,30}$/.test(username)) return res.status(400).json({ ok: false, error: 'invalid username (3-30 chars, a-z, 0-9, -, _)' });
  if (password.length < 4)        return res.status(400).json({ ok: false, error: 'password must be at least 4 characters' });
  if (password.length > 200)      return res.status(400).json({ ok: false, error: 'password too long' });

  try {
    const existing = await call('findUserByUsername', 'users', { username });
    if (existing?.user) {
      return res.status(409).json({ ok: false, error: 'username already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const now = Date.now();
    const user = {
      id: uid(),
      username,
      passwordHash,
      createdAt: now,
      updatedAt: now
    };
    await call('upsert', 'users', [user]);

    return res.status(200).json({ ok: true, user: { id: user.id, username: user.username } });
  } catch (err) {
    return res.status(err.status || 500).json({ ok: false, error: String(err.message || err) });
  }
}
