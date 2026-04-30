/**
 * FINBUDDY · Google Sheets Backend (Multi-User)
 * ---------------------------------------------
 * Deployed as a Google Apps Script Web App. The Vercel `/api` layer is the
 * ONLY caller — it attaches the SHARED_SECRET and the authenticated userId
 * to each request. Every row is stamped with userId and reads are scoped.
 *
 * SETUP:
 *  1) Open https://script.google.com → "+ New Project"
 *  2) Replace the default code with this file
 *  3) Set SHARED_SECRET to a long random string. Save.
 *  4) Deploy → New Deployment → "Web App"
 *      - Execute as: ME
 *      - Who has access: ANYONE (the secret is what authorizes; nobody can
 *        read or write without it)
 *  5) Copy the Web App URL into Vercel env var APPS_SCRIPT_URL.
 *     Copy SHARED_SECRET into Vercel env var APPS_SCRIPT_SECRET.
 *
 * Tabs auto-created on first call:
 *   users, transactions, accounts, categories, budgets, splits, splitParticipants
 */

const SHARED_SECRET = 'CHANGE_ME_TO_A_LONG_RANDOM_STRING';
const SHEET_ID = ''; // leave blank to auto-create a new sheet in your Drive

const TABLES = {
  users:             ['id','email','passwordHash','createdAt','updatedAt'],
  transactions:      ['id','userId','type','amount','accountId','toAccountId','categoryId','notes','ts','recurring','recurringRule','createdAt','updatedAt'],
  accounts:          ['id','userId','name','type','balance','color','createdAt','updatedAt'],
  categories:        ['id','userId','name','type','icon','color','updatedAt'],
  budgets:           ['id','userId','categoryId','monthlyLimit','period','alerted80','alertedFull','updatedAt'],
  splits:            ['id','userId','title','totalAmount','payerName','splitType','expenseTxId','expenseAccountId','createdAt','updatedAt'],
  splitParticipants: ['id','userId','splitId','name','phone','amountOwed','status','settledAt','settleMethod','settleNote','settleTxId','createdAt','updatedAt']
};

// Tables that are user-scoped (i.e. have a userId column). `users` itself is not.
const USER_SCOPED = new Set(['transactions','accounts','categories','budgets','splits','splitParticipants']);

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || '{}');
    if (body.secret !== SHARED_SECRET) return _json({ ok: false, error: 'unauthorized' });

    const { action, table, payload } = body;
    if (action === 'ping')              return _json({ ok: true, pong: Date.now() });
    if (action === 'findUserByEmail')   return _json({ ok: true, user: findUserByEmail(payload?.email) });
    if (action === 'pull')              return _json({ ok: true, data: pullForUser(payload?.userId) });
    if (action === 'upsert')            return _json({ ok: true, count: upsert(table, payload) });
    if (action === 'delete')            return _json({ ok: true, count: del(table, payload) });
    if (action === 'replace')           return _json({ ok: true, count: replace(table, payload) });
    return _json({ ok: false, error: 'unknown action' });
  } catch (err) {
    return _json({ ok: false, error: String(err && err.message || err) });
  }
}

function doGet(e) {
  return _json({ ok: true, service: 'finbuddy-sync', tables: Object.keys(TABLES) });
}

function _json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function _ss() {
  if (SHEET_ID) return SpreadsheetApp.openById(SHEET_ID);
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty('FINBUDDY_SHEET_ID');
  if (id) {
    try { return SpreadsheetApp.openById(id); } catch (_) { /* fall through to create */ }
  }
  const ss = SpreadsheetApp.create('FinBuddy Sync');
  props.setProperty('FINBUDDY_SHEET_ID', ss.getId());
  return ss;
}

function _sheet(name) {
  const ss = _ss();
  let sh = ss.getSheetByName(name);
  const headers = TABLES[name];
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
  } else if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function _readAll(name) {
  const sh = _sheet(name);
  const headers = TABLES[name];
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  const values = sh.getRange(2, 1, lastRow - 1, headers.length).getValues();
  return values.map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
}

function findUserByEmail(email) {
  if (!email) return null;
  const want = String(email).toLowerCase().trim();
  const rows = _readAll('users');
  const r = rows.find(u => String(u.email || '').toLowerCase().trim() === want);
  return r || null;
}

function pullForUser(userId) {
  if (!userId) throw new Error('userId required for pull');
  const out = {};
  Object.keys(TABLES).forEach(t => {
    if (t === 'users') return; // never expose user records via pull
    const all = _readAll(t);
    out[t] = all.filter(r => String(r.userId) === String(userId));
  });
  return out;
}

