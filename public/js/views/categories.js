/* ============================================================
   Categories — manage expense and income labels.
   CRUD with safety: deletion is blocked when transactions reference
   the category (offers reassign-to-Other instead).
   ============================================================ */

const ViewCategories = (root) => {
  const { el, $$, toast, modal, confirm, fmtMoney } = Utils;
  const s = State.get();

  root.appendChild(el('div', { class: 'view-title' }, '// CATEGORIES'));

  const tabs = el('div', { class: 'seg', style: 'margin-bottom:12px;' });
  let mode = 'expense';
  const setMode = (m) => {
    mode = m;
    $$('button', tabs).forEach(b => b.classList.toggle('active', b.dataset.m === m));
    list.innerHTML = '';
    renderList();
  };
  ['expense','income'].forEach(t => {
    const b = el('button', {
      class: t === 'expense' ? 'active' : '',
      data: { m: t },
      on: { click: () => setMode(t) }
    }, t.toUpperCase());
    tabs.appendChild(b);
  });
  // 3-column seg looks better with 3 buttons; pad with the new button:
  tabs.style.gridTemplateColumns = '1fr 1fr';
  root.appendChild(tabs);

  const list = el('div');
  root.appendChild(list);

  const newBtn = el('button', { class: 'btn btn-primary', style: 'margin-top:10px;', on: { click: () => openEditor() } }, '[ + NEW CATEGORY ]');
  root.appendChild(newBtn);

  const txCountFor = (catId) => s.transactions.filter(t => t.categoryId === catId).length;
  const txSpentFor = (catId) => Utils.sumMoney(s.transactions.filter(t => t.categoryId === catId && t.type === mode));

  function renderList() {
    const cats = s.categories.filter(c => c.type === mode).sort((a,b) => a.name.localeCompare(b.name));
    if (!cats.length) {
      list.appendChild(el('div', { class: 'card empty' }, 'no categories'));
      return;
    }
    cats.forEach(c => {
      const count = txCountFor(c.id);
      const total = txSpentFor(c.id);
      list.appendChild(el('div', { class: 'card', on: { click: () => openEditor(c) } }, [
        el('div', { style: 'display:flex;justify-content:space-between;align-items:center;gap:10px;' }, [
          el('div', { style: 'flex:1;min-width:0;display:flex;align-items:center;gap:10px;' }, [
            el('div', { style: `width:36px;height:36px;background:${c.color};border:3px solid var(--black);display:flex;align-items:center;justify-content:center;font-family:var(--display);font-size:16px;` }, c.icon || '●'),
            el('div', { style: 'flex:1;min-width:0;' }, [
              el('div', { style: 'font-family:var(--display);font-size:16px;letter-spacing:1px;text-transform:uppercase;' }, c.name),
              el('div', { class: 'muted', style: 'font-size:11px;letter-spacing:1px;margin-top:2px;' }, `${count} ENTR${count===1?'Y':'IES'} · ${fmtMoney(total)}`)
            ])
          ]),
          el('div', { class: 'mini' }, 'EDIT')
        ])
      ]));
    });
  }

  function openEditor(existing) {
    const draft = existing
      ? { ...existing }
      : { id: Utils.uid(), name: '', type: mode, icon: mode === 'expense' ? '✱' : '✚', color: Utils.palette[0] };

    const nameIn = el('input', { type: 'text', placeholder: 'NAME', maxlength: 24, value: draft.name, on: { input: e => draft.name = e.target.value } });
    const iconIn = el('input', { type: 'text', placeholder: 'ICON / EMOJI', maxlength: 4, value: draft.icon, on: { input: e => draft.icon = e.target.value } });

    const typeSeg = el('div', { class: 'seg' });
    typeSeg.style.gridTemplateColumns = '1fr 1fr';
    ['expense','income'].forEach(t => {
      const b = el('button', { class: t === draft.type ? 'active' : '', on: { click: () => {
        draft.type = t;
        $$('button', typeSeg).forEach(x => x.classList.remove('active'));
        b.classList.add('active');
      } } }, t.toUpperCase());
      typeSeg.appendChild(b);
    });

    const colorBox = el('div', { class: 'chip-grid' });
    Utils.palette.forEach(c => {
      const chip = el('div', {
        class: 'chip' + (draft.color === c ? ' active' : ''),
        style: `background:${c};color:#000;font-weight:900;`,
        on: { click: () => {
          draft.color = c;
          $$('.chip', colorBox).forEach(x => { x.classList.remove('active'); });
          chip.classList.add('active');
        } }
      }, '●');
      colorBox.appendChild(chip);
    });

    const usage = existing ? txCountFor(existing.id) : 0;

    const body = el('div', {}, [
      el('div', { class: 'form-row' }, [el('label', {}, 'NAME'), nameIn]),
      el('div', { class: 'form-row' }, [el('label', {}, 'TYPE'), typeSeg]),
      el('div', { class: 'form-row' }, [el('label', {}, 'ICON'), iconIn]),
      el('div', { class: 'form-row' }, [el('label', {}, 'COLOR'), colorBox]),
      existing && usage > 0 ? el('div', { class: 'ack-line' }, `IN USE · ${usage} TRANSACTION${usage===1?'':'S'}`) : null
    ]);

    Utils.modal({
      title: existing ? 'EDIT CATEGORY' : 'NEW CATEGORY',
      body,
      actions: [
        existing ? { label: '[ DELETE ]', kind: 'red', onClick: () => deleteFlow(existing) } : null,
        { label: '[ SAVE ]', kind: 'primary', onClick: async () => {
          if (!draft.name.trim()) { toast('name required','err'); return false; }
          await DB.put('categories', draft);
          await State.refreshAll();
          toast('saved');
          renderList();
        } }
      ].filter(Boolean)
    });
  }

  async function deleteFlow(cat) {
    const inUse = s.transactions.filter(t => t.categoryId === cat.id);
    if (inUse.length === 0) {
      if (!await confirm(`Delete category "${cat.name}"?`)) return false;
      await DB.del('categories', cat.id);
      await State.refreshAll();
      toast('deleted');
      renderList();
      return;
    }
    // Offer reassign
    const others = s.categories.filter(c => c.type === cat.type && c.id !== cat.id);
    if (others.length === 0) {
      toast(`cannot delete — ${inUse.length} tx use this and no other ${cat.type} category exists`, 'err');
      return false;
    }

    const reSel = el('select');
    others.forEach(o => reSel.appendChild(el('option', { value: o.id }, o.name.toUpperCase())));

    return new Promise((resolve) => {
      Utils.modal({
        title: 'CATEGORY IN USE',
        body: el('div', {}, [
          el('p', { class: 'muted', style: 'font-size:12px;' }, `${inUse.length} transactions use "${cat.name}". Reassign them to:`),
          el('div', { class: 'form-row' }, [el('label', {}, 'REASSIGN TO'), reSel])
        ]),
        actions: [
          { label: '[ CANCEL ]', kind: 'ghost', onClick: () => resolve(false) },
          { label: '[ REASSIGN + DELETE ]', kind: 'red', onClick: async () => {
            const tgt = reSel.value;
            for (const t of inUse) {
              t.categoryId = tgt;
              await DB.put('transactions', t);
            }
            await DB.del('categories', cat.id);
            await State.refreshAll();
            toast(`reassigned ${inUse.length} · deleted`);
            renderList();
            resolve(true);
          } }
        ]
      });
    });
  }

  setMode('expense');
};
