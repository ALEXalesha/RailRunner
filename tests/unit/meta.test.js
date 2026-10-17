// Законы прогресса RailRunner (web/js/meta.js): сохранение и переезд с 1.0, магазин, задания и
// множитель, испытание дня, достижения, лучшие забеги. node --test tests/unit
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const WEB = process.env.RR_WEB || path.join(__dirname, '..', '..', 'web');
const R = require(path.join(WEB, 'js', 'core.js'));
const M = require(path.join(WEB, 'js', 'meta.js'));

// итог забега как из RRCore.result + то, что добавляет страница
function res(o = {}) {
  return Object.assign({ score: 0, coins: 0, keys: 0, distance: 0, deathBy: 'train', time: 10, finished: true, stats: Object.assign(R.newRun(1).stats, o.stats || {}) }, o, { stats: Object.assign(R.newRun(1).stats, o.stats || {}) });
}

// ---------- сохранение ----------

// так выглядело сохранение RailRunner 1.0.0 (ключ railrunner:save)
const SAVE_1_0 = {
  v: 1, best: 5432, coins: 1234, runs: 17, totalCoins: 2890, bestDistance: 1870,
  upgrades: { magnet: 2, x2: 1, boots: 0, board: 5 },
  settings: { lang: 'en', theme: 'dark', music: 0.3, sfx: 0.6, quality: 'low', showFps: true,
    bindings: { left: ['KeyJ', null, null], right: ['KeyL', null, null], jump: ['KeyB', 'Space', null], slide: ['KeyK', null, null], pause: ['KeyP', 'Escape', null] } },
};

test('сохранение 1.0 переезжает в 2.0 без потерь', () => {
  const s = M.sanitizeSave(JSON.stringify(SAVE_1_0));
  assert.equal(s.v, 2);
  for (const k of ['best', 'coins', 'runs', 'totalCoins', 'bestDistance']) assert.equal(s[k], SAVE_1_0[k], k);
  assert.deepEqual(s.upgrades, { magnet: 2, x2: 1, boots: 0, board: 5, jetpack: 0 });
  assert.equal(s.settings.lang, 'en');
  assert.equal(s.settings.theme, 'dark');
  assert.equal(s.settings.music, 0.3);
  assert.equal(s.settings.sfx, 0.6);
  assert.equal(s.settings.quality, 'low');
  assert.equal(s.settings.showFps, true);
  for (const a of ['left', 'right', 'jump', 'slide', 'pause']) assert.deepEqual(s.settings.bindings[a], SAVE_1_0.settings.bindings[a], a);
  // B уже занята прыжком - доске остаётся только E
  assert.deepEqual(s.settings.bindings.board, [null, 'KeyE', null]);
  assert.equal(s.tutorialDone, true, 'кто уже играл, обучение не видит');
  assert.equal(s.char, 'kit');
  assert.deepEqual(s.owned.chars, ['kit']);
  assert.equal(s.missions.level, 1);
  assert.equal(s.stats.distance, 1870, 'пройденное хотя бы не меньше рекорда');
  // и без забегов обучение будет
  assert.equal(M.sanitizeSave({ v: 1, runs: 0 }).tutorialDone, false);
  // повторное чтение не меняет ничего
  assert.deepEqual(M.sanitizeSave(JSON.stringify(s)), s);
});

