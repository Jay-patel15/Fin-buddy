/* ============================================================
   Common utilities — currency, dates, dom helpers, toasts
   ============================================================ */

const Utils = (() => {
  const fmtMoney = (n, sym = '₹') => {
    if (n == null || isNaN(n)) n = 0;
    const neg = n < 0;
    const abs = Math.abs(n);
    const s = abs.toLocaleString('en-IN', { maximumFractionDigits: 2 });
    return (neg ? '-' : '') + sym + s;
  };

  // Cents-precise helpers — use everywhere money is summed.
  const toCents   = (x) => Math.round((+x || 0) * 100);
  const fromCents = (c) => c / 100;
  const round2    = (n) => Math.round((+n || 0) * 100) / 100;
  // Sum a list of records by an accessor, in cents, return rupees.
  const sumMoney  = (items, get = (x) => x.amount) => {
    let c = 0;
    for (const it of items) c += toCents(get(it));
    return c / 100;
  };

  const fmtDate = (ts) => {
    const d = new Date(ts);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
  };

  const fmtTime = (ts) => {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  };

  const fmtDateTime = (ts) => `${fmtDate(ts)} ${fmtTime(ts)}`;

  const monthKey = (ts) => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };

  const startOfMonth = (d = new Date()) => {
    const x = new Date(d); x.setDate(1); x.setHours(0,0,0,0); return x.getTime();
  };
  const endOfMonth = (d = new Date()) => {
    const x = new Date(d); x.setMonth(x.getMonth() + 1, 1); x.setHours(0,0,0,0);
    return x.getTime() - 1;
  };

  const debounce = (fn, ms = 200) => {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  };

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  const el = (tag, attrs = {}, children = []) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class')      e.className = v;
      else if (k === 'html')  e.innerHTML = v;
      else if (k === 'on')    Object.entries(v).forEach(([ev, h]) => e.addEventListener(ev, h));
      else if (k === 'data')  Object.entries(v).forEach(([dk, dv]) => e.dataset[dk] = dv);
      else if (k in e)        e[k] = v;
      else                    e.setAttribute(k, v);
    }
    (Array.isArray(children) ? children : [children]).forEach((c) => {
      if (c == null || c === false) return;
      e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return e;
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const toast = (msg, type = 'ok') => {
    const root = $('#toast-root');
    const t = el('div', { class: `toast ${type === 'err' ? 'err' : ''}` }, [msg]);
    root.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; }, 1600);
    setTimeout(() => t.remove(), 2000);
  };

  // simple modal
  const modal = ({ title, body, actions }) => {
    const root = $('#modal-root');
    root.innerHTML = '';
    const close = () => { root.innerHTML = ''; };

    const bg = el('div', { class: 'modal-bg', on: { click: (e) => { if (e.target === bg) close(); } } });
    const m = el('div', { class: 'modal' });
    if (title) m.appendChild(el('h3', {}, title));
    if (typeof body === 'string') m.appendChild(el('div', { html: body }));
    else if (body) m.appendChild(body);
    if (actions && actions.length) {
      const row = el('div', { style: 'display:flex;gap:6px;margin-top:14px;' });
      actions.forEach((a) => {
        const b = el('button', {
          class: `btn ${a.kind === 'primary' ? 'btn-primary' : a.kind === 'red' ? 'btn-red' : 'btn-ghost'}`,
          on: { click: async () => {
            // Await so async onClicks (e.g. the ones that open a nested
            // confirm modal) can finish before we close. Without the await,
            // close() runs immediately and wipes any nested modal the
            // onClick just opened, breaking every DELETE flow.
            const r = a.onClick ? await a.onClick() : undefined;
            if (r !== false) close();
          } }
        }, a.label);
        row.appendChild(b);
      });
      m.appendChild(row);
    }
    bg.appendChild(m);
    root.appendChild(bg);
    return { close };
  };

  const confirm = (msg) => new Promise((res) => {
    modal({
      title: 'CONFIRM',
      body: el('p', { class: 'muted' }, msg),
      actions: [
        { label: '[ CANCEL ]', kind: 'ghost', onClick: () => res(false) },
        { label: '[ OK ]', kind: 'primary', onClick: () => res(true) }
      ]
    });
  });

  // category palette — brutalist primaries (deterministic by name)
  const palette = ['#FFD400','#22C55E','#FF1B6B','#1F7AE0','#FF7A00','#A855F7','#FBBF24','#10B981','#EF4444','#0EA5E9'];
  const colorFor = (key) => {
    let h = 0;
    for (let i = 0; i < (key||'').length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
    return palette[h % palette.length];
  };

  // -------- Phone normalization for wa.me --------
  // wa.me only opens the right chat when given an international number
  // (digits only, with country code). If the user types a 10-digit Indian
  // number we silently prepend 91 so they don't have to manually pick the
  // contact in WhatsApp every time. Override default by passing cc='44' etc.
  const normalizePhone = (raw, cc = '91') => {
    if (!raw) return '';
    let s = String(raw).trim();
    const hadPlus = s.startsWith('+');
    s = s.replace(/\D/g, ''); // digits only
    if (!s) return '';
    if (hadPlus) return s; // user supplied a full international number
    // Indian: 10-digit local → prepend country code
    if (s.length === 10) return cc + s;
    // 11 digits starting with 0 → strip the leading 0, prepend country code
    if (s.length === 11 && s.startsWith('0')) return cc + s.slice(1);
    // Already 12+ digits — assume it includes the country code
    return s;
  };

  return {
    fmtMoney, fmtDate, fmtTime, fmtDateTime, monthKey,
    startOfMonth, endOfMonth, debounce, uid,
    toCents, fromCents, round2, sumMoney,
    el, $, $$, toast, modal, confirm, colorFor, palette,
    normalizePhone
  };
})();
