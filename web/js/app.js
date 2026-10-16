// RailRunner page: screens, keys, swipes, saving, sound and the game loop.
// The rules are in core.js, the picture in render.js; this file connects them.
//
// Address parameters (for tests and README frames): ?seed=N - the run's world,
// ?manual=1 - the simulation only moves by RailRunner.advance(seconds).
(function () {
  'use strict';
  const VERSION = '1.0.0';
  const R = window.RRCore, I = window.RRI18n, A = window.RRAudio;
  const DT = R.C.DT;
  const STORE = 'railrunner:save';
  const params = new URLSearchParams(location.search);
  const MANUAL = params.get('manual') === '1';
  const FIXED_SEED = params.has('seed') ? Number(params.get('seed')) >>> 0 : null;
  const $ = (id) => document.getElementById(id);
  const canvas = $('view');

  // ---------- saving: everything under one key with the railrunner: prefix ----------
  function loadSave() {
    try { return R.sanitizeSave(localStorage.getItem(STORE)); } catch (e) { return R.defaultSave(); }
  }
  function persist() {
    try { localStorage.setItem(STORE, JSON.stringify(save)); } catch (e) { /* private mode: play without saving */ }
  }
  let save = loadSave();
  I.lang = save.settings.lang || I.detect(navigator);

  // ---------- the 3D view ----------
  let view;
  try {
    view = window.RRRender.create(canvas, { quality: save.settings.quality, preserve: params.get('preserve') === '1' });
  } catch (e) {
    const f = $('fatal');
    f.hidden = false;
    f.textContent = I.lang === 'ru' ? 'Не удалось запустить 3D (WebGL). Обновите браузер или видеодрайвер.' : 'Could not start 3D (WebGL). Please update the browser or the video driver.';
    window.RailRunner = { error: String(e && e.message || e) };
    return;
  }

  // ---------- state ----------
  let state = 'menu';           // menu | playing | countdown | paused | dying | over
  let overlay = null;           // which screen is shown
  let backTo = null;            // where "Done" returns from settings / upgrades / how to play
  let demo = true;              // the menu runs a demo with the autopilot behind the screens
  let run = null;
  let prev = { z: 0, x: 0, y: 0 };
  let acc = 0, countT = 0, deadT = 0, hintT = 0, toastT = 0, lastRecord = false;
  let capture = null;           // key rebinding: { action, slot }
  const seedNow = () => (FIXED_SEED !== null ? FIXED_SEED : (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0);

  function newDemo() {
    const r = R.newRun(FIXED_SEED !== null ? FIXED_SEED + 1 : seedNow(), { upgrades: save.upgrades });
    return r;
  }
  function setRun(r) {
    run = r;
    prev = { z: r.z, x: r.x, y: r.y };
    acc = 0;
  }
  setRun(newDemo());

  // ---------- screens ----------
  const SCREENS = ['menu', 'pause', 'over', 'settings', 'upgrades', 'howto'];
  function show(name) {
    overlay = name;
    for (const s of SCREENS) $('scr-' + s).hidden = s !== name;
    $('hud').hidden = !(state === 'playing' || state === 'countdown' || state === 'paused' || state === 'dying');
    const first = { menu: 'm-play', pause: 'p-resume', over: 'o-again', settings: 's-done', upgrades: 'u-done', howto: 'h-done' }[name];
    if (first) {
      const el = $(first);
      if (name === 'over') setTimeout(() => { if (overlay === 'over') el.focus({ preventScroll: true }); }, 450);
      else el.focus({ preventScroll: true });
    }
    if (name === 'menu') renderMenu();
    if (name === 'settings') renderSettings();
    if (name === 'upgrades') renderUpgrades();
    if (name === 'howto') renderHowto();
  }
  function openSub(name) {
    backTo = overlay;
    show(name);
  }
  function back() {
    capture = null;
    show(backTo || 'menu');
    backTo = null;
  }

  function start() {
    A.init();
    A.resume();
    demo = false;
    setRun(R.newRun(seedNow(), { upgrades: save.upgrades }));
    state = 'playing';
    deadT = 0;
    hintT = 4.5;
    show(null);
    A.music(true);
    A.play('click');
  }
  function pause() {
    if (state !== 'playing' && state !== 'countdown') return;
    state = 'paused';
    show('pause');
    A.suspend();
  }
  function resume() {
    if (state !== 'paused') return;
    state = 'countdown';
    countT = 1.5;
    show(null);
    A.resume();
  }
  function toMenu() {
    state = 'menu';
    demo = true;
    A.music(false);
    A.resume();
    setRun(newDemo());
    show('menu');
  }
  function finish() {
    state = 'over';
    const res = R.result(run);
    lastRecord = R.applyResult(save, res);
    persist();
    A.music(false);
    $('o-score').textContent = res.score;
    $('o-coins').textContent = res.coins;
    $('o-dist').textContent = I.t('meters', { n: res.distance });
    $('o-record').hidden = !lastRecord;
    $('o-best').textContent = I.t('record', { n: save.best });
    show('over');
    if (lastRecord) A.play('record');
  }

  // ---------- the loop ----------
  function simStep() {
    prev = { z: run.z, x: run.x, y: run.y };
    if (demo) R.autopilot(run);
    R.step(run, DT);
    handleEvents();
    if (demo && !run.alive) setRun(newDemo());
  }
  function tick(dt) {
    if (hintT > 0) hintT -= dt;
    if (toastT > 0) toastT -= dt;
    if (state === 'countdown') {
      countT -= dt;
      if (countT <= 0) { state = 'playing'; countT = 0; }
      return;
    }
    if (state === 'dying') {
      deadT += dt;
      if (deadT >= 1.0) finish();
      return;
    }
    if (!(state === 'playing' || (demo && state === 'menu'))) return;
    acc += dt;
    while (acc >= DT) { acc -= DT; simStep(); if (state === 'dying') { acc = 0; break; } }
  }
  function handleEvents() {
    for (const e of run.events) {
      if (demo) continue;
      A.play(e);
      if (e === 'bump') { view.kick(0.22); toast(I.t('bump')); }
      else if (e === 'board-break') { view.kick(0.35); toast(I.t('boardBroke')); }
      else if (e === 'crash') { view.kick(0.55); state = 'dying'; deadT = 0; A.music(false); }
      else if (e.startsWith('power:')) toast(I.t('p_' + e.slice(6)));
    }
    run.events.length = 0;
  }

  let last = performance.now(), fpsN = 0, fpsT = 0;
  const viewState = { z: 0, x: 0, y: 0, deadT: 0 };
  function draw(dt) {
    const moving = state === 'playing' || (demo && state === 'menu');
    const a = moving ? Math.min(1, acc / DT) : 1;
    viewState.z = prev.z + (run.z - prev.z) * a;
    viewState.x = prev.x + (run.x - prev.x) * a;
    viewState.y = prev.y + (run.y - prev.y) * a;
    viewState.deadT = deadT;
    view.draw(run, viewState, run.t + a * DT, moving || state === 'dying' ? dt : 0);
    updateHud();
  }
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (!(dt > 0)) dt = 0;
    if (dt > 0.1) dt = 0.1;
    fpsN++; fpsT += dt;
    if (fpsT >= 0.5) { if (save.settings.showFps) $('hud-fps').textContent = I.t('fps', { n: Math.round(fpsN / fpsT) }); fpsN = 0; fpsT = 0; }
    if (!MANUAL) tick(dt);
    draw(dt);
  }

  // ---------- HUD ----------
  const ICONS = {
    magnet: '<svg viewBox="0 0 24 24"><path d="M5 3h4v9a3 3 0 0 0 6 0V3h4v9a7 7 0 0 1-14 0z" fill="#e0322c"/><rect x="5" y="3" width="4" height="3" fill="#cfd6de"/><rect x="15" y="3" width="4" height="3" fill="#cfd6de"/></svg>',
    x2: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#ffcf2e"/><text x="12" y="16.5" font-size="11" font-weight="900" text-anchor="middle" fill="#b5121b" font-family="Arial">x2</text></svg>',
    boots: '<svg viewBox="0 0 24 24"><path d="M6 3h6v8l6 3v4H4V9z" fill="#2fbf5a"/><path d="M5 19h3l-1 2 1 2H5l1-2zM13 19h3l-1 2 1 2h-3l1-2z" fill="#cfd6de"/></svg>',
    board: '<svg viewBox="0 0 24 24"><rect x="2" y="9" width="20" height="6" rx="3" fill="#7d3cff"/><rect x="2" y="11" width="20" height="1.5" fill="#ff4fb8"/><rect x="2" y="13" width="20" height="1.2" fill="#4fe3ff"/></svg>',
  };
  const hudCache = {};
  function setText(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } }
  function updateHud() {
    if (demo) return;
    setText('hud-score', String(run.score));
    setText('hud-coins', String(run.coins));
    $('hud-mult').hidden = !(run.power.x2 > 0);
    const chips = R.POWERS.filter((k) => run.power[k] > 0)
      .map((k) => `<div class="chip" data-power="${k}">${ICONS[k]}<div class="bar"><i style="width:${Math.round(100 * run.power[k] / R.powerDuration(k, save.upgrades[k]))}%"></i></div></div>`).join('');
    if (hudCache.chips !== chips) { hudCache.chips = chips; $('hud-powers').innerHTML = chips; }
    const showHint = hintT > 0 && state === 'playing';
    $('hud-hint').classList.toggle('show', showHint);
    $('hud-toast').classList.toggle('show', toastT > 0);
    setText('hud-count', state === 'countdown' ? String(Math.max(1, Math.ceil(countT / 0.5))) : '');
  }
  function toast(text) {
    $('hud-toast').textContent = text;
    toastT = 1.3;
  }

  // ---------- texts ----------
  function keysVars() {
    const b = save.settings.bindings, l = I.lang;
    const v = {};
    for (const a of R.ACTIONS) v[a] = R.keysText(b, a, l);
    return v;
  }
  function updateHints() {
    const v = keysVars();
    $('hud-hint').textContent = I.t('startHint', v);
    $('p-hint').textContent = I.t('startHint', v) + ' · ' + I.t('pauseHint', v);
    $('m-hint').textContent = I.t('startHint', v) + ' · ' + I.t('pauseHint', v);
  }
  function applyTexts() {
    document.documentElement.lang = I.lang;
    document.title = I.t('title');
    for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = I.t(el.dataset.i18n);
    for (const el of document.querySelectorAll('[data-i18n-title]')) el.title = I.t(el.dataset.i18nTitle);
    for (const el of document.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', I.t(el.dataset.i18nAria));
    canvas.setAttribute('aria-label', I.t('title'));
    updateHints();
    if (overlay === 'menu') renderMenu();
    if (overlay === 'settings') renderSettings();
    if (overlay === 'upgrades') renderUpgrades();
    if (overlay === 'howto') renderHowto();
    if (overlay === 'over') {
      $('o-dist').textContent = I.t('meters', { n: R.result(run).distance });
      $('o-best').textContent = I.t('record', { n: save.best });
    }
  }
  function renderMenu() {
    $('m-best').textContent = save.best;
    $('m-coins').textContent = save.coins;
    $('m-ver').textContent = 'RailRunner ' + VERSION;
  }
  function renderHowto() {
    const v = keysVars();
    $('h-text').innerHTML = '';
    for (const line of I.t('howtoText', v)) { const li = document.createElement('li'); li.textContent = line; $('h-text').appendChild(li); }
    $('h-powers').innerHTML = '';
    for (const k of R.POWERS) {
      const li = document.createElement('li');
      li.textContent = `${I.t('p_' + k)} - ${I.t('pd_' + k)} (${I.t('seconds', { n: Math.round(R.powerDuration(k, save.upgrades[k])) })})`;
      $('h-powers').appendChild(li);
    }
  }

  // ---------- theme ----------
  const darkQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function resolvedTheme() {
    const t = save.settings.theme;
    if (t === 'light' || t === 'dark') return t;
    return darkQuery && darkQuery.matches ? 'dark' : 'light';
  }
  function applyTheme() {
    const t = resolvedTheme();
    document.documentElement.dataset.theme = t;
    view.setTheme(t);
  }
  if (darkQuery) {
    const onChange = () => { if (save.settings.theme === 'auto') applyTheme(); };
    if (darkQuery.addEventListener) darkQuery.addEventListener('change', onChange); else if (darkQuery.addListener) darkQuery.addListener(onChange);
  }

  // ---------- settings ----------
  function setSeg(id, value) {
    for (const b of $(id).querySelectorAll('button')) { b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(b.dataset.v === value)); }
  }
  function renderSettings() {
    const s = save.settings;
    setSeg('s-lang', I.lang);
    setSeg('s-theme', s.theme);
    setSeg('s-quality', s.quality);
    $('s-music').value = Math.round(s.music * 100);
    $('s-sfx').value = Math.round(s.sfx * 100);
    $('s-fps').checked = s.showFps;
    renderKeys();
  }
  function renderKeys() {
    const box = $('s-keys');
    box.innerHTML = '';
    const b = save.settings.bindings;
    for (const a of R.ACTIONS) {
      const label = document.createElement('div');
      label.className = 'act';
      label.textContent = I.t('act_' + a);
      box.appendChild(label);
      for (let i = 0; i < R.SLOTS; i++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'key';
        btn.dataset.action = a;
        btn.dataset.slot = String(i);
        const waiting = capture && capture.action === a && capture.slot === i;
        btn.textContent = waiting ? I.t('pressKey') : R.keyName(b[a][i], I.lang);
        if (waiting) btn.classList.add('wait');
        if (!b[a][i] && !waiting) btn.classList.add('empty');
        btn.addEventListener('click', () => { capture = { action: a, slot: i }; renderKeys(); box.querySelector('.key.wait').focus({ preventScroll: true }); });
        box.appendChild(btn);
      }
    }
  }
  function settingsChanged() {
    persist();
    updateHints();
  }
  function bindSeg(id, fn) {
    $(id).addEventListener('click', (e) => {
      const b = e.target.closest('button[data-v]');
      if (!b) return;
      fn(b.dataset.v);
      A.play('click');
      renderSettings();
      settingsChanged();
    });
  }
  bindSeg('s-lang', (v) => { save.settings.lang = v; I.lang = v; applyTexts(); });
  bindSeg('s-theme', (v) => { save.settings.theme = v; applyTheme(); });
  bindSeg('s-quality', (v) => { save.settings.quality = v; view.setQuality(v); resize(); });
  $('s-music').addEventListener('input', (e) => { save.settings.music = e.target.value / 100; A.setVolumes(save.settings.music, save.settings.sfx); settingsChanged(); });
  $('s-sfx').addEventListener('input', (e) => { save.settings.sfx = e.target.value / 100; A.setVolumes(save.settings.music, save.settings.sfx); settingsChanged(); });
  $('s-fps').addEventListener('change', (e) => { save.settings.showFps = e.target.checked; $('hud-fps').hidden = !e.target.checked; settingsChanged(); });
  $('s-reset').addEventListener('click', () => { save.settings.bindings = R.defaultBindings(); capture = null; renderKeys(); settingsChanged(); A.play('click'); });

  // ---------- upgrades ----------
  function renderUpgrades() {
    $('u-coins').textContent = save.coins;
    const list = $('u-list');
    list.innerHTML = '';
    for (const k of R.POWERS) {
      const lvl = save.upgrades[k];
      const cost = R.upgradeCost(lvl);
      const row = document.createElement('div');
      row.className = 'upg';
      row.dataset.power = k;
      row.innerHTML = `<div class="ico">${ICONS[k]}</div><div><div class="name"></div><div class="desc"></div><div class="lvl">${Array.from({ length: R.MAX_LEVEL }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</div></div>`;
      row.querySelector('.name').textContent = `${I.t('p_' + k)} · ${I.t('seconds', { n: Math.round(R.powerDuration(k, lvl)) })}`;
      row.querySelector('.desc').textContent = `${I.t('pd_' + k)}. ${I.t('level', { n: lvl, max: R.MAX_LEVEL })}`;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn buy';
      if (cost === null) { btn.textContent = I.t('maxed'); btn.disabled = true; }
      else {
        btn.textContent = I.t('buy', { cost });
        if (save.coins < cost) { btn.disabled = true; btn.title = I.t('notEnough'); }
      }
      btn.addEventListener('click', () => {
        const r = R.buyUpgrade(save, k);
        if (r.ok) { persist(); A.play('power'); renderUpgrades(); renderMenu(); }
      });
      row.appendChild(btn);
      list.appendChild(row);
    }
  }

  // ---------- buttons ----------
  $('m-play').addEventListener('click', start);
  $('m-upgrades').addEventListener('click', () => openSub('upgrades'));
  $('m-settings').addEventListener('click', () => openSub('settings'));
  $('m-howto').addEventListener('click', () => openSub('howto'));
  $('p-resume').addEventListener('click', resume);
  $('p-restart').addEventListener('click', start);
  $('p-settings').addEventListener('click', () => openSub('settings'));
  $('p-menu').addEventListener('click', toMenu);
  $('o-again').addEventListener('click', start);
  $('o-upgrades').addEventListener('click', () => openSub('upgrades'));
  $('o-menu').addEventListener('click', toMenu);
  $('s-done').addEventListener('click', back);
  $('u-done').addEventListener('click', back);
  $('h-done').addEventListener('click', back);
  $('btn-pause').addEventListener('click', () => { A.init(); pause(); });

  // ---------- keyboard ----------
  window.addEventListener('keydown', (e) => {
    A.init();
    if (capture) {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Escape') capture = null;
      else {
        const b = save.settings.bindings;
        if (e.code === 'Delete' || e.code === 'Backspace') {
          const nb = R.rebind(b, capture.action, capture.slot, null);
          nb[capture.action][capture.slot] = null;
          save.settings.bindings = R.sanitizeBindings(nb);
        } else if (e.code) {
          save.settings.bindings = R.rebind(b, capture.action, capture.slot, e.code);
        }
        capture = null;
        settingsChanged();
      }
      renderKeys();
      return;
    }
    const act = R.actionFor(save.settings.bindings, e.code);
    if (state === 'playing' || state === 'countdown') {
      if (act) e.preventDefault();
      if (e.repeat) return;
      if (act === 'pause') pause();
      else if (act && state === 'playing') R.act(run, act);
      return;
    }
    if (state === 'paused' && overlay === 'pause') {
      if (act === 'pause' && !e.repeat) { e.preventDefault(); resume(); }
      return;
    }
    if (e.code === 'Escape' && (overlay === 'settings' || overlay === 'upgrades' || overlay === 'howto')) { e.preventDefault(); back(); }
  }, true);

  // ---------- swipes, taps and mouse drags ----------
  let touch = null;
  canvas.addEventListener('pointerdown', (e) => {
    A.init();
    if (state !== 'playing') return;
    touch = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), done: false };
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events have no capture */ }
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!touch || touch.done || e.pointerId !== touch.id || state !== 'playing') return;
    const dx = e.clientX - touch.x, dy = e.clientY - touch.y;
    const rect = canvas.getBoundingClientRect();
    const thr = Math.max(24, Math.min(rect.width, rect.height) * 0.05);
    if (Math.abs(dx) < thr && Math.abs(dy) < thr) return;
    const a = R.classifySwipe(dx, dy, performance.now() - touch.t, touch.x - rect.left, rect.width, rect.height);
    if (a) R.act(run, a);
    touch.done = true;          // one swipe per touch, recognised as soon as it is long enough
  });
  function endTouch(e) {
    if (!touch || e.pointerId !== touch.id) return;
    if (!touch.done && state === 'playing' && e.type === 'pointerup') {
      const rect = canvas.getBoundingClientRect();
      const a = R.classifySwipe(e.clientX - touch.x, e.clientY - touch.y, performance.now() - touch.t, touch.x - rect.left, rect.width, rect.height);
      if (a) R.act(run, a);
    }
    touch = null;
  }
  canvas.addEventListener('pointerup', endTouch);
  canvas.addEventListener('pointercancel', endTouch);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // ---------- pause when the window is hidden or loses focus ----------
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  window.addEventListener('blur', () => pause());

  // ---------- size ----------
  function resize() {
    const r = canvas.getBoundingClientRect();
    view.resize(Math.round(r.width), Math.round(r.height));
  }
  window.addEventListener('resize', resize);

  // ---------- start ----------
  A.setVolumes(save.settings.music, save.settings.sfx);
  $('hud-fps').hidden = !save.settings.showFps;
  applyTheme();
  applyTexts();
  resize();
  show('menu');
  requestAnimationFrame((t) => { last = t; frame(t); });

  // ---------- for tests and debugging ----------
  window.RailRunner = {
    version: VERSION,
    core: R,
    audio: A,
    get run() { return run; },
    get state() { return state; },
    get overlay() { return overlay; },
    get demo() { return demo; },
    get save() { return save; },
    get manual() { return MANUAL; },
    view: { info: () => view.info(), get theme() { return view.theme; } },
    // move the simulation by whole steps (works in ?manual=1 and normally);
    // { auto: true } - the autopilot plays the run (tests and README frames)
    advance(seconds, opts = {}) {
      const n = Math.round(seconds / DT);
      for (let i = 0; i < n; i++) { if (opts.auto && !demo && state === 'playing') R.autopilot(run); tick(DT); }
      draw(DT);
      return { state, z: run.z };
    },
    start, pause, resume, toMenu,
  };
})();