test('сохранение: мусор и испорченные поля становятся значениями по умолчанию, числа - в пределах', () => {
  const d = M.defaultSave();
  for (const junk of [null, undefined, 5, 'x', '{', '[]', '"str"', [], { best: 'много' }]) {
    const s = M.sanitizeSave(junk);
    assert.equal(s.best, 0);
    assert.deepEqual(s.settings, d.settings);
    assert.deepEqual(s.missions, d.missions);
  }
  const s = M.sanitizeSave({
    v: 2, best: -5, coins: 1e20, runs: 3.7, keys: -3, boards: 'a',
    upgrades: { magnet: 9, x2: -1, boots: 'a', jetpack: 2 },
    owned: { chars: ['mila', 'hacker', 'mila'], boards: 'x' }, char: 'hacker', board: 'gold',
    missions: { level: 999, ids: ['x'], progress: [5], done: [true] },
    daily: { date: '2026-13-99x', done: true, streak: -4 },
    achievements: { first: 1, fake: 1 },
    stats: { jumps: 'много', roofs: 12, deaths: { train: 3, alien: 9 } },
    bestRuns: [{ score: 10 }, 5, { score: 30, char: 'zzz', date: '<b>' }],
    settings: { lang: 'de', theme: 'pink', music: 7, sfx: -1, quality: 'ultra', particles: 'all', shadows: 0, showFps: 'yes', extra: 1 },
  });
  assert.equal(s.best, 0);
  assert.equal(s.coins, 1e9);
  assert.equal(s.runs, 3);
  assert.equal(s.keys, 0);
  assert.equal(s.boards, M.GIFT_BOARDS, 'испорченное число досок - подарок в 3 доски');
  assert.deepEqual(s.upgrades, { magnet: 5, x2: 0, boots: 0, board: 0, jetpack: 2 });
  assert.deepEqual(s.owned.chars, ['kit', 'mila']);
  assert.deepEqual(s.owned.boards, ['basic']);
  assert.equal(s.char, 'kit');
  assert.equal(s.board, 'basic', 'не купленную доску не выбрать');
  assert.equal(s.missions.level, M.MAX_MULT);
  assert.deepEqual(s.missions.ids, M.missionSet(M.MAX_MULT));
  assert.deepEqual(s.missions.progress, [0, 0, 0], 'чужой набор заданий - прогресс с нуля');
  assert.equal(s.daily.date, '');
  assert.equal(s.daily.done, false);
  assert.equal(s.daily.streak, 0);
  assert.deepEqual(s.achievements, { first: 1 });
  assert.equal(s.stats.jumps, 0);
  assert.equal(s.stats.roofs, 12);
  assert.equal(s.stats.deaths.train, 3);
  assert.ok(!('alien' in s.stats.deaths));
  assert.deepEqual(s.bestRuns.map((r) => [r.score, r.char, r.date]), [[30, 'kit', ''], [10, 'kit', '']]);
  assert.equal(s.settings.lang, null);
  assert.equal(s.settings.theme, 'auto');
  assert.equal(s.settings.music, 1);
  assert.equal(s.settings.sfx, 0);
  assert.equal(s.settings.quality, 'auto');
  assert.equal(s.settings.particles, 'high');
  assert.equal(s.settings.shadows, true);
  assert.equal(s.settings.showFps, false);
  assert.ok(!('extra' in s.settings));
  assert.equal(s.tutorialDone, false);
  // круг туда-обратно
  const good = M.defaultSave();
  good.best = 123; good.coins = 45; good.keys = 3; good.settings.theme = 'dark'; good.settings.lang = 'en'; good.tutorialDone = true;
  good.owned.chars.push('zoe'); good.char = 'zoe';
  good.missions.progress = [3, 0, 1]; good.missions.done = [false, true, false];
  assert.deepEqual(M.sanitizeSave(JSON.stringify(good)), good);
});

// ---------- магазин ----------

test('магазин: персонаж и доска покупаются за монеты один раз, выбрать можно только своё', () => {
  const s = M.defaultSave();
  assert.equal(M.selectChar(s, 'mila'), false, 'не куплен');
  s.coins = 1000;
  assert.deepEqual(M.buyChar(s, 'mila'), { ok: false, reason: 'coins', cost: 1500 });
  assert.equal(s.coins, 1000);
  s.coins = 20000;
  assert.equal(M.buyChar(s, 'mila').ok, true);
  assert.equal(s.coins, 18500);
  assert.equal(M.buyChar(s, 'mila').reason, 'owned');
  assert.equal(s.coins, 18500, 'второй раз не списывает');
  assert.equal(M.selectChar(s, 'mila'), true);
  assert.equal(s.char, 'mila');
  assert.equal(M.buyChar(s, 'nobody').ok, false);
  assert.equal(M.buyBoard(s, 'flame').ok, true);
  assert.equal(s.coins, 17500);
  assert.equal(M.selectBoard(s, 'flame'), true);
  assert.equal(M.selectBoard(s, 'gold'), false);
  assert.deepEqual(s.owned.boards, ['basic', 'flame']);
  for (const c of M.CHARS) assert.ok(c.cost >= 0 && Number.isInteger(c.cost));
  assert.equal(M.CHARS[0].cost, 0);
  assert.equal(M.BOARDS[0].cost, 0);
  assert.equal(new Set(M.CHARS.map((c) => c.id)).size, M.CHARS.length);
  assert.ok(M.CHARS.length >= 6 && M.BOARDS.length >= 6);
});

