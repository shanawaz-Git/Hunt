/* =====================================================================
   app.js — lock screen + vault renderer
   Content comes ONLY from the encrypted vault.js. Nothing readable
   lives in this file or in the page source.
   ===================================================================== */
(() => {
  'use strict';

  /* ---------- helpers ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const pad = (n, l = 2) => String(n).padStart(l, '0');
  const hex = (n) => '0x' + n.toString(16).toUpperCase().padStart(2, '0');
  const rnd = (s) => s[(Math.random() * s.length) | 0];
  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const GLYPHS = 'アカサタナハマヤラワガザダバパイキシチニヒミリギジビピウクスツヌフムユルグズブプエケセテネヘメレゲゼデベペオコソトノホモヨロヲゴゾドボポン0123456789ABCDEF$#<>/{}=+*';
  const SCRAMBLE = 'ABCDEF0123456789!@#$%&*<>/\\|{}[]=+-_';
  const DAY = 864e5;

  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* storage blocked */ } },
  };

  function parseDate(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }
  function fmtDate(s) {
    const d = parseDate(s);
    return d ? `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` : '';
  }
  function ordinal(n) {
    const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  /* =================================================================
     MATRIX RAIN
     ================================================================= */
  const Matrix = (() => {
    const cv = $('#matrix');
    const ctx = cv.getContext('2d');
    let w = 0, h = 0, fs = 16, cols = 0, drops = [], last = 0, raf = 0;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth; h = window.innerHeight;
      cv.width = Math.floor(w * dpr); cv.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      fs = w < 640 ? 14 : 16;
      cols = Math.ceil(w / fs);
      drops = Array.from({ length: cols }, () => Math.floor(Math.random() * -(h / fs)));
      ctx.fillStyle = '#020604';
      ctx.fillRect(0, 0, w, h);
    }
    function step() {
      ctx.fillStyle = 'rgba(2,6,4,0.10)';
      ctx.fillRect(0, 0, w, h);
      ctx.font = `${fs}px "JetBrains Mono", monospace`;
      for (let i = 0; i < cols; i++) {
        const y = drops[i] * fs;
        if (y > 0) {
          const r = Math.random();
          ctx.fillStyle = r < 0.015 ? '#ff2e88' : r < 0.08 ? '#c8ffdc' : '#00ff66';
          ctx.fillText(rnd(GLYPHS), i * fs, y);
        }
        if (y > h && Math.random() > 0.975) drops[i] = 0;
        drops[i]++;
      }
    }
    function loop(t) {
      raf = requestAnimationFrame(loop);
      if (t - last < 55) return;
      last = t;
      step();
    }
    function start() {
      cancelAnimationFrame(raf);
      if (REDUCED) { for (let i = 0; i < 90; i++) step(); return; }
      raf = requestAnimationFrame(loop);
    }
    function stop() { cancelAnimationFrame(raf); }

    let lastW = 0, lastH = 0, rt = 0;
    window.addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => {
        // ignore tiny height changes from mobile address bars
        if (window.innerWidth === lastW && Math.abs(window.innerHeight - lastH) < 120) return;
        lastW = window.innerWidth; lastH = window.innerHeight;
        resize(); start();
      }, 150);
    });
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
    lastW = window.innerWidth; lastH = window.innerHeight;
    resize(); start();
    return { start, stop };
  })();

  /* =================================================================
     LOCK SCREEN
     ================================================================= */
  const V = window.VAULT;
  const form = $('#authForm');
  const input = $('#pass');
  const authBtn = $('#authBtn');
  const statusEl = $('#authStatus');
  const prog = $('#progress');
  const FAIL_KEY = 'vault.fail';
  let busy = false, cdTimer = 0, skipBoot = false;

  const clockTimer = setInterval(() => { $('#clock').textContent = new Date().toTimeString().slice(0, 8); }, 1000);
  $('#clock').textContent = new Date().toTimeString().slice(0, 8);

  function flash(kind) {
    const f = $('#flash');
    f.className = 'flash';
    void f.offsetWidth;
    f.className = 'flash ' + kind;
  }
  function shake() {
    const t = $('#term');
    t.classList.remove('shake');
    void t.offsetWidth;
    t.classList.add('shake');
  }
  function setStatus(html, kind = '') {
    statusEl.className = 'status ' + kind;
    statusEl.innerHTML = html;
  }

  async function log(tag, text, kind = 'ok', pause = 110) {
    const el = document.createElement('div');
    el.className = 'ln';
    el.innerHTML = `<span class="tag ${kind}">${esc(tag)}</span> <span class="t"></span>`;
    $('#bootlog').appendChild(el);
    const t = el.lastElementChild;
    if (skipBoot || REDUCED) { t.textContent = text; return; }
    for (let i = 2; i <= text.length; i += 2) { t.textContent = text.slice(0, i); await sleep(9); if (skipBoot) break; }
    t.textContent = text;
    if (!skipBoot) await sleep(pause);
  }

  async function boot() {
    const skip = () => { skipBoot = true; };
    window.addEventListener('keydown', skip, { once: true });
    window.addEventListener('pointerdown', skip, { once: true });

    await log('[ OK ]', 'secure shell v4.2 :: session initialised');
    if (!VaultCrypto.available()) {
      await log('[ERR]', 'web crypto unavailable. open this page over https:// (or localhost).', 'err');
      return;
    }
    if (!V || !V.payload || !V.kdf || !Array.isArray(V.slots)) {
      await log('[ERR]', 'vault.js missing or damaged. build one with builder.html.', 'err');
      return;
    }
    const kb = (V.payload.ct.length * 0.75) / 1024;
    await log('[ OK ]', `encrypted payload located :: ${kb >= 1024 ? (kb / 1024).toFixed(2) + ' MB' : kb.toFixed(1) + ' KB'}`);
    await log('[ OK ]', `cipher aes-256-gcm :: kdf pbkdf2-sha256 × ${V.kdf.iter.toLocaleString('en-US')}`);
    await log('[ .. ]', 'tracing route .............. secure', 'dim');
    await log('[ !! ]', 'authorisation required', 'warn', 0);
    showPrompt();
  }

  function failState() { return store.get(FAIL_KEY) || { n: 0, until: 0 }; }

  function showPrompt() {
    form.hidden = false;
    if (failState().until > Date.now()) cooldown();
    else if (window.matchMedia('(hover: hover)').matches) input.focus();
  }

  function setLocked(on) { input.disabled = on; authBtn.disabled = on; }

  function cooldown() {
    clearInterval(cdTimer);
    const tick = () => {
      const left = failState().until - Date.now();
      if (left <= 0) {
        clearInterval(cdTimer);
        setLocked(false);
        setStatus('lockout cleared. try again.', 'dim');
        input.focus();
        return;
      }
      setLocked(true);
      setStatus(`too many failed attempts · terminal locked for <b>${Math.ceil(left / 1000)}s</b>`, 'err');
    };
    tick();
    cdTimer = setInterval(tick, 250);
  }

  function runProgress() {
    prog.hidden = false;
    const bar = $('.bar', prog), hx = $('.hex', prog);
    bar.classList.remove('bad');
    bar.style.width = '0%';
    let p = 0;
    const t = setInterval(() => {
      p += (92 - p) * 0.08;
      bar.style.width = p + '%';
      hx.textContent = Array.from({ length: 10 }, () => rnd('0123456789ABCDEF') + rnd('0123456789ABCDEF')).join(' ');
    }, 60);
    return (ok) => {
      clearInterval(t);
      bar.style.width = '100%';
      bar.classList.toggle('bad', !ok);
      hx.textContent = ok ? 'KEY MATCH · PAYLOAD INTEGRITY VERIFIED' : 'AUTH TAG MISMATCH · KEY REJECTED';
    };
  }

  $('#peek').addEventListener('click', (e) => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    e.currentTarget.textContent = show ? 'hide' : 'show';
    e.currentTarget.setAttribute('aria-pressed', String(show));
    input.focus();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy) return;
    const pass = input.value;
    if (!pass) { setStatus('passcode required.', 'warn'); shake(); return; }
    if (failState().until > Date.now()) { cooldown(); return; }

    busy = true;
    setLocked(true);
    setStatus('deriving key · decrypting payload…', 'dim');
    const done = runProgress();
    const [res] = await Promise.all([
      VaultCrypto.unlock(V, pass).catch((err) => { console.error(err); return null; }),
      sleep(REDUCED ? 150 : 1100),
    ]);
    done(!!res);
    if (res) { granted(res); return; }

    busy = false;
    const f = failState();
    f.n += 1;
    if (f.n % 5 === 0) f.until = Date.now() + Math.min(30000 * 2 ** (f.n / 5 - 1), 600000);
    store.set(FAIL_KEY, f);
    flash('deny');
    shake();
    input.value = '';
    setLocked(false);
    setStatus(`<b>ACCESS DENIED</b> · invalid passcode · attempt ${f.n}`, 'err');
    if (f.until > Date.now()) cooldown(); else input.focus();
  });

  async function granted(res) {
    store.del(FAIL_KEY);
    input.value = '';
    flash('grant');
    setStatus(`<b>ACCESS GRANTED</b> · welcome, ${esc(res.name || 'operator')}`, 'ok');
    await sleep(REDUCED ? 100 : 1000);
    openVault(res.data, res.name || 'operator');
  }

  /* =================================================================
     VAULT
     ================================================================= */
  let D = null, WHO = '', sessionStart = 0, lastActive = 0, idleMs = 0, tickTimer = 0, io = null;

  function normalize(d) {
    d = d && typeof d === 'object' ? d : {};
    d.meta = Object.assign({ title: 'Private Vault', subtitle: '', names: [], since: '', tagline: '', idleLock: 10 }, d.meta || {});
    if (typeof d.meta.names === 'string') d.meta.names = d.meta.names.split(',').map((s) => s.trim()).filter(Boolean);
    if (!Array.isArray(d.meta.names)) d.meta.names = [];
    for (const k of ['memories', 'gallery', 'notes', 'dates']) if (!Array.isArray(d[k])) d[k] = [];
    return d;
  }

  function openVault(data, who) {
    D = normalize(data);
    WHO = who;
    sessionStart = lastActive = Date.now();
    idleMs = Math.max(0, Number(D.meta.idleLock) || 0) * 60000;
    clearInterval(clockTimer);

    document.title = D.meta.title || 'vault';
    $('#brandTitle').textContent = D.meta.title || 'vault';

    renderHome(); renderMemories(); renderGallery(); renderNotes(); renderDates(); renderStatus();

    $('#lock').classList.add('out');
    setTimeout(() => {
      $('#lock').hidden = true;
      $('#vault').hidden = false;
      document.body.classList.add('unlocked');
      const start = (location.hash || '').slice(1);
      go(['home', 'memories', 'gallery', 'notes', 'dates'].includes(start) ? start : 'home');
      tick();
      tickTimer = setInterval(tick, 1000);
    }, REDUCED ? 0 : 550);

    ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll'].forEach((ev) =>
      window.addEventListener(ev, () => { lastActive = Date.now(); }, { passive: true }));
  }

  function lock() {
    clearInterval(tickTimer);
    D = null;
    $('#vault').innerHTML = '';
    $('#lightbox').hidden = true;
    history.replaceState(null, '', location.pathname + location.search);
    location.reload();
  }

  /* ---------- tabs ---------- */
  function go(tab) {
    $$('.tabs [data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    $$('.panel').forEach((p) => {
      const on = p.id === 'tab-' + tab;
      p.hidden = !on;
      if (on) { p.classList.remove('enter'); void p.offsetWidth; p.classList.add('enter'); }
    });
    const active = $('.tabs [aria-selected="true"]');
    if (active) active.scrollIntoView({ block: 'nearest', inline: 'center' });
    history.replaceState(null, '', '#' + tab);
    window.scrollTo(0, 0);
    observeReveals();
  }

  function observeReveals() {
    const els = $$('.reveal:not(.in)');
    if (REDUCED || !('IntersectionObserver' in window)) { els.forEach((el) => el.classList.add('in')); return; }
    if (!io) {
      io = new IntersectionObserver((entries) => {
        entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
      }, { rootMargin: '0px 0px -6% 0px' });
    }
    els.forEach((el) => io.observe(el));
  }

  const head = (name, desc, n) =>
    `<header class="sec-head"><h2><span class="pfx">~/</span>${name}</h2><p>${desc}</p><span class="count">[${pad(n)}]</span></header>`;
  const empty = (msg) => `<p class="empty">// ${msg}</p>`;

  /* ---------- dates logic ---------- */
  function nextOccurrence(dateStr, repeat) {
    const d = parseDate(dateStr);
    if (!d) return null;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (!repeat) return { at: d, isToday: +d === +today, past: d < today, n: null };
    let y = today.getFullYear();
    let at = new Date(y, d.getMonth(), d.getDate());
    if (at < today) { y += 1; at = new Date(y, d.getMonth(), d.getDate()); }
    return { at, isToday: +at === +today, past: false, n: y - d.getFullYear() };
  }
  function allDates() {
    return D.dates
      .map((x, i) => { const o = nextOccurrence(x.date, x.repeat); return o ? Object.assign({}, x, o, { i, ts: +o.at }) : null; })
      .filter(Boolean)
      .sort((a, b) => (a.past - b.past) || (a.past ? b.ts - a.ts : a.ts - b.ts));
  }
  function countdown(ts, mode, now) {
    const diff = ts - now;
    if (diff <= 0 && diff > -DAY) return mode === 'short' ? 'today ❤' : '▸ TODAY ◂';
    if (diff <= -DAY) {
      const d = Math.floor(-diff / DAY);
      return mode === 'short' ? `${d}d ago` : `${d.toLocaleString('en-US')} days ago`;
    }
    let s = Math.floor(diff / 1000);
    const d = Math.floor(s / 86400);
    s %= 86400;
    if (mode === 'short') return d > 0 ? `in ${d} day${d === 1 ? '' : 's'}` : `in ${Math.max(1, Math.ceil(s / 3600))}h`;
    return `T-${d}d ${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  }

  /* ---------- HOME ---------- */
  function renderHome() {
    const m = D.meta;
    const names = m.names.filter(Boolean).map(esc).join('<span class="heart">❤</span>');
    const next = allDates().find((x) => !x.past);
    const now = new Date();
    const otd = D.memories
      .map((x, i) => ({ x, i, d: parseDate(x.date) }))
      .filter((o) => o.d && o.d.getMonth() === now.getMonth() && o.d.getDate() === now.getDate() && o.d.getFullYear() < now.getFullYear());

    const stat = (tab, n, k, u) =>
      `<button class="frame stat" data-go="${tab}"><span class="k">${k}</span><b class="v">${pad(n)}</b><span class="u">${u}</span></button>`;

    $('#tab-home').innerHTML = `
      <div class="hero">
        <p class="eyebrow">// session opened for <b>${esc(WHO)}</b></p>
        <h1 class="title glitch" data-text="${esc(m.title)}">${esc(m.title)}</h1>
        ${m.subtitle ? `<p class="subtitle">${esc(m.subtitle)}</p>` : ''}
        ${names ? `<p class="names">${names}</p>` : ''}
      </div>
      ${parseDate(m.since) ? `
      <section class="frame uptime">
        <div class="label">connection uptime · since ${fmtDate(m.since)}</div>
        <div class="counter" id="uptime">
          <div><b data-u="d">0</b><span>days</span></div>
          <div><b data-u="h">00</b><span>hours</span></div>
          <div><b data-u="m">00</b><span>mins</span></div>
          <div><b data-u="s">00</b><span>secs</span></div>
        </div>
      </section>` : ''}
      <div class="stats">
        ${stat('memories', D.memories.length, 'memories', 'logged')}
        ${stat('gallery', D.gallery.length, 'photos', 'archived')}
        ${stat('notes', D.notes.length, 'notes', 'encrypted')}
        ${next
          ? `<button class="frame stat" data-go="dates"><span class="k">next event</span><b class="v sm">${esc(next.title || 'untitled')}</b><span class="u" data-target="${next.ts}" data-mode="short"></span></button>`
          : stat('dates', D.dates.length, 'dates', 'tracked')}
      </div>
      ${otd.length ? `
      <section class="frame otd">
        <div class="label">❤ on this day</div>
        <ul>${otd.map((o) => `<li><button data-go="memories" data-mem="${o.i}">${esc(o.x.title || 'a memory')}<small>${now.getFullYear() - o.d.getFullYear()} year${now.getFullYear() - o.d.getFullYear() === 1 ? '' : 's'} ago</small></button></li>`).join('')}</ul>
      </section>` : ''}
      ${m.tagline ? `<p class="tagline">&gt; ${esc(m.tagline)}<span class="cursor">_</span></p>` : ''}
    `;
  }

  /* ---------- MEMORIES ---------- */
  function renderMemories() {
    const list = D.memories.map((m, i) => Object.assign({}, m, { _i: i }))
      .sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
    const since = parseDate(D.meta.since);
    $('#tab-memories').innerHTML = head('memories', 'chronological log of us', list.length) + (list.length
      ? `<ol class="timeline">${list.map((m, n) => {
        const d = parseDate(m.date);
        const day = since && d && d >= since ? Math.round((d - since) / DAY) + 1 : null;
        return `
        <li class="mem reveal" id="mem-${m._i}">
          <div class="frame mem-card">
            <div class="mem-meta"><span class="mem-date">${fmtDate(m.date) || 'UNDATED'}</span><span>${day ? 'DAY ' + day.toLocaleString('en-US') : hex(n + 1)}</span></div>
            <h3>${esc(m.title || 'untitled')}</h3>
            ${m.place ? `<p class="mem-place">⌖ ${esc(m.place)}</p>` : ''}
            ${m.image ? `<button class="mem-img" data-lb="mem" data-i="${m._i}" aria-label="Open photo"><img src="${esc(m.image)}" alt="${esc(m.title || 'memory')}" loading="lazy"></button>` : ''}
            ${m.text ? `<p class="mem-text">${esc(m.text)}</p>` : ''}
          </div>
        </li>`;
      }).join('')}</ol>`
      : empty('no memories logged yet'));
  }

  /* ---------- GALLERY ---------- */
  function renderGallery() {
    $('#tab-gallery').innerHTML = head('gallery', 'visual records · tap to decode', D.gallery.length) + (D.gallery.length
      ? `<div class="gallery">${D.gallery.map((g, i) => `
        <figure class="shot reveal">
          <button data-lb="gallery" data-i="${i}" aria-label="Open ${esc(g.caption || 'photo ' + (i + 1))}"><img src="${esc(g.src)}" alt="${esc(g.caption || '')}" loading="lazy"></button>
          <figcaption><span>${esc(g.caption || 'IMG_' + pad(i + 1, 3))}</span>${g.date ? `<time>${fmtDate(g.date)}</time>` : ''}</figcaption>
        </figure>`).join('')}</div>`
      : empty('no photos archived yet'));
  }

  /* ---------- NOTES ---------- */
  const fileName = (n, i) =>
    ((n.title || 'note_' + (i + 1)).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 26) || 'note') + '.enc';
  const garble = (text, max) => text.slice(0, max).replace(/\S/g, () => rnd(SCRAMBLE)) + (text.length > max ? '…' : '');

  function renderNotes() {
    $('#tab-notes').innerHTML = head('notes', 'sealed messages · decrypt to read', D.notes.length) + (D.notes.length
      ? `<div class="notes">${D.notes.map((n, i) => `
        <article class="frame note reveal">
          <header><span class="file">▤ ${esc(fileName(n, i))}</span>${n.date ? `<time>${fmtDate(n.date)}</time>` : ''}</header>
          <h3>${esc(n.title || 'untitled')}</h3>
          ${n.from || n.to ? `<p class="fromto">${n.from ? `from <b>${esc(n.from)}</b>` : ''}${n.from && n.to ? ' <span>→</span> ' : ''}${n.to ? `to <b>${esc(n.to)}</b>` : ''}</p>` : ''}
          <pre class="note-body locked" aria-hidden="true">${esc(garble(n.body || '', 200))}</pre>
          <button class="btn sm" data-note="${i}" aria-expanded="false">[ decrypt ]</button>
        </article>`).join('')}</div>`
      : empty('no notes yet'));
  }

  function toggleNote(btn) {
    const i = +btn.dataset.note;
    const pre = btn.previousElementSibling;
    const text = (D.notes[i] && D.notes[i].body) || '';
    if (btn.getAttribute('aria-expanded') === 'true') {
      pre.classList.add('locked');
      pre.setAttribute('aria-hidden', 'true');
      pre.textContent = garble(text, 200);
      btn.textContent = '[ decrypt ]';
      btn.setAttribute('aria-expanded', 'false');
      return;
    }
    btn.textContent = '[ re-encrypt ]';
    btn.setAttribute('aria-expanded', 'true');
    pre.classList.remove('locked');
    pre.removeAttribute('aria-hidden');
    if (REDUCED) { pre.textContent = text; return; }
    const total = text.length, dur = Math.min(1600, 450 + total * 2), t0 = performance.now();
    const frame = (t) => {
      if (btn.getAttribute('aria-expanded') !== 'true') return;
      const p = Math.min(1, (t - t0) / dur);
      const n = Math.floor(total * p);
      pre.textContent = text.slice(0, n) + text.slice(n, n + 140).replace(/\S/g, () => rnd(SCRAMBLE));
      if (p < 1) requestAnimationFrame(frame); else pre.textContent = text;
    };
    requestAnimationFrame(frame);
  }

  /* ---------- DATES ---------- */
  function renderDates() {
    const list = allDates();
    $('#tab-dates').innerHTML = head('dates', 'countdowns · anniversaries · things we never forget', list.length) + (list.length
      ? `<div class="dates">${list.map((x) => {
        const kind = (x.kind || 'event').toLowerCase().replace(/[^a-z]/g, '') || 'event';
        const unit = kind === 'birthday' ? 'birthday' : kind === 'anniversary' ? 'anniversary' : 'year';
        return `
        <article class="frame date-card reveal k-${kind}${x.isToday ? ' today' : ''}${x.past ? ' past' : ''}">
          <div class="dc-top"><span class="dc-kind">${esc(kind)}</span><span class="dc-rep">${x.repeat ? '↻ yearly' : '● once'}</span></div>
          <h3>${esc(x.title || 'untitled')}</h3>
          <p class="dc-date">${fmtDate(x.date)}${x.repeat && x.n > 0 ? ` · ${ordinal(x.n)} ${unit}` : ''}${x.repeat ? ` · next ${pad(x.at.getDate())} ${MONTHS[x.at.getMonth()]} ${x.at.getFullYear()}` : ''}</p>
          <div class="dc-count" data-target="${x.ts}"></div>
          ${x.note ? `<p class="dc-note">${esc(x.note)}</p>` : ''}
        </article>`;
      }).join('')}</div>`
      : empty('no dates tracked yet'));
  }

  /* ---------- STATUS + TICK ---------- */
  function renderStatus() {
    $('#statusbar').innerHTML = `
      <span>usr <b>${esc(WHO)}</b></span>
      <span id="sbSess">sess 00:00:00</span>
      <span class="hide-sm">mem <b>${D.memories.length}</b> · img <b>${D.gallery.length}</b> · notes <b>${D.notes.length}</b></span>
      <span id="sbIdle">${idleMs ? `auto-lock ${D.meta.idleLock}m` : 'auto-lock off'}</span>
      <span class="hide-sm">keys 0-4 · L lock</span>`;
  }

  function tick() {
    if (!D) return;
    const now = Date.now();

    const since = parseDate(D.meta.since);
    const up = $('#uptime');
    if (up && since) {
      let s = Math.max(0, Math.floor((now - since) / 1000));
      const d = Math.floor(s / 86400); s %= 86400;
      const set = (k, v) => { const el = $(`[data-u="${k}"]`, up); if (el.textContent !== v) el.textContent = v; };
      set('d', d.toLocaleString('en-US'));
      set('h', pad(Math.floor(s / 3600)));
      set('m', pad(Math.floor((s % 3600) / 60)));
      set('s', pad(s % 60));
    }

    $$('[data-target]').forEach((el) => { el.textContent = countdown(+el.dataset.target, el.dataset.mode, now); });

    const ss = Math.floor((now - sessionStart) / 1000);
    const sb = $('#sbSess');
    if (sb) sb.textContent = `sess ${pad(Math.floor(ss / 3600))}:${pad(Math.floor((ss % 3600) / 60))}:${pad(ss % 60)}`;

    if (idleMs) {
      const left = idleMs - (now - lastActive);
      if (left <= 0) { lock(); return; }
      const il = $('#sbIdle');
      if (il) {
        il.classList.toggle('warn', left < 60000);
        il.textContent = left < 60000 ? `auto-lock in ${Math.ceil(left / 1000)}s` : `auto-lock ${D.meta.idleLock}m`;
      }
    }
  }

  /* ---------- LIGHTBOX ---------- */
  const LB = { list: [], i: 0, opener: null };
  function openLB(list, i) {
    if (!list.length) return;
    LB.list = list; LB.i = i; LB.opener = document.activeElement;
    $('#lightbox').hidden = false;
    document.body.classList.add('noscroll');
    showLB();
    $('#lbClose').focus();
  }
  function showLB() {
    const it = LB.list[LB.i];
    $('#lbImg').src = it.src;
    $('#lbImg').alt = it.caption || '';
    $('#lbCap').textContent = it.caption || '';
    $('#lbDate').textContent = it.date ? fmtDate(it.date) : '';
    $('#lbIdx').textContent = `${pad(LB.i + 1)} / ${pad(LB.list.length)}`;
    const multi = LB.list.length > 1;
    $('#lbPrev').hidden = !multi;
    $('#lbNext').hidden = !multi;
  }
  function closeLB() {
    $('#lightbox').hidden = true;
    $('#lbImg').removeAttribute('src');
    document.body.classList.remove('noscroll');
    if (LB.opener && LB.opener.focus) LB.opener.focus();
  }
  function navLB(dir) { LB.i = (LB.i + dir + LB.list.length) % LB.list.length; showLB(); }

  $('#lbClose').addEventListener('click', closeLB);
  $('#lbPrev').addEventListener('click', () => navLB(-1));
  $('#lbNext').addEventListener('click', () => navLB(1));
  $('#lbStage').addEventListener('click', (e) => { if (e.target.id === 'lbStage') closeLB(); });
  let tx = 0;
  $('#lightbox').addEventListener('touchstart', (e) => { tx = e.touches[0].clientX; }, { passive: true });
  $('#lightbox').addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - tx;
    if (Math.abs(dx) > 50 && LB.list.length > 1) navLB(dx < 0 ? 1 : -1);
  }, { passive: true });

  /* ---------- global events ---------- */
  document.addEventListener('click', (e) => {
    if (!D) return;
    const tab = e.target.closest('.tabs [data-tab]');
    if (tab) { go(tab.dataset.tab); return; }

    const goBtn = e.target.closest('[data-go]');
    if (goBtn) {
      go(goBtn.dataset.go);
      if (goBtn.dataset.mem) {
        const el = document.getElementById('mem-' + goBtn.dataset.mem);
        if (el) setTimeout(() => { el.classList.add('in'); el.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'center' }); }, 60);
      }
      return;
    }

    const lb = e.target.closest('[data-lb]');
    if (lb) {
      if (lb.dataset.lb === 'gallery') openLB(D.gallery.filter((g) => g.src).map((g) => ({ src: g.src, caption: g.caption, date: g.date })), +lb.dataset.i);
      else { const m = D.memories[+lb.dataset.i]; if (m) openLB([{ src: m.image, caption: m.title, date: m.date }], 0); }
      return;
    }

    const nb = e.target.closest('[data-note]');
    if (nb) toggleNote(nb);
  });

  $('#lockBtn').addEventListener('click', lock);

  document.addEventListener('keydown', (e) => {
    if (!D) return;
    if (!$('#lightbox').hidden) {
      if (e.key === 'Escape') closeLB();
      else if (e.key === 'ArrowRight') navLB(1);
      else if (e.key === 'ArrowLeft') navLB(-1);
      return;
    }
    if (e.target.closest('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey) return;
    const tabs = ['home', 'memories', 'gallery', 'notes', 'dates'];
    if (/^[0-4]$/.test(e.key)) go(tabs[+e.key]);
    else if (e.key === 'l' || e.key === 'L') lock();
  });

  boot();
})();
