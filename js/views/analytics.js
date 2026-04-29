/* ============================================================
   Analytics — pie by category, bar of monthly expenses,
   line of income vs expense over the last 6 months. All canvas.
   ============================================================ */

const ViewAnalytics = (root) => {
  const { el } = Utils;
  const s = State.get();

  root.appendChild(el('div', { class: 'view-title' }, '// ANALYTICS'));

  // -------- pie: this-month expense by category --------
  const monthFrom = Utils.startOfMonth();
  const monthTo   = Utils.endOfMonth();
  const monthExp = s.transactions.filter(t => t.type === 'expense' && t.ts >= monthFrom && t.ts <= monthTo);
  const byCatCents = new Map();
  monthExp.forEach(t => byCatCents.set(t.categoryId, (byCatCents.get(t.categoryId) || 0) + Utils.toCents(t.amount)));
  const pieData = [...byCatCents.entries()].map(([cid, cents]) => {
    const cat = s.categories.find(c => c.id === cid);
    return { label: cat?.name || '—', value: Utils.fromCents(cents), color: cat?.color || '#22C55E' };
  }).sort((a,b) => b.value - a.value);

  const pieCard = el('div', { class: 'chart-card' }, [
    el('div', { class: 'view-title', style:'margin-bottom:6px;' }, 'EXPENSE BY CATEGORY — THIS MONTH'),
    el('canvas', { id: 'pie' })
  ]);
  const pieLegend = el('div', { class: 'legend' });
  pieData.forEach(d => {
    pieLegend.appendChild(el('div', { class: 'legend-item' }, [
      el('div', { class: 'swatch', style: `background:${d.color}` }),
      `${d.label} · ${Utils.fmtMoney(d.value)}`
    ]));
  });
  pieCard.appendChild(pieLegend);
  root.appendChild(pieCard);

  // -------- bar: monthly expenses last 6 months --------
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: Utils.monthKey(d.getTime()), label: d.toLocaleDateString('en-IN', { month: 'short' }).toUpperCase() });
  }
  const sumMonth = (type) => months.map(m => {
    const total = Utils.sumMoney(s.transactions.filter(t => t.type === type && Utils.monthKey(t.ts) === m.key));
    return { x: m.label, y: total, label: m.label, value: total };
  });

  const expSeries = sumMonth('expense');
  const incSeries = sumMonth('income');

  const barCard = el('div', { class: 'chart-card' }, [
    el('div', { class: 'view-title', style:'margin-bottom:6px;' }, 'MONTHLY EXPENSE — 6 MONTHS'),
    el('canvas', { id: 'bar' })
  ]);
  root.appendChild(barCard);

  const lineCard = el('div', { class: 'chart-card' }, [
    el('div', { class: 'view-title', style:'margin-bottom:6px;' }, 'INCOME vs EXPENSE'),
    el('canvas', { id: 'line' }),
    el('div', { class: 'legend' }, [
      el('div', { class: 'legend-item' }, [el('div', { class: 'swatch', style: 'background:#22C55E' }), 'INCOME']),
      el('div', { class: 'legend-item' }, [el('div', { class: 'swatch', style: 'background:#FF1B6B' }), 'EXPENSE'])
    ])
  ]);
  root.appendChild(lineCard);

  // total / averages
  const totalExp = Utils.sumMoney(expSeries, x => x.y);
  const totalInc = Utils.sumMoney(incSeries, x => x.y);
  const net6m    = Utils.round2(totalInc - totalExp);
  root.appendChild(el('div', { class: 'card' }, [
    el('div', { class: 'kv' }, [el('span', { class: 'k' }, '6M IN'),  el('span', { class: 'v green' }, Utils.fmtMoney(totalInc))]),
    el('div', { class: 'kv' }, [el('span', { class: 'k' }, '6M OUT'), el('span', { class: 'v red' }, Utils.fmtMoney(totalExp))]),
    el('div', { class: 'kv' }, [el('span', { class: 'k' }, 'NET 6M'), el('span', { class: 'v' }, Utils.fmtMoney(net6m))])
  ]));

  // draw after layout
  requestAnimationFrame(() => {
    Charts.pie(Utils.$('#pie'), pieData, { height: 200 });
    Charts.bar(Utils.$('#bar'), expSeries, { height: 180 });
    Charts.line(Utils.$('#line'),
      [
        { color: '#22C55E', points: incSeries },
        { color: '#FF1B6B', points: expSeries }
      ],
      months.map(m => m.label),
      { height: 180 }
    );
  });
};
