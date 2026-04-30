/* ============================================================
   Settings — account, notifications, export/import, cloud sync,
   QR settle, shortcuts, sign out.
   ============================================================ */

const ViewSettings = (root) => {
  const { el, toast } = Utils;
  const s = State.get();

  root.appendChild(el('div', { class: 'view-title' }, '// SETTINGS'));

  // --- ACCOUNT ---
  root.appendChild(el('div', { class: 'card' }, [
    el('div', { class:'kv' }, [el('span', { class:'k' }, 'USERNAME'), el('span', { class:'v' }, s.user?.username || '—')]),
    el('div', { class:'kv' }, [el('span', { class:'k' }, 'USER ID'), el('span', { class:'v', style:'font-size:11px;' }, s.user?.id || '—')]),
    el('div', { style:'display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;' }, [
      el('button', { class:'mini red', on: { click: signOutFlow } }, 'SIGN OUT')
    ])
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
      el('button', { class:'mini',       on: { click: ExportData.exportCSV  } }, 'EXPORT CSV'),
      el('button', { class:'mini',       on: { click: importFlow            } }, 'IMPORT JSON')
    ])
  ]));

  // --- CLOUD SYNC (Vercel /api/data → Google Sheets) ---
  const sync = Sheets.get();
  const onTog   = el('input', { type: 'checkbox' });   onTog.checked   = !!sync.enabled;          onTog.style.cssText   = 'width:auto;margin-right:6px;';
  const autoTog = el('input', { type: 'checkbox' });   autoTog.checked = sync.autoSync !== false; autoTog.style.cssText = 'width:auto;margin-right:6px;';
  const lastEl  = el('span',  { class: 'v' }, sync.lastSync ? Utils.fmtDateTime(sync.lastSync) : 'NEVER');
  const stateEl = el('span',  { class: sync.enabled ? 'v green' : 'v amber' }, sync.enabled ? 'ENABLED' : 'OFF');

  const saveCfg = async () => {
    await Sheets.save({ enabled: onTog.checked, autoSync: autoTog.checked });
    stateEl.textContent = onTog.checked ? 'ENABLED' : 'OFF';
    stateEl.className = onTog.checked ? 'v green' : 'v amber';
  };

  const queued     = Sheets.queuedCount();
  const queuedEl   = el('span', { class: queued ? 'v amber' : 'v' }, String(queued));

  root.appendChild(el('div', { class: 'view-title', style:'margin-top:14px;' }, '// CLOUD SYNC · GOOGLE SHEETS'));
  root.appendChild(el('div', { class: 'card' }, [
    el('div', { class:'kv' }, [el('span', { class:'k' }, 'STATUS'),    stateEl]),
    el('div', { class:'kv' }, [el('span', { class:'k' }, 'LAST SYNC'), lastEl]),
    el('div', { class:'kv' }, [el('span', { class:'k' }, 'QUEUED'),    queuedEl]),
    el('div', { class:'muted', style:'font-size:11px;letter-spacing:1px;margin-bottom:6px;' },
      'CRUD goes through /api/data on this Vercel deployment. The Apps Script URL + secret live in Vercel env vars and never reach the browser. Rows are scoped to your account by the server. Failed pushes queue locally and survive reload — hit FLUSH QUEUE or PUSH ALL once the sync is healthy.'),
    el('label', { style:'display:flex;align-items:center;cursor:pointer;margin-top:8px;font-size:12px;' }, [onTog,   'CLOUD SYNC ENABLED']),
    el('label', { style:'display:flex;align-items:center;cursor:pointer;margin-top:4px;font-size:12px;' }, [autoTog, 'AUTO-PUSH ON EVERY CHANGE']),
    el('div', { style:'display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;' }, [
      el('button', { class:'mini',       on: { click: async () => { await saveCfg(); toast('saved'); } } }, 'SAVE'),
      el('button', { class:'mini blue',  on: { click: async () => {
        await saveCfg();
        try { await Sheets.ping(); toast('connection ok'); }
        catch (e) { toast('failed: ' + e.message, 'err'); }
      } } }, 'TEST CONNECTION'),
      el('button', { class:'mini green', on: { click: async () => {
        if (!Sheets.isLive()) { toast('enable cloud sync first','err'); return; }
        if (!await Utils.confirm('Replace your rows in the sheet with all local data?')) return;
        try { await Sheets.pushAll(); lastEl.textContent = Utils.fmtDateTime(Sheets.get().lastSync); toast('pushed'); }
        catch (e) { toast('push failed: ' + e.message, 'err'); }
      } } }, 'PUSH ALL → SHEET'),
      el('button', { class:'mini',       on: { click: async () => {
        if (!Sheets.isLive()) { toast('enable cloud sync first','err'); return; }
        if (!await Utils.confirm('Pull from sheet and merge into local DB?')) return;
        try { await Sheets.pullAll(); lastEl.textContent = Utils.fmtDateTime(Sheets.get().lastSync); toast('pulled'); }
        catch (e) { toast('pull failed: ' + e.message, 'err'); }
      } } }, 'PULL ← SHEET'),
      el('button', { class: queued ? 'mini red' : 'mini', on: { click: async () => {
        if (!Sheets.isLive()) { toast('enable cloud sync first','err'); return; }
        try {
          const r = await Sheets.flushPending();
          queuedEl.textContent = String(Sheets.queuedCount());
          queuedEl.className = Sheets.queuedCount() ? 'v amber' : 'v';
          toast(`drained ${r.drained} · ${r.remaining} left`);
        } catch (e) { toast('flush failed: ' + e.message, 'err'); }
      } } }, `FLUSH QUEUE${queued ? ' (' + queued + ')' : ''}`)
    ])
  ]));

  // --- QR SETTLE ---
  root.appendChild(el('div', { class: 'card' }, [
    el('div', { class:'kv' }, [el('span', { class:'k' }, 'QR SETTLE'), el('span', { class:'v' }, 'UPI')]),
    el('div', { class: 'muted', style:'font-size:11px;margin-bottom:6px;' }, 'Generate a UPI payment link for splits or quick settles.'),
    el('button', { class:'mini', on: { click: qrSettleFlow } }, 'GENERATE')
  ]));

  // --- SHORTCUTS ---
  root.appendChild(el('div', { class: 'view-title', style:'margin-top:14px;' }, '// MORE'));
  root.appendChild(el('div', { class:'card' }, [
    el('button', { class:'btn btn-ghost', style:'margin-bottom:6px;', on: { click: () => Router.go('accounts')   } }, '[ MANAGE ACCOUNTS ]'),
    el('button', { class:'btn btn-ghost', style:'margin-bottom:6px;', on: { click: () => Router.go('categories') } }, '[ MANAGE CATEGORIES ]'),
    el('button', { class:'btn btn-ghost', style:'margin-bottom:6px;', on: { click: () => Router.go('budgets')    } }, '[ MANAGE BUDGETS ]'),
    el('button', { class:'btn btn-ghost', style:'margin-bottom:6px;', on: { click: () => Router.go('monthly')    } }, '[ MONTHLY TRACKING ]')
  ]));

  root.appendChild(el('div', { class:'muted center', style:'margin-top:14px;font-size:11px;letter-spacing:2px;' }, 'FINBUDDY · v2.0'));

  // ---- flows ----
  function importFlow() {
    const inp = el('input', { type:'file', accept:'application/json' });
    inp.addEventListener('change', async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      if (!await Utils.confirm('This will REPLACE current local data. Continue?')) return;
      try { await ExportData.importJSON(f); }
      catch (err) { toast('import failed: ' + err.message, 'err'); }
    });
    inp.click();
  }

  async function signOutFlow() {
    if (!await Utils.confirm('Sign out?')) return;
    try { await AuthClient.logout(); } catch (_) {}
    for (const t of ['accounts','categories','transactions','splits','splitParticipants','budgets','notifications']) {
      try { await DB.clear(t); } catch (_) {}
    }
    location.href = 'login.html';
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
          const payerName = s.user?.username || 'me';
          const link = `upi://pay?pa=${encodeURIComponent(id)}&pn=${encodeURIComponent(payerName)}&am=${a}&tn=${encodeURIComponent(note.value || 'settle')}&cu=INR`;
          out.innerHTML = '';
          out.appendChild(el('div', { style:'background:var(--offwhite);border:2px solid var(--black);padding:12px;font-size:11px;word-break:break-all;text-align:left;' }, link));
          out.appendChild(el('div', { class:'muted', style:'font-size:11px;margin-top:6px;' }, 'Open this link on a phone with a UPI app installed.'));
          const btnRow = el('div', { style:'display:flex;gap:6px;margin-top:8px;justify-content:center;' });
          btnRow.appendChild(el('button', { class:'mini green', on: { click: () => { navigator.clipboard?.writeText(link); toast('copied'); } } }, 'COPY'));
          btnRow.appendChild(el('button', { class:'mini',       on: { click: () => Share.share({ text: `Pay me via UPI: ${link}` }) } }, 'SHARE'));
          btnRow.appendChild(el('a',      { href: link, class: 'mini' }, 'OPEN'));
          out.appendChild(btnRow);
          return false; // keep modal open
        } }
      ]
    });
  }
};
