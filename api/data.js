/**
 * /api/data — authenticated CRUD proxy.
 *
 * Requires a valid session cookie (set by /api/auth/login). The user's id
 * is read from the JWT and attached to every row written, and every row
 * pulled is scoped to that user id. The browser cannot see or change the
 * userId — it lives only in the verified token.
 *
 * Body: { action, table?, payload? }
 *   ping                                    – health check (auth required)
 *   pull                                    – { data: { table: rows[] } } scoped to user
 *   upsert  { table, payload: row|rows[] }  – upserts; userId stamped server-side
 *   delete  { table, payload: id|ids[] }    – deletes only rows owned by user
 *   replace { table, payload: rows[] }      – replaces this user's rows in `table`
 *
 * Note: `users` table is NOT exposed via this endpoint. Auth endpoints use
 * the Apps Script directly via _lib/sheets.js.
 */

import { call } from './_lib/sheets.js';
import { requireAuth } from './_lib/auth.js';

const ALLOWED_TABLES = new Set([
  'transactions', 'accounts', 'categories', 'budgets', 'splits', 'splitParticipants'
]);

export default async function handler(req, res) {
  const session = requireAuth(req, res);
  if (!session) return; // 401 already sent

  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, service: 'finbuddy-data', user: session.email });
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, GET');
    return res.status(405).json({ ok: false, error: 'method not allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (_) { body = {}; }
  }
  const { action, table, payload } = body || {};
  if (!action) return res.status(400).json({ ok: false, error: 'missing "action"' });

  if (action !== 'ping' && action !== 'pull') {
    if (!table || !ALLOWED_TABLES.has(table)) {
      return res.status(400).json({ ok: false, error: 'invalid table' });
    }
  }

  try {
    let result;
    if (action === 'ping') {
      result = await call('ping');
    } else if (action === 'pull') {
      result = await call('pull', null, { userId: session.id });
    } else if (action === 'upsert') {
      const rows = (Array.isArray(payload) ? payload : [payload])
        .filter(Boolean)
        .map(r => ({ ...r, userId: session.id, updatedAt: r.updatedAt || Date.now() }));
      result = await call('upsert', table, rows);
    } else if (action === 'delete') {
      const ids = Array.isArray(payload) ? payload : [payload];
      result = await call('delete', table, { ids, userId: session.id });
    } else if (action === 'replace') {
      const rows = (Array.isArray(payload) ? payload : [])
        .map(r => ({ ...r, userId: session.id, updatedAt: r.updatedAt || Date.now() }));
      result = await call('replace', table, { rows, userId: session.id });
    } else {
      return res.status(400).json({ ok: false, error: 'unknown action' });
    }
    return res.status(200).json(result);
  } catch (err) {
    return res.status(err.status || 500).json({ ok: false, error: String(err.message || err), upstream: err.upstream });
  }
}
