/* ============================================================
   Add Expense / Income / Transfer form. Supports recurring rules
   and optional voice input via SpeechRecognition (where available).
   ============================================================ */

const ViewAdd = (root) => {
  const { el, $, $$, toast } = Utils;
  const s = State.get();

  const editSeedStr = sessionStorage.getItem('edit_tx');
  let isEdit = false;
  let parsed = {};
  
  let draft = {
    type: 'expense',
    amount: 0,
    accountId: s.accounts[0]?.id || null,
    toAccountId: null,
    categoryId: null,
    notes: '',
    ts: Date.now(),
    recurring: false,
    recurringRule: null
  };

  if (editSeedStr) {
    try {
      parsed = JSON.parse(editSeedStr);
      draft = { ...draft, ...parsed };
      isEdit = true;
      sessionStorage.removeItem('edit_tx');
    } catch (_) {}
  }

  root.appendChild(el('div', { class: 'view-title' }, isEdit ? '// EDIT ENTRY' : '// NEW ENTRY'));

  // type
  const typeSeg = el('div', { class: 'seg' });
  ['expense','income','transfer'].forEach(t => {
    const b = el('button', { class: t === draft.type ? 'active' : '', on: { click: () => {
      draft.type = t;
      $$('button', typeSeg).forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      renderCats(); renderAcc(); renderTo();
    } } }, t.toUpperCase());
    typeSeg.appendChild(b);
  });
  root.appendChild(el('div', { class: 'form-row' }, typeSeg));

  // amount
  const amount = el('input', {
    class: 'amount-input',
    type: 'text',
    inputmode: 'decimal',
    placeholder: '0.00',
    value: draft.amount ? draft.amount.toString() : '',
    on: { input: e => {
      const v = e.target.value.replace(/[^0-9.]/g,'');
      e.target.value = v;
      draft.amount = parseFloat(v) || 0;
    } }
  });
  root.appendChild(el('div', { class: 'form-row' }, [
    el('label', {}, 'AMOUNT (₹)'),
    amount
  ]));

  // account
  const accBox = el('div', { class: 'chip-grid' });
  const renderAcc = () => {
    accBox.innerHTML = '';
    s.accounts.forEach(a => {
      const c = el('div', { class: 'chip' + (draft.accountId === a.id ? ' active' : ''), on: { click: () => {
        draft.accountId = a.id;
        renderAcc();
      } } }, [
        el('div', { html: `<span style="color:${a.color}">●</span> ${a.name}` }),
        el('div', { class: 'muted', style:'font-size:10px;letter-spacing:1px;' }, Utils.fmtMoney(a.balance || 0))
      ]);
      accBox.appendChild(c);
    });
  };
  root.appendChild(el('div', { class: 'form-row' }, [
    el('label', {}, 'ACCOUNT'),
    accBox
  ]));
  renderAcc();

  // to-account (transfer only)
  const toLab = el('label', {}, 'TO ACCOUNT');
  const toBox = el('div', { class: 'chip-grid' });
  const toRow = el('div', { class: 'form-row' }, [toLab, toBox]);
  const renderTo = () => {
    toRow.style.display = draft.type === 'transfer' ? '' : 'none';
    toBox.innerHTML = '';
    s.accounts
      .filter(a => a.id !== draft.accountId)
      .forEach(a => {
        const c = el('div', { class: 'chip' + (draft.toAccountId === a.id ? ' active' : ''), on: { click: () => {
          draft.toAccountId = a.id; renderTo();
        } } }, a.name);
        toBox.appendChild(c);
      });
  };
  root.appendChild(toRow);
  renderTo();

  // category (not for transfer)
  const catLab = el('label', {}, 'CATEGORY');
  const catBox = el('div', { class: 'chip-grid' });
  const catRow = el('div', { class: 'form-row' }, [catLab, catBox]);
  const renderCats = () => {
    catRow.style.display = draft.type === 'transfer' ? 'none' : '';
    catBox.innerHTML = '';
    s.categories.filter(c => c.type === draft.type).forEach(c => {
      const chip = el('div', { class: 'chip' + (draft.categoryId === c.id ? ' active' : ''), on: { click: () => {
        draft.categoryId = c.id;
        renderCats();
      } } }, [
        el('div', { style: `color:${c.color}` }, c.icon),
        el('div', {}, c.name)
      ]);
      catBox.appendChild(chip);
    });
  };
  root.appendChild(catRow);
  renderCats();

  // notes + voice
  const notesIn = el('input', {
    type: 'text', placeholder: 'NOTES (optional)', maxlength: 80, value: draft.notes || '',
    on: { input: e => draft.notes = e.target.value }
  });
  const micBtn = el('button', {
    class: 'mini',
    style: 'margin-top:6px;',
    on: { click: () => voiceInput((txt) => { notesIn.value = txt; draft.notes = txt; }) }
  }, '🎤 VOICE');
  root.appendChild(el('div', { class: 'form-row' }, [
    el('label', {}, 'NOTES'),
    notesIn,
    'SpeechRecognition' in window || 'webkitSpeechRecognition' in window ? micBtn : null
  ]));

  // date
  const dateIn = el('input', {
    type: 'datetime-local',
    value: toLocalInput(draft.ts),
    on: { change: e => draft.ts = new Date(e.target.value).getTime() }
  });
  root.appendChild(el('div', { class: 'form-row' }, [
    el('label', {}, 'WHEN'),
    dateIn
  ]));

  // recurring
  const recCheck = el('input', { type: 'checkbox', style: 'width:auto;margin-right:6px;', on: { change: e => {
    draft.recurring = e.target.checked;
    recRow.style.display = e.target.checked ? '' : 'none';
    if (e.target.checked && !draft.recurringRule) draft.recurringRule = { freq: 'monthly', startTs: draft.ts };
  } } });
  recCheck.checked = !!draft.recurring;
  const recFreq = el('select', { on: { change: e => draft.recurringRule.freq = e.target.value } });
  ['daily','weekly','monthly'].forEach(f => recFreq.appendChild(el('option', { value: f }, f.toUpperCase())));
  recFreq.value = draft.recurringRule?.freq || 'monthly';
  const recRow = el('div', { class: 'form-row', style: draft.recurring ? '' : 'display:none' }, [
    el('label', {}, 'REPEAT EVERY'),
    recFreq
  ]);

  root.appendChild(el('div', { class: 'form-row' }, [
    el('label', { style: 'display:flex;align-items:center;cursor:pointer;' }, [recCheck, 'RECURRING ENTRY'])
  ]));
  root.appendChild(recRow);

  // split-this-expense (only for type=expense)
  draft.splitAfter = false;
  const splitCheck = el('input', { type: 'checkbox', style: 'width:auto;margin-right:6px;', on: { change: e => {
    draft.splitAfter = e.target.checked;
  } } });
  const splitRow = el('div', { class: 'form-row' }, [
    el('label', { style: 'display:flex;align-items:center;cursor:pointer;' }, [splitCheck, 'ALSO SPLIT THIS EXPENSE WITH OTHERS'])
  ]);
  root.appendChild(splitRow);
  const updateSplitVisibility = () => { splitRow.style.display = draft.type === 'expense' ? '' : 'none'; };
  updateSplitVisibility();
  // also hook into segment changes
  $$('button', typeSeg).forEach(b => b.addEventListener('click', updateSplitVisibility));

  // submit
  const submit = el('button', { class: 'btn btn-primary', style: 'margin-top:10px;', on: { click: save } }, isEdit ? '[ UPDATE ENTRY ]' : '[ SAVE ENTRY ]');
  root.appendChild(submit);

  async function save() {
    if (!draft.amount || draft.amount <= 0) return toast('amount required', 'err');
    if (!draft.accountId) return toast('account required', 'err');
    if (draft.type === 'transfer' && !draft.toAccountId) return toast('select destination', 'err');
    if (draft.type !== 'transfer' && !draft.categoryId) return toast('category required', 'err');

    const tx = {
      id: isEdit ? draft.id : Utils.uid(),
      type: draft.type,
      amount: draft.amount,
      accountId: draft.accountId,
      toAccountId: draft.type === 'transfer' ? draft.toAccountId : null,
      categoryId: draft.type === 'transfer' ? null : draft.categoryId,
      notes: draft.notes,
      ts: draft.ts,
      recurring: draft.recurring,
      recurringRule: draft.recurring ? { ...draft.recurringRule, startTs: draft.ts } : null,
      createdAt: isEdit ? draft.createdAt : Date.now(),
      updatedAt: Date.now()
    };
    
    await DB.put('transactions', tx);
    await DB.recalcAccountBalance(tx.accountId);
    if (tx.toAccountId) await DB.recalcAccountBalance(tx.toAccountId);
    
    if (isEdit) {
      if (parsed.accountId && parsed.accountId !== tx.accountId) await DB.recalcAccountBalance(parsed.accountId);
      if (parsed.toAccountId && parsed.toAccountId !== tx.toAccountId) await DB.recalcAccountBalance(parsed.toAccountId);
    }
    
    await State.refreshAll();
    Notifications.checkBudgets();
    toast('saved');

    // Push to Google Sheets (no-op when sync disabled; queues on failure)
    if (Sheets.get().autoSync) {
      Sheets.upsert('transactions', tx);
      // balances changed locally; mirror them too so totals stay in sync
      const acc = await DB.get('accounts', tx.accountId);
      if (acc) Sheets.upsert('accounts', { ...acc, updatedAt: Date.now() });
      if (tx.toAccountId) {
        const acc2 = await DB.get('accounts', tx.toAccountId);
        if (acc2) Sheets.upsert('accounts', { ...acc2, updatedAt: Date.now() });
      }
    }

    if (draft.splitAfter && draft.type === 'expense') {
      // Stash a draft for the split view to pick up.
      sessionStorage.setItem('split_seed', JSON.stringify({
        title: draft.notes || 'expense',
        total: draft.amount,
        expenseTxId: tx.id,
        expenseAccountId: tx.accountId,
        expenseCategoryId: tx.categoryId
      }));
      Router.go('split');
    } else {
      Router.go('dashboard');
    }
  }
};

const toLocalInput = (ts) => {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const voiceInput = (cb) => {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { Utils.toast('voice not supported', 'err'); return; }
  const r = new SR();
  r.lang = 'en-IN';
  r.interimResults = false;
  r.maxAlternatives = 1;
  r.onresult = (e) => {
    const t = e.results[0][0].transcript;
    cb(t);
    Utils.toast('captured: ' + t.slice(0,30));
  };
  r.onerror = () => Utils.toast('voice error', 'err');
  r.start();
  Utils.toast('listening…');
};
