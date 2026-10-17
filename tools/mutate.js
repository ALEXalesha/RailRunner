// Проверка проверок: каждое правило игры по очереди ломается в копии web/, и законы
// обязаны это заметить («мутант убит»). Исходники не меняются.
//
//   node tools/mutate.js                 все мутанты (~40 мин)
//   RR_MUT=hurdle node tools/mutate.js   только те, чьё имя подходит под регулярку
//
// Сначала должны быть зелёными сами законы (npm test, npm run test:web): иначе упавший
// закон «убьёт» мутанта и без поломки.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const WEB = path.join(ROOT, 'web');

// file - в web/, from -> to - поломка (from должна встречаться ровно один раз),
// unit - имя закона node:test (регулярка), web - имя закона Playwright (-g)
const MUTANTS = [
  // ---------- правила забега (core.js) ----------
  { id: 'speed-cap', file: 'js/core.js', from: 'Math.min(C.SPEED_MAX, C.SPEED_MIN', to: 'Math.max(C.SPEED_MAX, C.SPEED_MIN', unit: 'скорость растёт' },
  { id: 'safe-lane-gets-traffic', file: 'js/core.js', from: '      if (L === s) continue;\n', to: '', unit: 'проходимая полоса|автопилот по безопасной' },
  { id: 'no-switch-window', file: 'js/core.js', from: 'free(n, z - sd)) moves.push(n)', to: 'free(n, z)) moves.push(n)', unit: 'проходимая полоса' },
  { id: 'moving-train-meets-early', file: 'js/core.js', from: 'const z0 = z + C.PLAYER_HALF_D + k * C.TRIGGER_D / (1 + k);', to: 'const z0 = z + C.PLAYER_HALF_D;', unit: 'встречный поезд|автопилот по безопасной|проходимая полоса' },
  { id: 'roof-fall-too-short', file: 'js/core.js', from: '(z < w.rideEnd + v * 0.8)', to: '(z < w.rideEnd + v * 0.3)', unit: 'проходимая полоса' },
  { id: 'hop-train-too-late', file: 'js/core.js', from: 'const z0 = z - sd - 0.5;', to: 'const z0 = z - 2;', unit: 'проходимая полоса' },
  { id: 'hurdle-too-high', file: 'js/core.js', from: "case 'hurdle': return [0, C.HURDLE_H];", to: "case 'hurdle': return [0, 1.7];", unit: 'барьер' },
  { id: 'fence-too-low', file: 'js/core.js', from: "case 'fence': return [0, C.FENCE_H];", to: "case 'fence': return [0, C.HURDLE_H];", unit: 'ограждение' },
  { id: 'pit-has-floor', file: 'js/core.js', from: 'run.z >= o.z0 && run.z <= o.z1) return -Infinity;', to: 'run.z >= o.z0 && run.z <= o.z1) return 0;', unit: 'яма' },
  { id: 'freight-meets-at-start', file: 'js/core.js', from: 'return [k > 0 ? Math.min(a, o.z0 - d) : a, b];', to: 'return [Math.min(a, o.z0 - d), b];', unit: 'товарный поезд' },
  { id: 'slide-does-not-duck', file: 'js/core.js', from: '(sliding(run) ? C.SLIDE_H : C.PLAYER_H)', to: '(sliding(run) ? C.PLAYER_H : C.PLAYER_H)', unit: 'перекладина' },
  { id: 'board-not-used-up', file: 'js/core.js', from: '      run.power.board = 0;\n', to: '', unit: 'доска спасает' },
  { id: 'board-without-stock', file: 'js/core.js', from: 'if (run.boardsLeft > 0 && run.power.board <= 0) {', to: 'if (run.power.board <= 0) {', unit: 'доска по кнопке' },
  { id: 'magnet-no-range', file: 'js/core.js', from: 'if (mag && dz >= -1 && dz <= C.MAGNET_RANGE && Math.abs(c.y - run.y) < 6) got = true;', to: 'if (mag) got = true;', unit: 'магнит' },
  { id: 'x2-does-nothing', file: 'js/core.js', from: '(run.power.x2 > 0 ? 2 : 1)', to: '(run.power.x2 > 0 ? 1 : 1)', unit: 'x2 удваивает|множитель очков' },
  { id: 'jet-flies-low', file: 'js/core.js', from: 'run.y += (C.JET_Y - run.y) * Math.min(1, dt * C.JET_RATE);', to: 'run.y += (2 - run.y) * Math.min(1, dt * C.JET_RATE);', unit: 'ранец' },
  { id: 'no-jump-buffer', file: 'js/core.js', from: 'if (run.jumpBuf > 0) doJump(run);', to: 'if (false) doJump(run);', unit: 'подкат в воздухе' },
  { id: 'no-side-bump', file: 'js/core.js', from: 'if (lateral && run.stumbleT <= 0) {', to: 'if (false) {', unit: 'боковой удар' },
  { id: 'bump-to-last-pressed-lane', file: 'js/core.js', from: 'run.lane = Math.max(-1, Math.min(1, Math.round(prevX / C.LANE_W)));\n      stumble(run);', to: 'run.lane = run.laneFrom;\n      stumble(run);', unit: 'два быстрых нажатия' },
  { id: 'graze-off', file: 'js/core.js', from: 'grazeDepth(run, o, bot, top, h) <= C.GRAZE &&', to: 'grazeDepth(run, o, bot, top, h) <= 0 &&', unit: 'задет' },
  { id: 'graze-too-wide', file: 'js/core.js', from: 'GRAZE: 0.1,', to: 'GRAZE: 0.3,', unit: 'задет' },
  { id: 'second-knock-forgiven', file: 'js/core.js', from: '(run.graze === o.id || (run.graze === null && run.stumbleT <= 0))', to: '(run.graze === o.id || run.graze === null)', unit: 'ушиб:' },
  { id: 'knock-gives-trick', file: 'js/core.js', from: '{ stumble(run); if (g) g.passed = true; }', to: '{ stumble(run); }', unit: 'ушиб:' },
  { id: 'knock-forgotten', file: 'js/core.js', from: '      if (run.alive && !(g && g.broken)) {', to: '      if (false) {', unit: 'ушиб:|задет' },
  { id: 'hurdle-hitbox-deep', file: 'js/core.js', from: 'HURDLE_D: 0.1,', to: 'HURDLE_D: 0.3,', web: 'хитбоксы' },
  { id: 'fence-hitbox-deep', file: 'js/core.js', from: 'FENCE_D: 0.1,', to: 'FENCE_D: 0.35,', web: 'хитбоксы' },
  { id: 'combo-never-ends', file: 'js/core.js', from: 'if (run.comboT === 0) run.combo = 0;', to: '', unit: 'комбо:' },
  { id: 'near-miss-any-distance', file: 'js/core.js', from: 'if (d < 0 || d > v * C.NEAR_TIME) continue;', to: 'if (d < 0) continue;', unit: 'промах на волосок' },
  { id: 'revive-keeps-killer', file: 'js/core.js', from: '    if (o) o.broken = true;\n', to: '', unit: 'продолжение:' },
  { id: 'revive-cost-flat', file: 'js/core.js', from: 'Math.min(64, 2 ** Math.max(0, revives | 0))', to: 'Math.min(64, 1)', unit: 'продолжение:' },
  { id: 'tutorial-one-lane', file: 'js/core.js', from: "for (const L of LANES) add({ type: 'hurdle'", to: "for (const L of [0]) add({ type: 'hurdle'", unit: 'обучение:' },
  { id: 'districts-skip', file: 'js/core.js', from: 'const idx = prev ? (prev.idx + 1) : w.startIdx;', to: 'const idx = prev ? (prev.idx + 2) : w.startIdx;', unit: 'районы идут' },
  { id: 'bridge-pits', file: 'js/core.js', from: 'bridge: { coins: 30, empty: 14, hurdle: 22, bar: 22, pit: 0, rampTrain: 18 },', to: 'bridge: { coins: 30, empty: 14, hurdle: 22, bar: 22, pit: 12, rampTrain: 18 },', unit: 'на мосту' },
  { id: 'no-prune', file: 'js/core.js', from: 'const lim = pz - C.BEHIND;', to: 'const lim = -Infinity;', unit: 'не растёт бесконечно' },
  { id: 'rebind-keeps-duplicate', file: 'js/core.js', from: '    for (const a of ACTIONS) b[a] = b[a].map((c) => (c === code ? null : c));\n', to: '', unit: 'переназначение' },
  { id: 'new-action-steals-key', file: 'js/core.js', from: 'out[a] = DEFAULT_BINDINGS[a].map((c) => (c && !used.has(c) ? c : null));', to: 'out[a] = DEFAULT_BINDINGS[a].slice();', unit: 'привязки из хранилища|сохранение 1.0' },
  { id: 'swipe-no-threshold', file: 'js/core.js', from: 'if (ax < thr && ay < thr) {', to: 'if (ax < 5 && ay < 5) {', unit: 'свайпы' },
  // ---------- прогресс (meta.js) ----------
  { id: 'migrate-loses-upgrades', file: 'js/meta.js', from: '    if (isObj(src.upgrades)) for (const k of R.POWERS) d.upgrades[k] = int(src.upgrades[k], 0, 0, R.MAX_LEVEL);\n', to: '', unit: 'сохранение 1.0' },
  { id: 'tutorial-for-veterans', file: 'js/meta.js', from: 'd.tutorialDone = v1 ? d.runs > 0 : src.tutorialDone === true;', to: 'd.tutorialDone = src.tutorialDone === true;', unit: 'сохранение 1.0' },
  { id: 'gift-repeats', file: 'js/meta.js', from: 'if (src.boardGift !== true) d.boards', to: 'if (true) d.boards', unit: 'подарок', web: 'подарок досок' },
  { id: 'no-gift-for-new', file: 'js/meta.js', from: 'boards: GIFT_BOARDS, boardGift: true,', to: 'boards: 0, boardGift: true,', unit: 'подарок', web: 'подарок: новый' },
  { id: 'no-gift-for-old', file: 'js/meta.js', from: '    if (src.boardGift !== true) d.boards = Math.max(d.boards, GIFT_BOARDS);\n', to: '', unit: 'подарок', web: 'подарок досок' },
  { id: 'menu-boards-not-shown', file: 'js/app.js', from: "    $('m-boards').textContent = fmt(save.boards);\n", to: '', web: 'меню: число досок' },
  { id: 'menu-boards-shows-keys', file: 'js/app.js', from: "$('m-boards').textContent = fmt(save.boards);", to: "$('m-boards').textContent = fmt(save.keys);", web: 'меню: число досок' },
  { id: 'buy-twice', file: 'js/meta.js', from: "    if (save.owned[owned].includes(id)) return { ok: false, reason: 'owned' };\n", to: '', unit: 'магазин: персонаж' },
  { id: 'select-unowned', file: 'js/meta.js', from: 'function selectChar(save, id) { if (!save.owned.chars.includes(id)) return false;', to: 'function selectChar(save, id) {', unit: 'магазин: персонаж' },
  { id: 'run-missions-add-up', file: 'js/meta.js', from: "def.scope === 'run' ? Math.max(m.progress[i], v) : m.progress[i] + v", to: 'm.progress[i] + v', unit: 'задания: «за забег»' },
  { id: 'no-level-up', file: 'js/meta.js', from: '      if (m.level < MAX_MULT) m.level++;\n', to: '', unit: 'задания: «за забег»' },
  { id: 'daily-twice', file: 'js/meta.js', from: '    if (d.date === key && d.done) return null;\n', to: '', unit: 'испытание дня: награда' },
  { id: 'streak-always-one', file: 'js/meta.js', from: 'd.streak = d.last === prevDay(key) ? Math.min(999, d.streak + 1) : 1;', to: 'd.streak = 1;', unit: 'испытание дня: награда' },
  { id: 'achievement-pays-twice', file: 'js/meta.js', from: '      if (save.achievements[a.id]) continue;\n', to: '', unit: 'достижения:' },
  { id: 'revive-for-free', file: 'js/meta.js', from: '    if (!o.canKeys && !o.canCoins) return false;\n', to: '', unit: 'продолжение за ключи' },
  { id: 'best-runs-unsorted', file: 'js/meta.js', from: '    save.bestRuns.sort((a, b) => b.score - a.score);\n', to: '', unit: 'итог забега' },
  { id: 'save-coins-unclamped', file: 'js/meta.js', from: 'd.coins = int(src.coins, 0, 0, 1e9);', to: "d.coins = typeof src.coins === 'number' ? src.coins : 0;", unit: 'мусор и испорченные' },
  // ---------- страница (app.js, render.js, css) ----------
  { id: 'hints-default-keys', file: 'js/app.js', from: 'const b = save.settings.bindings, l = I.lang;', to: 'const b = R.defaultBindings(), l = I.lang;', web: 'переназначение' },
  { id: 'pause-keeps-running', file: 'js/app.js', from: "if (!(state === 'playing' || (demo && state === 'menu' && overlay !== 'shop'))) return;", to: "if (!(state === 'playing' || state === 'paused' || (demo && state === 'menu'))) return;", web: 'пауза:' },
  { id: 'ramp-inside-out', file: 'js/gfx.js', from: '-hw, 0, 0, hw, H, L, hw, 0, 0, -hw, 0, 0, -hw, H, L, hw, H, L,', to: '-hw, 0, 0, hw, 0, 0, hw, H, L, -hw, 0, 0, hw, H, L, -hw, H, L,', web: 'пандус:' },
  { id: 'catenary-low', file: 'js/scenery.js', from: 'const CATENARY_WIRE_Y = 10.2;', to: 'const CATENARY_WIRE_Y = 5.85;', web: 'провода:' },
  { id: 'catenary-gantry-low', file: 'js/scenery.js', from: "G.box(0.04, 0.8, 0.04, 0x444444, [lx, C0 + 0.35, 0])", to: "G.box(0.04, 0.8, 0.04, 0x444444, [lx, 6.2, 0])", web: 'провода:' },
  { id: 'tunnel-vault-low', file: 'js/scenery.js', from: 'const TUNNEL_LOW = CATENARY_WIRE_Y + 0.7;', to: 'const TUNNEL_LOW = 7.3;', web: 'туннель:' },
  { id: 'tunnel-portal-low', file: 'js/scenery.js', from: 'G.box(12.4, 1.2, 0.8, 0x9a948a, [0, TV + 0.6, -0.2])', to: 'G.box(12.4, 1.2, 0.8, 0x9a948a, [0, 9.0, -0.2])', web: 'туннель:' },
  { id: 'run-key-not-banked', file: 'js/app.js', from: '        save.keys = Math.min(99999, save.keys + 1);\n        run.keys--;\n', to: '', web: 'ключ, найденный' },
  { id: 'ach-text-overflows', file: 'css/style.css', from: '.ach > div { min-width: 0; }', to: '.ach > div { min-width: 0; white-space: nowrap; }', web: 'раскладка: все экраны' },
  { id: 'run-key-twice', file: 'js/app.js', from: '        run.keys--;\n', to: '', web: 'ключ, найденный' },
  { id: 'store-without-prefix', file: 'js/app.js', from: "const STORE = 'railrunner:save';", to: "const STORE = 'save';", web: 'хранилище' },
  { id: 'theme-not-saved', file: 'js/app.js', from: "bindSeg('s-theme', (v) => { save.settings.theme = v; applyTheme(); });", to: "bindSeg('s-theme', (v) => { const t = save.settings.theme; save.settings.theme = v; applyTheme(); save.settings.theme = t; });", web: 'тема' },
  { id: 'dark-not-neon', file: 'js/app.js', from: "FIXED_DISTRICT || (resolvedTheme() === 'dark' ? 'neon' : 'city');", to: "FIXED_DISTRICT || 'city';", web: 'тема' },
  { id: 'title-not-translated', file: 'js/app.js', from: "    document.title = I.t('title');\n", to: '', web: 'язык' },
  { id: 'hidden-tab-runs', file: 'js/app.js', from: "document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });", to: '', web: 'скрытая вкладка' },
  { id: 'demo-makes-noise', file: 'js/app.js', from: '      if (demo) continue;\n', to: '', web: 'меню: за экраном' },
  { id: 'tap-ignores-place', file: 'js/app.js', from: 'const a = R.classifySwipe(e.clientX - touch.x, e.clientY - touch.y, performance.now() - touch.t, touch.x - rect.left, rect.width, rect.height);', to: 'const a = R.classifySwipe(e.clientX - touch.x, e.clientY - touch.y, performance.now() - touch.t, rect.width / 2, rect.width, rect.height);', web: 'мышь и палец' },
  { id: 'results-not-saved', file: 'js/app.js', from: '    persist();\n    lastOver = { res, rec, mis, daily, ach };', to: '    lastOver = { res, rec, mis, daily, ach };', web: 'итоги:' },
  { id: 'tutorial-does-not-wait', file: 'js/app.js', from: 'tut.waiting = !!s.need;', to: 'tut.waiting = false;', web: 'обучение: первый забег' },
  { id: 'tutorial-any-action', file: 'js/app.js', from: 'if (s && s.need && s.need.includes(a)) tut.waiting = false;', to: 'if (s) tut.waiting = false;', web: 'обучение: первый забег' },
  { id: 'continue-without-keys', file: 'js/app.js', from: '    if (!offer.canKeys && !offer.canCoins) { finish(); return; }\n', to: '', web: 'авария: ключей нет' },
  { id: 'continue-timer-off', file: 'js/app.js', from: '      if (contT <= 0) finish();\n', to: '', web: 'авария: ключей нет' },
  { id: 'boards-not-saved', file: 'js/app.js', from: '    save.boards = run.boardsLeft;\n', to: '', web: 'доска по кнопке на экране' },
  { id: 'daily-random-world', file: 'js/app.js', from: 'setRun(R.newRun(daily ? daily.seed : seedNow(), {', to: 'setRun(R.newRun(seedNow(), {', web: 'испытание дня:' },
  { id: 'multiplier-not-used', file: 'js/app.js', from: 'upgrades: save.upgrades, mult: save.missions.level, boards: save.boards, tutorial,', to: 'upgrades: save.upgrades, mult: 1, boards: save.boards, tutorial,', web: 'задания: выполнено' },
  { id: 'auto-quality-stuck', file: 'js/app.js', from: 'if (perf.slowT > 2 && i > 0) { setAuto(LEVELS[i - 1]); perf.holdT = 15; }', to: '', web: 'графика:' },
  { id: 'district-no-banner', file: 'js/app.js', from: "else if (e.startsWith('district:')) banner(", to: "else if (e.startsWith('district-x:')) banner(", web: 'HUD:' },
  { id: 'particles-ignore-setting', file: 'js/render.js', from: "const d = (settings.particles === 'off' ? 0 : settings.particles === 'low' ? 0.4 : 1) * QUALITY[quality].particles;", to: 'const d = QUALITY[quality].particles;', web: 'графика:' },
  { id: 'shadows-ignore-setting', file: 'js/render.js', from: 'const on = settings.shadows && q.shadow > 0;', to: 'const on = q.shadow > 0;', web: 'графика:' },
  { id: 'key-columns-fixed', file: 'css/style.css', from: '.keys { display: grid; grid-template-columns: minmax(80px, 1fr) repeat(3, minmax(0, 1fr));', to: '.keys { display: grid; grid-template-columns: minmax(80px, 1fr) repeat(3, 110px);', web: 'раскладка' },
];

