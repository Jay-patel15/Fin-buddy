/* ============================================================
   Local authentication: PIN setup, login, optional biometrics
   via WebAuthn (platform authenticator).
   No external auth dependency.
   ============================================================ */

const Auth = (() => {
  const { $, $$, el, toast } = Utils;

  let pinBuffer = '';

  const renderDots = () => {
    const dots = $$('#pin-dots span');
    dots.forEach((d, i) => d.classList.toggle('filled', i < pinBuffer.length));
  };

  const showSetup = () => {
    $('#lock-setup').classList.remove('hidden');
    $('#lock-login').classList.add('hidden');
  };
  const showLogin = () => {
    $('#lock-setup').classList.add('hidden');
    $('#lock-login').classList.remove('hidden');
    pinBuffer = '';
    renderDots();
    $('#login-error').textContent = '';
  };

  const init = async () => {
    const user = await DB.getMeta('user');
    if (!user) showSetup();
    else showLogin();

    // SETUP
    $('#setup-submit').addEventListener('click', onSetup);

    // KEYPAD
    $('#keypad').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-k]');
      if (!b) return;
      const k = b.dataset.k;
      if (k === 'del')      { pinBuffer = pinBuffer.slice(0, -1); renderDots(); return; }
      if (k === 'bio')      { tryBiometric(); return; }
      if (pinBuffer.length >= 8) return;
      pinBuffer += k;
      renderDots();
      if (pinBuffer.length >= 4) {
        // try unlock once user typed >= 4
        // but don't auto-submit; require >=4 as min and check after each press
        tryUnlock();
      }
    });

    $('#lock-btn').addEventListener('click', () => lock());
  };

  const onSetup = async () => {
    const p1 = $('#setup-pin').value;
    const p2 = $('#setup-pin-confirm').value;
    const err = $('#setup-error');
    err.textContent = '';

    if (!/^\d{4,8}$/.test(p1))      return err.textContent = '> pin must be 4-8 digits';
    if (p1 !== p2)                  return err.textContent = '> pins do not match';

    const salt = Crypto.randomSalt();
    const pinHash = await Crypto.hashPin(p1, salt);
    const user = {
      id: Utils.uid(),
      username: 'user',
      salt, pinHash,
      hasBiometric: false,
      biometricCredId: null,
      autoLockMs: 60_000,
      createdAt: Date.now()
    };
    await DB.setMeta('user', user);
    await DB.seedDefaults();
    State.set({ user, locked: false });
    await State.refreshAll();
    finishUnlock();
  };

  const tryUnlock = async () => {
    const user = await DB.getMeta('user');
    if (!user) return;
    const candidate = await Crypto.hashPin(pinBuffer, user.salt);
    if (Crypto.safeEqual(candidate, user.pinHash)) {
      State.set({ user, locked: false });
      await State.refreshAll();
      finishUnlock();
    } else if (pinBuffer.length >= user.pinHash.length / 8) {
      // wrong, but don't reveal length — clear after >=4 attempts of full possible
      // simply clear if exact pin length attempts (we don't know exact) -> use fixed cap
      if (pinBuffer.length >= 8) {
        $('#login-error').textContent = '> ACCESS DENIED';
        pinBuffer = '';
        renderDots();
      }
    }
  };

  const finishUnlock = () => {
    $('#lock-screen').classList.add('hidden');
    $('#app-screen').classList.remove('hidden');
    Router.go(State.get().route || 'dashboard');
    Notifications.scheduleAll();
  };

  const lock = () => {
    State.set({ locked: true });
    pinBuffer = '';
    $('#app-screen').classList.add('hidden');
    $('#lock-screen').classList.remove('hidden');
    showLogin();
  };

  // ---------- WebAuthn (biometric) ----------
  const supportsBio = () => !!(window.PublicKeyCredential && navigator.credentials);

  const enrollBiometric = async () => {
    if (!supportsBio()) { toast('biometrics unsupported', 'err'); return; }
    const user = State.get().user;
    if (!user) return;
    try {
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const userId = new TextEncoder().encode(user.id);
      const cred = await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: { name: 'RETRO.CASH' },
          user: { id: userId, name: user.username, displayName: user.username },
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 },   // ES256
            { type: 'public-key', alg: -257 }  // RS256
          ],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            userVerification: 'required',
            residentKey: 'preferred'
          },
          timeout: 60000,
          attestation: 'none'
        }
      });
      if (!cred) throw new Error('cancelled');
      const credId = btoa(String.fromCharCode(...new Uint8Array(cred.rawId)));
      user.hasBiometric = true;
      user.biometricCredId = credId;
      await DB.setMeta('user', user);
      State.set({ user });
      toast('biometric enrolled');
    } catch (e) {
      console.warn(e);
      toast('biometric setup failed', 'err');
    }
  };

  const disableBiometric = async () => {
    const user = State.get().user;
    user.hasBiometric = false;
    user.biometricCredId = null;
    await DB.setMeta('user', user);
    State.set({ user });
    toast('biometric removed');
  };

  const tryBiometric = async () => {
    const user = await DB.getMeta('user');
    if (!user || !user.hasBiometric || !user.biometricCredId) {
      toast('biometric not enrolled', 'err');
      return;
    }
    try {
      const credIdBuf = Uint8Array.from(atob(user.biometricCredId), c => c.charCodeAt(0));
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge,
          allowCredentials: [{ id: credIdBuf, type: 'public-key', transports: ['internal'] }],
          userVerification: 'required',
          timeout: 60000
        }
      });
      if (assertion) {
        // We trust the OS to have verified the user. We don't verify the signature
        // server-side because there's no server — local auth via OS biometric.
        State.set({ user, locked: false });
        await State.refreshAll();
        finishUnlock();
      }
    } catch (e) {
      console.warn(e);
      toast('biometric failed', 'err');
    }
  };

  // ---------- auto-lock ----------
  let activityTimer = null;
  // Mutate directly (no emit) so we don't trigger a view re-render on every click/keystroke.
  const pokeActivity = () => { State.get().lastActivity = Date.now(); };
  const startAutoLock = () => {
    ['click','keydown','touchstart','scroll'].forEach(ev =>
      document.addEventListener(ev, pokeActivity, { passive: true })
    );
    if (activityTimer) clearInterval(activityTimer);
    activityTimer = setInterval(() => {
      const s = State.get();
      const ms = s.user?.autoLockMs || 60_000;
      if (ms > 0 && !s.locked && Date.now() - s.lastActivity > ms) lock();
    }, 5_000);
  };

  const setAutoLockMs = async (ms) => {
    const user = State.get().user;
    user.autoLockMs = ms;
    await DB.setMeta('user', user);
    State.set({ user });
  };

  const changePin = async (currentPin, newPin) => {
    const user = State.get().user;
    const cur = await Crypto.hashPin(currentPin, user.salt);
    if (!Crypto.safeEqual(cur, user.pinHash)) throw new Error('wrong pin');
    if (!/^\d{4,8}$/.test(newPin)) throw new Error('pin must be 4-8 digits');
    const salt = Crypto.randomSalt();
    const pinHash = await Crypto.hashPin(newPin, salt);
    user.salt = salt; user.pinHash = pinHash;
    await DB.setMeta('user', user);
    State.set({ user });
  };

  const wipe = async () => {
    indexedDB.deleteDatabase('retro_cash_db');
    location.reload();
  };

  return {
    init, lock, finishUnlock,
    supportsBio, enrollBiometric, disableBiometric, tryBiometric,
    startAutoLock, setAutoLockMs, changePin, wipe
  };
})();
