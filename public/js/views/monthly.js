/* ============================================================
   Monthly tracking — pick a month, see income/expense/net,
   per-category breakdown, daily bars, and the full transaction list.
   Includes per-month CSV export.
   ============================================================ */

const ViewMonthly = (root) => {
  const { el, $, fmtMoney, fmtDate, monthKey, toCents, fromCents, sumMoney } = Utils;
  const s = State.get();

  // Build month list (every month that has data, plus current)
  const set = new Set();
  s.transactions.forEach(t => set.add(monthKey(t.ts)));
  set.add(monthKey(Date.now()));
  const months = [...set].sort().reverse();

  let active = months[0];

  root.appendChild(el('div', { class: 'view-title' }, '// MONTHLY'));

  const picker = el('select', { style: 'margin-bottom:12px;', on: { change: e => { active = e.target.value; render(); } } });
  months.forEach(m => {
    const [y, mm] = m.split('-');
    const label = new Date(+y, +mm - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }).toUpperCase();
    picker.appendChild(el('option', { value: m }, label));
  });
  root.appendChild(picker);

  const body = el('div');
  root.appendChild(body);

  const render = () => {
    body.innerHTML = '';

    const txs = s.transactions.filter(t => monthKey(t.ts) === active).sort((a,b) => b.ts - a.ts);
    const income   = sumMoney(txs.filter(t => t.type === 'income'));
    const expense  = sumMoney(txs.filter(t => t.type === 'expense'));
    const net      = Utils.round2(income - expense);

    // KPIs
    body.appendChild(el('div', { class: 'kpi-grid' }, [
      el('div', { class: 'kpi in' },  [el('div', { class: 'l' }, 'IN'),  el('div', { class: 'v' }, fmtMoney(income))]),
      el('div', { class: 'kpi out' }, [el('div', { class: 'l' }, 'OUT'), el('div', { class: 'v' }, fmtMoney(expense))])
    ]));
    body.appendChild(el('div', { class: 'card', style: net >= 0 ? 'background:var(--green);' : 'background:var(--pink);color:var(--paper);' }, [
      el('div', { class: 'kv' }, [
        el('span', { class: 'k', style: net >= 0 ? '' : 'color:var(--paper);' }, 'NET'),
        el('span', { class: 'v', style: 'font-family:var(--display);font-size:20px;' + (net >= 0 ? '' : 'color:var(--paper);') }, fmtMoney(net))
      ])
    ]));

    // Daily bar chart
    const [y, m] = active.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const dailyExp = Array.from({ length: daysInMonth }, (_, i) => ({
      label: String(i + 1),
      value: 0
    }));
    txs.filter(t => t.type === 'expense').forEach(t => {
      const d = new Date(t.ts);
      if (d.getFullYear() === y && d.getMonth() === m - 1) {
        dailyExp[d.getDate() - 1].value += t.amount;
      }
    });
    // round to cents-precision
    dailyExp.forEach(d => d.value = Utils.round2(d.value));

    body.appendChild(el('div', { class: 'chart-card' }, [
      el('div', { class: 'view-title', style: 'margin-bottom:6px;' }, 'DAILY EXPENSE'),
      el('canvas', { id: 'monthly-bar' })
    ]));

    // By-category
    const expCats = new Map();
    txs.filter(t => t.type === 'expense').forEach(t => {
      expCats.set(t.categoryId, (expCats.get(t.categoryId) || 0) + toCents(t.amount));
    });
    const catRows = [...expCats.entries()].map(([cid, cents]) => {
      const cat = s.categories.find(c => c.id === cid);
      return { name: cat?.name || '—', color: cat?.color || '#FFD400', value: fromCents(cents) };
    }).sort((a,b) => b.value - a.value);

    if (catRows.length) {
      body.appendChild(el('div', { class: 'section-h' }, [el('div', { class: 't' }, 'BY CATEGORY')]));
      const card = el('div', { class: 'card' });
      const totalExpCents = [...expCats.values()].reduce((a,b) => a+b, 0);
      catRows.forEach(r => {
        const pct = totalExpCents ? (toCents(r.value) / totalExpCents) : 0;
        card.appendChild(el('div', { style: 'margin-bottom:10px;' }, [
          el('div', { style: 'display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;' }, [
            el('span', {}, [
              el('span', { style: `display:inline-block;width:10px;height:10px;border:2px solid var(--black);background:${r.color};margin-right:6px;` }),
              r.name.toUpperCase()
            ]),
            el('span', { class: 'muted' }, `${fmtMoney(r.value)} · ${Math.round(pct*100)}%`)
          ]),
          el('div', { class: 'bar' }, el('div', { style: `width:${pct*100}%;background-color:${r.color};` }))
        ]));
      });
      body.appendChild(card);
    }

    // Transactions list
    body.appendChild(el('div', { class: 'section-h' }, [
      el('div', { class: 't' }, `TRANSACTIONS · ${txs.length}`),
      el('div', { style: 'display:flex;gap:6px;' }, [
        el('div', { class: 'a', on: { click: () => ExportData.exportMonthCSV(active) } }, '⤓ CSV'),
        el('div', { class: 'a', style: 'background:var(--green);', on: { click: () => Whatsapp.send('', Whatsapp.monthlySummary(active)) } }, '✉ WHATSAPP')
      ])
    ]));
    if (!txs.length) {
      body.appendChild(el('div', { class: 'card empty' }, 'no entries this month'));
    } else {
      const tCard = el('div', { class: 'card' });
      txs.forEach(t => tCard.appendChild(renderTx(t, s)));
      body.appendChild(tCard);
    }

    // Render the chart after layout
    requestAnimationFrame(() => {
      const c = $('#monthly-bar');
      if (c) Charts.bar(c, dailyExp, { height: 160 });
    });
  };

  render();
};