test('магазин: улучшения - длительность растёт, цены, без монет и сверх потолка отказ', () => {
  for (const k of R.POWERS) {
    for (let l = 0; l < R.MAX_LEVEL; l++) assert.ok(R.powerDuration(k, l + 1) > R.powerDuration(k, l));
    assert.equal(R.powerDuration(k, 99), R.powerDuration(k, R.MAX_LEVEL));
  }
  assert.deepEqual([0, 1, 2, 3, 4].map(R.upgradeCost), [...R.UPGRADE_COST]);
  assert.equal(R.upgradeCost(R.MAX_LEVEL), null);
  const s = M.defaultSave();
  s.coins = 100;
  assert.deepEqual(M.buyUpgrade(s, 'jetpack'), { ok: false, reason: 'coins', cost: 150 });
  assert.equal(s.coins, 100);
  s.coins = 10000;
  assert.equal(M.buyUpgrade(s, 'magnet').ok, true);
  assert.equal(s.coins, 9850);
  for (let i = 0; i < 10; i++) M.buyUpgrade(s, 'magnet');
  assert.equal(s.upgrades.magnet, R.MAX_LEVEL);
  assert.equal(s.coins, 10000 - R.UPGRADE_COST.reduce((a, b) => a + b, 0));
  assert.equal(M.buyUpgrade(s, 'magnet').reason, 'max');
  assert.equal(M.buyUpgrade(s, 'nope').ok, false);
});

test('подарок: новый игрок начинает с 3 досками; старое сохранение получает до 3 один раз, без повторов', () => {
  // новый профиль
  const d = M.defaultSave();
  assert.equal(M.GIFT_BOARDS, 3);
  assert.equal(d.boards, 3);
  assert.equal(M.sanitizeSave(null).boards, 3, 'пустое хранилище');
  assert.equal(M.sanitizeSave(JSON.stringify(d)).boards, 3);
  // сохранение 2.0.0 / 2.0.1 (без отметки): досок меньше 3 - до 3, больше - не трогаем
  for (const [had, got] of [[0, 3], [1, 3], [2, 3], [3, 3], [7, 7]]) {
    const s = M.sanitizeSave(JSON.stringify({ v: 2, boards: had, runs: 5, coins: 40, tutorialDone: true }));
    assert.equal(s.boards, got, had + ' -> ' + got);
    assert.equal(s.boardGift, true, 'отметка о подарке');
    assert.equal(s.coins, 40);
  }
  // сохранение 1.0 тоже
  assert.equal(M.sanitizeSave(JSON.stringify({ best: 10, coins: 5, runs: 2 })).boards, 3);
  // потратил подарок - после перезапуска не возвращается (сколько угодно перезапусков)
  let s = M.sanitizeSave(JSON.stringify({ v: 2, boards: 0, runs: 5 }));
  s.boards = 1;                                     // одна осталась после забега
  for (let i = 0; i < 3; i++) s = M.sanitizeSave(JSON.stringify(s));
  assert.equal(s.boards, 1, 'подарок один раз');
  s.boards = 0;
  assert.equal(M.sanitizeSave(JSON.stringify(s)).boards, 0);
  // новый игрок тоже не получает второй раз
  const n = M.defaultSave(); n.boards = 0;
  assert.equal(M.sanitizeSave(JSON.stringify(n)).boards, 0);
});

test('магазин: ключи и доски поштучно', () => {
  const s = M.defaultSave();
  s.coins = M.ITEMS.key + M.ITEMS.hoverboard * 2;
  assert.equal(M.buyItem(s, 'key').ok, true);
  assert.equal(M.buyItem(s, 'hoverboard').ok, true);
  assert.equal(M.buyItem(s, 'hoverboard').ok, true);
  assert.equal(M.buyItem(s, 'hoverboard').reason, 'coins');
  assert.deepEqual([s.keys, s.boards, s.coins], [1, M.GIFT_BOARDS + 2, 0]);
  assert.equal(M.buyItem(s, 'gold').ok, false);
});

test('продолжение за ключи: хватает - тратятся ключи; не хватает - докупаются за монеты; иначе нельзя', () => {
  const s = M.defaultSave();
  s.keys = 3; s.coins = 0;
  assert.equal(M.payRevive(s, 2), true);
  assert.deepEqual([s.keys, s.coins], [1, 0]);
  s.coins = 2 * M.ITEMS.key + 7;
  const o = M.reviveOffer(s, 3);
  assert.deepEqual([o.missing, o.coins, o.canKeys, o.canCoins], [2, 2 * M.ITEMS.key, false, true]);
  assert.equal(M.payRevive(s, 3), true);
  assert.deepEqual([s.keys, s.coins], [0, 7]);
  assert.equal(M.payRevive(s, 1), false, 'ни ключей, ни монет');
  assert.deepEqual([s.keys, s.coins], [0, 7]);
  assert.equal(s.stats.revives, 2);
});

