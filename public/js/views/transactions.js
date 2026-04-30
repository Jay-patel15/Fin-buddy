/* ============================================================
   Transaction log — searchable list grouped by date, with filters.
   ============================================================ */

const ViewTransactions = (root) => {
  const { el, $, fmtDate } = Utils;
  const s = State.get();

  let filter = { type: 'all', q: '' };

  const re = () => {
    const list = listEl;
    list.innerHTML = '';
    const txs = s.transactions.filter(t => {
      if (filter.type !== 'all' && t.type !== filter.type) return false;
      if (filter.q) {
        const q = filter.q.toLowerCase();
        const cat = s.categories.find(c => c.id === t.categoryId);
        const acc = s.accounts.find(a => a.id === t.accountId);
        const hay = `${t.notes || ''} ${cat?.name || ''} ${acc?.name || ''} ${t.amount}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    if (!txs.length) {
      list.appendChild(el('div', { class: 'card empty' }, [
        el('div', { class: 'ascii' }, '∅'),
        el('div', {}, 'no matches')
      ]));
      return;
    }

    // group by date
    const groups = new Map();
    txs.forEach(t => {
      const k = fmtDate(t.ts);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(t);
    });

    for (const [day, items] of groups) {
      list.appendChild(el('div', { class: 'section-h' }, [
        el('div', { class: 't' }, day),
        el('div', { class: 'muted', style:'font-size:11px;' }, `${items.length} ENTR${items.length===1?'Y':'IES'}`)
      ]));
      const card = el('div', { class: 'card' });
      items.forEach(t => card.appendChild(renderTx(t, s)));
      list.appendChild(card);
    }
  };

  root.appendChild(el('div', { class: 'view-title' }, '// TRANSACTION LOG'));

  // Filter
  const seg = el('div', { class: 'seg', style:'margin-bottom:10px;' });
  ['all','income','expense','transfer'].forEach(k => {
    const b = el('button', { class: filter.type === k ? 'active' : '', on: { click: () => {
      filter.type = k;
      seg.querySelectorAll('button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      re();
    } } }, k.toUpperCase());
    seg.appendChild(b);
  });
  root.appendChild(seg);

  const search = el('input', {
    type: 'text',
    placeholder: 'SEARCH NOTES / CATEGORY',
    style: 'margin-bottom:10px;',
    on: { input: Utils.debounce((e) => { filter.q = e.target.value; re(); }, 200) }
  });
  root.appendChild(search);

  const listEl = el('div');
  root.appendChild(listEl);
  re();
};
