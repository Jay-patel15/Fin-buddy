/* ============================================================
   Hash-based router — keeps everything local, no SPA framework.
   ============================================================ */

const Router = (() => {
  const routes = {};

  const register = (name, fn) => { routes[name] = fn; };

  const go = (route) => {
    if (!routes[route]) route = 'dashboard';
    State.set({ route });
    location.hash = '#' + route;
    render();
  };

  const render = () => {
    const route = State.get().route;
    const fn = routes[route];
    const root = Utils.$('#view-root');
    root.innerHTML = '';
    if (fn) fn(root);

    Utils.$$('.tabbar .tab').forEach(t => {
      t.classList.toggle('active', t.dataset.route === route);
    });
    Utils.$$('.side-nav .item').forEach(t => {
      t.classList.toggle('active', t.dataset.route === route);
    });
    root.scrollTop = 0;
  };

  const init = () => {
    Utils.$$('.tabbar .tab').forEach(t => {
      t.addEventListener('click', () => go(t.dataset.route));
    });
    Utils.$$('.side-nav .item').forEach(t => {
      t.addEventListener('click', () => go(t.dataset.route));
    });
    window.addEventListener('hashchange', () => {
      const r = location.hash.replace('#', '') || 'dashboard';
      State.set({ route: r });
      render();
    });
    State.on(() => {
      // re-render on data changes if we're already in app
      if (!State.get().locked) render();
    });
  };

  return { register, go, init, render };
})();