// ---------- задания ----------

test('задания: на уровень три разных, всегда одни и те же; цели растут с уровнем', () => {
  const sets = new Set();
  for (let l = 1; l <= M.MAX_MULT; l++) {
    const a = M.missionSet(l);
    assert.equal(new Set(a).size, 3);
    assert.deepEqual(M.missionSet(l), a);
    for (const id of a) assert.ok(M.MISSION_IDS.includes(id));
    sets.add(a.join());
  }
  assert.ok(sets.size > 20, 'наборы разные');
  for (const id of M.MISSION_IDS) {
    assert.ok(M.missionTarget(id, 9) >= M.missionTarget(id, 1));
    assert.ok(M.missionTarget(id, 1) >= 1);
  }
  assert.ok(M.missionTarget('coins_run', 9) > M.missionTarget('coins_run', 1));
  assert.ok(M.missionTarget('district_run', 30) <= 6, 'районов не больше, чем можно проехать');
  assert.ok(M.missionReward(9) > M.missionReward(1));
});

test('задания: «за забег» - лучший забег, «всего» - сумма; все три - множитель +1, новый набор и ключ', () => {
  const s = M.defaultSave();
  s.missions.ids = ['coins_run', 'jumps', 'runs'];       // свой набор для закона
  const tc = M.missionTarget('coins_run', 1), tj = M.missionTarget('jumps', 1), tr = M.missionTarget('runs', 1);
  // во время забега видно с его учётом
  let v = M.missionView(s, res({ coins: tc - 1, stats: { jumps: 4 } }));
  assert.deepEqual(v.map((x) => x.value), [tc - 1, 4, 1]);
  assert.equal(v[0].done, false);
  // после забега: за забег не складывается, «всего» складывается
  M.commitMissions(s, res({ coins: tc - 1, stats: { jumps: 4 } }));
  M.commitMissions(s, res({ coins: tc - 1, stats: { jumps: 4 } }));
  assert.deepEqual(s.missions.progress, [tc - 1, 8, 2]);
  assert.deepEqual(s.missions.done, [false, false, false]);
  const coins0 = s.coins;
  const out = M.commitMissions(s, res({ coins: tc, stats: { jumps: 3 } }));
  assert.deepEqual(out.completed, tr === 3 ? ['coins_run', 'runs'] : ['coins_run']);
  assert.equal(s.coins - coins0, out.completed.length * M.missionReward(1), 'награда за задания');
  assert.equal(out.levelUp, false);
  assert.equal(s.missions.done[0], true);
  // добить последнее
  const out2 = M.commitMissions(s, res({ coins: 0, stats: { jumps: tj } }));
  assert.ok(out2.completed.includes('jumps'));
  assert.equal(out2.levelUp, true);
  assert.equal(out2.keys, 1);
  assert.equal(s.missions.level, 2, 'множитель вырос');
  assert.deepEqual(s.missions.ids, M.missionSet(2));
  assert.deepEqual(s.missions.done, [false, false, false]);
  assert.deepEqual(s.missions.progress, [0, 0, 0]);
  assert.equal(s.keys, 1, 'ключ за набор');
  assert.equal(s.stats.missions, 3);
});

test('задание можно пропустить за ключи', () => {
  const s = M.defaultSave();
  assert.equal(M.skipMission(s, 0).reason, 'keys');
  s.keys = 5;
  assert.deepEqual(M.skipMission(s, 1), { ok: true, cost: M.skipCost(1) });
  assert.equal(s.missions.done[1], true);
  assert.equal(s.keys, 5 - M.skipCost(1));
  assert.equal(M.skipMission(s, 1).ok, false, 'выполненное не пропускается');
  assert.equal(M.skipMission(s, 7).ok, false);
  assert.ok(M.skipCost(20) > M.skipCost(1));
});

// ---------- испытание дня ----------

