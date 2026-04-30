/* ============================================================
   Budgets — set monthly limits per category. Progress bars + alerts.
   ============================================================ */

const ViewBudgets = (root) => {
  const { el, toast } = Utils;
  const s = State.get();

  root.appendChild(el('div', { class: 'view-title' }, '// BUDGETS'));

  const monthFrom = Utils.startOfMonth();
  const monthTo   = Utils.endOfMonth();

  const expCats = s.categories.filter(c => c.type === 'expense');
  const card = el('div', { class: 'card' });
  expCats.forEach(c => {
    const b = s.budgets.find(b => b.categoryId === c.id);
    const spent = Utils.sumMoney(s.transactions.filter(t => t.type === 'expense' && t.categoryId === c.id && t.ts >= monthFrom && t.ts <= monthTo));

    const limit = b ? b.monthlyLimit : 0;
    const ratio = limit > 0 ? Math.min(1, spent / limit) : 0;
    const cls = ratio >= 1 ? 'bad' : ratio >= 0.8 ? 'warn' : '';

    const limInput = el('input', {
      type:'text', inputmode:'decimal', placeholder:'limit ₹', value: limit || '',
      style:'width:100px;padding:6px 8px;font-size:12px;text-align:right;',
      on: { change: async e => {
        const v = parseFloat(e.target.value) || 0;
        if (v <= 0) {
          if (b) await DB.del('budgets', b.id);
        } else if (b) {
          b.monthlyLimit = v; await DB.put('budgets', b);
        } else {
          await DB.put('budgets', { id: Utils.uid(), categoryId: c.id, monthlyLimit: v, period: 'monthly' });
        }
        await State.refreshAll();
        toast('saved');
      } }
    });

    card.appendChild(el('div', { style:'margin-bottom:14px;' }, [
      el('div', { style:'display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;' }, [
        el('div', { style:`color:${c.color};font-weight:700;` }, c.name),
        limInput
      ]),
      limit > 0
        ? el('div', { class: 'bar ' + cls }, el('div', { style:`width:${ratio*100}%` }))
        : el('div', { class: 'muted', style: 'font-size:11px;' }, 'no budget'),
      limit > 0
        ? el('div', { class: 'muted', style:'font-size:11px;margin-top:4px;display:flex;justify-content:space-between;' }, [
            el('span', {}, `${Utils.fmtMoney(spent)} spent`),
            el('span', {}, `${Math.round(ratio*100)}%`)
          ])
        : null
    ]));
  });
  root.appendChild(card);
};
