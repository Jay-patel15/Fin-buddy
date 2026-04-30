/* ============================================================
   Accounts — manage cash, bank, UPI, card, wallet entries with
   manual balance adjustments.
   ============================================================ */

const ViewAccounts = (root) => {
  const { el, $$, toast } = Utils;
  const s = State.get();

  root.appendChild(el('div', { class: 'view-title' }, '// ACCOUNTS'));

  const list = el('div');
  s.accounts.forEach(a => list.appendChild(renderRow(a)));
  if (!s.accounts.length) list.appendChild(el('div', { class: 'card empty' }, 'no accounts'));
  root.appendChild(list);

  root.appendChild(el('button', { class: 'btn btn-primary', style:'margin-top:10px;', on: { click: () => openEditor() } }, '[ + NEW ACCOUNT ]'));

  function renderRow(a) {
    return el('div', { class: 'card', on: { click: () => openEditor(a) } }, [
      el('div', { style: 'display:flex;justify-content:space-between;align-items:center;' }, [
        el('div', {}, [
          el('div', { html: `<span style="color:${a.color}">●</span> <strong>${a.name}</strong>` }),
          el('div', { class: 'muted', style:'font-size:11px;letter-spacing:1px;margin-top:4px;' }, a.type.toUpperCase())
        ]),
        el('div', { class: 'right' }, [
          el('div', { style:'font-weight:700;font-size:16px;' }, Utils.fmtMoney(a.balance || 0))
        ])
      ])
    ]);
  }

  function openEditor(existing) {
    const draft = existing
      ? { ...existing }
      : { id: Utils.uid(), name: '', type: 'cash', color: Utils.palette[0], balance: 0, createdAt: Date.now() };

    const nameIn = el('input', { type:'text', placeholder:'NAME', value: draft.name, on: { input: e => draft.name = e.target.value } });

    const typeSeg = el('div', { class:'seg' });
    ['cash','bank','upi','card','wallet'].forEach(t => {
      const b = el('button', { class: t === draft.type ? 'active' : '', on: { click: () => {
        draft.type = t;
        $$('button', typeSeg).forEach(x => x.classList.remove('active'));
        b.classList.add('active');
      } } }, t.toUpperCase());
      typeSeg.appendChild(b);
    });

    const colorBox = el('div', { class:'chip-grid' });
    Utils.palette.forEach(c => {
      const chip = el('div', { class: 'chip' + (draft.color === c ? ' active' : ''), style:`color:${c}`, on: { click: () => {
        draft.color = c;
        $$('.chip', colorBox).forEach(x => x.classList.remove('active'));
        chip.classList.add('active');
      } } }, '●');
      colorBox.appendChild(chip);
    });

    const balIn = el('input', { type:'text', inputmode:'decimal', placeholder:'OPENING BAL', value: draft.balance || '', on: { input: e => draft.balance = parseFloat(e.target.value) || 0 } });

    const body = el('div', {}, [
      el('div', { class:'form-row' }, [el('label', {}, 'NAME'), nameIn]),
      el('div', { class:'form-row' }, [el('label', {}, 'TYPE'), typeSeg]),
      el('div', { class:'form-row' }, [el('label', {}, 'COLOR'), colorBox]),
      el('div', { class:'form-row' }, [el('label', {}, 'BALANCE'), balIn,
        el('div', { class: 'muted', style:'font-size:11px;margin-top:6px;' }, 'note: balance auto-recalculates from your transactions')])
    ]);

    Utils.modal({
      title: existing ? 'EDIT ACCOUNT' : 'NEW ACCOUNT',
      body,
      actions: [
        existing ? { label: '[ DELETE ]', kind: 'red', onClick: async () => {
          if (!await Utils.confirm('Delete account? Linked transactions remain.')) return false;
          await DB.del('accounts', existing.id);
          await State.refreshAll();
          toast('removed');
        } } : null,
        { label: '[ SAVE ]', kind: 'primary', onClick: async () => {
          if (!draft.name.trim()) { toast('name required','err'); return false; }
          
          await DB.put('accounts', draft);
          
          const trueTxSum = await DB.recalcAccountBalance(draft.id);
          const newBal = parseFloat(draft.balance) || 0;
          const diff = newBal - trueTxSum;

          let openingTx = null;
          if (diff !== 0) {
            openingTx = {
              id: Utils.uid(),
              type: diff > 0 ? 'income' : 'expense',
              amount: Math.abs(diff),
              accountId: draft.id,
              categoryId: (s.categories.find(c => c.type === (diff > 0 ? 'income' : 'expense')) || {}).id || null,
              notes: existing ? 'balance adjustment' : 'opening balance',
              ts: Date.now(),
              createdAt: Date.now(),
              updatedAt: Date.now()
            };
            await DB.put('transactions', openingTx);
          }

          await DB.recalcAccountBalance(draft.id);

          // Cloud-push everything we just wrote, awaiting so failures surface
          // as a toast (and queue persistently for later flush).
          if (Sheets.isLive()) {
            const accUp = await Sheets.upsert('accounts', { ...(await DB.get('accounts', draft.id)), updatedAt: Date.now() });
            const txUp  = openingTx ? await Sheets.upsert('transactions', openingTx) : { ok: true };

            await State.refreshAll();
            if (accUp.ok && txUp.ok) {
              toast('saved + synced');
            } else if (accUp.queued || txUp.queued) {
              toast('saved · cloud queued (' + Sheets.queuedCount() + ')', 'err');
            } else {
              toast('saved');
            }
          } else {
            await State.refreshAll();
            toast('saved');
          }
        } }
      ].filter(Boolean)
    });
  }
};
