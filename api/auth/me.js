import { readSession } from '../_lib/auth.js';

export default async function handler(req, res) {
  const session = readSession(req);
  if (!session) return res.status(401).json({ ok: false, error: 'unauthorized' });
  return res.status(200).json({ ok: true, user: { id: session.id, username: session.username } });
}
