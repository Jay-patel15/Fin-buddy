/**
 * Apps Script Web App client used by every backend endpoint.
 * Sends { secret, action, table, payload } and returns the parsed JSON.
 */

const URL    = process.env.APPS_SCRIPT_URL;
const SECRET = process.env.APPS_SCRIPT_SECRET;

export function isConfigured() {
  return !!(URL && SECRET);
}

export async function call(action, table, payload) {
  if (!isConfigured()) {
    const err = new Error('server not configured: set APPS_SCRIPT_URL and APPS_SCRIPT_SECRET');
    err.status = 500;
    throw err;
  }
  const r = await fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: SECRET, action, table, payload }),
    redirect: 'follow'
  });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); }
  catch (_) {
    const err = new Error('upstream non-JSON: ' + text.slice(0, 200));
    err.status = 502;
    throw err;
  }
  if (!r.ok || data.ok === false) {
    const err = new Error(data?.error || ('upstream http ' + r.status));
    err.status = r.ok ? 400 : r.status;
    err.upstream = data;
    throw err;
  }
  return data;
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}