function upsert(table, rows) {
  if (!TABLES[table]) throw new Error('unknown table: ' + table);
  if (!Array.isArray(rows)) rows = [rows];
  const sh = _sheet(table);
  const headers = TABLES[table];
  const existing = _readAll(table);
  const idx = new Map(existing.map((r, i) => [String(r.id), i + 2])); // sheet row #
  let writes = 0;
  rows.forEach(r => {
    if (!r || !r.id) return;
    if (USER_SCOPED.has(table) && !r.userId) return; // require userId
    const norm = headers.map(h => {
      const v = r[h];
      if (v === undefined || v === null) return '';
      if (typeof v === 'object') return JSON.stringify(v);
      return v;
    });
    const key = String(r.id);
    if (idx.has(key)) {
      const sheetRow = idx.get(key);
      const cur = sh.getRange(sheetRow, 1, 1, headers.length).getValues()[0];
      // ownership guard: cannot overwrite another user's row
      if (USER_SCOPED.has(table)) {
        const curUserId = String(cur[headers.indexOf('userId')] || '');
        if (curUserId && curUserId !== String(r.userId)) return;
      }
      const curUpdated = Number(cur[headers.indexOf('updatedAt')] || 0);
      const incomingUpdated = Number(r.updatedAt || 0);
      if (incomingUpdated >= curUpdated) {
        sh.getRange(sheetRow, 1, 1, headers.length).setValues([norm]);
        writes++;
      }
    } else {
      sh.appendRow(norm);
      writes++;
    }
  });
  return writes;
}

function del(table, payload) {
  if (!TABLES[table]) throw new Error('unknown table: ' + table);
  const ids    = Array.isArray(payload) ? payload : (payload?.ids || []);
  const userId = (typeof payload === 'object' && !Array.isArray(payload)) ? payload?.userId : null;
  if (!ids.length) return 0;

  const sh = _sheet(table);
  const headers = TABLES[table];
  const existing = _readAll(table);
  const wanted = new Set(ids.map(String));
  const toDelete = [];
  existing.forEach((r, i) => {
    if (!wanted.has(String(r.id))) return;
    if (USER_SCOPED.has(table) && userId && String(r.userId) !== String(userId)) return;
    toDelete.push(i + 2);
  });
  toDelete.sort((a,b) => b - a).forEach(rowNum => sh.deleteRow(rowNum));
  return toDelete.length;
}

/**
 * For user-scoped tables, `replace` only clears + writes rows for THIS user;
 * other users' rows are preserved. For non-scoped tables it replaces all rows.
 */
function replace(table, payload) {
  if (!TABLES[table]) throw new Error('unknown table: ' + table);
  const sh = _sheet(table);
  const headers = TABLES[table];

  const rows   = (Array.isArray(payload) ? payload : (payload?.rows   || [])) || [];
  const userId = (typeof payload === 'object' && !Array.isArray(payload)) ? payload?.userId : null;

  if (USER_SCOPED.has(table)) {
    if (!userId) throw new Error('userId required for replace on user-scoped table');
    // delete this user's rows
    const existing = _readAll(table);
    const toDelete = [];
    existing.forEach((r, i) => {
      if (String(r.userId) === String(userId)) toDelete.push(i + 2);
    });
    toDelete.sort((a,b) => b - a).forEach(rowNum => sh.deleteRow(rowNum));
    // append fresh
    const owned = rows.filter(r => r && r.id && String(r.userId) === String(userId));
    if (!owned.length) return 0;
    const values = owned.map(r => headers.map(h => {
      const v = r[h];
      if (v === undefined || v === null) return '';
      if (typeof v === 'object') return JSON.stringify(v);
      return v;
    }));
    sh.getRange(sh.getLastRow() + 1, 1, values.length, headers.length).setValues(values);
    return values.length;
  }

  // Non-scoped (e.g. users): replace everything
  const lastRow = sh.getLastRow();
  if (lastRow > 1) sh.getRange(2, 1, lastRow - 1, headers.length).clearContent();
  if (!rows.length) return 0;
  const values = rows.map(r => headers.map(h => {
    const v = r[h];
    if (v === undefined || v === null) return '';
    if (typeof v === 'object') return JSON.stringify(v);
    return v;
  }));
  sh.getRange(2, 1, values.length, headers.length).setValues(values);
  return values.length;
}
