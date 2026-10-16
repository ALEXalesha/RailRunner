// RailRunner page: screens, keys, swipes, saving, sound and the game loop.
// The rules of a run are in core.js, progress between runs in meta.js, the picture in
// render.js (with gfx.js, scenery.js, actors.js); this file connects them.
//
// Address parameters (for tests and README frames): ?seed=N - the run's world,
// ?manual=1 - the simulation only moves by RailRunner.advance(seconds), ?date=YYYY-MM-DD - the
// day of the daily challenge, ?district=industrial - the district a run starts in,
// ?preserve=1 - keep the picture for screenshots.
(function () {
  'use strict';
  const VERSION = '2.0.0';
  const R = window.RRCore, M = window.RRMeta, I = window.RRI18n, A = window.RRAudio;
  const DT = R.C.DT;
  const STORE = 'railrunner:save';
  const params = new URLSearchParams(location.search);
  const MANUAL = params.get('manual') === '1';
  const FIXED_SEED = params.has('seed') ? Number(params.get('seed')) >>> 0 : null;
  const TODAY = /^\d{4}-\d{2}-\d{2}$/.test(params.get('date') || '') ? params.get('date') : M.dateKey(new Date());
  const $ = (id) => document.getElementById(id);
  const canvas = $('view');

  // ---------- saving: everything under one key with the railrunner: prefix ----------
  function loadSave() {
    try { return M.sanitizeSave(localStorage.getItem(STORE)); } catch (e) { return M.defaultSave(); }
  }
  function persist() {
    try { localStorage.setItem(STORE, JSON.stringify(save)); } catch (e) { /* private mode: play without saving */ }
  }
  let save = loadSave();
  I.lang = save.settings.lang || I.detect(navigator);
  const charCfg = (id) => M.CHARS.find((c) => c.id === id) || M.CHARS[0];
  const boardCfg = (id) => M.BOARDS.find((b) => b.id === id) || M.BOARDS[0];

  // ---------- graphics quality: a fixed level or "auto" by the frame time ----------
  let autoLevel = 'high';
  const qualityLevel = () => (save.settings.quality === 'auto' ? autoLevel : save.settings.quality);

  // ---------- the 3D view ----------
  let view;
  try {
    view = window.RRRender.create(canvas, {
      quality: qualityLevel(), preserve: params.get('preserve') === '1', lang: I.lang,
      shadows: save.settings.shadows, particles: save.settings.particles, shake: save.settings.shake,
    });
    view.setCharacter(charCfg(save.char));
    view.setBoard(boardCfg(save.board));
  } catch (e) {
    const f = $('fatal');
    f.hidden = false;
    f.textContent = I.lang === 'ru' ? 'Не удалось запустить 3D (WebGL). Обновите браузер или видеодрайвер.' : 'Could not start 3D (WebGL). Please update the browser or the video driver.';
    window.RailRunner = { error: String(e && e.message || e) };
    return;
  }

  // ---------- state ----------
  let state = 'menu';           // menu | playing | countdown | paused | dying | continue | over
  let overlay = null;           // which screen is shown
  let backTo = null;            // where "Done" returns from sub-screens
  let demo = true;              // the menu runs a demo with the autopilot behind the screens
  let run = null;
  let runInfo = { daily: null, tutorial: false };
  let prev = { z: 0, x: 0, y: 0 };
  let acc = 0, countT = 0, deadT = 0, hintT = 0, toastT = 0, contT = 0, missionT = 0;
  let capture = null;           // key rebinding: { action, slot }
  let shopTab = 'chars', preview = null;
  let tut = null;               // { step, waiting, doneT }
  let announced = new Set(), dailyAnnounced = false, lastOver = null;
  const seedNow = () => (FIXED_SEED !== null ? FIXED_SEED : (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0);
  const FIXED_DISTRICT = R.DISTRICTS.includes(params.get('district')) ? params.get('district') : null;
  const startDistrict = () => FIXED_DISTRICT || (resolvedTheme() === 'dark' ? 'neon' : 'city');

  function newDemo() {
    return R.newRun(FIXED_SEED !== null ? FIXED_SEED + 1 : seedNow(), { upgrades: save.upgrades, startDistrict: startDistrict() });
  }
  function setRun(r) {
    run = r;
    prev = { z: r.z, x: r.x, y: r.y };
    acc = 0;
  }

  // ---------- screens ----------
  const SCREENS = ['menu', 'shop', 'missions', 'ach', 'records', 'pause', 'continue', 'over', 'settings', 'howto'];
  const FIRST = { menu: 'm-play', shop: 'sh-done', missions: 'mi-done', ach: 'ac-done', records: 'rc-done', pause: 'p-resume', continue: 'c-keys', over: 'o-again', settings: 's-done', howto: 'h-done' };
  function show(name) {
    overlay = name;
    for (const s of SCREENS) $('scr-' + s).hidden = s !== name;
    $('hud').hidden = !(state === 'playing' || state === 'countdown' || state === 'paused' || state === 'dying' || state === 'continue');
    const first = FIRST[name];
    if (first) {
      const el = $(first);
      if (name === 'over') setTimeout(() => { if (overlay === 'over') el.focus({ preventScroll: true }); }, 450);
      else if (!el.disabled && !el.hidden) el.focus({ preventScroll: true });
    }
    if (name === 'menu') renderMenu();
    if (name === 'settings') renderSettings();
    if (name === 'shop') renderShop();
    if (name === 'missions') renderMissions();
    if (name === 'ach') renderAch();
    if (name === 'records') renderRecords();
    if (name === 'howto') renderHowto();
    if (name === 'pause') renderMiniMissions($('p-missions'), runRes(false));
    view.setShowcase(name === 'shop', { board: shopTab === 'boards' });
    if (name !== 'shop' && preview) { preview = null; view.setCharacter(charCfg(save.char)); view.setBoard(boardCfg(save.board)); }
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

  // ---------- a run ----------
  // opts.daily - the daily challenge (its world and goal)
  function start(opts = {}) {
    A.init();
    A.resume();
    demo = false;
    const daily = opts.daily ? M.dailyFor(TODAY) : null;
    const tutorial = !daily && !save.tutorialDone;
    runInfo = { daily, tutorial };
    view.setCharacter(charCfg(save.char));
    view.setBoard(boardCfg(save.board));
    setRun(R.newRun(daily ? daily.seed : seedNow(), {
      upgrades: save.upgrades, mult: save.missions.level, boards: save.boards, tutorial,
      startDistrict: daily ? 'city' : startDistrict(),
    }));
    tut = tutorial ? { step: 0, waiting: false } : null;
    announced = new Set(save.missions.done.map((d, i) => (d ? i : -1)).filter((i) => i >= 0));
    dailyAnnounced = false;
    state = 'playing';
    deadT = 0;
    hintT = tutorial ? 0 : 4.5;
    show(null);
    A.music(true);
    A.play('click');
    banner(I.t('d_' + run.district) + weatherText(run.z));
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
    A.jet(false);
    A.resume();
    view.setCharacter(charCfg(save.char));
    setRun(newDemo());
    show('menu');
  }
  // the result as missions see it in the middle of the run (finished: the run is counted)
  function runRes(finished) {
    if (!run || demo) return null;
    return Object.assign(R.result(run), { finished, char: save.char, date: TODAY, daily: !!runInfo.daily });
  }
  // after the crash: continue with keys, or the results
  function afterCrash() {
    if (runInfo.tutorial && tut && run.world.tutorial && run.z < run.world.tutorial.end + 5) {
      R.revive(run);
      handleEvents();
      state = 'countdown';
      countT = 1.0;
      A.music(true);
      return;
    }
    const cost = R.reviveCost(run.revives);
    const offer = M.reviveOffer(save, cost);
    if (!offer.canKeys && !offer.canCoins) { finish(); return; }
    state = 'continue';
    contT = 7;
    $('c-keys').textContent = I.t('continueKeys', { n: cost });
    $('c-keys').disabled = !offer.canKeys;
    $('c-buy').hidden = offer.canKeys || !offer.canCoins;
    $('c-buy').textContent = I.t('continueBuy', { coins: offer.coins });
    $('c-have').textContent = I.t('continueHave', { n: save.keys });
    show('continue');
    if (!offer.canKeys) $('c-buy').focus({ preventScroll: true });
  }
  function continueRun() {
    if (state !== 'continue') return;
    if (!M.payRevive(save, R.reviveCost(run.revives))) return;
    persist();
    R.revive(run);
    handleEvents();
    state = 'countdown';
    countT = 1.5;
    show(null);
    A.music(true);
  }
  function finish() {
    state = 'over';
    A.music(false);
    A.jet(false);
    const res = runRes(true);
    save.boards = run.boardsLeft;
    if (runInfo.tutorial && run.world.tutorial && run.z > run.world.tutorial.end) save.tutorialDone = true;
    const rec = M.applyResult(save, res);
    const mis = M.commitMissions(save, res);
    let daily = null;
    if (runInfo.daily && M.dailyValue(runInfo.daily.goal, res) >= runInfo.daily.goal.n) daily = M.completeDaily(save, runInfo.daily.date);
    const ach = M.checkAchievements(save);
    persist();
    lastOver = { res, rec, mis, daily, ach };
    $('o-score').textContent = res.score;
    $('o-coins').textContent = res.coins;
    $('o-dist').textContent = I.t('meters', { n: res.distance });
    $('o-combo').textContent = 'x' + (res.stats.bestCombo || 0);
    $('o-record').hidden = !rec.record;
    renderOverNews();
    renderMiniMissions($('o-missions'), null);
    show('over');
    if (rec.record) A.play('record');
    else if (mis.completed.length || ach.length || daily) A.play('mission');
  }
  function renderOverNews() {
    if (!lastOver) return;
    const { rec, mis, daily, ach } = lastOver;
    $('o-best').textContent = I.t('record', { n: save.best }) + (rec.rank ? ' · ' + I.t('rankText', { n: rec.rank }) : '');
    const news = [];
    for (const id of mis.completed) news.push('✓ ' + missionText(id, save.missions.level - (mis.levelUp ? 1 : 0)) + ' · ' + I.t('missionReward', { n: M.missionReward(save.missions.level - (mis.levelUp ? 1 : 0)) }));
    if (mis.levelUp) news.push('★ ' + I.t('levelUp', { n: save.missions.level }));
    if (daily) news.push('☀ ' + I.t('dailyGot', { coins: daily.coins, keys: daily.keys }));
    for (const id of ach) news.push('🏅 ' + I.t('achUnlocked', { name: I.t('a_' + id) }));
    const box = $('o-news');
    box.innerHTML = '';
    for (const n of news) { const d = document.createElement('div'); d.textContent = n; box.appendChild(d); }
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
      deadT += dt * (deadT < 0.5 ? 0.35 : 1);       // a slow-motion moment after the crash
      if (deadT >= 1.0) afterCrash();
      return;
    }
    if (state === 'continue') {
      contT -= dt;
      if (contT <= 0) finish();
      return;
    }
    if (!(state === 'playing' || (demo && state === 'menu' && overlay !== 'shop'))) return;
    let scale = 1;
    if (tut && tut.waiting) scale = 0.2;           // the lesson waits: time almost stops
    acc += dt * scale;
    while (acc >= DT) { acc -= DT; simStep(); if (state !== 'playing' && !demo) { acc = 0; break; } }
    if (!demo && state === 'playing') { tutorialTick(dt); watchMissions(dt); }
  }

  // ---------- the tutorial ----------
  function tutorialTick(dt) {
    if (!tut) return;
    if (!run.world.tutorial) { tut = null; setTut(null); return; }
    const steps = run.world.tutorial.steps;
    if (tut.step >= steps.length) {
      if (run.z > run.world.tutorial.end + 2 && !tut.end) {
        tut.end = true;
        save.tutorialDone = true;
        persist();
        toast(I.t('tut_done'), 2.5);
        A.play('mission');
        hintT = 5;
      }
      setTut(null);
      return;
    }
    const s = steps[tut.step];
    if (run.z >= s.z && !tut.shown) { tut.shown = true; tut.waiting = !!s.need; setTut(I.t('tut_' + s.id, keysVars())); }
    if (run.z > s.obstacle + 3) { tut.step++; tut.shown = false; tut.waiting = false; setTut(null); }
    void dt;
  }
  // an action of the player: the lesson stops waiting when it is the right one
  function playerAction(a) {
    if (tut && tut.waiting) {
      const s = run.world.tutorial.steps[tut.step];
      if (s && s.need && s.need.includes(a)) tut.waiting = false;
    }
    R.act(run, a);
  }
  function setTut(text) {
    const el = $('hud-tut');
    if (text) el.textContent = text;
    el.classList.toggle('show', !!text);
  }

  // ---------- missions and the daily challenge during the run ----------
  function watchMissions(dt) {
    missionT -= dt;
    if (missionT > 0) return;
    missionT = 0.3;
    const res = runRes(false);
    M.missionView(save, res).forEach((m, i) => {
      if (m.done && !announced.has(i)) { announced.add(i); toast(I.t('missionDone') + '\n' + missionText(m.id, save.missions.level), 2.2); A.play('mission'); }
    });
    if (runInfo.daily && !dailyAnnounced && M.dailyValue(runInfo.daily.goal, res) >= runInfo.daily.goal.n) {
      dailyAnnounced = true;
      toast(I.t('dailyComplete'), 2.2);
      A.play('mission');
    }
  }

  function handleEvents() {
    for (const e of run.events) {
      if (demo) continue;
      A.play(e);
      view.event(e, run, viewState);
      if (e === 'bump') toast(I.t('bump'));
      else if (e === 'board-break') { toast(I.t('boardBroke')); flash(); }
      else if (e === 'board-on') toast(I.t('boardOn'));
      else if (e === 'key') toast(I.t('keyFound'));
      else if (e === 'crash') { state = 'dying'; deadT = 0; A.music(false); A.jet(false); flash(true); }
      else if (e.startsWith('power:')) { toast(I.t('p_' + e.slice(6))); flash(); if (e === 'power:jetpack') A.jet(true); }
      else if (e === 'power-end:jetpack') A.jet(false);
      else if (e.startsWith('trick:')) trickPopup(e.slice(6));
      else if (e.startsWith('district:')) banner(I.t('d_' + e.slice(9)) + weatherText(run.z + 1));
    }
    run.events.length = 0;
  }
  function weatherText(z) {
    const w = R.districtAt(run.world, z).weather;
    return w === 'clear' ? '' : ' · ' + I.t('w_' + w);
  }
  function flash(red) {
    const f = $('flash');
    f.classList.remove('go', 'red');
    void f.offsetWidth;
    f.classList.add('go');
    if (red) f.classList.add('red');
  }
  function trickPopup(kind) {
    const el = $('hud-trick');
    el.textContent = `${I.t('t_' + kind)} +${R.C.TRICK_POINTS * run.combo * R.mult(run)}`;
    el.classList.remove('go');
    void el.offsetWidth;
    el.classList.add('go');
  }
  function banner(text) {
    const el = $('hud-banner');
    el.textContent = text;
    el.classList.remove('go');
    void el.offsetWidth;
    el.classList.add('go');
  }

  // ---------- drawing and the frame loop ----------
  let last = performance.now(), fpsN = 0, fpsT = 0, drawMs = 0;
  const perf = { ema: 1 / 60, drawEma: 4, slowT: 0, fastT: 0, holdT: 0 };
  const viewState = { z: 0, x: 0, y: 0, deadT: 0 };
  function draw(dt) {
    const moving = state === 'playing' || (demo && state === 'menu' && overlay !== 'shop');
    const a = moving ? Math.min(1, acc / DT) : 1;
    viewState.z = prev.z + (run.z - prev.z) * a;
    viewState.x = prev.x + (run.x - prev.x) * a;
    viewState.y = prev.y + (run.y - prev.y) * a;
    viewState.deadT = deadT;
    const viewDt = state === 'dying' ? dt * (deadT < 0.5 ? 0.35 : 1) : (moving || overlay === 'shop' ? dt : 0);
    const t0 = performance.now();
    view.draw(run, viewState, run.t + a * DT + (overlay === 'shop' ? shopClock : 0), viewDt);
    drawMs = performance.now() - t0;
    if (!demo) A.mood(run.speed, run.district);
    updateHud();
  }
  let shopClock = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (!(dt > 0)) dt = 0;
    if (dt > 0.1) dt = 0.1;
    if (overlay === 'shop') shopClock += dt;
    fpsN++; fpsT += dt;
    if (fpsT >= 0.5) {
      if (save.settings.showFps) $('hud-fps').textContent = I.t('fps', { n: Math.round(fpsN / fpsT), ms: perf.drawEma.toFixed(1), q: I.t('q' + qualityLevel()[0].toUpperCase() + qualityLevel().slice(1)) });
      fpsN = 0; fpsT = 0;
    }
    if (!MANUAL) tick(dt);
    draw(dt);
    autoQuality(dt);
  }
  // "auto": a frame slower than 1/45 s for 2 s - one level lower; quick frames with room to
  // spare for 8 s - one level higher (not sooner than 15 s after going down)
  const LEVELS = ['low', 'medium', 'high'];
  function autoQuality(dt) {
    if (save.settings.quality !== 'auto' || document.hidden || !(dt > 0)) return;
    perf.ema += (dt - perf.ema) * 0.05;
    perf.drawEma += (drawMs - perf.drawEma) * 0.05;
    perf.holdT = Math.max(0, perf.holdT - dt);
    const i = LEVELS.indexOf(autoLevel);
    if (perf.ema > 1 / 45) { perf.slowT += dt; perf.fastT = 0; } else if (perf.ema < 1 / 55 && perf.drawEma < 6) { perf.fastT += dt; perf.slowT = 0; } else { perf.slowT = 0; perf.fastT = 0; }
    if (perf.slowT > 2 && i > 0) { setAuto(LEVELS[i - 1]); perf.holdT = 15; }
    else if (perf.fastT > 8 && perf.holdT <= 0 && i < LEVELS.length - 1) setAuto(LEVELS[i + 1]);
  }
  function setAuto(level) {
    autoLevel = level;
    perf.slowT = 0; perf.fastT = 0; perf.ema = 1 / 60;
    view.setQuality(level);
  }

  // ---------- HUD ----------
  const ICONS = {
    magnet: '<svg viewBox="0 0 24 24"><path d="M5 3h4v9a3 3 0 0 0 6 0V3h4v9a7 7 0 0 1-14 0z" fill="#e0322c"/><rect x="5" y="3" width="4" height="3" fill="#cfd6de"/><rect x="15" y="3" width="4" height="3" fill="#cfd6de"/></svg>',
    x2: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#ffcf2e"/><text x="12" y="16.5" font-size="11" font-weight="900" text-anchor="middle" fill="#b5121b" font-family="Arial">x2</text></svg>',
    boots: '<svg viewBox="0 0 24 24"><path d="M6 3h6v8l6 3v4H4V9z" fill="#2fbf5a"/><path d="M5 19h3l-1 2 1 2H5l1-2zM13 19h3l-1 2 1 2h-3l1-2z" fill="#cfd6de"/></svg>',
    board: '<svg viewBox="0 0 24 24"><rect x="2" y="9" width="20" height="6" rx="3" fill="#7d3cff"/><rect x="2" y="11" width="20" height="1.5" fill="#ff4fb8"/><rect x="2" y="13" width="20" height="1.2" fill="#4fe3ff"/></svg>',
    jetpack: '<svg viewBox="0 0 24 24"><rect x="5" y="4" width="5" height="12" rx="2.5" fill="#d8d8d8"/><rect x="14" y="4" width="5" height="12" rx="2.5" fill="#d8d8d8"/><rect x="9" y="7" width="6" height="7" fill="#2e7dd1"/><path d="M6 17h3l-1.5 5zM15 17h3l-1.5 5z" fill="#ff8a2a"/></svg>',
    key: '<svg viewBox="0 0 24 24"><circle cx="8" cy="8" r="5" fill="none" stroke="#3fb4ff" stroke-width="3"/><path d="M11.5 11.5L20 20M16 16l2.5-2.5M18 18l2-2" stroke="#3fb4ff" stroke-width="3" stroke-linecap="round"/></svg>',
  };
  const hudCache = {};
  function setText(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } }
  function updateHud() {
    if (demo) return;
    setText('hud-score', String(run.score));
    setText('hud-coins', String(run.coins));
    setText('hud-dist', I.t('meters', { n: Math.floor(run.z) }));
    const m = R.mult(run);
    setText('hud-mult', 'x' + m);
    $('hud-mult').classList.toggle('x2', run.power.x2 > 0);
    const chips = R.POWERS.filter((k) => run.power[k] > 0).map((k) => {
      const f = run.power[k] / R.powerDuration(k, save.upgrades[k]);
      return `<div class="chip${f < 0.25 ? ' low' : ''}" data-power="${k}">${ICONS[k]}<div class="bar"><i style="width:${Math.round(100 * f)}%"></i></div></div>`;
    }).join('');
    if (hudCache.chips !== chips) { hudCache.chips = chips; $('hud-powers').innerHTML = chips; }
    const combo = run.combo >= 2 && run.alive;
    $('hud-combo').classList.toggle('show', combo);
    if (combo) { setText('hud-combo-n', I.t('combo', { n: run.combo })); $('hud-combo-bar').style.width = Math.round(100 * run.comboT / R.C.COMBO_TIME) + '%'; }
    setText('hud-boards', String(run.boardsLeft));
    $('btn-board').disabled = !(run.boardsLeft > 0 && run.power.board <= 0 && state === 'playing');
    $('hud-hint').classList.toggle('show', hintT > 0 && state === 'playing');
    $('hud-toast').classList.toggle('show', toastT > 0);
    setText('hud-count', state === 'countdown' ? String(Math.max(1, Math.ceil(countT / 0.5))) : '');
    if (state === 'continue') $('c-timer').style.width = Math.max(0, Math.round(100 * contT / 7)) + '%';
  }
  function toast(text, time = 1.3) {
    $('hud-toast').textContent = text;
    toastT = time;
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
    const touchOnly = window.matchMedia && window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(pointer: fine)').matches;
    $('hud-hint').textContent = touchOnly ? I.t('touchHint') : I.t('startHint', v);
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
    if (overlay && overlay !== 'over' && overlay !== 'continue') show(overlay);
    if (overlay === 'over' && lastOver) {
      $('o-dist').textContent = I.t('meters', { n: lastOver.res.distance });
      renderOverNews();
      renderMiniMissions($('o-missions'), null);
    }
  }
  const fmt = (n) => Math.round(n).toLocaleString(I.lang === 'ru' ? 'ru-RU' : 'en-US');
  const missionText = (id, level) => I.t('m_' + id, { n: fmt(M.missionTarget(id, level)) });
  function renderMiniMissions(box, res) {
    box.innerHTML = '';
    if (!save.missions) return;
    for (const m of M.missionView(save, res)) {
      const d = document.createElement('div');
      d.className = 'mm' + (m.done ? ' done' : '');
      d.innerHTML = '<i></i><span></span><em></em>';
      d.querySelector('span').textContent = missionText(m.id, save.missions.level);
      d.querySelector('em').textContent = `${fmt(m.value)}/${fmt(m.target)}`;
      box.appendChild(d);
    }
  }
  function dailyGoalText(d) { return I.t('goal_' + d.goal.type, { n: fmt(d.goal.n) }); }
  function renderMenu() {
    $('m-best').textContent = fmt(save.best);
    $('m-coins').textContent = fmt(save.coins);
    $('m-keys').textContent = fmt(save.keys);
    $('m-ver').textContent = 'RailRunner ' + VERSION;
    $('m-mult').textContent = 'x' + save.missions.level;
    const d = M.dailyFor(TODAY);
    const done = save.daily.date === TODAY && save.daily.done;
    $('m-daily-goal').textContent = dailyGoalText(d);
    $('m-daily-state').textContent = done ? I.t('dailyDone') + (save.daily.streak > 1 ? ' · ' + I.t('dailyStreak', { n: save.daily.streak }) : '') : I.t('dailyReward', { coins: d.reward.coins });
    $('m-daily').classList.toggle('done', done);
    renderMiniMissions($('m-missions-list'), null);
  }
  function renderHowto() {
    const v = keysVars();
    const fill = (id, lines) => { $(id).innerHTML = ''; for (const line of lines) { const li = document.createElement('li'); li.textContent = line; $(id).appendChild(li); } };
    fill('h-text', I.t('howtoText', v));
    fill('h-obstacles', I.t('obstaclesText', v));
    fill('h-powers', R.POWERS.map((k) => `${I.t('p_' + k)} - ${I.t('pd_' + k)} (${I.t('seconds', { n: Math.round(R.powerDuration(k, save.upgrades[k])) })})`));
  }

  // ---------- missions screen ----------
  function renderMissions() {
    $('mi-mult').textContent = I.t('multiplier', { n: save.missions.level });
    const list = $('mi-list');
    list.innerHTML = '';
    M.missionView(save, null).forEach((m, i) => {
      const row = document.createElement('div');
      row.className = 'mission' + (m.done ? ' done' : '');
      row.dataset.mission = m.id;
      row.innerHTML = '<div class="txt"></div><div class="rew"></div><div class="prog"><span class="bar-line"><i></i></span><span class="num"></span></div>';
      row.querySelector('.txt').textContent = missionText(m.id, save.missions.level);
      row.querySelector('.rew').textContent = I.t('missionReward', { n: m.reward });
      row.querySelector('.bar-line i').style.width = Math.round(100 * m.value / m.target) + '%';
      row.querySelector('.num').textContent = `${fmt(m.value)} / ${fmt(m.target)}`;
      if (!m.done) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn small';
        const cost = M.skipCost(save.missions.level);
        b.textContent = I.t('missionSkip', { n: cost });
        b.disabled = save.keys < cost;
        b.addEventListener('click', () => {
          if (M.skipMission(save, i).ok) {
            const out = M.commitMissions(save, null);
            M.checkAchievements(save);
            persist();
            A.play('mission');
            if (out.levelUp) toast(I.t('levelUp', { n: save.missions.level }));
            renderMissions();
          }
        });
        row.querySelector('.prog').appendChild(b);
      }
      list.appendChild(row);
    });
    const d = M.dailyFor(TODAY);
    const done = save.daily.date === TODAY && save.daily.done;
    const box = $('mi-daily');
    box.innerHTML = '<b></b><span class="hint"></span>';
    box.querySelector('b').textContent = dailyGoalText(d);
    box.querySelector('.hint').textContent = (done ? I.t('dailyDone') : I.t('dailyReward', { coins: d.reward.coins })) + (save.daily.streak ? ' · ' + I.t('dailyStreak', { n: save.daily.streak }) : '');
    if (!done) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn primary';
      b.id = 'mi-daily-play';
      b.textContent = I.t('dailyPlay');
      b.addEventListener('click', () => start({ daily: true }));
      box.appendChild(b);
    }
  }

  // ---------- shop ----------
  const hex = (n) => '#' + n.toString(16).padStart(6, '0');
  function charSvg(c) {
    const hat = { cap: `<path d="M22 13a10 9 0 0 1 20 0z" fill="${hex(c.hatColor)}"/><rect x="38" y="11" width="10" height="3" rx="1.5" fill="${hex(c.hatColor)}"/>`,
      ponytail: `<path d="M22 14a10 10 0 0 1 20 0z" fill="${hex(c.hair)}"/><path d="M40 12q8 4 5 14" stroke="${hex(c.hair)}" stroke-width="4" fill="none"/>`,
      beanie: `<path d="M21 15a11 11 0 0 1 22 0z" fill="${hex(c.hatColor)}"/><circle cx="32" cy="4" r="3" fill="#fff"/><rect x="21" y="13" width="22" height="3" fill="#fff"/>`,
      helmet: `<path d="M20 17a12 12 0 0 1 24 0z" fill="${hex(c.hatColor)}"/><rect x="24" y="14" width="16" height="3" fill="#223355"/>`,
      antenna: `<line x1="35" y1="2" x2="35" y2="8" stroke="#555" stroke-width="2"/><circle cx="35" cy="2" r="2.5" fill="${hex(c.hatColor)}"/>`,
      spikes: `<path d="M22 13l3-8 3 6 4-8 3 8 4-6 3 8z" fill="${hex(c.hair)}"/>` }[c.hat] || '';
    const head = c.robot ? `<rect x="23" y="7" width="18" height="16" rx="3" fill="${hex(c.skin)}"/><rect x="26" y="12" width="12" height="3" fill="#40e0ff"/>` : `<circle cx="32" cy="16" r="9" fill="${hex(c.skin)}"/><circle cx="29" cy="16" r="1.3" fill="#222"/><circle cx="35" cy="16" r="1.3" fill="#222"/>`;
    const w = 14 * c.build, h = 22 * c.height;
    return `<svg viewBox="0 0 64 74"><rect x="${32 - w / 2 - 4}" y="26" width="4" height="18" rx="2" fill="${hex(c.top)}"/><rect x="${32 + w / 2}" y="26" width="4" height="18" rx="2" fill="${hex(c.top)}"/>` +
      `<rect x="${32 - w / 2}" y="25" width="${w}" height="${h}" rx="4" fill="${hex(c.top)}"/>` +
      (c.extra === 'neon' ? `<rect x="29" y="27" width="1.5" height="${h - 4}" fill="${hex(c.extraColor)}"/><rect x="33.5" y="27" width="1.5" height="${h - 4}" fill="${hex(c.extraColor)}"/>` : '') +
      (c.extra === 'scarf' ? `<rect x="25" y="24" width="14" height="4" rx="2" fill="${hex(c.extraColor)}"/>` : '') +
      `<rect x="26" y="${25 + h}" width="5" height="22" fill="${hex(c.pants)}"/><rect x="33" y="${25 + h}" width="5" height="22" fill="${hex(c.pants)}"/>` +
      `<rect x="24" y="${45 + h}" width="8" height="4" rx="2" fill="${hex(c.shoes)}"/><rect x="32" y="${45 + h}" width="8" height="4" rx="2" fill="${hex(c.shoes)}"/>` +
      head + hat + '</svg>';
  }
  function boardCss(b) {
    const base = hex(b.base), a = hex(b.a), c = hex(b.b);
    const g = { stripes: `linear-gradient(180deg, ${base} 35%, ${a} 35% 50%, ${base} 50% 58%, ${c} 58% 72%, ${base} 72%)`,
      flames: `repeating-linear-gradient(120deg, ${base} 0 8px, ${a} 8px 14px, ${c} 14px 18px)`,
      waves: `radial-gradient(circle at 20% 60%, ${a} 0 6px, transparent 7px), radial-gradient(circle at 60% 40%, ${c} 0 5px, transparent 6px), ${base}`,
      stars: `radial-gradient(circle at 25% 40%, ${a} 0 2px, transparent 3px), radial-gradient(circle at 70% 60%, ${c} 0 2px, transparent 3px), radial-gradient(circle at 45% 30%, ${a} 0 1.5px, transparent 2.5px), ${base}`,
      grid: `repeating-linear-gradient(90deg, ${a} 0 2px, transparent 2px 10px), repeating-linear-gradient(0deg, ${c} 0 2px, ${base} 2px 9px)`,
      checker: `repeating-linear-gradient(90deg, ${a} 0 8px, ${base} 8px 16px)` }[b.pattern];
    return `background:${g}; border: 3px solid ${a}`;
  }
  function renderShop() {
    $('sh-coins').textContent = fmt(save.coins);
    $('sh-keys').textContent = fmt(save.keys);
    $('sh-boards').textContent = fmt(save.boards);
    for (const b of $('sh-tabs').querySelectorAll('button')) { b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(b.dataset.tab === shopTab)); }
    const list = $('sh-list');
    list.innerHTML = '';
    list.classList.toggle('rows', shopTab === 'upgrades' || shopTab === 'items');
    const card = (id, pic, name, desc, owned, selected, cost, onBuy, onSelect, onPreview) => {
      const el = document.createElement('div');
      el.className = 'shop-card' + ((preview ? preview === id : selected) ? ' on' : '');
      el.dataset.id = id;
      el.tabIndex = 0;
      el.innerHTML = `<div class="pic">${pic}</div><div class="name"></div><div class="desc"></div>`;
      el.querySelector('.name').textContent = name;
      el.querySelector('.desc').textContent = desc;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn' + (selected ? ' owned' : '');
      if (selected) { b.textContent = I.t('selected'); b.disabled = true; }
      else if (owned) { b.textContent = I.t('select'); b.addEventListener('click', (e) => { e.stopPropagation(); onSelect(); }); }
      else {
        b.textContent = I.t('buy', { cost: fmt(cost) });
        if (save.coins < cost) { b.disabled = true; b.title = I.t('notEnough'); }
        b.addEventListener('click', (e) => { e.stopPropagation(); onBuy(); });
      }
      el.appendChild(b);
      el.addEventListener('click', onPreview);
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPreview(); } });
      list.appendChild(el);
    };
    if (shopTab === 'chars') {
      for (const c of M.CHARS) {
        card(c.id, charSvg(c), I.t('c_' + c.id), I.t('c_' + c.id + '_d'), save.owned.chars.includes(c.id), save.char === c.id, c.cost,
          () => { if (M.buyChar(save, c.id).ok) { M.selectChar(save, c.id); M.checkAchievements(save); persist(); A.play('power'); preview = null; view.setCharacter(c); renderShop(); } },
          () => { M.selectChar(save, c.id); persist(); A.play('click'); preview = null; view.setCharacter(c); renderShop(); },
          () => { preview = c.id; view.setCharacter(c); renderShop(); });
      }
    } else if (shopTab === 'boards') {
      for (const b of M.BOARDS) {
        card(b.id, `<div class="board-pic" style="${boardCss(b)}"></div>`, I.t('b_' + b.id), '', save.owned.boards.includes(b.id), save.board === b.id, b.cost,
          () => { if (M.buyBoard(save, b.id).ok) { M.selectBoard(save, b.id); persist(); A.play('power'); preview = null; view.setBoard(b); renderShop(); } },
          () => { M.selectBoard(save, b.id); persist(); A.play('click'); preview = null; view.setBoard(b); renderShop(); },
          () => { preview = b.id; view.setBoard(b); renderShop(); });
      }
    } else if (shopTab === 'upgrades') {
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
          btn.textContent = I.t('buy', { cost: fmt(cost) });
          if (save.coins < cost) { btn.disabled = true; btn.title = I.t('notEnough'); }
        }
        btn.addEventListener('click', () => { if (M.buyUpgrade(save, k).ok) { M.checkAchievements(save); persist(); A.play('power'); renderShop(); } });
        row.appendChild(btn);
        list.appendChild(row);
      }
    } else {
      for (const id of ['key', 'hoverboard']) {
        const row = document.createElement('div');
        row.className = 'upg';
        row.dataset.item = id;
        row.innerHTML = `<div class="ico">${id === 'key' ? ICONS.key : ICONS.board}</div><div><div class="name"></div><div class="desc"></div></div>`;
        row.querySelector('.name').textContent = `${I.t('item_' + id)} · ${I.t('owned', { n: id === 'key' ? save.keys : save.boards })}`;
        row.querySelector('.desc').textContent = I.t('item_' + id + '_d', keysVars());
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn buy';
        btn.textContent = I.t('buy', { cost: fmt(M.ITEMS[id]) });
        btn.disabled = save.coins < M.ITEMS[id];
        btn.addEventListener('click', () => { if (M.buyItem(save, id).ok) { persist(); A.play('power'); renderShop(); } });
        row.appendChild(btn);
        list.appendChild(row);
      }
    }
  }
  $('sh-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tab]');
    if (!b) return;
    shopTab = b.dataset.tab;
    if (preview) { preview = null; view.setCharacter(charCfg(save.char)); view.setBoard(boardCfg(save.board)); }
    view.setShowcase(true, { board: shopTab === 'boards' });
    A.play('click');
    renderShop();
  });

  // ---------- achievements ----------
  const BADGE = {
    flag: '<path d="M10 6v20M10 7h12l-3 4 3 4H10" stroke="#fff" stroke-width="2.4" fill="#fff" fill-opacity=".9" stroke-linejoin="round"/>',
    road: '<path d="M12 26l4-20M20 26l-4-20" stroke="#fff" stroke-width="2.4"/><path d="M16 9v3M16 15v3M16 21v3" stroke="#fff" stroke-width="2"/>',
    coin: '<circle cx="16" cy="16" r="8" fill="#fff"/><text x="16" y="20" font-size="10" font-weight="900" text-anchor="middle" fill="#c98b00" font-family="Arial">¤</text>',
    bank: '<path d="M7 13l9-5 9 5zM9 14v8M13 14v8M19 14v8M23 14v8M7 24h18" stroke="#fff" stroke-width="2.2" fill="#fff"/>',
    star: '<path d="M16 6l3 7 7 .6-5.4 4.6 1.7 7L16 21.4 9.7 25.2l1.7-7L6 13.6l7-.6z" fill="#fff"/>',
    bolt: '<path d="M18 5l-9 13h6l-2 9 9-13h-6z" fill="#fff"/>',
    train: '<rect x="9" y="7" width="14" height="15" rx="3" fill="#fff"/><rect x="11" y="10" width="10" height="5" fill="#2e7dd1"/><path d="M11 25l2-3M21 25l-2-3" stroke="#fff" stroke-width="2"/>',
    hop: '<path d="M6 22h8M18 22h8" stroke="#fff" stroke-width="3"/><path d="M10 18q6-14 12 0" stroke="#fff" stroke-width="2.4" fill="none"/>',
    wind: '<path d="M6 12h14a3 3 0 1 0-3-3M6 17h18a3 3 0 1 1-3 3M6 22h9" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round"/>',
    jet: '<rect x="10" y="7" width="5" height="12" rx="2.5" fill="#fff"/><rect x="17" y="7" width="5" height="12" rx="2.5" fill="#fff"/><path d="M11 20h3l-1.5 6zM18 20h3l-1.5 6z" fill="#ffe14f"/>',
    map: '<path d="M6 9l6-2 8 3 6-2v16l-6 2-8-3-6 2z" fill="#fff"/><path d="M12 7v16M20 10v16" stroke="#3aa35b" stroke-width="1.5"/>',
    mult: '<text x="16" y="21" font-size="13" font-weight="900" text-anchor="middle" fill="#fff" font-family="Arial">x</text>',
    people: '<circle cx="12" cy="11" r="3.5" fill="#fff"/><circle cx="21" cy="11" r="3.5" fill="#fff"/><path d="M6 24a6 6 0 0 1 12 0zM15 24a6 6 0 0 1 12 0z" fill="#fff"/>',
    calendar: '<rect x="8" y="9" width="16" height="15" rx="2" fill="#fff"/><path d="M8 13h16" stroke="#8a5bd1" stroke-width="2"/><path d="M12 7v4M20 7v4" stroke="#fff" stroke-width="2"/>',
    heart: '<path d="M16 25s-9-5.5-9-11.5A4.5 4.5 0 0 1 16 11a4.5 4.5 0 0 1 9 2.5C25 19.5 16 25 16 25z" fill="#fff"/>',
    up: '<path d="M16 6l8 9h-5v10h-6V15H8z" fill="#fff"/>',
  };
  function badge(a, locked) {
    return `<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="15" fill="${a.color}"/><circle cx="16" cy="16" r="12.5" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="1.5"/>${BADGE[a.icon] || ''}${locked ? '' : ''}</svg>`;
  }
  function renderAch() {
    const list = $('ac-list');
    list.innerHTML = '';
    let n = 0;
    for (const a of M.ACHIEVEMENTS) {
      const got = !!save.achievements[a.id];
      if (got) n++;
      const el = document.createElement('div');
      el.className = 'ach' + (got ? '' : ' locked');
      el.dataset.ach = a.id;
      el.innerHTML = badge(a, !got) + '<div><div class="name"></div><div class="desc"></div></div>';
      el.querySelector('.name').textContent = I.t('a_' + a.id);
      el.querySelector('.desc').textContent = I.t('a_' + a.id + '_d');
      list.appendChild(el);
    }
    $('ac-count').textContent = I.t('achCount', { n, max: M.ACHIEVEMENTS.length });
  }

  // ---------- records and statistics ----------
  function renderRecords() {
    const box = $('rc-runs');
    box.innerHTML = '';
    if (!save.bestRuns.length) { box.textContent = I.t('noRuns'); }
    save.bestRuns.forEach((r, i) => {
      const d = document.createElement('div');
      d.className = 'run';
      d.innerHTML = `<b>${i + 1}</b><span></span><span></span><small></small>`;
      const s = d.querySelectorAll('span');
      s[0].textContent = fmt(r.score);
      s[1].textContent = I.t('meters', { n: fmt(r.distance) }) + ' · ' + fmt(r.coins) + ' ¤';
      d.querySelector('small').textContent = I.t('c_' + r.char) + (r.daily ? ' · ' + I.t('daily_mark') : '') + (r.date ? ' · ' + r.date.slice(5).split('-').reverse().join('.') : '');
      box.appendChild(d);
    });
    const st = save.stats;
    const deaths = Object.entries(st.deaths).sort((a, b) => b[1] - a[1]).filter((x) => x[1] > 0);
    const rows = [
      ['s_runs', fmt(save.runs)], ['s_distance', I.t('meters', { n: fmt(st.distance) })], ['s_time', I.t('minutes', { n: fmt(st.time / 60) })],
      ['s_totalCoins', fmt(save.totalCoins)], ['s_jumps', fmt(st.jumps)], ['s_slides', fmt(st.slides)], ['s_roofs', fmt(st.roofs)],
      ['s_hops', fmt(st.hops)], ['s_near', fmt(st.near)], ['s_tricks', fmt(st.tricks)], ['s_bestCombo', 'x' + fmt(st.bestCombo)],
      ['s_powers', fmt(st.powers)], ['s_jets', fmt(st.jets)], ['s_boards', fmt(st.boards)], ['s_revives', fmt(st.revives)],
      ['s_missions', fmt(st.missions)], ['s_dailies', fmt(st.dailies)],
      ['s_deaths', deaths.length ? deaths.slice(0, 2).map(([k, n]) => `${I.t('death_' + k)} (${n})`).join(', ') : '—'],
    ];
    const dl = $('rc-stats');
    dl.innerHTML = '';
    for (const [k, v] of rows) {
      const dt = document.createElement('dt'); dt.textContent = I.t(k);
      const dd = document.createElement('dd'); dd.textContent = v; dd.dataset.stat = k;
      dl.append(dt, dd);
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
    const changed = document.documentElement.dataset.theme !== t;
    document.documentElement.dataset.theme = t;
    view.setTheme(t);
    if (changed && demo && run) setRun(newDemo());
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
    setSeg('s-particles', s.particles);
    $('s-music').value = Math.round(s.music * 100);
    $('s-sfx').value = Math.round(s.sfx * 100);
    $('s-fps').checked = s.showFps;
    $('s-shadows').checked = s.shadows;
    $('s-shake').checked = s.shake;
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
  bindSeg('s-lang', (v) => { save.settings.lang = v; I.lang = v; view.setLang(v); applyTexts(); });
  bindSeg('s-theme', (v) => { save.settings.theme = v; applyTheme(); });
  bindSeg('s-quality', (v) => { save.settings.quality = v; if (v === 'auto') autoLevel = 'high'; view.setQuality(qualityLevel()); resize(); });
  bindSeg('s-particles', (v) => { save.settings.particles = v; view.setOptions({ particles: v }); });
  $('s-music').addEventListener('input', (e) => { save.settings.music = e.target.value / 100; A.setVolumes(save.settings.music, save.settings.sfx); settingsChanged(); });
  $('s-sfx').addEventListener('input', (e) => { save.settings.sfx = e.target.value / 100; A.setVolumes(save.settings.music, save.settings.sfx); settingsChanged(); });
  $('s-fps').addEventListener('change', (e) => { save.settings.showFps = e.target.checked; $('hud-fps').hidden = !e.target.checked; settingsChanged(); });
  $('s-shadows').addEventListener('change', (e) => { save.settings.shadows = e.target.checked; view.setOptions({ shadows: e.target.checked }); settingsChanged(); });
  $('s-shake').addEventListener('change', (e) => { save.settings.shake = e.target.checked; view.setOptions({ shake: e.target.checked }); settingsChanged(); });
  $('s-reset').addEventListener('click', () => { save.settings.bindings = R.defaultBindings(); capture = null; renderKeys(); settingsChanged(); A.play('click'); });
  $('s-tutorial').addEventListener('click', () => { save.tutorialDone = false; persist(); A.play('click'); toast(I.t('tutorialSet'), 2); $('s-tutorial').textContent = I.t('tutorialSet'); });

  // ---------- buttons ----------
  $('m-play').addEventListener('click', () => start());
  $('m-daily').addEventListener('click', () => { if (save.daily.date === TODAY && save.daily.done) openSub('missions'); else start({ daily: true }); });
  $('m-missions').addEventListener('click', () => openSub('missions'));
  $('m-shop').addEventListener('click', () => openSub('shop'));
  $('m-ach').addEventListener('click', () => openSub('ach'));
  $('m-records').addEventListener('click', () => openSub('records'));
  $('m-settings').addEventListener('click', () => openSub('settings'));
  $('m-howto').addEventListener('click', () => openSub('howto'));
  $('p-resume').addEventListener('click', resume);
  $('p-restart').addEventListener('click', () => start({ daily: !!runInfo.daily }));
  $('p-settings').addEventListener('click', () => openSub('settings'));
  $('p-menu').addEventListener('click', toMenu);
  $('c-keys').addEventListener('click', continueRun);
  $('c-buy').addEventListener('click', continueRun);
  $('c-no').addEventListener('click', () => { if (state === 'continue') finish(); });
  $('o-again').addEventListener('click', () => start());
  $('o-shop').addEventListener('click', () => openSub('shop'));
  $('o-menu').addEventListener('click', toMenu);
  for (const id of ['sh-done', 'mi-done', 'ac-done', 'rc-done', 's-done', 'h-done']) $(id).addEventListener('click', back);
  $('btn-pause').addEventListener('click', () => { A.init(); pause(); });
  $('btn-board').addEventListener('click', (e) => { e.preventDefault(); if (state === 'playing') playerAction('board'); });

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
      else if (act === 'board' && state === 'playing' && run.boardsLeft <= 0) toast(I.t('noBoards'));
      else if (act && state === 'playing') playerAction(act);
      return;
    }
    if (state === 'paused' && overlay === 'pause') {
      if (act === 'pause' && !e.repeat) { e.preventDefault(); resume(); }
      return;
    }
    if (e.code === 'Escape' && backTo !== null && ['settings', 'shop', 'missions', 'ach', 'records', 'howto'].includes(overlay)) { e.preventDefault(); back(); }
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
    if (a) playerAction(a);
    touch.done = true;          // one swipe per touch, recognised as soon as it is long enough
  });
  function endTouch(e) {
    if (!touch || e.pointerId !== touch.id) return;
    if (!touch.done && state === 'playing' && e.type === 'pointerup') {
      const rect = canvas.getBoundingClientRect();
      const a = R.classifySwipe(e.clientX - touch.x, e.clientY - touch.y, performance.now() - touch.t, touch.x - rect.left, rect.width, rect.height);
      if (a) playerAction(a);
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
  setRun(newDemo());
  applyTexts();
  resize();
  show('menu');
  requestAnimationFrame((t) => { last = t; frame(t); });

  // ---------- for tests and debugging ----------
  window.RailRunner = {
    version: VERSION,
    core: R,
    meta: M,
    audio: A,
    today: TODAY,
    get run() { return run; },
    get state() { return state; },
    get overlay() { return overlay; },
    get demo() { return demo; },
    get save() { return save; },
    get manual() { return MANUAL; },
    get tutorial() { return tut; },
    get lastOver() { return lastOver; },
    view: { info: () => view.info(), get theme() { return view.theme; }, get quality() { return view.quality; }, get look() { return view.look; }, get scene() { return view.scene; } },
    // move the simulation by whole steps (works in ?manual=1 and normally);
    // { auto: true } - the autopilot plays the run (tests and README frames)
    advance(seconds, opts = {}) {
      const n = Math.round(seconds / DT);
      for (let i = 0; i < n; i++) {
        if (opts.auto && !demo && state === 'playing') {
          const acts = R.autopilot(run);
          run.queue.length -= acts.length;
          for (const x of acts) playerAction(x);
        }
        tick(DT);
      }
      draw(DT);
      return { state, z: run.z };
    },
    setAutoQuality: setAuto,
    start, pause, resume, toMenu, continueRun, finish: () => { if (state === 'continue') finish(); },
  };
})();