test('испытание дня: один день - один мир и одна цель, разные дни - разные', () => {
  const a = M.dailyFor('2026-10-17');
  assert.deepEqual(M.dailyFor('2026-10-17'), a);
  const days = [];
  for (let d = 1; d <= 28; d++) days.push(M.dailyFor(`2026-11-${String(d).padStart(2, '0')}`));
  assert.equal(new Set(days.map((x) => x.seed)).size, 28);
  assert.ok(new Set(days.map((x) => x.goal.type)).size >= 4, 'цели разные');
  for (const x of days) assert.ok(x.goal.n > 0 && x.reward.coins > 0 && x.reward.keys > 0);
  assert.equal(M.prevDay('2026-03-01'), '2026-02-28');
  assert.equal(M.prevDay('2026-01-01'), '2025-12-31');
  assert.equal(M.dailyValue({ type: 'roofs', n: 3 }, res({ stats: { roofs: 4 } })), 4);
  assert.equal(M.dailyValue({ type: 'score', n: 3 }, res({ score: 77 })), 77);
});

test('испытание дня: награда один раз в день, дни подряд - серия с прибавкой, пропуск - серия заново', () => {
  const s = M.defaultSave();
  const r1 = M.completeDaily(s, '2026-10-17');
  assert.deepEqual([r1.coins, r1.keys, r1.streak], [300, 1, 1]);
  assert.equal(M.completeDaily(s, '2026-10-17'), null, 'второй раз за день - ничего');
  assert.equal(s.coins, 300);
  const r2 = M.completeDaily(s, '2026-10-18');
  assert.deepEqual([r2.coins, r2.streak], [350, 2]);
  const r3 = M.completeDaily(s, '2026-10-20');
  assert.deepEqual([r3.coins, r3.streak], [300, 1], 'пропущен день');
  assert.equal(s.keys, 3);
  assert.equal(s.stats.dailies, 3);
});

// ---------- итоги, лучшие забеги, достижения ----------

test('итог забега: рекорд, банк, ключи, статистика, смерти и десять лучших забегов по порядку', () => {
  const s = M.defaultSave();
  const a = M.applyResult(s, res({ score: 100, coins: 7, keys: 1, distance: 300, deathBy: 'pit', stats: { jumps: 5, bestCombo: 4, districts: 2 } }));
  assert.deepEqual(a, { record: true, rank: 1 });
  const b = M.applyResult(s, res({ score: 50, coins: 3, distance: 500, deathBy: 'train', stats: { jumps: 2, bestCombo: 9, districts: 1 } }));
  assert.deepEqual(b, { record: false, rank: 2 });
  assert.equal(s.best, 100);
  assert.equal(s.bestDistance, 500);
  assert.equal(s.coins, 10);
  assert.equal(s.keys, 1);
  assert.equal(s.runs, 2);
  assert.equal(s.stats.distance, 800);
  assert.equal(s.stats.jumps, 7);
  assert.equal(s.stats.bestCombo, 9);
  assert.equal(s.stats.maxDistricts, 2);
  assert.deepEqual([s.stats.deaths.pit, s.stats.deaths.train], [1, 1]);
  for (let i = 0; i < 15; i++) M.applyResult(s, res({ score: 60 + i * 10, distance: 100 }));
  assert.equal(s.bestRuns.length, M.BEST_RUNS);
  for (let i = 1; i < s.bestRuns.length; i++) assert.ok(s.bestRuns[i - 1].score >= s.bestRuns[i].score);
  assert.equal(s.bestRuns[0].score, 200);
  assert.equal(M.applyResult(s, res({ score: 1 })).rank, null, 'слабый забег в список не попал');
});

test('достижения: открываются по условию один раз и платят один раз', () => {
  const s = M.defaultSave();
  assert.deepEqual(M.checkAchievements(s), []);
  M.applyResult(s, res({ score: 12000, coins: 120, distance: 1200 }));
  const coins = s.coins;
  const got = M.checkAchievements(s);
  for (const id of ['first', 'km1', 'coins100', 'score10k']) assert.ok(got.includes(id), id);
  assert.ok(!got.includes('km5'));
  assert.equal(s.coins - coins, got.length * M.ACH_REWARD);
  assert.deepEqual(M.checkAchievements(s), [], 'второй раз - ничего');
  assert.equal(new Set(M.ACHIEVEMENTS.map((a) => a.id)).size, M.ACHIEVEMENTS.length);
  assert.ok(M.ACHIEVEMENTS.length >= 16);
  s.owned.chars = M.CHARS.map((c) => c.id);
  assert.deepEqual(M.checkAchievements(s).sort(), ['crew3', 'crewAll']);
});
