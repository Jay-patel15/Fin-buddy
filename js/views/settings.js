/* ============================================================
   Settings — biometric, auto-lock, notifications, change PIN,
   export/import, wipe, accounts/budgets shortcuts, QR settle.
   ============================================================ */

const ViewSettings = (root) => {
  const { el, toast, modal } = Utils;
  const s = State.get();

  root.appendChild(el('div', { class: 'view-title' }, '// SETTINGS'));

  // --- USER ---
  root.appendChild(el('div', { class: 'card' }, [
    el('div', { class:'kv' }, [el('span', { class:'k' }, 'USER'), el('span', { class:'v' }, s.user?.username || '—')]),
    el('div', { class:'kv' }, [el('span', { class:'k' }, 'CREATED'), el('span', { class:'v' }, Utils.fmtDate(s.user?.createdAt || Date.now()))]),
    el('button', { class:'mini', style:'margin-top:8px;', on: { click: changePinFlow } }, 'CHANGE PIN')
  ]));

  // --- AUTO-LOCK ---
  const lockSel = el('select', { on: { change: e => Auth.setAutoLockMs(parseInt(e.target.value, 10)) } });
  [['0','OFF'],['30000','30 SEC'],['60000','1 MIN'],['300000','5 MIN'],['900000','15 MIN']].forEach(([v,l]) => {
    const o = el('option', { value: v }, l);
    if (parseInt(v,10) === (s.user?.autoLockMs ?? 60000)) o.selected = true;
    lockSel.appendChild(o);
  });

  root.appendChild(el('div', { class: 'card' }, [
    el('div', { class:'kv' }, [el('span', { class:'k' }, 'AUTO-LOCK'), lockSel])
  ]));

  // --- BIOMETRIC ---
  const bioState = s.user?.hasBiometric ? 'ENROLLED' : 'NOT SET';
  const bioBtn = el('button', { class:'mini', on: { click: async () => {
    if (s.user?.hasBiometric) await Auth.disableBiometric();
    else await Auth.enrollBiometric();
  } } }, s.user?.hasBiometric ? 'REMOVE' : 'ENROLL');
  root.appendChild(el('div', { class: 'card' }, [
    el('div', { class:'kv' }, [el('span', { class:'k' }, 'BIOMETRIC'), el('span', { class: s.user?.hasBiometric ? 'v green' : 'v amber' }, bioState)]),
    el('div', { class: 'muted', style:'font-size:11px;margin-bottom:6px;' }, Auth.supportsBio() ? 'Uses platform biometric (Touch ID / Face / Fingerprint).' : 'WebAuthn not supported on this device.'),
    bioBtn
  ]));

  // --- NOTIFICATIONS ---
  root.appendChild(el('div', { class: 'card' }, [
    el('div', { class:'kv' }, [
      el('span', { class:'k' }, 'NOTIFICATIONS'),
      el('span', { class:'v' }, Notifications.supports() ? (Notification.permission || 'default').toUpperCase() : 'UNSUPPORTED')
    ]),
    el('button', { class:'mini', on: { click: async () => {
      const p = await Notifications.requestPermission();
      toast('perm: ' + p);
    } } }, 'REQUEST PERMISSION'),
    el('button', { class:'mini', style:'margin-left:6px;', on: { click: () => Notifications.fireOrToast('TEST', 'notifications working') } }, 'TEST')
  ]));

  // --- DATA ---
  root.appendChild(el('div', { class: 'view-title', style:'margin-top:14px;' }, '// DATA'));
  root.appendChild(el('div', { class: 'card' }, [
    el('div', { class:'kv' }, [el('span', { class:'k' }, 'TRANSACTIONS'), el('span', { class:'v' }, s.transactions.length)]),
    el('div', { class:'kv' }, [el('span', { class:'k' }, 'ACCOUNTS'), el('span', { class:'v' }, s.accounts.length)]),
    el('div', { class:'kv' }, [el('span', { class:'k' }, 'CATEGORIES'), el('span', { class:'v' }, s.categories.length)]),
    el('div', { class:'kv' }, [el('span', { class:'k' }, 'SPLITS'), el('span', { class:'v' }, s.splits.length)]),
    el('div', { style:'display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;' }, [
      el('button', { class:'mini green', on: { click: ExportData.exportJSON } }, 'EXPORT JSON'),
      el('button', { class:'mini', on: { click: ExportData.exportCSV } }, 'EXPORT CSV'),
      el('button', { class:'mini blue', on: { click: ExportData.exportSQL } }, 'EXPORT .SQL'),
      el('button', { class:'mini black', on: { click: ExportData.exportDB } }, 'EXPORT .DB'),
      el('button', { class:'mini', on: { click: importFlow } }, 'IMPORT JSON')
    ]),
    el('div', { class: 'muted', style:'font-size:10px;letter-spacing:1px;margin-top:6px;' }, '.DB FILE = SQL DUMP — IMPORT INTO ANY SQLITE TOOL OR USE  sqlite3 retro.db < dump')
  ]));

  // --- QR SETTLE ---
  root.appendChild(el('div', { class: 'card' }, [
    el('div', { class:'kv' }, [el('span', { class:'k' }, 'QR SETTLE'), el('span', { class:'v' }, 'UPI')]),
    el('div', { class: 'muted', style:'font-size:11px;margin-bottom:6px;' }, 'Generate a UPI payment link/QR for splits or quick settles.'),
    el('button', { class:'mini', on: { click: qrSettleFlow } }, 'GENERATE')
  ]));

  // --- SHORTCUTS ---
  root.appendChild(el('div', { class: 'view-title', style:'margin-top:14px;' }, '// MORE'));
  root.appendChild(el('div', { class:'card' }, [
    el('button', { class:'btn btn-ghost', style:'margin-bottom:6px;', on: { click: () => Router.go('accounts')   } }, '[ MANAGE ACCOUNTS ]'),
    el('button', { class:'btn btn-ghost', style:'margin-bottom:6px;', on: { click: () => Router.go('categories') } }, '[ MANAGE CATEGORIES ]'),
    el('button', { class:'btn btn-ghost', style:'margin-bottom:6px;', on: { click: () => Router.go('budgets')    } }, '[ MANAGE BUDGETS ]'),
    el('button', { class:'btn btn-ghost', style:'margin-bottom:6px;', on: { click: () => Router.go('monthly')    } }, '[ MONTHLY TRACKING ]'),
    el('button', { class:'btn btn-blue',  style:'margin-bottom:6px;', on: { click: () => window.open('widget.html', '_blank') } }, '[ OPEN WIDGET VIEW ]'),
    el('button', { class:'btn btn-red', on: { click: wipeFlow } }, '[ WIPE ALL DATA ]')
  ]));

  root.appendChild(el('div', { class:'muted center', style:'margin-top:14px;font-size:11px;letter-spacing:2px;' }, 'FINBUDDY · OFFLINE-FIRST · v1.0'));

  // ---- flows ----
  function changePinFlow() {
    const cur = el('input', { type:'password', inputmode:'numeric', placeholder:'CURRENT PIN', maxlength:8 });
    const np  = el('input', { type:'password', inputmode:'numeric', placeholder:'NEW PIN', maxlength:8, style:'margin-top:6px;' });
    const np2 = el('input', { type:'password', inputmode:'numeric', placeholder:'CONFIRM NEW', maxlength:8, style:'margin-top:6px;' });
    const errEl = el('div', { class:'error' });
    Utils.modal({
      title: 'CHANGE PIN',
      body: el('div', {}, [cur, np, np2, errEl]),
      actions: [
        { label: '[ CANCEL ]', kind: 'ghost' },
        { label: '[ UPDATE ]', kind: 'primary', onClick: async () => {
          if (np.value !== np2.value) { errEl.textContent = '> mismatch'; return false; }
          try { await Auth.changePin(cur.value, np.value); toast('pin updated'); }
          catch (e) { errEl.textContent = '> ' + e.message; return false; }
        } }
      ]
    });
  }

  function importFlow() {
    const inp = el('input', { type:'file', accept:'application/json' });
    inp.addEventListener('change', async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      if (!await Utils.confirm('This will REPLACE current data. Continue?')) return;
      try { await ExportData.importJSON(f); }
      catch (err) { toast('import failed: ' + err.message, 'err'); }
    });
    inp.click();
  }

  async function wipeFlow() {
    if (!await Utils.confirm('PERMANENTLY WIPE ALL LOCAL DATA?')) return;
    if (!await Utils.confirm('Are you absolutely sure? This cannot be undone.')) return;
    await Auth.wipe();
  }

  function qrSettleFlow() {
    const upi  = el('input', { type:'text', placeholder:'UPI ID (e.g. you@bank)' });
    const amt  = el('input', { type:'text', inputmode:'decimal', placeholder:'AMOUNT', style:'margin-top:6px;' });
    const note = el('input', { type:'text', placeholder:'NOTE (optional)', style:'margin-top:6px;' });
    const out = el('div', { style:'margin-top:10px;text-align:center;' });

    Utils.modal({
      title: 'QR SETTLE',
      body: el('div', {}, [upi, amt, note, out]),
      actions: [
        { label: '[ CANCEL ]', kind: 'ghost' },
        { label: '[ MAKE QR ]', kind: 'primary', onClick: () => {
          const id = upi.value.trim();
          const a = parseFloat(amt.value) || 0;
          if (!id || a <= 0) { toast('id + amount required','err'); return false; }
          const link = `upi://pay?pa=${encodeURIComponent(id)}&pn=${encodeURIComponent(s.user?.username || 'me')}&am=${a}&tn=${encodeURIComponent(note.value || 'settle')}&cu=INR`;
          out.innerHTML = '';
          out.appendChild(el('div', { style:'background:var(--bg-2);border:1px solid var(--green);padding:12px;border-radius:6px;font-size:11px;word-break:break-all;text-align:left;' }, link));
          out.appendChild(el('div', { class:'muted', style:'font-size:11px;margin-top:6px;' }, 'Tap a UPI link on a phone with a UPI app installed to open it directly.'));
          const btnRow = el('div', { style:'display:flex;gap:6px;margin-top:8px;justify-content:center;' });
          btnRow.appendChild(el('button', { class:'mini green', on: { click: () => { navigator.clipboard?.writeText(link); toast('copied'); } } }, 'COPY'));
          btnRow.appendChild(el('button', { class:'mini', on: { click: () => Share.share({ text: `Pay me via UPI: ${link}` }) } }, 'SHARE'));
          btnRow.appendChild(el('a', { href: link, class: 'mini' }, 'OPEN'));
          out.appendChild(btnRow);
          return false; // keep modal open
        } }
      ]
    });
  }
};
