/* ============================================================
   Cloud sync client — talks to /api/data on the same Vercel
   deployment. The Vercel function attaches the shared secret
   and forwards to the Google Apps Script Web App that owns
   the actual Google Sheet. The browser never sees the secret
   or the upstream URL.

   Public API:
     Sheets.load() / save()    – read/write { enabled, autoSync, lastSync } in DB.meta
     Sheets.get()              – current config snapshot
     Sheets.isLive()           – true when enabled
     Sheets.ping()             – server-side connectivity check
     Sheets.upsert(table, row) – fire-and-forget upsert (queues on failure)
     Sheets.remove(table, id)  – fire-and-forget delete  (queues on failure)
     Sheets.pushAll()          – replaces all rows in every table on the server
     Sheets.pullAll()          – pulls every table back into IndexedDB (merge by id)
     Sheets.flushPending()     – retries queued mutations (called on `online`)
   ============================================================ */

const Sheets = (() => {
  const ENDPOINT    = '/api/data';
  const CFG_KEY     = 'cloudSync';
  const QUEUE_KEY   = 'cloudSyncQueue'; // persisted pending queue
  const empty       = () => ({ enabled: true, autoSync: true, lastSync: 0 });

  let cfg = empty();
  let pending = []; // mirrors DB.meta[QUEUE_KEY] — survives reloads

  const load = async () => {
    cfg     = { ...empty(), ...((await DB.getMeta(CFG_KEY)) || {}) };
    pending = (await DB.getMeta(QUEUE_KEY)) || [];
    return cfg;
  };
  const save = async (patch) => {
    cfg = { ...cfg, ...patch };
    await DB.setMeta(CFG_KEY, cfg);
    return cfg;
  };
  const get    = () => cfg;
  const isLive = () => !!cfg.enabled;

  // Persist the queue any time we mutate it so failures survive a reload.
  const _saveQueue = () => DB.setMeta(QUEUE_KEY, pending);
  const queuedCount = () => pending.length;

  const _post = async (action, table, payload) => {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, table, payload })
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.ok === false) {
      throw new Error(json.error || ('http ' + res.status));
    }
    return json;
  };

  const ping = () => _post('ping');

  // ---------- single-record helpers (called on every mutation) ----------
  // Returns { ok: true } on success, { ok: false, queued: true, error } on
  // failure (job is queued and persisted). Callers can `await` for status.
  const upsert = async (table, row) => {
    if (!isLive()) return { ok: false, queued: false, error: 'sync disabled' };
    try {
      await _post('upsert', table, [_normalize(row)]);
      return { ok: true };
    } catch (e) {
      console.warn('cloud upsert queued:', e.message);
      pending.push({ kind: 'upsert', table, row, ts: Date.now() });
      await _saveQueue();
      return { ok: false, queued: true, error: e.message };
    }
  };
  const remove = async (table, id) => {
    if (!isLive()) return { ok: false, queued: false, error: 'sync disabled' };
    try {
      await _post('delete', table, [id]);
      return { ok: true };
    } catch (e) {
      console.warn('cloud delete queued:', e.message);
      pending.push({ kind: 'delete', table, id, ts: Date.now() });
      await _saveQueue();
      return { ok: false, queued: true, error: e.message };
    }
  };

  // ---------- bulk push / pull (called from Settings) ----------
  const TABLES = ['transactions', 'accounts', 'categories', 'budgets', 'splits', 'splitParticipants'];

  const pushAll = async () => {
    if (!isLive()) throw new Error('cloud sync not enabled');
    for (const t of TABLES) {
      const rows = (await DB.all(t)).map(_normalize);
      await _post('replace', t, rows);
    }
    await save({ lastSync: Date.now() });
  };

  const pullAll = async () => {
    if (!isLive()) throw new Error('cloud sync not enabled');
    const json = await _post('pull');
    const data = json.data || {};
    for (const t of TABLES) {
      const rows = data[t] || [];
      for (const r of rows) {
        const parsed = _parse(t, r);
        if (!parsed.id) continue;
        await DB.put(t, parsed);
      }
    }
    await DB.recalcAllBalances();
    await State.refreshAll();
    await save({ lastSync: Date.now() });
  };

  const flushPending = async () => {
    if (!isLive() || !pending.length) return { ok: true, drained: 0, remaining: 0 };
    const queue = pending.slice();
    pending = [];
    let drained = 0;
    for (const job of queue) {
      try {
        if (job.kind === 'upsert') await _post('upsert', job.table, [_normalize(job.row)]);
        if (job.kind === 'delete') await _post('delete', job.table, [job.id]);
        drained++;
      } catch (_) { pending.push(job); }
    }
    await _saveQueue();
    return { ok: pending.length === 0, drained, remaining: pending.length };
  };

  // ---------- helpers ----------
  function _normalize(row) {
    if (!row || typeof row !== 'object') return row;
    return { ...row, updatedAt: row.updatedAt || Date.now() };
  }
  function _parse(table, row) {
    const out = { ...row };
    if (out.amount       !== undefined && out.amount       !== '') out.amount       = Number(out.amount)       || 0;
    if (out.balance      !== undefined && out.balance      !== '') out.balance      = Number(out.balance)      || 0;
    if (out.totalAmount  !== undefined && out.totalAmount  !== '') out.totalAmount  = Number(out.totalAmount)  || 0;
    if (out.amountOwed   !== undefined && out.amountOwed   !== '') out.amountOwed   = Number(out.amountOwed)   || 0;
    if (out.monthlyLimit !== undefined && out.monthlyLimit !== '') out.monthlyLimit = Number(out.monthlyLimit) || 0;
    ['ts','createdAt','updatedAt','settledAt','lastSpawn'].forEach(k => {
      if (out[k] !== undefined && out[k] !== '') out[k] = Number(out[k]) || out[k];
    });
    if (typeof out.recurringRule === 'string' && out.recurringRule.startsWith('{')) {
      try { out.recurringRule = JSON.parse(out.recurringRule); } catch (_) {}
    }
    if (typeof out.settleNote === 'string' && out.settleNote.startsWith('{')) {
      try { out.settleNote = JSON.parse(out.settleNote); } catch (_) {}
    }
    ['toAccountId','categoryId','expenseTxId','expenseAccountId','splitTxId','parentId','splitId','splitParticipantId']
      .forEach(k => { if (out[k] === '') out[k] = null; });
    return out;
  }

  return { load, save, get, isLive, ping, upsert, remove, pushAll, pullAll, flushPending, queuedCount };
})();
