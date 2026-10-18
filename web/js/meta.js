// RailRunner meta: everything between runs - the save (with the 1.0 migration), the shop
// (characters, boards, upgrades, keys and hoverboards), missions with the score multiplier,
// the daily challenge, achievements, statistics and the best runs. Pure rules, no screen:
// window.RRMeta in the browser, require() in the laws (tests/unit/meta.test.js).
(function (root, factory) {
  const core = typeof module === 'object' && module.exports ? require('./core.js') : root.RRCore;
  const api = factory(core);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RRMeta = api;
})(typeof self !== 'undefined' ? self : this, function (R) {
  'use strict';

  const SAVE_VERSION = 2;
  const GIFT_BOARDS = 3;        // a new player starts with three hoverboards (2.0.2: older saves get them once)

  // ---------- the catalog ----------
  // Characters: body proportions, colours and what they wear (render.js builds them).
  const CHARS = [
    { id: 'kit', cost: 0, height: 1.0, build: 1.0, skin: 0xf1c39b, top: 0xff6a2a, pants: 0x2b3a67, shoes: 0xf4f4f4, hair: 0x3a2618, hat: 'cap', hatColor: 0x1f8fff, extra: 'backpack', extraColor: 0x2f9e6a },
    { id: 'mila', cost: 1500, height: 0.95, build: 0.88, skin: 0xe8b48c, top: 0x8a4cff, pants: 0x1d2235, shoes: 0xffffff, hair: 0x7a3b1c, hat: 'ponytail', hatColor: 0x7a3b1c, extra: 'scarf', extraColor: 0xffd23a },
    { id: 'zoe', cost: 2500, height: 0.92, build: 0.95, skin: 0xc98e64, top: 0x2fa36b, pants: 0x3b3b46, shoes: 0xff5a5a, hair: 0x1b1b1b, hat: 'beanie', hatColor: 0xff8c1a, extra: 'scarf', extraColor: 0xe8e8e8 },
    { id: 'max', cost: 3500, height: 1.1, build: 1.08, skin: 0x8d5a3b, top: 0xd8342a, pants: 0x1a1a1a, shoes: 0xffffff, hair: 0x111111, hat: 'helmet', hatColor: 0xf2f2f2, extra: 'headphones', extraColor: 0x222222 },
    { id: 'bolt', cost: 5000, height: 1.02, build: 1.15, skin: 0xb8c3cf, top: 0x5d6b7c, pants: 0x3d4654, shoes: 0x2b2f36, hair: 0x5d6b7c, hat: 'antenna', hatColor: 0xff3b3b, extra: 'backpack', extraColor: 0xffc928, robot: true },
    { id: 'nova', cost: 8000, height: 1.0, build: 0.92, skin: 0xf5d0b5, top: 0x161a2e, pants: 0x161a2e, shoes: 0x16f0ff, hair: 0xff3bb4, hat: 'spikes', hatColor: 0xff3bb4, extra: 'neon', extraColor: 0x16f0ff },
  ];
  // Boards: the look of the hoverboard (render.js draws the pattern).
  const BOARDS = [
    { id: 'basic', cost: 0, base: 0x7d3cff, a: 0xff4fb8, b: 0x4fe3ff, pattern: 'stripes' },
    { id: 'flame', cost: 1000, base: 0x1d1d22, a: 0xff5a1a, b: 0xffd23a, pattern: 'flames' },
    { id: 'wave', cost: 1500, base: 0x0b6fb8, a: 0x5fe0ff, b: 0xffffff, pattern: 'waves' },
    { id: 'stars', cost: 2500, base: 0x141a3a, a: 0xffe14f, b: 0x8fa3ff, pattern: 'stars' },
    { id: 'neon', cost: 4000, base: 0x0d0d14, a: 0x16f0ff, b: 0xff3bb4, pattern: 'grid', glow: true },
    { id: 'gold', cost: 7000, base: 0xd9a400, a: 0xfff1a8, b: 0x8a5a00, pattern: 'checker' },
  ];
  const ITEMS = Object.freeze({ key: 500, hoverboard: 200 });
  const MAX_MULT = 30;

  // ---------- missions ----------
  // scope 'run' - reach the value in one run; 'total' - add up over runs.
  const MISSIONS = {
    coins_run: { scope: 'run', stat: 'coins', base: 40, step: 20 },
    dist_run: { scope: 'run', stat: 'distance', base: 600, step: 300 },
    score_run: { scope: 'run', stat: 'score', base: 1500, step: 1200 },
    combo_run: { scope: 'run', stat: 'bestCombo', base: 4, step: 2 },
    hurdles_run: { scope: 'run', stat: 'hurdles', base: 5, step: 3 },
    district_run: { scope: 'run', stat: 'districts', base: 2, step: 1, max: 6 },
    jumps: { scope: 'total', stat: 'jumps', base: 15, step: 10 },
    slides: { scope: 'total', stat: 'slides', base: 12, step: 8 },
    powers: { scope: 'total', stat: 'powers', base: 3, step: 2 },
    roofs: { scope: 'total', stat: 'roofs', base: 3, step: 2 },
    hops: { scope: 'total', stat: 'hops', base: 1, step: 1 },
    near: { scope: 'total', stat: 'near', base: 3, step: 2 },
    pits: { scope: 'total', stat: 'pits', base: 3, step: 2 },
    jets: { scope: 'total', stat: 'jets', base: 1, step: 1 },
    runs: { scope: 'total', stat: 'runs', base: 3, step: 1 },
  };
  const MISSION_IDS = Object.keys(MISSIONS);
  const missionTier = (level) => Math.floor((level - 1) / 2);
  function missionTarget(id, level) {
    const m = MISSIONS[id];
    const t = m.base + m.step * missionTier(level);
    return m.max ? Math.min(m.max, t) : t;
  }
  const missionReward = (level) => 50 + 30 * missionTier(level);
  // three different missions for a multiplier level - always the same for the same level
  function missionSet(level) {
    const r = R.rng((Math.imul(level, 2654435761) ^ 0x6d2b79f5) >>> 0);
    const ids = MISSION_IDS.slice();
    const out = [];
    while (out.length < 3) out.push(ids.splice(Math.floor(r() * ids.length), 1)[0]);
    return out;
  }
  // what one run adds: the run's stats plus score, distance and the run itself
  function runValues(res) {
    const s = Object.assign({}, res && res.stats);
    s.coins = res ? res.coins : 0;
    s.score = res ? res.score : 0;
    s.distance = res ? res.distance : 0;
    s.runs = res && res.finished ? 1 : 0;
    return s;
  }
  // missions as the player sees them now (during a run: with that run counted)
  function missionView(save, res) {
    const m = save.missions;
    const vals = runValues(res);
    return m.ids.map((id, i) => {
      const def = MISSIONS[id];
      const target = missionTarget(id, m.level);
      const v = vals[def.stat] || 0;
      const value = m.done[i] ? target : Math.min(target, def.scope === 'run' ? Math.max(m.progress[i], v) : m.progress[i] + v);
      return { id, target, value, done: m.done[i] || value >= target, reward: missionReward(m.level) };
    });
  }
  // after a run: progress is kept, finished missions pay, a finished set raises the multiplier
  function commitMissions(save, res) {
    const m = save.missions;
    const view = missionView(save, res);
    const out = { completed: [], coins: 0, levelUp: false, keys: 0 };
    view.forEach((v, i) => {
      if (v.done && !m.done[i]) { m.done[i] = true; out.completed.push(v.id); out.coins += v.reward; }
      m.progress[i] = v.value;
    });
    save.stats.missions += out.completed.length;
    if (m.done.every(Boolean)) {
      out.levelUp = true;
      if (m.level < MAX_MULT) m.level++;
      m.ids = missionSet(m.level);
      m.progress = [0, 0, 0];
      m.done = [false, false, false];
      out.keys = 1;
      save.keys += 1;
    }
    save.coins = Math.min(1e9, save.coins + out.coins);
    return out;
  }
  // a mission can be skipped for keys (as many as the multiplier level / 5, at least one)
  const skipCost = (level) => Math.max(1, Math.ceil(level / 5));
  function skipMission(save, i) {
    const m = save.missions;
    if (!(i >= 0 && i < 3) || m.done[i]) return { ok: false, reason: 'index' };
    const cost = skipCost(m.level);
    if (save.keys < cost) return { ok: false, reason: 'keys', cost };
    save.keys -= cost;
    m.done[i] = true;
    m.progress[i] = missionTarget(m.ids[i], m.level);
    return { ok: true, cost };
  }

  // ---------- the daily challenge ----------
  // One world (seed) and one goal per calendar day, the same for everyone that day.
  const DAILY_GOALS = [
    { type: 'score', base: 3000, step: 500 },
    { type: 'coins', base: 60, step: 10 },
    { type: 'distance', base: 1200, step: 200 },
    { type: 'tricks', base: 10, step: 2 },
    { type: 'roofs', base: 3, step: 1 },
  ];
  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  function dateKey(d) {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  function prevDay(key) {
    const [y, m, d] = key.split('-').map(Number);
    return dateKey(new Date(y, m - 1, d - 1));
  }
  function dailyFor(key) {
    const h = hashStr('railrunner-daily-' + key);
    const r = R.rng(h);
    const g = DAILY_GOALS[Math.floor(r() * DAILY_GOALS.length)];
    const n = g.base + g.step * Math.floor(r() * 5);
    return { date: key, seed: (h ^ 0x2545f491) >>> 0, goal: { type: g.type, n }, reward: { coins: 300, keys: 1 } };
  }
  function dailyValue(goal, res) {
    if (!res) return 0;
    if (goal.type === 'score') return res.score;
    if (goal.type === 'coins') return res.coins;
    if (goal.type === 'distance') return res.distance;
    return (res.stats && res.stats[goal.type]) || 0;
  }
  // the reward is paid once a day; days in a row add 50 coins each (up to 7)
  function completeDaily(save, key) {
    const d = save.daily;
    if (d.date === key && d.done) return null;
    const daily = dailyFor(key);
    d.streak = d.last === prevDay(key) ? Math.min(999, d.streak + 1) : 1;
    d.last = key;
    d.date = key;
    d.done = true;
    const coins = daily.reward.coins + 50 * Math.min(7, d.streak - 1);
    save.coins = Math.min(1e9, save.coins + coins);
    save.keys += daily.reward.keys;
    save.stats.dailies++;
    return { coins, keys: daily.reward.keys, streak: d.streak };
  }

  // ---------- statistics ----------
  const STAT_KEYS = ['distance', 'time', 'jumps', 'slides', 'lanes', 'powers', 'roofs', 'hops', 'near', 'tricks', 'jets',
    'boards', 'hurdles', 'bars', 'pits', 'fences', 'keys', 'bumps', 'revives', 'missions', 'dailies', 'bestCombo', 'maxDistricts',
    'saves', 'bestClean', 'bestCoins', 'boxes'];
  const DEATHS = ['hurdle', 'bar', 'fence', 'pit', 'train', 'moving', 'freight', 'ramp'];
  function defaultStats() {
    const s = {};
    for (const k of STAT_KEYS) s[k] = 0;
    s.deaths = {};
    for (const k of DEATHS) s.deaths[k] = 0;
    return s;
  }

  // ---------- achievements ----------
  // Each has a badge (icon + colour, drawn by app.js), a tier (bronze, silver, gold), pays 100 coins
  // once and gives a mystery box of its tier once (2.1.0).
  const TIERS = ['bronze', 'silver', 'gold'];
  const ACHIEVEMENTS = [
    { id: 'first', tier: 'bronze', icon: 'flag', color: '#3aa35b', test: (s) => s.runs >= 1 },
    { id: 'km1', tier: 'bronze', icon: 'road', color: '#2e7dd1', test: (s) => s.bestDistance >= 1000 },
    { id: 'km5', tier: 'silver', icon: 'road', color: '#8a5bd1', test: (s) => s.bestDistance >= 5000 },
    { id: 'km10', tier: 'gold', icon: 'road', color: '#e0a526', test: (s) => s.bestDistance >= 10000 },
    { id: 'clean1k', tier: 'bronze', icon: 'shield', color: '#16a3b8', test: (s) => s.stats.bestClean >= 1000 },
    { id: 'clean3k', tier: 'silver', icon: 'shield', color: '#2e7dd1', test: (s) => s.stats.bestClean >= 3000 },
    { id: 'clean6k', tier: 'gold', icon: 'shield', color: '#d8443a', test: (s) => s.stats.bestClean >= 6000 },
    { id: 'coins100', tier: 'bronze', icon: 'coin', color: '#e0a526', test: (s) => s.stats.bestCoins >= 100 || s.bestRuns.some((r) => r.coins >= 100) },
    { id: 'coins300', tier: 'silver', icon: 'coin', color: '#ff6a2a', test: (s) => s.stats.bestCoins >= 300 },
    { id: 'coins600', tier: 'gold', icon: 'coin', color: '#d8443a', test: (s) => s.stats.bestCoins >= 600 },
    { id: 'bank1k', tier: 'bronze', icon: 'bank', color: '#3aa35b', test: (s) => s.totalCoins >= 1000 },
    { id: 'bank10k', tier: 'silver', icon: 'bank', color: '#d8443a', test: (s) => s.totalCoins >= 10000 },
    { id: 'bank50k', tier: 'gold', icon: 'bank', color: '#e0a526', test: (s) => s.totalCoins >= 50000 },
    { id: 'score10k', tier: 'silver', icon: 'star', color: '#2e7dd1', test: (s) => s.best >= 10000 },
    { id: 'score50k', tier: 'gold', icon: 'star', color: '#d8443a', test: (s) => s.best >= 50000 },
    { id: 'jumps100', tier: 'bronze', icon: 'jump', color: '#3aa35b', test: (s) => s.stats.jumps >= 100 },
    { id: 'jumps1k', tier: 'silver', icon: 'jump', color: '#2e7dd1', test: (s) => s.stats.jumps >= 1000 },
    { id: 'jumps5k', tier: 'gold', icon: 'jump', color: '#d8443a', test: (s) => s.stats.jumps >= 5000 },
    { id: 'slides100', tier: 'bronze', icon: 'slide', color: '#16a3b8', test: (s) => s.stats.slides >= 100 },
    { id: 'slides1k', tier: 'silver', icon: 'slide', color: '#8a5bd1', test: (s) => s.stats.slides >= 1000 },
    { id: 'slides5k', tier: 'gold', icon: 'slide', color: '#d8443a', test: (s) => s.stats.slides >= 5000 },
    { id: 'powers25', tier: 'bronze', icon: 'bolt', color: '#e0a526', test: (s) => s.stats.powers >= 25 },
    { id: 'powers100', tier: 'silver', icon: 'bolt', color: '#8a5bd1', test: (s) => s.stats.powers >= 100 },
    { id: 'powers500', tier: 'gold', icon: 'bolt', color: '#d8443a', test: (s) => s.stats.powers >= 500 },
    { id: 'saves1', tier: 'bronze', icon: 'board', color: '#8a5bd1', test: (s) => s.stats.saves >= 1 },
    { id: 'saves10', tier: 'silver', icon: 'board', color: '#ff6a2a', test: (s) => s.stats.saves >= 10 },
    { id: 'saves50', tier: 'gold', icon: 'board', color: '#16a3b8', test: (s) => s.stats.saves >= 50 },
    { id: 'missions10', tier: 'bronze', icon: 'check', color: '#3aa35b', test: (s) => s.stats.missions >= 10 },
    { id: 'missions50', tier: 'silver', icon: 'check', color: '#2e7dd1', test: (s) => s.stats.missions >= 50 },
    { id: 'missions150', tier: 'gold', icon: 'check', color: '#e0a526', test: (s) => s.stats.missions >= 150 },
    { id: 'combo10', tier: 'silver', icon: 'bolt', color: '#ff6a2a', test: (s) => s.stats.bestCombo >= 10 },
    { id: 'roofs50', tier: 'silver', icon: 'train', color: '#2e7dd1', test: (s) => s.stats.roofs >= 50 },
    { id: 'hops10', tier: 'silver', icon: 'hop', color: '#8a5bd1', test: (s) => s.stats.hops >= 10 },
    { id: 'near25', tier: 'silver', icon: 'wind', color: '#16a3b8', test: (s) => s.stats.near >= 25 },
    { id: 'jets10', tier: 'silver', icon: 'jet', color: '#ff6a2a', test: (s) => s.stats.jets >= 10 },
    { id: 'tour', tier: 'gold', icon: 'map', color: '#3aa35b', test: (s) => s.stats.maxDistricts >= 5 },
    { id: 'mult5', tier: 'silver', icon: 'mult', color: '#e0a526', test: (s) => s.missions.level >= 5 },
    { id: 'mult10', tier: 'gold', icon: 'mult', color: '#d8443a', test: (s) => s.missions.level >= 10 },
    { id: 'crew3', tier: 'silver', icon: 'people', color: '#2e7dd1', test: (s) => s.owned.chars.length >= 3 },
    { id: 'crewAll', tier: 'gold', icon: 'people', color: '#d8443a', test: (s) => s.owned.chars.length >= CHARS.length },
    { id: 'daily1', tier: 'bronze', icon: 'calendar', color: '#e0a526', test: (s) => s.stats.dailies >= 1 },
    { id: 'streak3', tier: 'silver', icon: 'calendar', color: '#8a5bd1', test: (s) => s.daily.streak >= 3 },
    { id: 'revive', tier: 'bronze', icon: 'heart', color: '#d8443a', test: (s) => s.stats.revives >= 1 },
    { id: 'upgrade', tier: 'gold', icon: 'up', color: '#3aa35b', test: (s) => R.POWERS.some((k) => s.upgrades[k] >= R.MAX_LEVEL) },
  ];
  const ACH_REWARD = 100;
  // every unlocked achievement whose box was not given yet gives it now: after a run, and once for
  // the achievements of a 2.0.5 save (the mark boxGot stays, so a reload gives nothing more)
  function grantBoxes(save) {
    const got = [];
    for (const a of ACHIEVEMENTS) {
      if (!save.achievements[a.id] || save.boxGot[a.id]) continue;
      save.boxGot[a.id] = 1;
      save.boxes[a.tier] = Math.min(99999, save.boxes[a.tier] + 1);
      got.push(a.id);
    }
    return got;
  }
  function checkAchievements(save) {
    const got = [];
    for (const a of ACHIEVEMENTS) {
      if (save.achievements[a.id]) continue;
      if (a.test(save)) { save.achievements[a.id] = 1; got.push(a.id); }
    }
    save.coins = Math.min(1e9, save.coins + got.length * ACH_REWARD);
    grantBoxes(save);
    return got;
  }
  const achTier = (id) => { const a = ACHIEVEMENTS.find((x) => x.id === id); return a ? a.tier : null; };

  // ---------- mystery boxes ----------
  // What a box can drop: p - the chance (each table sums to 1), n - how many, coins - from min to max.
  // 'skin' is the rare one: a character or a hoverboard look not owned yet (all owned - SKIN_COINS).
  // A better tier: more of everything and a bigger chance of the rare one.
  const DROPS = {
    bronze: [{ type: 'coins', p: 0.55, min: 100, max: 250 }, { type: 'boards', p: 0.22, n: 1 }, { type: 'keys', p: 0.2, n: 1 }, { type: 'skin', p: 0.03 }],
    silver: [{ type: 'coins', p: 0.45, min: 250, max: 600 }, { type: 'boards', p: 0.25, n: 2 }, { type: 'keys', p: 0.24, n: 2 }, { type: 'skin', p: 0.06 }],
    gold: [{ type: 'coins', p: 0.35, min: 600, max: 1500 }, { type: 'boards', p: 0.27, n: 3 }, { type: 'keys', p: 0.28, n: 3 }, { type: 'skin', p: 0.1 }],
  };
  const REWARD_TYPES = ['coins', 'boards', 'keys', 'skin'];
  const SKIN_COINS = 2000;
  // one roll of a box: r - a random function [0, 1); the save only says which looks are owned
  function rollBox(tier, r, save) {
    const table = DROPS[tier];
    const x = r();
    let acc = 0, d = table[table.length - 1];
    for (const t of table) { acc += t.p; if (x < acc) { d = t; break; } }
    if (d.type === 'coins') return { type: 'coins', n: d.min + Math.floor(r() * (d.max - d.min + 1)) };
    if (d.type !== 'skin') return { type: d.type, n: d.n };
    const free = CHARS.filter((c) => !save.owned.chars.includes(c.id)).map((c) => ({ kind: 'char', id: c.id }))
      .concat(BOARDS.filter((b) => !save.owned.boards.includes(b.id)).map((b) => ({ kind: 'board', id: b.id })));
    if (!free.length) return { type: 'skin', kind: null, id: null, coins: SKIN_COINS };
    const f = free[Math.floor(r() * free.length)];
    return { type: 'skin', kind: f.kind, id: f.id };
  }
  // the box's own random numbers come from the save's seed and the number of boxes opened: the same
  // save opens the same way (the laws set boxSeed), a reload does not roll again
  const boxRandom = (save) => R.rng((save.boxSeed ^ Math.imul(save.boxRolls + 1, 0x9e3779b1)) >>> 0);
  function openBox(save, tier) {
    if (!DROPS[tier] || !(save.boxes[tier] > 0)) return null;
    const reward = rollBox(tier, boxRandom(save), save);
    save.boxes[tier]--;
    save.boxRolls++;
    save.stats.boxes++;
    if (reward.type === 'coins') save.coins = Math.min(1e9, save.coins + reward.n);
    else if (reward.type === 'keys') save.keys = Math.min(99999, save.keys + reward.n);
    else if (reward.type === 'boards') save.boards = Math.min(99999, save.boards + reward.n);
    else if (reward.kind === 'char') save.owned.chars = charIds.filter((x) => x === reward.id || save.owned.chars.includes(x));
    else if (reward.kind === 'board') save.owned.boards = boardIds.filter((x) => x === reward.id || save.owned.boards.includes(x));
    else save.coins = Math.min(1e9, save.coins + reward.coins);
    return Object.assign({ tier }, reward);
  }
  const newSeed = () => (Math.floor(Math.random() * 4294967296) >>> 0) || 1;

  // ---------- the save ----------
  const THEMES = ['auto', 'light', 'dark'];
  const LANGS = ['ru', 'en'];
  const QUALITIES = ['auto', 'high', 'medium', 'low'];
  const PARTICLES = ['high', 'low', 'off'];
  const BEST_RUNS = 10;

  function defaultSettings() {
    return { lang: null, theme: 'auto', music: 0.5, sfx: 0.8, quality: 'auto', shadows: true, particles: 'high', shake: true, showFps: false, bindings: R.defaultBindings() };
  }
  function defaultSave() {
    return {
      v: SAVE_VERSION, best: 0, bestDistance: 0, coins: 0, keys: 0, boards: GIFT_BOARDS, boardGift: true, runs: 0, totalCoins: 0,
      upgrades: { magnet: 0, x2: 0, boots: 0, board: 0, jetpack: 0 },
      owned: { chars: ['kit'], boards: ['basic'] },
      char: 'kit',
      board: 'basic',
      missions: { level: 1, ids: missionSet(1), progress: [0, 0, 0], done: [false, false, false] },
      daily: { date: '', done: false, streak: 0, last: '' },
      achievements: {},
      boxes: { bronze: 0, silver: 0, gold: 0 },   // mystery boxes not opened yet
      boxGot: {},                                // achievements whose box was given
      boxSeed: newSeed(), boxRolls: 0,
      stats: defaultStats(),
      bestRuns: [],
      tutorialDone: false,
      settings: defaultSettings(),
    };
  }
  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const int = (v, def, min, max) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.floor(v))) : def);
  const num = (v, def, min, max) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def);
  const charIds = CHARS.map((c) => c.id), boardIds = BOARDS.map((b) => b.id);

  // Whatever lies in storage becomes a valid save. A 1.0 save (v: 1 or no v) keeps the best
  // score, coins, runs, upgrades and settings; it gets the new parts with their defaults and,
  // if it has runs, skips the tutorial.
  function sanitizeSave(raw) {
    const d = defaultSave();
    let src = raw;
    if (typeof raw === 'string') { try { src = JSON.parse(raw); } catch (e) { src = null; } }
    if (!isObj(src)) return d;
    const v1 = src.v !== SAVE_VERSION;
    d.best = int(src.best, 0, 0, 1e9);
    d.bestDistance = int(src.bestDistance, 0, 0, 1e9);
    d.coins = int(src.coins, 0, 0, 1e9);
    d.keys = int(src.keys, 0, 0, 99999);
    d.boards = int(src.boards, 0, 0, 99999);
    // a save from before 2.0.2 gets its hoverboards topped up to three, once: the mark stays
    if (src.boardGift !== true) d.boards = Math.max(d.boards, GIFT_BOARDS);
    d.runs = int(src.runs, 0, 0, 1e9);
    d.totalCoins = int(src.totalCoins, 0, 0, 1e12);
    if (isObj(src.upgrades)) for (const k of R.POWERS) d.upgrades[k] = int(src.upgrades[k], 0, 0, R.MAX_LEVEL);
    if (isObj(src.owned)) {
      const ch = Array.isArray(src.owned.chars) ? src.owned.chars.filter((x) => charIds.includes(x)) : [];
      const bo = Array.isArray(src.owned.boards) ? src.owned.boards.filter((x) => boardIds.includes(x)) : [];
      d.owned.chars = charIds.filter((x) => x === 'kit' || ch.includes(x));
      d.owned.boards = boardIds.filter((x) => x === 'basic' || bo.includes(x));
    }
    d.char = d.owned.chars.includes(src.char) ? src.char : 'kit';
    d.board = d.owned.boards.includes(src.board) ? src.board : 'basic';
    if (isObj(src.missions)) {
      const m = src.missions;
      d.missions.level = int(m.level, 1, 1, MAX_MULT);
      d.missions.ids = missionSet(d.missions.level);
      const sameSet = Array.isArray(m.ids) && m.ids.length === 3 && m.ids.every((x, i) => x === d.missions.ids[i]);
      if (sameSet) {
        for (let i = 0; i < 3; i++) {
          d.missions.progress[i] = int(Array.isArray(m.progress) ? m.progress[i] : 0, 0, 0, 1e9);
          d.missions.done[i] = Array.isArray(m.done) && m.done[i] === true;
        }
      }
    }
    if (isObj(src.daily)) {
      const s = src.daily;
      d.daily.date = typeof s.date === 'string' && DATE_RE.test(s.date) ? s.date : '';
      d.daily.last = typeof s.last === 'string' && DATE_RE.test(s.last) ? s.last : '';
      d.daily.done = d.daily.date !== '' && s.done === true;
      d.daily.streak = int(s.streak, 0, 0, 999);
    }
    if (isObj(src.achievements)) for (const a of ACHIEVEMENTS) if (src.achievements[a.id]) d.achievements[a.id] = 1;
    if (isObj(src.boxes)) for (const t of TIERS) d.boxes[t] = int(src.boxes[t], 0, 0, 99999);
    if (isObj(src.boxGot)) for (const a of ACHIEVEMENTS) if (src.boxGot[a.id] && d.achievements[a.id]) d.boxGot[a.id] = 1;
    if (typeof src.boxSeed === 'number' && Number.isFinite(src.boxSeed)) d.boxSeed = src.boxSeed >>> 0;
    d.boxRolls = int(src.boxRolls, 0, 0, 1e9);
    if (isObj(src.stats)) {
      for (const k of STAT_KEYS) d.stats[k] = num(src.stats[k], 0, 0, 1e12);
      if (isObj(src.stats.deaths)) for (const k of DEATHS) d.stats.deaths[k] = int(src.stats.deaths[k], 0, 0, 1e9);
    }
    if (Array.isArray(src.bestRuns)) {
      d.bestRuns = src.bestRuns.filter(isObj).slice(0, BEST_RUNS).map((r) => ({
        score: int(r.score, 0, 0, 1e9), distance: int(r.distance, 0, 0, 1e9), coins: int(r.coins, 0, 0, 1e9),
        combo: int(r.combo, 0, 0, 1e6), char: charIds.includes(r.char) ? r.char : 'kit',
        date: typeof r.date === 'string' && DATE_RE.test(r.date) ? r.date : '', daily: r.daily === true,
      })).sort((a, b) => b.score - a.score);
    }
    d.tutorialDone = v1 ? d.runs > 0 : src.tutorialDone === true;
    if (v1 && d.stats.distance === 0 && d.bestDistance > 0) d.stats.distance = d.bestDistance;
    const s = isObj(src.settings) ? src.settings : {};
    const st = d.settings;
    st.lang = LANGS.includes(s.lang) ? s.lang : null;
    st.theme = THEMES.includes(s.theme) ? s.theme : 'auto';
    st.music = num(s.music, 0.5, 0, 1);
    st.sfx = num(s.sfx, 0.8, 0, 1);
    st.quality = QUALITIES.includes(s.quality) ? s.quality : 'auto';
    st.shadows = s.shadows !== false;
    st.particles = PARTICLES.includes(s.particles) ? s.particles : 'high';
    st.shake = s.shake !== false;
    st.showFps = s.showFps === true;
    st.bindings = R.sanitizeBindings(s.bindings);
    grantBoxes(d);         // a 2.0.5 save: a box for each achievement it already has, once
    return d;
  }

  // ---------- the shop ----------
  function buyUpgrade(save, kind) {
    if (!R.POWERS.includes(kind)) return { ok: false, reason: 'kind' };
    const lvl = save.upgrades[kind];
    const cost = R.upgradeCost(lvl);
    if (cost === null) return { ok: false, reason: 'max' };
    if (save.coins < cost) return { ok: false, reason: 'coins', cost };
    save.coins -= cost;
    save.upgrades[kind] = lvl + 1;
    return { ok: true, cost };
  }
  function buyThing(save, list, owned, id) {
    const item = list.find((x) => x.id === id);
    if (!item) return { ok: false, reason: 'id' };
    if (save.owned[owned].includes(id)) return { ok: false, reason: 'owned' };
    if (save.coins < item.cost) return { ok: false, reason: 'coins', cost: item.cost };
    save.coins -= item.cost;
    const ids = list.map((x) => x.id);
    save.owned[owned] = ids.filter((x) => x === id || save.owned[owned].includes(x));
    return { ok: true, cost: item.cost };
  }
  const buyChar = (save, id) => buyThing(save, CHARS, 'chars', id);
  const buyBoard = (save, id) => buyThing(save, BOARDS, 'boards', id);
  function selectChar(save, id) { if (!save.owned.chars.includes(id)) return false; save.char = id; return true; }
  function selectBoard(save, id) { if (!save.owned.boards.includes(id)) return false; save.board = id; return true; }
  function buyItem(save, id) {
    const cost = ITEMS[id];
    if (!cost) return { ok: false, reason: 'id' };
    if (save.coins < cost) return { ok: false, reason: 'coins', cost };
    save.coins -= cost;
    if (id === 'key') save.keys++;
    else save.boards++;
    return { ok: true, cost };
  }

  // ---------- continue after a crash ----------
  // n keys; the missing ones can be bought on the spot for coins
  function reviveOffer(save, cost) {
    const missing = Math.max(0, cost - save.keys);
    const coins = missing * ITEMS.key;
    return { cost, keys: save.keys, missing, coins, canKeys: missing === 0, canCoins: missing > 0 && save.coins >= coins };
  }
  function payRevive(save, cost) {
    const o = reviveOffer(save, cost);
    if (!o.canKeys && !o.canCoins) return false;
    save.coins -= o.coins;
    save.keys = save.keys + o.missing - cost;
    save.stats.revives++;
    return true;
  }

  // ---------- the run's result goes into the save ----------
  // res - RRCore.result(run) plus { finished: true, char, daily, date }
  function applyResult(save, res) {
    const record = res.score > save.best;
    save.best = Math.max(save.best, res.score);
    save.bestDistance = Math.max(save.bestDistance, res.distance);
    save.coins = Math.min(1e9, save.coins + res.coins);
    save.keys = Math.min(99999, save.keys + (res.keys | 0));
    save.totalCoins += res.coins;
    save.runs += 1;
    const st = save.stats, rs = res.stats || {};
    st.distance += res.distance;
    st.time += res.time || 0;
    for (const k of ['jumps', 'slides', 'lanes', 'powers', 'roofs', 'hops', 'near', 'tricks', 'jets', 'boards', 'hurdles', 'bars', 'pits', 'fences', 'keys', 'bumps']) st[k] += rs[k] | 0;
    st.bestCombo = Math.max(st.bestCombo, rs.bestCombo | 0);
    st.maxDistricts = Math.max(st.maxDistricts, rs.districts | 0);
    st.saves += rs.saves | 0;
    st.bestClean = Math.max(st.bestClean, Math.min(res.distance, typeof rs.clean === 'number' ? rs.clean : res.distance));
    st.bestCoins = Math.max(st.bestCoins, res.coins);
    if (res.deathBy && DEATHS.includes(res.deathBy)) st.deaths[res.deathBy]++;
    const entry = { score: res.score, distance: res.distance, coins: res.coins, combo: rs.bestCombo | 0, char: res.char || save.char, date: res.date || '', daily: !!res.daily };
    save.bestRuns.push(entry);
    save.bestRuns.sort((a, b) => b.score - a.score);
    save.bestRuns = save.bestRuns.slice(0, BEST_RUNS);
    const rank = save.bestRuns.indexOf(entry);
    return { record, rank: rank >= 0 ? rank + 1 : null };
  }

  return {
    SAVE_VERSION, GIFT_BOARDS, CHARS, BOARDS, ITEMS, MAX_MULT, MISSIONS, MISSION_IDS, ACHIEVEMENTS, ACH_REWARD, STAT_KEYS, DEATHS,
    TIERS, DROPS, REWARD_TYPES, SKIN_COINS, rollBox, openBox, grantBoxes, achTier,
    THEMES, LANGS, QUALITIES, PARTICLES, BEST_RUNS, DAILY_GOALS,
    missionSet, missionTarget, missionReward, missionTier, missionView, commitMissions, runValues, skipCost, skipMission,
    dailyFor, dailyValue, completeDaily, dateKey, prevDay, hashStr,
    checkAchievements, defaultSave, defaultSettings, sanitizeSave,
    buyUpgrade, buyChar, buyBoard, selectChar, selectBoard, buyItem, reviveOffer, payRevive, applyResult,
  };
});
