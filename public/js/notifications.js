/* ============================================================
   Local notifications + recurring transaction scheduler.
   Uses the in-page Notification API. No server.
   ============================================================ */

const Notifications = (() => {
  let timer = null;
  let permState = 'default';

  const supports = () => 'Notification' in window;

  const requestPermission = async () => {
    if (!supports()) return 'unsupported';
    permState = await Notification.requestPermission();
    return permState;
  };

  const fire = (title, body) => {
    if (!supports() || Notification.permission !== 'granted') return;
    try { new Notification(title, { body, icon: 'icons/icon-192.png' }); }
    catch (e) { console.warn('notify failed', e); }
  };

  const fireOrToast = (title, body) => {
    if (supports() && Notification.permission === 'granted') fire(title, body);
    else Utils.toast(`${title}: ${body}`);
  };

  // Persisted scheduled notifications (e.g. bill reminders, split nudges)
  const schedule = async (n) => {
    n.id = n.id || Utils.uid();
    n.status = 'pending';
    await DB.put('notifications', n);
  };

  const cancel = async (id) => DB.del('notifications', id);

  const tickAll = async () => {
    const now = Date.now();
    const list = await DB.all('notifications');
    for (const n of list) {
      if (n.status === 'pending' && n.fireAt <= now) {
        fireOrToast(n.title, n.body);
        n.status = 'fired';
        n.firedAt = now;
        await DB.put('notifications', n);
      }
    }

    // Recurring transactions
    const txs = await DB.all('transactions');
    for (const t of txs) {
      if (!t.recurring || !t.recurringRule) continue;
      const next = nextOccurrence(t);
      if (next && next <= now && (t.lastSpawn || 0) < next) {
        const child = {
          ...t,
          id: Utils.uid(),
          ts: next,
          recurring: false,
          recurringRule: null,
          parentId: t.id,
          notes: (t.notes ? t.notes + ' ' : '') + '(recurring)'
        };
        delete child.lastSpawn;
        await DB.put('transactions', child);
        t.lastSpawn = next;
        await DB.put('transactions', t);
        await DB.recalcAccountBalance(child.accountId);
      }
    }
  };

  // Compute next scheduled time for a recurring tx given its rule.
  // The original tx's own `ts` is the first occurrence, so children are
  // always spawned strictly AFTER it (advance by one period from the
  // last spawn, or from the original ts if nothing has spawned yet).
  // rule: { freq: 'daily'|'weekly'|'monthly', startTs, endTs? }
  const nextOccurrence = (t) => {
    const rule = t.recurringRule || {};
    const base = t.lastSpawn || rule.startTs || t.ts;
    const d = new Date(base);
    if (rule.freq === 'daily')        d.setDate(d.getDate() + 1);
    else if (rule.freq === 'weekly')  d.setDate(d.getDate() + 7);
    else if (rule.freq === 'monthly') d.setMonth(d.getMonth() + 1);
    else return null;
    if (rule.endTs && d.getTime() > rule.endTs) return null;
    return d.getTime();
  };

  const scheduleAll = () => {
    if (timer) clearInterval(timer);
    timer = setInterval(tickAll, 30_000);
    tickAll(); // immediate
  };

  // Budget breach checker — fired during analytics/transaction add
  const checkBudgets = async () => {
    const budgets = await DB.all('budgets');
    if (!budgets.length) return;
    const cats = await DB.all('categories');
    const txs = await DB.all('transactions');
    const now = new Date();
    const monthStart = Utils.startOfMonth(now);
    for (const b of budgets) {
      const spent = Utils.sumMoney(txs.filter(t => t.type === 'expense' && t.categoryId === b.categoryId && t.ts >= monthStart));
      const cat = cats.find(c => c.id === b.categoryId);
      const ratio = spent / b.monthlyLimit;
      if (ratio >= 1 && !b.alertedFull) {
        fireOrToast('Budget exceeded', `${cat?.name || 'category'} over ${Utils.fmtMoney(b.monthlyLimit)}`);
        b.alertedFull = true; await DB.put('budgets', b);
      } else if (ratio >= 0.8 && !b.alerted80) {
        fireOrToast('Budget warning', `${cat?.name || 'category'} at ${Math.round(ratio*100)}%`);
        b.alerted80 = true; await DB.put('budgets', b);
      } else if (ratio < 0.8 && (b.alerted80 || b.alertedFull)) {
        // new month or reset
        b.alerted80 = false; b.alertedFull = false; await DB.put('budgets', b);
      }
    }
  };

  return { supports, requestPermission, fire, fireOrToast, schedule, cancel, scheduleAll, tickAll, checkBudgets };
})();
