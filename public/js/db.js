/* ============================================================
   IndexedDB wrapper — offline-first local store
   Stores: meta, accounts, categories, transactions, splits,
           splitParticipants, budgets, notifications
   ============================================================ */

const DB = (() => {
  const NAME = 'retro_cash_db';
  const VERSION = 1;
  let dbInst = null;

  const STORES = {
    meta:              { keyPath: 'key' },
    accounts:          { keyPath: 'id' },
    categories:        { keyPath: 'id' },
    transactions:      { keyPath: 'id', indexes: [['ts','ts'],['accountId','accountId'],['categoryId','categoryId']] },
    splits:            { keyPath: 'id' },
    splitParticipants: { keyPath: 'id', indexes: [['splitId','splitId']] },
    budgets:           { keyPath: 'id', indexes: [['categoryId','categoryId']] },
    notifications:     { keyPath: 'id' }
  };

  const open = () => new Promise((resolve, reject) => {
    if (dbInst) return resolve(dbInst);
    const req = indexedDB.open(NAME, VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      for (const [name, def] of Object.entries(STORES)) {
        if (!db.objectStoreNames.contains(name)) {
          const s = db.createObjectStore(name, { keyPath: def.keyPath });
          (def.indexes || []).forEach(([n, k]) => s.createIndex(n, k));
        }
      }
    };
    req.onsuccess = () => { dbInst = req.result; resolve(dbInst); };
    req.onerror = () => reject(req.error);
  });

  const tx = async (storeNames, mode = 'readonly') => {
    const db = await open();
    const t = db.transaction(storeNames, mode);
    return Array.isArray(storeNames)
      ? Object.fromEntries(storeNames.map(n => [n, t.objectStore(n)]))
      : t.objectStore(storeNames);
  };

  const wrap = (req) => new Promise((res, rej) => {
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });

  const get = async (store, key) => wrap((await tx(store)).get(key));
  const all = async (store) => wrap((await tx(store)).getAll());
  const put = async (store, val) => wrap((await tx(store, 'readwrite')).put(val));
  const del = async (store, key) => wrap((await tx(store, 'readwrite')).delete(key));
  const clear = async (store) => wrap((await tx(store, 'readwrite')).clear());

  // meta key/value
  const getMeta = async (key) => {
    const r = await get('meta', key);
    return r ? r.value : null;
  };
  const setMeta = (key, value) => put('meta', { key, value });

  // ---------- domain helpers ----------
  const seedDefaults = async () => {
    const acc = await all('accounts');
    if (acc.length === 0) {
      const accounts = [
        { id: Utils.uid(), name: 'Cash',  type: 'cash',   balance: 0, color: '#22C55E', createdAt: Date.now() },
        { id: Utils.uid(), name: 'Bank',  type: 'bank',   balance: 0, color: '#1F7AE0', createdAt: Date.now() },
        { id: Utils.uid(), name: 'UPI',   type: 'upi',    balance: 0, color: '#FF1B6B', createdAt: Date.now() },
        { id: Utils.uid(), name: 'Card',  type: 'card',   balance: 0, color: '#FFD400', createdAt: Date.now() }
      ];
      for (const a of accounts) await put('accounts', a);
    }
    const cats = await all('categories');
    if (cats.length === 0) {
      const expense = ['Food','Transport','Bills','Shopping','Entertainment','Health','Rent','Groceries','Other'];
      const income  = ['Salary','Freelance','Refund','Gift','Other'];
      for (const n of expense) {
        await put('categories', { id: Utils.uid(), name: n, type: 'expense', icon: '✱', color: Utils.colorFor(n) });
      }
      for (const n of income) {
        await put('categories', { id: Utils.uid(), name: n, type: 'income',  icon: '✚', color: Utils.colorFor(n) });
      }
    }
  };

  const recalcAccountBalance = async (accountId) => {
    const txs = await all('transactions');
    // Cents-precise so 0.1+0.2 stays 0.3.
    let cents = 0;
    for (const t of txs) {
      const c = Math.round((+t.amount || 0) * 100);
      if (t.accountId === accountId) {
        if (t.type === 'income')   cents += c;
        if (t.type === 'expense')  cents -= c;
        if (t.type === 'transfer') cents -= c;
      }
      if (t.toAccountId === accountId && t.type === 'transfer') cents += c;
    }
    const bal = cents / 100;
    const a = await get('accounts', accountId);
    if (a) { a.balance = bal; await put('accounts', a); }
    return bal;
  };

  const recalcAllBalances = async () => {
    const accs = await all('accounts');
    for (const a of accs) await recalcAccountBalance(a.id);
  };

  return {
    open, get, all, put, del, clear, tx, wrap,
    getMeta, setMeta,
    seedDefaults, recalcAccountBalance, recalcAllBalances
  };
})();
