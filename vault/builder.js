/* =====================================================================
   builder.js — create / edit the encrypted vault.js
   Runs entirely in your browser. Nothing is sent anywhere.
   ===================================================================== */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const human = (bytes) => {
    const k = bytes / 1024;
    return k >= 1024 ? (k / 1024).toFixed(2) + ' MB' : Math.max(1, Math.round(k)) + ' KB';
  };
  const kb = (b64chars) => human(b64chars * 0.75); // size of base64 data
  const MIN_PASS = 8;

  /* ---------- state ---------- */
  const S = {
    source: window.VAULT || null, // encrypted vault currently loaded (for unlocking)
    data: null,                   // plaintext content being edited
    slots: [],                    // { name, box } existing  |  { name, pass } new
    kdf: null,
    key: null,                    // content key (CryptoKey)
    dirty: false,
  };

  const blank = () => ({
    meta: { title: 'Our Little Universe', subtitle: '', names: [], since: '', tagline: '', idleLock: 10 },
    memories: [], gallery: [], notes: [], dates: [],
  });

  function normalize(d) {
    const b = blank();
    d = d && typeof d === 'object' ? d : {};
    d.meta = Object.assign(b.meta, d.meta || {});
    if (typeof d.meta.names === 'string') d.meta.names = d.meta.names.split(',').map((s) => s.trim()).filter(Boolean);
    for (const k of ['memories', 'gallery', 'notes', 'dates']) if (!Array.isArray(d[k])) d[k] = [];
    delete d.access;
    return d;
  }

  const SPECS = {
    memories: {
      one: 'memory',
      blank: () => ({ date: '', title: '', place: '', text: '', image: '' }),
      fields: [
        { k: 'date', t: 'date', l: 'date' },
        { k: 'title', t: 'text', l: 'title', ph: 'the day we first met' },
        { k: 'place', t: 'text', l: 'place', ph: 'where it happened' },
        { k: 'image', t: 'image', l: 'photo (optional)' },
        { k: 'text', t: 'area', l: 'the story', rows: 4, ph: 'what happened, what it meant…' },
      ],
    },
    gallery: {
      one: 'photo',
      blank: () => ({ src: '', caption: '', date: '' }),
      fields: [
        { k: 'src', t: 'image', l: 'photo' },
        { k: 'caption', t: 'text', l: 'caption' },
        { k: 'date', t: 'date', l: 'date' },
      ],
    },
    notes: {
      one: 'note',
      blank: () => ({ title: '', from: '', to: '', date: '', body: '' }),
      fields: [
        { k: 'title', t: 'text', l: 'title', ph: 'read_this_first' },
        { k: 'from', t: 'text', l: 'from' },
        { k: 'to', t: 'text', l: 'to' },
        { k: 'date', t: 'date', l: 'date' },
        { k: 'body', t: 'area', l: 'message', rows: 8 },
      ],
    },
    dates: {
      one: 'date',
      blank: () => ({ title: '', date: '', kind: 'anniversary', repeat: true, note: '' }),
      fields: [
        { k: 'title', t: 'text', l: 'title', ph: 'our anniversary' },
        { k: 'date', t: 'date', l: 'date (original)' },
        { k: 'kind', t: 'select', l: 'type', opts: ['anniversary', 'birthday', 'event', 'other'] },
        { k: 'repeat', t: 'check', l: 'repeats every year' },
        { k: 'note', t: 'text', l: 'note', wide: true },
      ],
    },
  };

  /* ---------- ui helpers ---------- */
  let toastT = 0;
  function toast(msg, kind = '') {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast on ' + kind;
    clearTimeout(toastT);
    toastT = setTimeout(() => { t.className = 'toast ' + kind; }, 3200);
  }
  function dirty() { S.dirty = true; }
  window.addEventListener('beforeunload', (e) => { if (S.dirty) { e.preventDefault(); e.returnValue = ''; } });

  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }

  function readText(file) {
    return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsText(file); });
  }

  async function compress(file, max = 1600, q = 0.82) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      return c.toDataURL('image/jpeg', q);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function strength(p) {
    if (!p) return 0;
    let s = 0;
    if (p.length >= MIN_PASS) s++;
    if (p.length >= 12) s++;
    if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++;
    if (/\d/.test(p)) s++;
    if (/[^A-Za-z0-9]/.test(p)) s++;
    if (/^\d+$/.test(p)) s = Math.min(s, 1);
    if (p.length < MIN_PASS) s = 0;
    return s;
  }
  function paintMeter(el, p) {
    const s = strength(p);
    const label = !p ? '' : p.length < MIN_PASS ? `too short · min ${MIN_PASS}`
      : /^\d+$/.test(p) ? 'numbers only · crackable in hours'
        : s <= 2 ? 'weak' : s === 3 ? 'fair' : 'strong';
    el.className = 'meter s' + s;
    el.textContent = p ? '▮'.repeat(s) + '▯'.repeat(5 - s) + '  ' + label : '';
  }

  /* =================================================================
     START SCREEN
     ================================================================= */
  function parseVaultText(txt) {
    const a = txt.indexOf('{'), b = txt.lastIndexOf('}');
    if (a < 0 || b < a) throw new Error('not a vault file');
    const v = JSON.parse(txt.slice(a, b + 1));
    if (!v.kdf || !Array.isArray(v.slots) || !v.payload) throw new Error('not a vault file');
    return v;
  }

  function showSource() {
    const info = $('#existingInfo');
    if (!VaultCrypto.available()) {
      info.innerHTML = '<span style="color:var(--red)">Web Crypto unavailable. Open this page in Chrome, Edge, Firefox or Safari (file:// or https://).</span>';
      return;
    }
    if (S.source) {
      const when = S.source.updated ? new Date(S.source.updated).toLocaleString() : 'unknown';
      info.textContent = `vault found · ${kb(S.source.payload.ct.length)} · ${S.source.slots.length} access slot(s) · updated ${when}`;
      $('#unlockForm').hidden = false;
    } else {
      info.textContent = 'no vault.js next to this page. load one, or create a new vault.';
      $('#unlockForm').hidden = true;
    }
  }

  $('#loadVault').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      S.source = parseVaultText(await readText(f));
      showSource();
      $('#unlockStatus').className = 'status ok';
      $('#unlockStatus').textContent = `loaded ${f.name}. enter a passcode to unlock it.`;
      $('#unlockPass').focus();
    } catch (err) {
      $('#unlockStatus').className = 'status err';
      $('#unlockStatus').textContent = `could not read ${f.name}: ${err.message}`;
    }
  });

  $('#unlockForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const st = $('#unlockStatus');
    const pass = $('#unlockPass').value;
    if (!pass) return;
    st.className = 'status dim';
    st.textContent = 'deriving key…';
    let res = null;
    try { res = await VaultCrypto.unlock(S.source, pass); } catch (err) { console.error(err); }
    if (!res) { st.className = 'status err'; st.textContent = 'ACCESS DENIED · wrong passcode'; return; }
    $('#unlockPass').value = '';
    const names = Array.isArray(res.data.access) ? res.data.access : [];
    S.key = res.contentKey;
    S.kdf = S.source.kdf;
    S.slots = S.source.slots.map((box, i) => ({ name: names[i] || (i === res.slot ? res.name : `slot ${i + 1}`), box }));
    S.data = normalize(res.data);
    enterEditor('memories');
    toast(`unlocked as ${res.name}`);
  });

  $('#newVault').addEventListener('click', () => {
    S.data = blank();
    S.key = null; S.kdf = null;
    S.slots = [{ name: '', pass: '' }];
    S.dirty = true;
    enterEditor('settings');
  });

  $('#importBackup').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const obj = JSON.parse(await readText(f));
      if (!obj || typeof obj !== 'object' || !obj.meta) throw new Error('not a vault backup');
      S.data = normalize(obj);
      S.key = null; S.kdf = null;
      S.slots = [{ name: '', pass: '' }];
      S.dirty = true;
      enterEditor('access');
      toast('backup imported · set passcodes in ACCESS');
    } catch (err) {
      toast(`import failed: ${err.message}`, 'err');
    }
  });

  /* =================================================================
     EDITOR
     ================================================================= */
  function enterEditor(tab) {
    $('#start').hidden = true;
    $('#editor').hidden = false;
    fillSettings();
    renderAccess();
    Object.keys(SPECS).forEach(renderList);
    go(tab);
  }

  function go(p) {
    $$('.b-tabs [data-p]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.p === p)));
    $$('.b-panel').forEach((el) => { el.hidden = el.dataset.p !== p; });
    if (p === 'export') updateSummary();
    window.scrollTo(0, 0);
  }
  $('.b-tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-p]'); if (b) go(b.dataset.p); });

  function updateCounts() {
    for (const k of Object.keys(SPECS)) { const el = $(`[data-count="${k}"]`); if (el) el.textContent = S.data[k].length; }
    $('[data-count="access"]').textContent = S.slots.length;
  }

  /* ---------- settings ---------- */
  function fillSettings() {
    $$('[data-meta]').forEach((el) => {
      const k = el.dataset.meta;
      const v = S.data.meta[k];
      el.value = k === 'names' ? (v || []).join(', ') : (v ?? '');
    });
  }
  $$('[data-meta]').forEach((el) => el.addEventListener('input', () => {
    const k = el.dataset.meta;
    if (k === 'names') S.data.meta.names = el.value.split(',').map((s) => s.trim()).filter(Boolean);
    else if (k === 'idleLock') S.data.meta.idleLock = Math.max(0, parseInt(el.value, 10) || 0);
    else S.data.meta[k] = el.value;
    dirty();
  }));

  /* ---------- access ---------- */
  function renderAccess() {
    const el = $('#accessList');
    el.innerHTML = S.slots.length ? S.slots.map((s, i) => s.box ? `
      <div class="frame b-slot locked" data-i="${i}">
        <span class="ico">🔒</span>
        <div><b>${esc(s.name)}</b><small>passcode set · hidden, cannot be recovered</small></div>
        <button class="btn sm danger" type="button" data-sact="del">revoke</button>
      </div>` : `
      <div class="frame b-slot" data-i="${i}">
        <label class="f"><span>name (shown when they unlock)</span><input data-s="name" value="${esc(s.name)}" placeholder="e.g. Shanawaz" autocomplete="off"></label>
        <div class="f"><span>passcode</span>
          <span class="pw"><input type="password" data-s="pass" value="${esc(s.pass || '')}" autocomplete="new-password" placeholder="min ${MIN_PASS} characters" aria-label="Passcode for person ${i + 1}"><button type="button" data-sact="peek">show</button></span>
          <span class="meter" data-meter></span>
        </div>
        <button class="btn sm danger" type="button" data-sact="del">remove</button>
      </div>`).join('') : '<p class="empty">// nobody has access. add at least one person.</p>';
    $$('.b-slot:not(.locked)', el).forEach((row) => paintMeter($('[data-meter]', row), S.slots[+row.dataset.i].pass));
    updateCounts();
  }

  $('#accessList').addEventListener('input', (e) => {
    const k = e.target.dataset.s;
    if (!k) return;
    const row = e.target.closest('.b-slot');
    S.slots[+row.dataset.i][k] = e.target.value;
    if (k === 'pass') paintMeter($('[data-meter]', row), e.target.value);
    dirty();
  });
  $('#accessList').addEventListener('click', (e) => {
    const b = e.target.closest('[data-sact]');
    if (!b) return;
    const row = b.closest('.b-slot');
    const i = +row.dataset.i;
    if (b.dataset.sact === 'peek') {
      const inp = $('[data-s="pass"]', row);
      inp.type = inp.type === 'password' ? 'text' : 'password';
      b.textContent = inp.type === 'password' ? 'show' : 'hide';
      return;
    }
    if (b.dataset.sact === 'del') {
      const s = S.slots[i];
      if (s.box && !confirm(`Revoke access for "${s.name}"?\n\nTheir passcode stops working on the NEW vault.js you export. Anyone who already copied the old file can still open that old copy.`)) return;
      S.slots.splice(i, 1);
      dirty();
      renderAccess();
    }
  });
  $('#addPerson').addEventListener('click', () => {
    S.slots.push({ name: '', pass: '' });
    dirty();
    renderAccess();
    const inputs = $$('#accessList [data-s="name"]');
    if (inputs.length) inputs[inputs.length - 1].focus();
  });
  $('#rekey').addEventListener('click', () => {
    if (!confirm('Re-key the vault?\n\nA brand-new encryption key is generated and EVERY person must be given a passcode again. Use this to fully revoke someone.')) return;
    S.key = null; S.kdf = null;
    S.slots = S.slots.map((s) => ({ name: s.name, pass: '' }));
    if (!S.slots.length) S.slots.push({ name: '', pass: '' });
    dirty();
    renderAccess();
    toast('re-keyed · set a passcode for each person');
  });

  /* ---------- generic lists ---------- */
  function fieldHTML(f, item) {
    const v = item[f.k];
    const wide = f.wide ? ' wide' : '';
    switch (f.t) {
      case 'area':
        return `<label class="f wide"><span>${f.l}</span><textarea data-k="${f.k}" rows="${f.rows || 4}" placeholder="${esc(f.ph || '')}">${esc(v)}</textarea></label>`;
      case 'select':
        return `<label class="f${wide}"><span>${f.l}</span><select data-k="${f.k}">${f.opts.map((o) => `<option${o === v ? ' selected' : ''}>${o}</option>`).join('')}</select></label>`;
      case 'check':
        return `<label class="f check${wide}"><input type="checkbox" data-k="${f.k}"${v ? ' checked' : ''}><span>${f.l}</span></label>`;
      case 'image':
        return `<div class="f wide"><span>${f.l}</span><div class="img-box">
          ${v ? `<img src="${esc(v)}" alt="">` : '<em>no image</em>'}
          <div class="img-act">
            <label class="btn sm">${v ? 'replace' : 'upload'}<input type="file" accept="image/*" data-img="${f.k}" hidden></label>
            ${v ? `<button type="button" class="btn sm danger" data-act="clearimg" data-k="${f.k}">remove</button><small>${kb(v.length)}</small>` : ''}
          </div></div></div>`;
      default:
        return `<label class="f${wide}"><span>${f.l}</span><input type="${f.t}" data-k="${f.k}" value="${esc(v)}" placeholder="${esc(f.ph || '')}"></label>`;
    }
  }

  function renderList(list) {
    const el = $('#list-' + list), spec = SPECS[list], arr = S.data[list];
    el.innerHTML = arr.length ? arr.map((item, i) => `
      <article class="frame b-item" data-i="${i}">
        <header><b>#${pad(i + 1)}</b><span>${spec.one}</span>
          <span class="b-ctl">
            <button type="button" data-act="up"${i === 0 ? ' disabled' : ''} aria-label="Move up">↑</button>
            <button type="button" data-act="down"${i === arr.length - 1 ? ' disabled' : ''} aria-label="Move down">↓</button>
            <button type="button" data-act="del" class="del" aria-label="Delete">✕</button>
          </span>
        </header>
        <div class="b-fields">${spec.fields.map((f) => fieldHTML(f, item)).join('')}</div>
      </article>`).join('') : '<p class="empty">// nothing here yet.</p>';
    updateCounts();
  }

  for (const list of Object.keys(SPECS)) {
    const el = $('#list-' + list);
    el.addEventListener('input', (e) => {
      const k = e.target.dataset.k;
      if (!k) return;
      const i = +e.target.closest('.b-item').dataset.i;
      S.data[list][i][k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
      dirty();
    });
    el.addEventListener('change', async (e) => {
      const k = e.target.dataset.img;
      if (!k || !e.target.files || !e.target.files[0]) return;
      const i = +e.target.closest('.b-item').dataset.i;
      try {
        toast('compressing image…');
        S.data[list][i][k] = await compress(e.target.files[0]);
        dirty();
        renderList(list);
        toast('image added');
      } catch (err) {
        toast('could not read that image (HEIC? convert to JPG first)', 'err');
      }
    });
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const i = +b.closest('.b-item').dataset.i;
      const arr = S.data[list];
      switch (b.dataset.act) {
        case 'up': if (i > 0) [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; break;
        case 'down': if (i < arr.length - 1) [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]]; break;
        case 'del': if (!confirm(`Delete this ${SPECS[list].one}?`)) return; arr.splice(i, 1); break;
        case 'clearimg': arr[i][b.dataset.k] = ''; break;
        default: return;
      }
      dirty();
      renderList(list);
    });
  }

  $$('[data-add]').forEach((btn) => btn.addEventListener('click', () => {
    const list = btn.dataset.add;
    S.data[list].push(SPECS[list].blank());
    dirty();
    renderList(list);
    const items = $$('#list-' + list + ' .b-item');
    const last = items[items.length - 1];
    if (last) { last.scrollIntoView({ behavior: 'smooth', block: 'center' }); const first = $('input:not([type="file"]), textarea', last); if (first) first.focus({ preventScroll: true }); }
  }));

  $('#bulkPhotos').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    let ok = 0, bad = 0;
    for (const [n, f] of files.entries()) {
      toast(`compressing ${n + 1}/${files.length}…`);
      try {
        const src = await compress(f);
        S.data.gallery.push({ src, caption: f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '), date: '' });
        ok++;
      } catch (err) { bad++; }
    }
    if (ok) dirty();
    renderList('gallery');
    toast(`${ok} photo(s) added${bad ? ` · ${bad} failed (HEIC? convert to JPG)` : ''}`, bad ? 'err' : '');
  });

  /* =================================================================
     EXPORT
     ================================================================= */
  function plainData() {
    const d = JSON.parse(JSON.stringify(S.data));
    d.memories = d.memories.filter((m) => m.title || m.text || m.image || m.date);
    d.gallery = d.gallery.filter((g) => g.src);
    d.notes = d.notes.filter((n) => n.title || n.body);
    d.dates = d.dates.filter((x) => x.date);
    return d;
  }

  function updateSummary() {
    const d = plainData();
    const size = JSON.stringify(d).length * 1.34;
    const imgs = d.gallery.length + d.memories.filter((m) => m.image).length;
    const people = S.slots.map((s) => `${s.name || '(unnamed)'}${s.box ? ' 🔒' : ' · new'}`).join(', ') || 'NONE — add someone in ACCESS';
    $('#summary').textContent =
      `title      ${d.meta.title || '(none)'}\n` +
      `access     ${people}\n` +
      `memories   ${d.memories.length}\n` +
      `photos     ${imgs}  (gallery ${d.gallery.length})\n` +
      `notes      ${d.notes.length}\n` +
      `dates      ${d.dates.length}\n` +
      `est. size  ${human(size)}` + (size > 15 * 1024 * 1024 ? '   ⚠ heavy — slow on mobile data' : '') + '\n' +
      `cipher     AES-256-GCM · PBKDF2-SHA256 × ${VaultCrypto.ITER.toLocaleString('en-US')}`;
  }

  function validateAccess() {
    if (!S.slots.length) throw new Error('add at least one person in ACCESS');
    const fresh = S.slots.filter((s) => !s.box);
    for (const s of fresh) {
      if (!s.name || !s.name.trim()) throw new Error('every person needs a name (ACCESS tab)');
      if (!s.pass || s.pass.length < MIN_PASS) throw new Error(`passcode for "${s.name}" must be at least ${MIN_PASS} characters`);
    }
    const seen = new Set();
    for (const s of fresh) {
      if (seen.has(s.pass)) throw new Error('two people have the same passcode — give each person their own');
      seen.add(s.pass);
    }
    const names = S.slots.map((s) => s.name.trim().toLowerCase());
    if (new Set(names).size !== names.length) throw new Error('two people have the same name — make them unique');
  }

  async function buildVaultText(log) {
    validateAccess();
    if (!S.key) {
      log('generating new 256-bit content key…');
      S.key = await VaultCrypto.newContentKey();
      S.kdf = VaultCrypto.newKdf();
    }
    for (const s of S.slots) {
      if (s.box) continue;
      log(`sealing access slot for ${s.name.trim()} (pbkdf2 × ${S.kdf.iter.toLocaleString('en-US')})…`);
      s.box = await VaultCrypto.makeSlot(S.kdf, s.pass, s.name.trim(), S.key);
      s.name = s.name.trim();
      delete s.pass;
    }
    const data = plainData();
    data.access = S.slots.map((s) => s.name);
    log('encrypting payload…');
    const payload = await VaultCrypto.seal(S.key, data);
    log('verifying round-trip…');
    const back = await VaultCrypto.open(S.key, payload);
    if (JSON.stringify(back) !== JSON.stringify(data)) throw new Error('self-check failed — nothing was saved');
    const vault = { v: 1, updated: new Date().toISOString(), kdf: S.kdf, slots: S.slots.map((s) => s.box), payload };
    return '/* vault.js :: ENCRYPTED. Generated by builder.html on ' + vault.updated + '\n' +
      '   Safe to publish. Unreadable without a valid passcode. Do not edit by hand. */\n' +
      'window.VAULT = ' + JSON.stringify(vault) + ';\n';
  }

  $('#buildBtn').addEventListener('click', async () => {
    const out = $('#buildLog');
    const btn = $('#buildBtn');
    out.innerHTML = '';
    const log = (m) => { out.textContent += '> ' + m + '\n'; };
    btn.disabled = true;
    try {
      const text = await buildVaultText(log);
      download('vault.js', text, 'text/javascript');
      log(`done · vault.js (${human(text.length)}) downloaded`);
      S.source = parseVaultText(text);
      S.dirty = false;
      renderAccess();
      updateSummary();
      toast('vault.js downloaded');
    } catch (err) {
      console.error(err);
      out.innerHTML += `<span class="err">✕ ${esc(err.message)}</span>\n`;
      toast(err.message, 'err');
    } finally {
      btn.disabled = false;
    }
  });

  $('#backupBtn').addEventListener('click', () => {
    if (!confirm('This file is NOT encrypted. Anyone who opens it can read everything.\n\nKeep it offline. Download anyway?')) return;
    const d = new Date();
    download(`vault-backup-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.json`, JSON.stringify(plainData(), null, 2), 'application/json');
  });

  showSource();
})();
