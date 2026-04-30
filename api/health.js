/**
 * GET /api/health
 *
 * Returns:
 *   { ok: true,  env: { ... }, upstream: { ok: true, pong: ... } }
 *   { ok: false, env: { ... }, error: 'apps script rejected the secret ...' }
 *
 * Use this in the browser to verify the Vercel ⇄ Apps Script wiring
 * before trying to register a real account.
 */

import { call, isConfigured } from './_lib/sheets.js';

export default async function handler(req, res) {
  const env = {
    APPS_SCRIPT_URL:    !!process.env.APPS_SCRIPT_URL,
    APPS_SCRIPT_SECRET: !!process.env.APPS_SCRIPT_SECRET,
    JWT_SECRET:         !!process.env.JWT_SECRET
  };

  if (!isConfigured()) {
    return res.status(500).json({
      ok: false,
      env,
      error: 'set APPS_SCRIPT_URL and APPS_SCRIPT_SECRET in Vercel env, then redeploy'
    });
  }

  try {
    const upstream = await call('ping');
    return res.status(200).json({ ok: true, env, upstream });
  } catch (err) {
    return res.status(err.status || 500).json({
      ok: false,
      env,
      error: String(err.message || err),
      upstream: err.upstream
    });
  }
}
