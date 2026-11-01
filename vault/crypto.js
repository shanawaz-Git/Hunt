/* =====================================================================
   crypto.js — shared by index.html and builder.html
   - Content is encrypted with a random AES-256-GCM key.
   - Each person gets an "access slot": that content key, encrypted with
     a key derived from THEIR passcode (PBKDF2-SHA256, 600,000 rounds).
   - No passcode or hash is stored anywhere. A wrong passcode simply
     fails the AES-GCM authentication check.
   ===================================================================== */
const VaultCrypto = (() => {
  'use strict';

  const ITER = 600000;
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  const toB64 = (buf) => {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(s);
  };

  const fromB64 = (b64) => {
    const s = atob(b64);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  };

  const available = () => !!(globalThis.crypto && globalThis.crypto.subtle);

  async function passKey(pass, kdf) {
    const base = await crypto.subtle.importKey(
      'raw', enc.encode(String(pass).normalize('NFC')), 'PBKDF2', false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: fromB64(kdf.salt), iterations: kdf.iter, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
    );
  }

  async function seal(key, obj) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
    return { iv: toB64(iv), ct: toB64(ct) };
  }

  async function open(key, box) {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(box.iv) }, key, fromB64(box.ct));
    return JSON.parse(dec.decode(pt));
  }

  const newKdf = () => ({ salt: toB64(crypto.getRandomValues(new Uint8Array(16))), iter: ITER });

  const newContentKey = () =>
    crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);

  async function makeSlot(kdf, pass, name, contentKey) {
    const k = await passKey(pass, kdf);
    const raw = await crypto.subtle.exportKey('raw', contentKey);
    return seal(k, { k: toB64(raw), n: name });
  }

  /* Returns { data, name, slot, contentKey } or null if the passcode is wrong. */
  async function unlock(vault, pass) {
    const k = await passKey(pass, vault.kdf);
    for (let i = 0; i < vault.slots.length; i++) {
      let slot;
      try { slot = await open(k, vault.slots[i]); } catch (e) { continue; }
      const contentKey = await crypto.subtle.importKey(
        'raw', fromB64(slot.k), { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']
      );
      const data = await open(contentKey, vault.payload);
      return { data, name: slot.n, slot: i, contentKey };
    }
    return null;
  }

  return { ITER, available, seal, open, newKdf, newContentKey, makeSlot, unlock, toB64, fromB64 };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = VaultCrypto;
