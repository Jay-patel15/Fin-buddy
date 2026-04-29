/* ============================================================
   Cryptography helpers — PBKDF2 hashing, AES-GCM optional encrypt
   Uses the Web Crypto API. PIN/password is never stored in plaintext.
   ============================================================ */

const Crypto = (() => {
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  const buf2hex = (buf) =>
    Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');

  const hex2buf = (hex) => {
    const a = new Uint8Array(hex.length / 2);
    for (let i = 0; i < a.length; i++) a[i] = parseInt(hex.substr(i*2, 2), 16);
    return a;
  };

  const randomSalt = (len = 16) => {
    const a = new Uint8Array(len);
    crypto.getRandomValues(a);
    return buf2hex(a);
  };

  // PBKDF2 hash for PIN/password — returns hex
  const hashPin = async (pin, saltHex, iterations = 150000) => {
    const keyMat = await crypto.subtle.importKey(
      'raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']
    );
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: hex2buf(saltHex), iterations, hash: 'SHA-256' },
      keyMat, 256
    );
    return buf2hex(bits);
  };

  // constant-time-ish compare (string equality is fine for fixed-length hex, but safer this way)
  const safeEqual = (a, b) => {
    if (a.length !== b.length) return false;
    let r = 0;
    for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return r === 0;
  };

  // Derive an AES-GCM key from PIN — used for optional payload encryption
  const deriveKey = async (pin, saltHex) => {
    const keyMat = await crypto.subtle.importKey(
      'raw', enc.encode(pin), 'PBKDF2', false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: hex2buf(saltHex), iterations: 150000, hash: 'SHA-256' },
      keyMat,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  };

  const encrypt = async (key, plain) => {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plain));
    return { iv: buf2hex(iv), ct: buf2hex(ct) };
  };

  const decrypt = async (key, ivHex, ctHex) => {
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: hex2buf(ivHex) }, key, hex2buf(ctHex)
    );
    return dec.decode(pt);
  };

  return { randomSalt, hashPin, safeEqual, deriveKey, encrypt, decrypt };
})();