function run(m, dir) {
  const env = { ...process.env, RR_WEB: dir };
  let r;
  if (m.unit) {
    r = spawnSync(process.execPath, ['--test', '--test-concurrency=1', '--test-name-pattern', m.unit, 'tests/unit/*.test.js'], { cwd: ROOT, env, encoding: 'utf8', timeout: 900000 });
  } else {
    const cli = path.join(ROOT, 'node_modules', '@playwright', 'test', 'cli.js');
    r = spawnSync(process.execPath, [cli, 'test', '-g', m.web, '--workers=1', '--reporter=line', '--retries=0'], { cwd: ROOT, env, encoding: 'utf8', timeout: 1200000 });
  }
  return r.status;
}

if (process.argv.includes('--check')) {
  // только проверить, что каждая поломка находится в исходниках ровно один раз
  let bad = 0;
  for (const m of MUTANTS) {
    const n = fs.readFileSync(path.join(WEB, m.file), 'utf8').split(m.from).length - 1;
    if (n !== 1) { bad++; console.log(`${m.id}: найдено ${n}`); }
  }
  console.log(`мутантов ${MUTANTS.length}, не на месте ${bad}`);
  process.exit(bad ? 1 : 0);
}

const filter = process.env.RR_MUT ? new RegExp(process.env.RR_MUT) : null;
const list = MUTANTS.filter((m) => !filter || filter.test(m.id));
const rows = [];
let bad = 0;
for (const m of list) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'railrunner-mut-'));
  try {
    fs.cpSync(WEB, dir, { recursive: true });
    const file = path.join(dir, m.file);
    const text = fs.readFileSync(file, 'utf8');
    const n = text.split(m.from).length - 1;
    if (n !== 1) { rows.push([m.id, `НЕ НАЙДЕНО (${n})`]); bad++; continue; }
    fs.writeFileSync(file, text.replace(m.from, m.to));
    const t0 = Date.now();
    const status = run(m, dir);
    const killed = status !== 0;
    if (!killed) bad++;
    rows.push([m.id, `${killed ? 'убит' : 'ВЫЖИЛ'} (${m.unit ? 'node' : 'страница'}, ${Math.round((Date.now() - t0) / 1000)} с)`]);
    console.log(rows[rows.length - 1].join(': '));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });   // своя временная копия
  }
}
console.log(`\nмутантов ${list.length}, убито ${list.length - bad}`);
for (const [id, res] of rows) if (!/^убит/.test(res)) console.log('  ' + id + ': ' + res);
process.exit(bad ? 1 : 0);
