/* ============================================================
   Dashboard — net worth, KPIs, recent activity, account chips,
   budget progress, quick links.
   ============================================================ */

const ViewDashboard = (root) => {
  const { el, fmtMoney, startOfMonth, endOfMonth } = Utils;
  const s = State.get();

  const monthFrom = startOfMonth();
  const monthTo   = endOfMonth();
  const monthTx = s.transactions.filter(t => t.ts >= monthFrom && t.ts <= monthTo);
  const income   = Utils.sumMoney(monthTx.filter(t => t.type === 'income'));
  const expense  = Utils.sumMoney(monthTx.filter(t => t.type === 'expense'));
  const net      = Utils.sumMoney(s.accounts, (a) => a.balance || 0);

  // Update topbar + sidebar net displays
  Utils.$('#net-balance').textContent = fmtMoney(net);
  const sidebarNet = Utils.$('#sidebar-net-val');
  if (sidebarNet) sidebarNet.textContent = fmtMoney(net);

  // ---- HERO ----
  root.appendChild(el('div', { class: 'balance-hero' }, [
    el('div', { class: 'lab' }, '// NET BALANCE'),
    el('div', { class: 'num' }, fmtMoney(net)),
    el('div', { class: 'sub' }, `across ${s.accounts.length} accounts`)
  ]));

  // ---- KPI ----
  const kpi = el('div', { class: 'kpi-grid' }, [
    el('div', { class: 'kpi in' }, [
      el('div', { class: 'l' }, 'IN — THIS MONTH'),
      el('div', { class: 'v' }, fmtMoney(income))
    ]),
    el('div', { class: 'kpi out' }, [
      el('div', { class: 'l' }, 'OUT — THIS MONTH'),
      el('div', { class: 'v' }, fmtMoney(expense))
    ])
  ]);
  root.appendChild(kpi);

  // ---- ACCOUNTS ROW ----
  root.appendChild(el('div', { class: 'section-h' }, [
    el('div', { class: 't' }, 'ACCOUNTS'),
    el('div', { class: 'a', on: { click: () => Router.go('accounts') } }, 'MANAGE →')
  ]));

  const accCard = el('div', { class: 'card' });
  s.accounts.forEach(a => {
    accCard.appendChild(el('div', { class: 'card-row' }, [
      el('div', {}, [
        el('div', { html: `<span style="color:${a.color}">●</span> ${a.name}` }),
        el('div', { class: 'muted', style: 'font-size:11px;letter-spacing:1px;' }, a.type.toUpperCase())
      ]),
      el('div', { class: 'right' }, [
        el('div', { style: 'font-weight:700;' }, fmtMoney(a.balance || 0))
      ])
    ]));
  });
  if (!s.accounts.length) accCard.appendChild(el('div', { class: 'empty' }, 'no accounts'));
  root.appendChild(accCard);

  // ---- BUDGETS PREVIEW ----
  if (s.budgets.length) {
    root.appendChild(el('div', { class: 'section-h' }, [
      el('div', { class: 't' }, 'BUDGETS'),
      el('div', { class: 'a', on: { click: () => Router.go('budgets') } }, 'EDIT →')
    ]));
    const bCard = el('div', { class: 'card' });
    s.budgets.slice(0, 3).forEach(b => {
      const cat = s.categories.find(c => c.id === b.categoryId);
      const spent = Utils.sumMoney(monthTx.filter(t => t.type === 'expense' && t.categoryId === b.categoryId));
      const ratio = Math.min(1, spent / b.monthlyLimit);
      const cls = ratio >= 1 ? 'bad' : ratio >= 0.8 ? 'warn' : '';
      bCard.appendChild(el('div', { style: 'margin-bottom:10px;' }, [
        el('div', { style: 'display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;' }, [
          el('span', {}, cat?.name || '—'),
          el('span', { class: 'muted' }, `${fmtMoney(spent)} / ${fmtMoney(b.monthlyLimit)}`)
        ]),
        el('div', { class: 'bar ' + cls }, el('div', { style: `width:${ratio*100}%` }))
      ]));
    });
    root.appendChild(bCard);
  } else {
    root.appendChild(el('div', { class: 'section-h' }, [
      el('div', { class: 't' }, 'BUDGETS'),
      el('div', { class: 'a', on: { click: () => Router.go('budgets') } }, 'SET →')
    ]));
    root.appendChild(el('div', { class: 'card empty' }, 'no budgets set yet'));
  }

  // ---- RECENT TX ----
  root.appendChild(el('div', { class: 'section-h' }, [
    el('div', { class: 't' }, 'RECENT'),
    el('div', { class: 'a', on: { click: () => Router.go('transactions') } }, 'ALL →')
  ]));
  const recent = s.transactions.slice(0, 6);
  if (recent.length) {
    const rCard = el('div', { class: 'card' });
    recent.forEach(t => rCard.appendChild(renderTx(t, s)));
    root.appendChild(rCard);
  } else {
    root.appendChild(el('div', { class: 'card empty' }, [
      el('div', { class: 'ascii' }, '◌'),
      el('div', {}, 'no entries yet'),
      el('div', { class: 'link', on: { click: () => Router.go('add') } }, '+ ADD FIRST')
    ]));
  }
};

