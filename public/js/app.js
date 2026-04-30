/* ============================================================
   App boot — auth-gated. Calls /api/auth/me first; if no session,
   bounces to /login.html. After auth, registers routes, hydrates
   per-user local state, optionally pulls from cloud, then renders.
   ============================================================ */

(async function main() {
  // 1) Auth gate — must succeed before we render anything.
  let user = null;
  try { user = await AuthClient.me(); }
  catch (_) { user = null; }
  if (!user) { location.href = 'login.html'; return; }

  // 2) Reveal the app shell (was hidden in index.html).
  Utils.$('#app-screen').classList.remove('hidden');
  const userBadge = Utils.$('#sidebar-user');
  if (userBadge) userBadge.textContent = user.username;

  // 3) Per-user local-DB scoping. Switching accounts on the same
  //    browser must not leak data; wipe the cache when the user changes.
  await DB.open();
  const prevUserId = await DB.getMeta('currentUserId');
  if (prevUserId && prevUserId !== user.id) {
    for (const t of ['accounts','categories','transactions','splits','splitParticipants','budgets','notifications']) {
      try { await DB.clear(t); } catch (_) {}
    }
  }
  await DB.setMeta('currentUserId',    user.id);
  await DB.setMeta('currentUsername', user.username);

  // 4) Seed defaults (cash/bank/UPI/card + categories) on first login.
  await DB.seedDefaults();
  State.set({ user, locked: false });
  await State.refreshAll();

  // 5) Load cloud sync config; if enabled, pull a fresh copy from the
  //    server so the user sees their data on a new device.
  await Sheets.load();
  if (Sheets.isLive()) {
    try { await Sheets.pullAll(); }
    catch (e) { console.warn('initial pull failed:', e.message); }
  }

  // 6) Routes
  Router.register('dashboard',    ViewDashboard);
  Router.register('transactions', ViewTransactions);
  Router.register('add',          ViewAdd);
  Router.register('split',        ViewSplit);
  Router.register('analytics',    ViewAnalytics);
  Router.register('accounts',     ViewAccounts);
  Router.register('budgets',      ViewBudgets);
  Router.register('categories',   ViewCategories);
  Router.register('monthly',      ViewMonthly);
  Router.register('settings',     ViewSettings);
  Router.init();

  const initial = location.hash.replace('#','') || 'dashboard';
  State.set({ route: initial });
  Router.render();

  // 7) Topbar wiring
  Utils.$('#settings-btn').addEventListener('click', () => Router.go('settings'));

  // Mobile drawer (hamburger) — toggles the same sidebar used on desktop.
  const sidebar  = Utils.$('.sidebar');
  const backdrop = Utils.$('#drawer-backdrop');
  const closeDrawer = () => {
    sidebar?.classList.remove('open');
    backdrop?.classList.remove('open');
    document.body.classList.remove('drawer-open');
  };
  const openDrawer = () => {
    sidebar?.classList.add('open');
    backdrop?.classList.add('open');
    document.body.classList.add('drawer-open');
  };
  Utils.$('#menu-btn')?.addEventListener('click', openDrawer);
  backdrop?.addEventListener('click', closeDrawer);
  // Closing on every nav-item tap is the natural mobile behavior.
  Utils.$$('.side-nav .item').forEach(b => b.addEventListener('click', closeDrawer));
  // ESC also closes the drawer (helpful on tablets with keyboards).
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });

  Utils.$('#logout-btn').addEventListener('click', async () => {
    if (!await Utils.confirm('Sign out?')) return;
    try { await AuthClient.logout(); } catch (_) {}
    for (const t of ['accounts','categories','transactions','splits','splitParticipants','budgets','notifications']) {
      try { await DB.clear(t); } catch (_) {}
    }
    location.href = 'login.html';
  });

  Utils.$('#export-btn')?.addEventListener('click', () => {
    const { el } = Utils;
    const monthLabel = new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }).toUpperCase();
    let m;
    const run = (fn) => () => { fn(); m?.close(); };
    m = Utils.modal({
      title: 'EXPORT DATA',
      body: el('div', {}, [
        el('p', { class: 'muted', style: 'font-size:11px;letter-spacing:1px;margin:0 0 12px;' },
          'Files download to your device. Nothing is uploaded.'),
        el('div', { style: 'display:flex;flex-direction:column;gap:8px;' }, [
          el('button', { class: 'btn btn-primary', on: { click: run(() => ExportData.exportCSV()) } }, '[ ALL TRANSACTIONS · CSV ]'),
          el('button', { class: 'btn btn-amber',   on: { click: run(() => ExportData.exportMonthCSV(Utils.monthKey(Date.now()))) } }, `[ ${monthLabel} · CSV ]`),
          el('button', { class: 'btn btn-blue',    on: { click: run(() => ExportData.exportJSON()) } }, '[ FULL BACKUP · JSON ]'),
          el('button', { class: 'btn btn-ghost',   on: { click: run(() => Router.go('settings')) } }, '[ MORE OPTIONS → ]')
        ])
      ]),
      actions: [{ label: '[ CLOSE ]', kind: 'ghost' }]
    });
  });

  // 8) Notification permission once user is in the app
  if (Notifications.supports() && Notification.permission === 'default') {
    setTimeout(() => {
      if (Notification.permission === 'default') Notifications.requestPermission();
    }, 4000);
  }

  // 9) Flush queued cloud sync jobs whenever we come back online
  window.addEventListener('online', () => Sheets.flushPending());
})();
