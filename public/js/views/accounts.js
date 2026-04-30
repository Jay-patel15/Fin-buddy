/* ============================================================
   Accounts — manage cash, bank, UPI, card, wallet entries with
   manual balance adjustments.
   ============================================================ */

const ViewAccounts = (root) => {
  const { el, $, $$, toast } = Utils;
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
          if (!existing) {
            // seed opening balance via a synthetic income tx
            if (draft.balance) {
              await DB.put('transactions', {
                id: Utils.uid(),
                type: 'income',
                amount: Math.abs(draft.balance),
                accountId: draft.id,
                categoryId: (s.categories.find(c => c.type === 'income') || {}).id || null,
                notes: 'opening balance',
                ts: Date.now()
              });
            }
          }
          await DB.recalcAccountBalance(draft.id);
          await State.refreshAll();
          toast('saved');
        } }
      ].filter(Boolean)
    });
  }
};
