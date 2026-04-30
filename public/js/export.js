/* ============================================================
   Export / Import — JSON backup & CSV transactions, locally generated.
   No server: everything stays on-device. User chooses where to save.
   ============================================================ */

const ExportData = (() => {
  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
  };

  const exportJSON = async () => {
    const dump = {
      version: 1,
      exportedAt: Date.now(),
      accounts:           await DB.all('accounts'),
      categories:         await DB.all('categories'),
      transactions:       await DB.all('transactions'),
      splits:             await DB.all('splits'),
      splitParticipants:  await DB.all('splitParticipants'),
      budgets:            await DB.all('budgets')
    };
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    downloadBlob(blob, `finbuddy-backup-${ts}.json`);
    Utils.toast('backup saved');
  };

  const exportCSV = async () => {
    const txs = (await DB.all('transactions')).sort((a,b) => b.ts - a.ts);
    const accs = await DB.all('accounts');
    const cats = await DB.all('categories');
    const accMap = Object.fromEntries(accs.map(a => [a.id, a.name]));
    const catMap = Object.fromEntries(cats.map(c => [c.id, c.name]));

    const header = ['Date','Type','Amount','Account','To Account','Category','Notes'];
    const rows = [header.join(',')];
    for (const t of txs) {
      const cells = [
        new Date(t.ts).toISOString(),
        t.type,
        t.amount,
        accMap[t.accountId] || '',
        accMap[t.toAccountId] || '',
        catMap[t.categoryId] || '',
        (t.notes || '').replace(/\r?\n/g, ' ')
      ].map(v => {
        const s = String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      });
      rows.push(cells.join(','));
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    downloadBlob(blob, `finbuddy-transactions-${ts}.csv`);
    Utils.toast('csv saved');
  };

  const importJSON = async (file) => {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data || !data.version) throw new Error('invalid backup');

    const stores = ['accounts','categories','transactions','splits','splitParticipants','budgets'];
    for (const s of stores) {
      if (!Array.isArray(data[s])) continue;
      await DB.clear(s);
      for (const r of data[s]) await DB.put(s, r);
    }
    await DB.recalcAllBalances();
    await State.refreshAll();
    Utils.toast('restore complete');
  };

  // ----- monthly CSV (one month of transactions) -----
  const exportMonthCSV = async (monthKey) => {
    const all = (await DB.all('transactions')).filter(t => Utils.monthKey(t.ts) === monthKey).sort((a,b) => a.ts - b.ts);
    const accs = await DB.all('accounts');
    const cats = await DB.all('categories');
    const accMap = Object.fromEntries(accs.map(a => [a.id, a.name]));
    const catMap = Object.fromEntries(cats.map(c => [c.id, c.name]));
    const header = ['Date','Type','Amount','Account','To Account','Category','Notes'];
    const rows = [header.join(',')];
    for (const t of all) {
      const cells = [
        new Date(t.ts).toISOString(),
        t.type,
        t.amount,
        accMap[t.accountId] || '',
        accMap[t.toAccountId] || '',
        catMap[t.categoryId] || '',
        (t.notes || '').replace(/\r?\n/g, ' ')
      ].map(v => {
        const s = String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      });
      rows.push(cells.join(','));
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    downloadBlob(blob, `finbuddy-${monthKey}.csv`);
    Utils.toast(`csv saved · ${all.length} rows`);
  };

  // ----- SQL dump / .db file -----
  // Produces a SQLite-importable text dump. To create a real .db on a mobile
  // device: install any SQLite app that supports "import SQL" (e.g. "SQLite
  // Editor") and run the dump, OR on desktop:  sqlite3 retro.db < dump.sql
  const buildSQL = async () => {
    const lines = [];
    lines.push('-- FinBuddy local database dump');
    lines.push(`-- Generated: ${new Date().toISOString()}`);
    lines.push('-- Import into SQLite:    sqlite3 retro.db < this-file');
    lines.push('-- (the .db extension is identical content; rename if needed)');
    lines.push('PRAGMA foreign_keys=OFF;');
    lines.push('BEGIN TRANSACTION;');
    lines.push('');

    const sqlString = (v) => {
      if (v == null) return 'NULL';
      if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
      if (typeof v === 'boolean') return v ? '1' : '0';
      // objects (recurringRule, settleNote, etc.) are stored as JSON text
      if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
      return `'${String(v).replace(/'/g, "''")}'`;
    };

    const dumpTable = async (table, schema) => {
      lines.push(`DROP TABLE IF EXISTS ${table};`);
      lines.push(`CREATE TABLE ${table} (${schema});`);
      const rows = await DB.all(table);
      if (!rows.length) { lines.push(''); return; }
      const cols = schema.split(',').map(c => c.trim().split(/\s+/)[0]);
      for (const r of rows) {
        const vals = cols.map(c => sqlString(r[c]));
        lines.push(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${vals.join(',')});`);
      }
      lines.push('');
    };

    await dumpTable('accounts',
      'id TEXT PRIMARY KEY, name TEXT, type TEXT, balance REAL, color TEXT, createdAt INTEGER');
    await dumpTable('categories',
      'id TEXT PRIMARY KEY, name TEXT, type TEXT, icon TEXT, color TEXT');
    await dumpTable('transactions',
      'id TEXT PRIMARY KEY, type TEXT, amount REAL, accountId TEXT, toAccountId TEXT, categoryId TEXT, notes TEXT, ts INTEGER, recurring INTEGER, recurringRule TEXT, lastSpawn INTEGER, parentId TEXT, splitId TEXT, splitParticipantId TEXT, createdAt INTEGER');
    await dumpTable('splits',
      'id TEXT PRIMARY KEY, title TEXT, totalAmount REAL, totalCents INTEGER, payerName TEXT, payerOwedCents INTEGER, splitType TEXT, expenseTxId TEXT, expenseAccountId TEXT, createdAt INTEGER');
    await dumpTable('splitParticipants',
      'id TEXT PRIMARY KEY, splitId TEXT, name TEXT, phone TEXT, amountOwed REAL, amountOwedCents INTEGER, status TEXT, settledAt INTEGER, settleMethod TEXT, settleNote TEXT, settleTxId TEXT, ackSentAt INTEGER, createdAt INTEGER');
    await dumpTable('budgets',
      'id TEXT PRIMARY KEY, categoryId TEXT, monthlyLimit REAL, period TEXT, alerted80 INTEGER, alertedFull INTEGER');

    lines.push('COMMIT;');
    return lines.join('\n');
  };

  const exportSQL = async () => {
    const sql = await buildSQL();
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    downloadBlob(new Blob([sql], { type: 'application/sql' }), `finbuddy-${ts}.sql`);
    Utils.toast('sql dump saved');
  };

  const exportDB = async () => {
    // Same dump, just with .db extension so it lands in the device's
    // database-file folder. SQLite tools will recognise it after rename / import.
    const sql = await buildSQL();
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    downloadBlob(new Blob([sql], { type: 'application/x-sqlite3' }), `finbuddy-${ts}.db`);
    Utils.toast('.db file saved');
  };

  return { exportJSON, exportCSV, exportMonthCSV, exportSQL, exportDB, importJSON, buildSQL };
})();