const renderTx = (t, s) => {
  const { el, fmtMoney, fmtDate, fmtTime } = Utils;
  const cat = s.categories.find(c => c.id === t.categoryId);
  const acc = s.accounts.find(a => a.id === t.accountId);
  const toAcc = s.accounts.find(a => a.id === t.toAccountId);
  const sign = t.type === 'income' ? '+' : t.type === 'expense' ? '-' : '↹';
  const cls  = t.type === 'income' ? 'in' : t.type === 'expense' ? 'out' : 'tr';
  const icon = t.type === 'income' ? '✚' : t.type === 'expense' ? '−' : '↹';

  const row = el('div', { class: 'tx', on: { click: () => editTxModal(t) } }, [
    el('div', { class: 'tx-icon', style: `color:${cat?.color || (t.type==='income'?'#22C55E':'#FF1B6B')}` }, icon),
    el('div', { class: 'tx-body' }, [
      el('div', { class: 't1' }, t.type === 'transfer' ? `Transfer → ${toAcc?.name || ''}` : (cat?.name || '—') + (t.notes ? ` · ${t.notes}` : '')),
      el('div', { class: 't2' }, `${acc?.name || ''} · ${fmtDate(t.ts)} ${fmtTime(t.ts)}`)
    ]),
    el('div', { class: 'tx-amt ' + cls }, sign + fmtMoney(t.amount).replace('-',''))
  ]);
  return row;
};

const editTxModal = (t) => {
  const { el, fmtMoney, modal, confirm } = Utils;
  const s = State.get();
  const cat = s.categories.find(c => c.id === t.categoryId);
  const acc = s.accounts.find(a => a.id === t.accountId);
  const toAcc = s.accounts.find(a => a.id === t.toAccountId);

  const body = el('div', {}, [
    el('div', { class: 'kv' }, [el('span', { class: 'k' }, 'TYPE'), el('span', { class: 'v' }, t.type.toUpperCase())]),
    el('div', { class: 'kv' }, [el('span', { class: 'k' }, 'AMOUNT'), el('span', { class: 'v' }, fmtMoney(t.amount))]),
    cat && el('div', { class: 'kv' }, [el('span', { class: 'k' }, 'CATEGORY'), el('span', { class: 'v' }, cat.name)]),
    acc && el('div', { class: 'kv' }, [el('span', { class: 'k' }, 'ACCOUNT'), el('span', { class: 'v' }, acc.name)]),
    toAcc && el('div', { class: 'kv' }, [el('span', { class: 'k' }, 'TO'), el('span', { class: 'v' }, toAcc.name)]),
    el('div', { class: 'kv' }, [el('span', { class: 'k' }, 'WHEN'), el('span', { class: 'v' }, Utils.fmtDateTime(t.ts))]),
    t.notes && el('div', { class: 'kv' }, [el('span', { class: 'k' }, 'NOTES'), el('span', { class: 'v' }, t.notes)]),
    t.recurring && el('div', { class: 'kv' }, [el('span', { class: 'k' }, 'RECURRING'), el('span', { class: 'v amber' }, t.recurringRule?.freq?.toUpperCase() || 'YES')])
  ]);

  modal({
    title: 'TRANSACTION',
    body,
    actions: [
      { label: '[ DELETE ]', kind: 'red', onClick: async () => {
        if (!await confirm('Delete this transaction?')) return false;
        await DB.del('transactions', t.id);
        await DB.recalcAccountBalance(t.accountId);
        if (t.toAccountId) await DB.recalcAccountBalance(t.toAccountId);
        await State.refreshAll();
        if (Sheets.get().autoSync) Sheets.remove('transactions', t.id);
        Utils.toast('deleted');
      } },
      { label: '[ CLOSE ]', kind: 'primary' }
    ]
  });
};
