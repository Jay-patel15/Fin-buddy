/* ============================================================
   Expense splitting — equal/custom/percentage with cents-precise math.
   Maintains a local per-contact ledger and supports:
     - optional "also record as expense" on creation,
     - settlement with method/note + optional auto-income tx,
     - acknowledgement message ("thanks!") via Web Share / WhatsApp.
   No Twilio, no server.
   ============================================================ */

const ViewSplit = (root) => {
  const { el, $, $$, toast, fmtMoney, fmtDate, modal, confirm } = Utils;
  const s = State.get();

  // ---------- math helpers (cents-precise) ----------
  const toCents   = (x) => Math.round((+x || 0) * 100);
  const fromCents = (c) => c / 100;

  // Compute each participant's owed amount in CENTS, given:
  //   totalCents   — total of the bill
  //   participants — array of { name, value }, value meaning depends on type
  //   type         — equal | custom | percentage
  // Returns { owedCents: number[], payerOwedCents: number, valid: boolean, error?: string }
  const computeOwed = (totalCents, participants, type) => {
    const n = participants.length;
    if (n === 0) return { owedCents: [], payerOwedCents: totalCents, valid: false, error: 'no participants' };
    if (totalCents <= 0) return { owedCents: [], payerOwedCents: 0, valid: false, error: 'total must be > 0' };

    if (type === 'equal') {
      // Payer counts as one share too; remainder cents stay with payer.
      const heads = n + 1;
      const baseEach = Math.floor(totalCents / heads);
      const remainder = totalCents - baseEach * heads;
      const owed = Array.from({ length: n }, () => baseEach);
      const payer = baseEach + remainder;
      return { owedCents: owed, payerOwedCents: payer, valid: true };
    }

    if (type === 'custom') {
      const owed = participants.map(p => toCents(p.value));
      const sum = owed.reduce((a, b) => a + b, 0);
      if (sum > totalCents) return { owedCents: owed, payerOwedCents: 0, valid: false, error: `participants exceed total by ${fmtMoney(fromCents(sum - totalCents))}` };
      return { owedCents: owed, payerOwedCents: totalCents - sum, valid: true };
    }

    if (type === 'percentage') {
      const sumPct = participants.reduce((a, p) => a + (+p.value || 0), 0);
      if (sumPct > 100.0001) return { owedCents: [], payerOwedCents: 0, valid: false, error: `percentages exceed 100% (${sumPct.toFixed(2)}%)` };
      // Use cent-rounding; remainder goes to payer.
      const owed = participants.map(p => Math.round(totalCents * (+p.value || 0) / 100));
      const sum = owed.reduce((a, b) => a + b, 0);
      const payer = totalCents - sum;
      return { owedCents: owed, payerOwedCents: payer, valid: true };
    }

    return { owedCents: [], payerOwedCents: 0, valid: false, error: 'unknown type' };
  };

  // ---------- header ----------
  root.appendChild(el('div', { class: 'view-title' }, '// SPLIT EXPENSES'));

  const tabs = el('div', { class: 'seg', style:'margin-bottom:12px;' });
  let mode = 'list';
  const setMode = (m) => {
    mode = m;
    $$('button', tabs).forEach(b => b.classList.toggle('active', b.dataset.m === m));
    body.innerHTML = '';
    if (m === 'list') renderList();
    else if (m === 'new') renderNew();
    else renderLedger();
  };
  ['list','new','ledger'].forEach(m => {
    const b = el('button', {
      class: m === 'list' ? 'active' : '',
      data: { m },
      on: { click: () => setMode(m) }
    }, m.toUpperCase());
    tabs.appendChild(b);
  });
  root.appendChild(tabs);

  const body = el('div');
  root.appendChild(body);

  // ============================================================ LIST
  const renderList = () => {
    if (!s.splits.length) {
      body.appendChild(el('div', { class: 'card empty' }, [
        el('div', { class: 'ascii' }, '◇'),
        el('div', {}, 'no splits yet'),
        el('div', { class: 'link', on: { click: () => setMode('new') } }, '+ NEW SPLIT')
      ]));
      return;
    }
    s.splits.slice().sort((a, b) => b.createdAt - a.createdAt).forEach(sp => {
      const parts = s.splitParticipants.filter(p => p.splitId === sp.id);
      const pending = parts.filter(p => p.status === 'pending');
      const settled = parts.filter(p => p.status === 'settled');
      const pendAmt = pending.reduce((a, p) => a + p.amountOwed, 0);
      const setAmt  = settled.reduce((a, p) => a + p.amountOwed, 0);

      const tag = pending.length === 0
        ? el('span', { class: 'pill set' }, 'ALL SETTLED')
        : el('span', { class: 'pill pend' }, `${pending.length} PENDING`);

      const card = el('div', { class: 'card', on: { click: () => openSplit(sp) } }, [
        el('div', { style: 'display:flex;justify-content:space-between;align-items:flex-start;gap:10px;' }, [
          el('div', { style:'flex:1;min-width:0;' }, [
            el('div', { style:'display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:6px;' }, [
              el('span', { class: `tag ${sp.splitType === 'equal' ? 'green' : sp.splitType === 'custom' ? 'pink' : 'blue'}` }, sp.splitType.toUpperCase())
            ]),
            el('div', { style: 'font-family:var(--display);font-size:18px;text-transform:uppercase;letter-spacing:1px;' }, sp.title),
            el('div', { class: 'muted', style: 'font-size:11px;letter-spacing:1px;margin-top:4px;' }, `${parts.length} PEOPLE · ${fmtDate(sp.createdAt)}`)
          ]),
          el('div', { class: 'right' }, [
            el('div', { style: 'font-family:var(--display);font-size:18px;font-weight:900;' }, fmtMoney(sp.totalAmount)),
            el('div', { style:'margin-top:6px;' }, tag)
          ])
        ]),
        el('div', { class: 'ack-line' }, [
          el('span', { class: 'red' }, `OWED: ${fmtMoney(pendAmt)}`),
          el('span', {}, ' · '),
          el('span', { class: 'green' }, `SETTLED: ${fmtMoney(setAmt)}`)
        ])
      ]);
      body.appendChild(card);
    });
  };

  // ============================================================ NEW
  const renderNew = () => {
    // Optional seed from Add view ("split this expense" toggle)
    let seed = null;
    try {
      const raw = sessionStorage.getItem('split_seed');
      if (raw) { seed = JSON.parse(raw); sessionStorage.removeItem('split_seed'); }
    } catch (_) {}

    const draft = {
      title: seed?.title || '',
      total: seed?.total || 0,
      payerName: s.user?.username || 'me',
      type: 'equal',
      participants: [{ name: '', phone: '', value: 0 }],
      // If we already recorded the expense in Add, link to it instead of double-recording.
      seededExpenseTxId: seed?.expenseTxId || null,
      recordExpense: false,
      expenseAccountId: seed?.expenseAccountId || s.accounts[0]?.id || null,
      expenseCategoryId: seed?.expenseCategoryId
                      || (s.categories.find(c => c.type === 'expense' && c.name.toLowerCase() === 'food')
                       || s.categories.find(c => c.type === 'expense'))?.id || null
    };

    const titleIn = el('input', { type: 'text', placeholder: 'TITLE (e.g. dinner)', value: draft.title, on: { input: e => draft.title = e.target.value } });
    const totalIn = el('input', { type: 'text', inputmode: 'decimal', placeholder: 'TOTAL ₹', value: draft.total || '', on: { input: e => {
      draft.total = parseFloat(e.target.value) || 0;
      updatePreview();
    } } });
    const seededHint = draft.seededExpenseTxId
      ? el('div', { class: 'ack-line', style: 'margin-bottom:10px;background:var(--green);' },
          'LINKED TO THE EXPENSE YOU JUST RECORDED — DO NOT TOGGLE "RECORD AS EXPENSE" BELOW (WOULD DOUBLE-COUNT)')
      : null;

    const seg = el('div', { class: 'seg' });
    ['equal','custom','percentage'].forEach(t => {
      const b = el('button', { class: t === draft.type ? 'active' : '', on: { click: () => {
        draft.type = t;
        $$('button', seg).forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        renderParts();
        updatePreview();
      } } }, t.toUpperCase());
      seg.appendChild(b);
    });

    const partsBox = el('div');
    const renderParts = () => {
      partsBox.innerHTML = '';
      draft.participants.forEach((p, i) => {
        const row = el('div', { class: 'part' }, [
          el('input', { type: 'text', placeholder: 'NAME', value: p.name, on: { input: e => { p.name = e.target.value; updatePreview(); } } }),
          el('input', { type: 'tel', placeholder: 'PHONE', value: p.phone, on: { input: e => p.phone = e.target.value } }),
          el('input', {
            type: 'text', inputmode: 'decimal', value: p.value || '',
            placeholder: draft.type === 'equal' ? '—' : draft.type === 'custom' ? '₹' : '%',
            disabled: draft.type === 'equal',
            on: { input: e => { p.value = parseFloat(e.target.value) || 0; updatePreview(); } }
          }),
          el('button', { on: { click: () => { draft.participants.splice(i, 1); renderParts(); updatePreview(); } } }, '×')
        ]);
        partsBox.appendChild(row);
      });
      const add = el('button', { class: 'mini', style:'margin-top:4px;', on: { click: () => {
        draft.participants.push({ name: '', phone: '', value: 0 });
        renderParts(); updatePreview();
      } } }, '+ ADD PERSON');
      partsBox.appendChild(add);
    };
    renderParts();

    // optional: also record as expense
    const recordToggle = el('input', { type: 'checkbox', style:'width:auto;margin-right:6px;', on: { change: e => {
      draft.recordExpense = e.target.checked;
      recordPanel.style.display = e.target.checked ? '' : 'none';
    } } });
    const acctSelect = el('select', { on: { change: e => draft.expenseAccountId = e.target.value } });
    s.accounts.forEach(a => {
      const o = el('option', { value: a.id }, `${a.name.toUpperCase()} (${fmtMoney(a.balance || 0)})`);
      if (a.id === draft.expenseAccountId) o.selected = true;
      acctSelect.appendChild(o);
    });
    const catSelect = el('select', { on: { change: e => draft.expenseCategoryId = e.target.value } });
    s.categories.filter(c => c.type === 'expense').forEach(c => {
      const o = el('option', { value: c.id }, c.name.toUpperCase());
      if (c.id === draft.expenseCategoryId) o.selected = true;
      catSelect.appendChild(o);
    });
    const recordPanel = el('div', { style: 'display:none;background:var(--offwhite);border:3px solid var(--black);padding:10px;margin-top:8px;' }, [
      el('div', { class: 'kv' }, [el('span', { class: 'k' }, 'PAID FROM'), acctSelect]),
      el('div', { class: 'kv' }, [el('span', { class: 'k' }, 'CATEGORY'), catSelect])
    ]);

    // live preview
    const preview = el('div', { class: 'card', style:'background:var(--offwhite);' });
    const updatePreview = () => {
      preview.innerHTML = '';
      const valid = draft.participants.filter(p => p.name.trim());
      const totalC = toCents(draft.total);
      const calc = computeOwed(totalC, valid, draft.type);

      if (!calc.valid) {
        preview.appendChild(el('div', { class: 'muted', style:'font-size:11px;' }, calc.error || 'add participants'));
        return;
      }

      const head = el('div', { class: 'view-title', style:'margin-bottom:8px;' }, '// PREVIEW');
      preview.appendChild(head);
      preview.appendChild(el('div', { class: 'kv' }, [
        el('span', { class: 'k' }, 'YOUR SHARE'),
        el('span', { class: 'v green' }, fmtMoney(fromCents(calc.payerOwedCents)))
      ]));
      valid.forEach((p, i) => {
        preview.appendChild(el('div', { class: 'kv' }, [
          el('span', { class: 'k' }, (p.name || `PERSON ${i+1}`).toUpperCase()),
          el('span', { class: 'v' }, fmtMoney(fromCents(calc.owedCents[i])))
        ]));
      });
      const sumOwed = calc.owedCents.reduce((a,b) => a+b, 0) + calc.payerOwedCents;
      preview.appendChild(el('div', { class: 'ack-line' }, `Σ ${fmtMoney(fromCents(sumOwed))} · matches total ${sumOwed === totalC ? '✓' : '✕'}`));
    };

    const submit = el('button', { class: 'btn btn-primary', style:'margin-top:10px;', on: { click: save } }, '[ CREATE SPLIT ]');

    if (seededHint) body.appendChild(seededHint);
    body.appendChild(el('div', { class: 'form-row' }, [el('label', {}, 'TITLE'), titleIn]));
    body.appendChild(el('div', { class: 'form-row' }, [el('label', {}, 'TOTAL ₹'), totalIn]));
    body.appendChild(el('div', { class: 'form-row' }, [el('label', {}, 'METHOD'), seg]));
    body.appendChild(el('div', { class: 'form-row' }, [el('label', {}, 'PARTICIPANTS (you = payer)'), partsBox]));
    body.appendChild(el('div', { class: 'form-row' }, [
      el('label', { style:'display:flex;align-items:center;cursor:pointer;' }, [recordToggle, 'ALSO RECORD AS EXPENSE I PAID']),
      recordPanel
    ]));
    body.appendChild(preview);
    body.appendChild(submit);
    updatePreview();

    async function save() {
      const valid = draft.participants.filter(p => p.name.trim());
      if (!draft.title.trim())     return toast('title required', 'err');
      if (!draft.total || draft.total <= 0) return toast('total required', 'err');
      if (valid.length === 0)      return toast('add at least one person', 'err');

      const totalC = toCents(draft.total);
      const calc = computeOwed(totalC, valid, draft.type);
      if (!calc.valid) return toast(calc.error || 'invalid amounts', 'err');

      const splitId = Utils.uid();

      // Link to existing expense if seeded from Add, OR optionally record now.
      let expenseTxId = draft.seededExpenseTxId || null;
      if (expenseTxId) {
        // Tag the seed tx with this splitId so deletion cascades correctly.
        const seedTx = await DB.get('transactions', expenseTxId);
        if (seedTx) { seedTx.splitId = splitId; await DB.put('transactions', seedTx); }
      } else if (draft.recordExpense && draft.expenseAccountId) {
        expenseTxId = Utils.uid();
        await DB.put('transactions', {
          id: expenseTxId,
          type: 'expense',
          amount: fromCents(totalC),
          accountId: draft.expenseAccountId,
          categoryId: draft.expenseCategoryId,
          notes: `Split: ${draft.title.trim()}`,
          ts: Date.now(),
          splitId,
          recurring: false,
          createdAt: Date.now()
        });
        await DB.recalcAccountBalance(draft.expenseAccountId);
      }

      const split = {
        id: splitId,
        title: draft.title.trim(),
        totalAmount: fromCents(totalC),
        totalCents: totalC,
        payerName: draft.payerName,
        payerOwedCents: calc.payerOwedCents,
        splitType: draft.type,
        expenseTxId,
        expenseAccountId: draft.recordExpense ? draft.expenseAccountId : null,
        createdAt: Date.now()
      };
      await DB.put('splits', split);

      for (let i = 0; i < valid.length; i++) {
        const p = valid[i];
        await DB.put('splitParticipants', {
          id: Utils.uid(),
          splitId,
          name: p.name.trim(),
          phone: Share.cleanPhone(p.phone),
          amountOwed: fromCents(calc.owedCents[i]),
          amountOwedCents: calc.owedCents[i],
          status: 'pending',
          settledAt: null,
          settleMethod: null,
          settleNote: null,
          settleTxId: null,
          ackSentAt: null,
          createdAt: Date.now()
        });
      }
      await State.refreshAll();
      toast('split created');
      setMode('list');
    }
  };

  // ============================================================ DETAIL
  const openSplit = (sp) => {
    const renderInside = () => {
      const parts = State.get().splitParticipants.filter(p => p.splitId === sp.id);
      const allSettled = parts.every(p => p.status === 'settled');
      const totalOwed = parts.reduce((a,p) => a + p.amountOwed, 0);
      const totalSettled = parts.filter(p => p.status === 'settled').reduce((a,p) => a + p.amountOwed, 0);

      const list = el('div');
      parts.forEach(p => {
        const row = el('div', { style:'padding:10px 0;border-bottom:2px dashed var(--black);' }, [
          el('div', { style:'display:flex;justify-content:space-between;align-items:flex-start;gap:8px;' }, [
            el('div', { style:'flex:1;min-width:0;' }, [
              el('div', { style:'font-weight:900;' }, p.name),
              el('div', { class: 'muted', style:'font-size:11px;letter-spacing:1px;' }, p.phone || 'NO PHONE')
            ]),
            el('div', { class: 'right' }, [
              el('div', { style:'font-family:var(--display);font-size:16px;' }, fmtMoney(p.amountOwed)),
              el('span', { class: `pill ${p.status === 'pending' ? 'pend' : 'set'}`, style:'margin-top:4px;display:inline-block;' }, p.status.toUpperCase())
            ])
          ]),
          p.status === 'settled'
            ? el('div', { class: 'ack-line' }, [
                el('div', {}, `SETTLED ${Utils.fmtDateTime(p.settledAt)}${p.settleMethod ? ' · '+p.settleMethod.toUpperCase() : ''}`),
                p.settleNote ? el('div', { class: 'muted', style:'margin-top:2px;' }, '“'+p.settleNote+'”') : null,
                p.ackSentAt
                  ? el('div', { class: 'green', style:'margin-top:2px;font-weight:900;letter-spacing:1px;' }, `✓ ACK SENT ${Utils.fmtDate(p.ackSentAt)}`)
                  : null
              ])
            : null,
          el('div', { style:'display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;' }, [
            p.status === 'pending'
              ? el('button', { class:'mini blue', on: { click: () => sendNudge(sp, p) } }, '✉ NUDGE')
              : null,
            p.status === 'pending'
              ? el('button', { class:'mini green', on: { click: () => settleFlow(sp, p) } }, '✓ MARK SETTLED')
              : el('button', { class:'mini', on: { click: async () => {
                  if (!await confirm('Reopen this settlement?')) return;
                  // unlink any auto-created income tx
                  if (p.settleTxId) {
                    const linked = await DB.get('transactions', p.settleTxId);
                    if (linked) {
                      await DB.del('transactions', p.settleTxId);
                      if (linked.accountId) await DB.recalcAccountBalance(linked.accountId);
                    }
                  }
                  p.status = 'pending';
                  p.settledAt = null;
                  p.settleMethod = null;
                  p.settleNote = null;
                  p.settleTxId = null;
                  await DB.put('splitParticipants', p);
                  await State.refreshAll();
                  toast('reopened');
                  renderInside();
                } } }, '↶ REOPEN'),
            p.status === 'settled'
              ? el('button', { class:'mini black', on: { click: () => sendAck(sp, p) } }, p.ackSentAt ? '✉ RE-SEND THANKS' : '✉ SEND THANKS')
              : null
          ].filter(Boolean))
        ]);
        list.appendChild(row);
      });

      const head = el('div', {}, [
        el('div', { class:'kv' }, [el('span', { class:'k' }, 'TOTAL'), el('span', { class:'v' }, fmtMoney(sp.totalAmount))]),
        el('div', { class:'kv' }, [el('span', { class:'k' }, 'YOUR SHARE'), el('span', { class:'v green' }, fmtMoney((sp.payerOwedCents || 0) / 100))]),
        el('div', { class:'kv' }, [el('span', { class:'k' }, 'METHOD'), el('span', { class:'v' }, sp.splitType.toUpperCase())]),
        el('div', { class:'kv' }, [el('span', { class:'k' }, 'WHEN'), el('span', { class:'v' }, fmtDate(sp.createdAt))]),
        sp.expenseTxId
          ? el('div', { class:'kv' }, [el('span', { class:'k' }, 'LINKED TX'), el('span', { class:'v blue' }, 'YES')])
          : null,
        el('div', { class:'kv' }, [el('span', { class:'k' }, 'STATUS'), el('span', { class:'v' }, allSettled ? 'ALL SETTLED' : `${fmtMoney(totalSettled)} OF ${fmtMoney(totalOwed)} IN`)]),
        el('div', { style:'margin-top:8px;' }, list)
      ]);

      Utils.modal({
        title: sp.title.toUpperCase(),
        body: head,
        actions: [
          { label: '[ DELETE ]', kind: 'red', onClick: async () => {
            if (!await confirm('Delete split? Linked transactions will also be removed.')) return false;
            // remove participants
            for (const p of parts) {
              if (p.settleTxId) {
                const t = await DB.get('transactions', p.settleTxId);
                if (t) { await DB.del('transactions', p.settleTxId); if (t.accountId) await DB.recalcAccountBalance(t.accountId); }
              }
              await DB.del('splitParticipants', p.id);
            }
            // remove linked expense tx
            if (sp.expenseTxId) {
              const t = await DB.get('transactions', sp.expenseTxId);
              if (t) { await DB.del('transactions', sp.expenseTxId); if (t.accountId) await DB.recalcAccountBalance(t.accountId); }
            }
            await DB.del('splits', sp.id);
            await State.refreshAll();
            toast('deleted');
          } },
          { label: '[ CLOSE ]', kind: 'primary' }
        ]
      });
    };
    renderInside();
  };

  // ============================================================ SETTLE flow
  const settleFlow = (sp, p) => {
    const draft = {
      method: 'cash',
      note: '',
      recordIncome: false,
      accountId: sp.expenseAccountId || s.accounts[0]?.id || null
    };

    const methodSel = el('select', { on: { change: e => draft.method = e.target.value } });
    ['cash','upi','bank','card','other'].forEach(m => {
      const o = el('option', { value: m }, m.toUpperCase());
      methodSel.appendChild(o);
    });

    const noteIn = el('input', { type:'text', placeholder:'NOTE (optional)', maxlength: 80, on: { input: e => draft.note = e.target.value } });

    const incomeChk = el('input', { type:'checkbox', style:'width:auto;margin-right:6px;', on: { change: e => {
      draft.recordIncome = e.target.checked;
      acctRow.style.display = e.target.checked ? '' : 'none';
    } } });
    const acctSel = el('select', { on: { change: e => draft.accountId = e.target.value } });
    s.accounts.forEach(a => {
      const o = el('option', { value: a.id }, `${a.name.toUpperCase()} (${fmtMoney(a.balance || 0)})`);
      if (a.id === draft.accountId) o.selected = true;
      acctSel.appendChild(o);
    });
    const acctRow = el('div', { style:'display:none;margin-top:8px;' }, [
      el('div', { class:'kv' }, [el('span', { class:'k' }, 'TO ACCOUNT'), acctSel])
    ]);

    Utils.modal({
      title: `SETTLE · ${p.name.toUpperCase()}`,
      body: el('div', {}, [
        el('div', { class:'kv' }, [el('span', { class:'k' }, 'AMOUNT'), el('span', { class:'v' }, fmtMoney(p.amountOwed))]),
        el('div', { class:'kv' }, [el('span', { class:'k' }, 'METHOD'), methodSel]),
        el('div', { class:'form-row', style:'margin-top:10px;' }, [el('label', {}, 'NOTE'), noteIn]),
        el('div', { class:'form-row' }, [
          el('label', { style:'display:flex;align-items:center;cursor:pointer;' }, [incomeChk, 'RECORD AS INCOME IN MY ACCOUNT'])
        ]),
        acctRow
      ]),
      actions: [
        { label: '[ CANCEL ]', kind: 'ghost' },
        { label: '[ CONFIRM ]', kind: 'primary', onClick: async () => {
          let txId = null;
          if (draft.recordIncome && draft.accountId) {
            txId = Utils.uid();
            const incomeCat = s.categories.find(c => c.type === 'income') || null;
            await DB.put('transactions', {
              id: txId,
              type: 'income',
              amount: p.amountOwed,
              accountId: draft.accountId,
              categoryId: incomeCat?.id || null,
              notes: `Settled: ${sp.title} (${p.name})`,
              ts: Date.now(),
              splitId: sp.id,
              splitParticipantId: p.id,
              recurring: false,
              createdAt: Date.now()
            });
            await DB.recalcAccountBalance(draft.accountId);
          }
          p.status = 'settled';
          p.settledAt = Date.now();
          p.settleMethod = draft.method;
          p.settleNote = draft.note || null;
          p.settleTxId = txId;
          await DB.put('splitParticipants', p);
          await State.refreshAll();
          toast('settled');
          // re-open detail with fresh data
          const fresh = State.get().splits.find(x => x.id === sp.id);
          if (fresh) openSplit(fresh);
        } }
      ]
    });
  };

  // Send a "you owe" nudge
  const sendNudge = (sp, p) => {
    const text = Share.settleMessage({
      payerName: sp.payerName,
      who: p.name,
      amount: p.amountOwed,
      title: sp.title
    });
    Share.share({ phone: p.phone, text });
  };

  // Send a "thanks for paying" acknowledgement
  const sendAck = async (sp, p) => {
    const text = `Got it — thanks for paying ${fmtMoney(p.amountOwed)} for "${sp.title}". We're settled ✓\n— ${sp.payerName} via FinBuddy`;
    Share.share({ phone: p.phone, text });
    p.ackSentAt = Date.now();
    await DB.put('splitParticipants', p);
    await State.refreshAll();
    toast('thanks sent');
    openSplit(sp);
  };

  // ============================================================ LEDGER
  const renderLedger = () => {
    const tally = new Map();
    s.splitParticipants.forEach(p => {
      const k = `${p.name}|${p.phone || ''}`;
      const cur = tally.get(k) || { name: p.name, phone: p.phone, pending: 0, settled: 0, count: 0, lastActivity: 0 };
      if (p.status === 'pending') cur.pending += p.amountOwed;
      else cur.settled += p.amountOwed;
      cur.count += 1;
      cur.lastActivity = Math.max(cur.lastActivity, p.settledAt || p.createdAt || 0);
      tally.set(k, cur);
    });
    const rows = [...tally.values()].sort((a,b) => b.pending - a.pending || b.lastActivity - a.lastActivity);

    if (!rows.length) {
      body.appendChild(el('div', { class: 'card empty' }, 'no contacts'));
      return;
    }

    const totalPending = rows.reduce((a,r) => a + r.pending, 0);
    const totalSettled = rows.reduce((a,r) => a + r.settled, 0);
    body.appendChild(el('div', { class: 'kpi-grid' }, [
      el('div', { class: 'kpi out' }, [el('div', { class: 'l' }, 'OWED TO YOU'), el('div', { class: 'v' }, fmtMoney(totalPending))]),
      el('div', { class: 'kpi in' }, [el('div', { class: 'l' }, 'SETTLED'),     el('div', { class: 'v' }, fmtMoney(totalSettled))])
    ]));

    const card = el('div', { class: 'card' });
    rows.forEach(r => {
      card.appendChild(el('div', { style:'padding:10px 0;border-bottom:2px dashed var(--black);' }, [
        el('div', { style:'display:flex;justify-content:space-between;align-items:flex-start;gap:8px;' }, [
          el('div', { style:'flex:1;min-width:0;' }, [
            el('div', { style:'font-weight:900;' }, r.name),
            el('div', { class: 'muted', style:'font-size:11px;letter-spacing:1px;' }, `${r.phone || 'NO PHONE'} · ${r.count} ENTR${r.count===1?'Y':'IES'}`)
          ]),
          el('div', { class: 'right' }, [
            r.pending > 0
              ? el('div', { class:'red', style:'font-weight:900;' }, `OWES ${fmtMoney(r.pending)}`)
              : el('div', { class:'green', style:'font-weight:900;' }, 'CLEAR'),
            el('div', { class: 'muted', style:'font-size:11px;margin-top:2px;' }, `paid ${fmtMoney(r.settled)}`)
          ])
        ]),
        r.pending > 0 && r.phone
          ? el('div', { style:'margin-top:6px;' }, el('button', { class:'mini blue', on: { click: () => {
              const text = `Hey ${r.name}, you have ${fmtMoney(r.pending)} pending across our shared expenses.`;
              Share.share({ phone: r.phone, text });
            } } }, '✉ NUDGE TOTAL'))
          : null
      ]));
    });
    body.appendChild(card);
  };

  // If we just landed here from "ALSO SPLIT THIS EXPENSE", jump straight to
  // the NEW form so the seeded title/total/account auto-fill is visible.
  const initialMode = sessionStorage.getItem('split_seed') ? 'new' : 'list';
  setMode(initialMode);
};
