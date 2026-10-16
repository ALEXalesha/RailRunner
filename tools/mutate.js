// Проверка проверок: каждое правило игры по очереди ломается в копии web/, и законы
// обязаны это заметить («мутант убит»). Исходники не меняются.
//
//   node tools/mutate.js                 все мутанты (~15 мин)
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
  { id: 'speed-cap', file: 'js/core.js', from: 'Math.min(C.SPEED_MAX, C.SPEED_MIN', to: 'Math.max(C.SPEED_MAX, C.SPEED_MIN', unit: 'скорость растёт' },
  { id: 'safe-lane-gets-traffic', file: 'js/core.js', from: '      if (L === s) continue;\n', to: '', unit: 'проходимая полоса|автопилот по безопасной' },
  { id: 'no-switch-window', file: 'js/core.js', from: 'free(n, z - sd)) moves.push(n)', to: 'free(n, z)) moves.push(n)', unit: 'проходимая полоса' },
  { id: 'moving-train-meets-early', file: 'js/core.js', from: 'const z0 = z + C.PLAYER_HALF_D + k * C.TRIGGER_D / (1 + k);', to: 'const z0 = z + C.PLAYER_HALF_D;', unit: 'встречный поезд|автопилот по безопасной|проходимая полоса' },
  { id: 'roof-fall-too-short', file: 'js/core.js', from: '(z < w.rideEnd + v * 0.8)', to: '(z < w.rideEnd + v * 0.3)', unit: 'проходимая полоса' },
  { id: 'hurdle-too-high', file: 'js/core.js', from: "case 'hurdle': return [0, C.HURDLE_H];", to: "case 'hurdle': return [0, 1.7];", unit: 'барьер' },
  { id: 'slide-does-not-duck', file: 'js/core.js', from: '(sliding(run) ? C.SLIDE_H : C.PLAYER_H)', to: '(sliding(run) ? C.PLAYER_H : C.PLAYER_H)', unit: 'перекладина' },
  { id: 'board-not-used-up', file: 'js/core.js', from: '      run.power.board = 0;\n', to: '', unit: 'доска спасает' },
  { id: 'magnet-no-range', file: 'js/core.js', from: 'if (mag && dz >= -1 && dz <= C.MAGNET_RANGE) got = true;', to: 'if (mag) got = true;', unit: 'магнит' },
  { id: 'x2-does-nothing', file: 'js/core.js', from: '(run.power.x2 > 0 ? 2 : 1)', to: '(run.power.x2 > 0 ? 1 : 1)', unit: 'x2 удваивает' },
  { id: 'save-coins-unclamped', file: 'js/core.js', from: 'd.coins = int(src.coins, 0, 0, 1e9);', to: "d.coins = typeof src.coins === 'number' ? src.coins : 0;", unit: 'сохранение' },
  { id: 'rebind-keeps-duplicate', file: 'js/core.js', from: '    for (const a of ACTIONS) b[a] = b[a].map((c) => (c === code ? null : c));\n', to: '', unit: 'переназначение' },
  { id: 'swipe-no-threshold', file: 'js/core.js', from: 'if (ax < thr && ay < thr) {', to: 'if (ax < 5 && ay < 5) {', unit: 'свайпы' },
  { id: 'no-jump-buffer', file: 'js/core.js', from: 'if (run.jumpBuf > 0) doJump(run);', to: 'if (false) doJump(run);', unit: 'подкат в воздухе' },
  { id: 'no-side-bump', file: 'js/core.js', from: 'if (lateral && run.stumbleT <= 0) {', to: 'if (false) {', unit: 'боковой удар' },
  { id: 'bump-to-last-pressed-lane', file: 'js/core.js', from: 'run.lane = Math.max(-1, Math.min(1, Math.round(prevX / C.LANE_W)));', to: 'run.lane = run.laneFrom;', unit: 'два быстрых нажатия' },
  { id: 'no-prune', file: 'js/core.js', from: 'const lim = pz - C.BEHIND;', to: 'const lim = -Infinity;', unit: 'не растёт бесконечно' },
  { id: 'hints-default-keys', file: 'js/app.js', from: 'const b = save.settings.bindings, l = I.lang;', to: 'const b = R.defaultBindings(), l = I.lang;', web: 'переназначение' },
  { id: 'pause-keeps-running', file: 'js/app.js', from: "if (!(state === 'playing' || (demo && state === 'menu'))) return;", to: "if (!(state === 'playing' || state === 'paused' || (demo && state === 'menu'))) return;", web: 'пауза:' },
  { id: 'store-without-prefix', file: 'js/app.js', from: "const STORE = 'railrunner:save';", to: "const STORE = 'save';", web: 'хранилище' },
  { id: 'theme-not-saved', file: 'js/app.js', from: "bindSeg('s-theme', (v) => { save.settings.theme = v; applyTheme(); });", to: "bindSeg('s-theme', (v) => { const t = save.settings.theme; save.settings.theme = v; applyTheme(); save.settings.theme = t; });", web: 'тема' },
  { id: 'title-not-translated', file: 'js/app.js', from: "    document.title = I.t('title');\n", to: '', web: 'язык' },
  { id: 'hidden-tab-runs', file: 'js/app.js', from: "document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });", to: '', web: 'скрытая вкладка' },
  { id: 'demo-makes-noise', file: 'js/app.js', from: '      if (demo) continue;\n', to: '', web: 'меню: за экраном' },
  { id: 'tap-ignores-place', file: 'js/app.js', from: 'const a = R.classifySwipe(e.clientX - touch.x, e.clientY - touch.y, performance.now() - touch.t, touch.x - rect.left, rect.width, rect.height);', to: 'const a = R.classifySwipe(e.clientX - touch.x, e.clientY - touch.y, performance.now() - touch.t, rect.width / 2, rect.width, rect.height);', web: 'мышь и палец' },
  { id: 'key-columns-fixed', file: 'css/style.css', from: '.keys { display: grid; grid-template-columns: minmax(80px, 1fr) repeat(3, minmax(0, 1fr));', to: '.keys { display: grid; grid-template-columns: minmax(80px, 1fr) repeat(3, 110px);', web: 'раскладка' },
  { id: 'record-not-saved', file: 'js/app.js', from: '    lastRecord = R.applyResult(save, res);\n    persist();\n', to: '    lastRecord = R.applyResult(save, res);\n', web: 'авария: итоги' },
];

function run(m, dir) {
  const env = { ...process.env, RR_WEB: dir };
  let r;
  if (m.unit) {
    r = spawnSync(process.execPath, ['--test', '--test-concurrency=1', '--test-name-pattern', m.unit, 'tests/unit/*.test.js'], { cwd: ROOT, env, encoding: 'utf8', timeout: 600000 });
  } else {
    const cli = path.join(ROOT, 'node_modules', '@playwright', 'test', 'cli.js');
    r = spawnSync(process.execPath, [cli, 'test', '-g', m.web, '--workers=1', '--reporter=line', '--retries=0'], { cwd: ROOT, env, encoding: 'utf8', timeout: 900000 });
  }
  return r.status;
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
