/* ============================================================
   App boot — wire routes, init auth, register service worker.
   ============================================================ */

(async function main() {
  // Register routes
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

  // Initial route from hash if present
  const initial = location.hash.replace('#','') || 'dashboard';
  State.set({ route: initial });

  // Topbar settings button → settings view
  Utils.$('#settings-btn').addEventListener('click', () => Router.go('settings'));

  // Auth
  await Auth.init();
  Auth.startAutoLock();

  // Service worker (offline shell)
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    try { await navigator.serviceWorker.register('sw.js'); }
    catch (e) { console.warn('SW registration failed', e); }
  }

  // Auto-request notification permission once user is in the app
  State.on(s => {
    if (!s.locked && Notifications.supports() && Notification.permission === 'default') {
      // ask once after a brief delay so it isn't immediately on unlock
      setTimeout(() => {
        if (Notification.permission === 'default') Notifications.requestPermission();
      }, 4000);
    }
  });
})();
