/* ============================================================
   Tiny reactive store — pub/sub for app state.
   ============================================================ */

const State = (() => {
  const data = {
    user: null,             // { id, username } — server-issued, no crypto state on the client
    accounts: [],
    categories: [],
    transactions: [],
    splits: [],
    splitParticipants: [],
    budgets: [],
    route: 'dashboard',
    locked: true,
    lastActivity: Date.now()
  };
  const subs = new Set();

  const emit = () => subs.forEach(fn => { try { fn(data); } catch (e) { console.error(e); } });

  const on = (fn) => { subs.add(fn); return () => subs.delete(fn); };

  const set = (patch) => { Object.assign(data, patch); emit(); };

  const get = () => data;

  const refreshAll = async () => {
    data.accounts          = await DB.all('accounts');
    data.categories        = await DB.all('categories');
    data.transactions      = (await DB.all('transactions')).sort((a,b) => b.ts - a.ts);
    data.splits            = await DB.all('splits');
    data.splitParticipants = await DB.all('splitParticipants');
    data.budgets           = await DB.all('budgets');
    emit();
  };

  return { on, set, get, refreshAll };
})();
