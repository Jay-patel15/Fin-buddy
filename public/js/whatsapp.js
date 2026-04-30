/* ============================================================
   WhatsApp helpers — deep-link only.

   How it works:
     const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
     window.open(url, '_blank');
   The user's WhatsApp opens with a prefilled message; they tap Send.
   No backend, no API keys, no rate limits, no cost.

   Public API:
     Whatsapp.send(phone, text)                 – open WhatsApp with prefilled text
     Whatsapp.monthlySummary(monthKey)          – build a monthly summary message
     Whatsapp.transactionReceipt(tx)            – build a single-tx receipt message
     Whatsapp.balanceSnapshot()                 – build a balance snapshot message
     Whatsapp.settleReminder({ payerName, who, amount, title })
                                                – build a "you owe ₹X" message
   ============================================================ */

const Whatsapp = (() => {
  const fmt = (n) => Utils.fmtMoney(n);
  // Use the shared normalizer so a 10-digit Indian number gets a 91 prefix.
  // Without the country code, wa.me opens to the contact-picker screen
  // instead of the specific chat — that's the "have to select contact" bug.
  const cleanPhone = (p) => Utils.normalizePhone(p);

  // ---------- the only sender ----------
  const send = (phone, text) => {
    const ph  = cleanPhone(phone);
    const url = ph
      ? `https://wa.me/${ph}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener');
  };

  // ---------- message builders ----------
  const monthlySummary = (monthKey) => {
    const s = State.get();
    const txs = s.transactions.filter(t => Utils.monthKey(t.ts) === monthKey);
    const income  = Utils.sumMoney(txs.filter(t => t.type === 'income'));
    const expense = Utils.sumMoney(txs.filter(t => t.type === 'expense'));
    const net     = Utils.round2(income - expense);
    const [y, m]  = monthKey.split('-').map(Number);
    const label   = new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

    const byCat = new Map();
    txs.filter(t => t.type === 'expense').forEach(t => {
      byCat.set(t.categoryId, (byCat.get(t.categoryId) || 0) + Utils.toCents(t.amount));
    });
    const top = [...byCat.entries()]
      .map(([cid, cents]) => ({ name: s.categories.find(c => c.id === cid)?.name || '—', val: Utils.fromCents(cents) }))
      .sort((a, b) => b.val - a.val)
      .slice(0, 3);

    const lines = [
      `*FinBuddy · ${label}*`,
      `In:    ${fmt(income)}`,
      `Out:   ${fmt(expense)}`,
      `Net:   ${fmt(net)}`,
      `Entries: ${txs.length}`
    ];
    if (top.length) {
      lines.push('');
      lines.push('Top spends:');
      top.forEach((c, i) => lines.push(`${i + 1}. ${c.name} — ${fmt(c.val)}`));
    }
    return lines.join('\n');
  };

  const transactionReceipt = (t) => {
    const s = State.get();
    const cat = s.categories.find(c => c.id === t.categoryId);
    const acc = s.accounts.find(a => a.id === t.accountId);
    return [
      `*FinBuddy · ${t.type.toUpperCase()}*`,
      `Amount:   ${fmt(t.amount)}`,
      cat ? `Category: ${cat.name}` : null,
      acc ? `Account:  ${acc.name}` : null,
      `When:     ${Utils.fmtDateTime(t.ts)}`,
      t.notes ? `Notes:    ${t.notes}` : null
    ].filter(Boolean).join('\n');
  };

  const balanceSnapshot = () => {
    const s = State.get();
    const net = Utils.sumMoney(s.accounts, a => a.balance || 0);
    const lines = ['*FinBuddy · Balance Snapshot*', `Net: ${fmt(net)}`, ''];
    s.accounts.forEach(a => lines.push(`${a.name}: ${fmt(a.balance || 0)}`));
    return lines.join('\n');
  };

  const settleReminder = ({ payerName, who, amount, title }) =>
    `Hey ${who || ''}, you owe ${fmt(amount)} for "${title || 'a shared expense'}". Please settle when you can.\n— ${payerName || 'me'} via FinBuddy`;

  return { send, monthlySummary, transactionReceipt, balanceSnapshot, settleReminder, cleanPhone };
})();
