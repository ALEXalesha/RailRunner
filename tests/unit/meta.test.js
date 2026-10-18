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

// ---------- 2.1.0: ярусы достижений и коробки-сюрпризы ----------

const I18N = require(path.join(WEB, 'js', 'i18n.js')).RRI18n;

test('достижений 44 (вдвое больше 2.0.5), ярусы бронза/серебро/золото, у каждого текст на обоих языках', () => {
  assert.equal(M.ACHIEVEMENTS.length, 44);
  assert.deepEqual(M.TIERS, ['bronze', 'silver', 'gold']);
  for (const a of M.ACHIEVEMENTS) assert.ok(M.TIERS.includes(a.tier), a.id + ': ярус ' + a.tier);
  for (const t of M.TIERS) assert.ok(M.ACHIEVEMENTS.filter((a) => a.tier === t).length >= 10, 'ярус ' + t);
  // семьи по ярусам: дистанция, без аварий, монеты, прыжки, подкаты, ускорители, спасения доской, задания
  for (const fam of [['km1', 'km5', 'km10'], ['clean1k', 'clean3k', 'clean6k'], ['coins100', 'coins300', 'coins600'], ['bank1k', 'bank10k', 'bank50k'],
    ['jumps100', 'jumps1k', 'jumps5k'], ['slides100', 'slides1k', 'slides5k'], ['powers25', 'powers100', 'powers500'],
    ['saves1', 'saves10', 'saves50'], ['missions10', 'missions50', 'missions150']]) {
    assert.deepEqual(fam.map(M.achTier), ['bronze', 'silver', 'gold'], fam.join());
  }
  for (const lang of ['ru', 'en']) {

    for (const a of M.ACHIEVEMENTS) for (const k of ['a_' + a.id, 'a_' + a.id + '_d']) {
      const v = I18N.T[lang][k];
      assert.ok(v && v !== k, `${lang}: нет текста ${k}`);
      // 2.0.4: пятизначные числа - с неразрывным пробелом (ru) или запятой (en), не обычным пробелом
      assert.ok(!/\d \d{3}/.test(v), `${lang} ${k}: число с обычным пробелом «${v}»`);
    }
  }
});

test('достижения: каждое достижимо - игрок, сделавший всё, открывает все 44', () => {
  const s = M.defaultSave();
  M.applyResult(s, res({ score: 60000, coins: 700, distance: 11000, stats: { jumps: 5000, slides: 5000, powers: 500, saves: 50, roofs: 50, hops: 10, near: 25, jets: 10, bestCombo: 10, districts: 5, clean: 6500 } }));
  s.stats.missions = 150; s.stats.revives = 1; s.stats.dailies = 1; s.daily.streak = 3;
  s.totalCoins = 50000; s.missions.level = 10; s.owned.chars = M.CHARS.map((c) => c.id); s.upgrades.magnet = R.MAX_LEVEL;
  assert.equal(M.checkAchievements(s).length, 44);
  // и ни одно не открывается раньше порога: у новичка с одним коротким забегом - только «Первый забег»
  const n = M.defaultSave();
  M.applyResult(n, res({ score: 10, coins: 3, distance: 50, stats: { jumps: 2, clean: 50 } }));
  assert.deepEqual(M.checkAchievements(n), ['first']);
});

test('забег без аварии: метры до первой аварии или спасения доской идут в лучший «чистый» забег', () => {
  const s = M.defaultSave();
  M.applyResult(s, res({ distance: 4000, stats: { clean: 1200, saves: 2 } }));
  assert.equal(s.stats.bestClean, 1200);
  assert.equal(s.stats.saves, 2);
  M.applyResult(s, res({ distance: 3100, stats: { clean: 3100 } }));
  assert.equal(s.stats.bestClean, 3100);
  assert.equal(s.stats.saves, 2);
  assert.ok(M.checkAchievements(s).includes('clean3k'));
  assert.ok(!s.achievements.clean6k);
});

test('коробки: вероятности каждой коробки в сумме 1, в каждой есть все виды наград, лучше ярус - лучше коробка', () => {
  assert.deepEqual(Object.keys(M.DROPS), M.TIERS);
  const worth = {};
  for (const t of M.TIERS) {
    const table = M.DROPS[t];
    const sum = table.reduce((a, d) => a + d.p, 0);
    assert.ok(Math.abs(sum - 1) < 1e-9, `${t}: сумма ${sum}`);
    assert.ok(table.every((d) => d.p > 0), t + ': нулевая вероятность');
    assert.deepEqual(table.map((d) => d.type).sort(), M.REWARD_TYPES.slice().sort(), t);
    const p = (k) => table.find((d) => d.type === k);
    worth[t] = { coins: (p('coins').min + p('coins').max) / 2, keys: p('keys').n, boards: p('boards').n, rare: p('skin').p };
  }
  for (const [lo, hi] of [['bronze', 'silver'], ['silver', 'gold']]) {
    for (const k of ['coins', 'keys', 'boards', 'rare']) assert.ok(worth[hi][k] > worth[lo][k], `${hi} лучше ${lo} по ${k}`);
  }
});

test('коробки: выпадает каждый вид награды, частоты по таблице, один seed - те же награды', () => {
  for (const t of M.TIERS) {
    const r = R.rng(12345);
    const s = M.defaultSave();
    const count = { coins: 0, keys: 0, boards: 0, skin: 0 };
    const N = 4000;
    for (let i = 0; i < N; i++) {
      const w = M.rollBox(t, r, s);
      count[w.type]++;
      if (w.type === 'coins') { const d = M.DROPS[t][0]; assert.ok(w.n >= d.min && w.n <= d.max && Number.isInteger(w.n)); }
      if (w.type === 'skin') assert.ok(w.kind === 'char' ? !s.owned.chars.includes(w.id) : !s.owned.boards.includes(w.id), 'редкое - то, чего ещё нет');
    }
    for (const d of M.DROPS[t]) {
      assert.ok(count[d.type] > 0, `${t}: ${d.type} не выпал ни разу`);
      assert.ok(Math.abs(count[d.type] / N - d.p) < 0.03, `${t}: ${d.type} ${count[d.type] / N} при ${d.p}`);
    }
  }
  // всё уже куплено - редкое становится монетами
  const all = M.defaultSave();
  all.owned.chars = M.CHARS.map((c) => c.id); all.owned.boards = M.BOARDS.map((b) => b.id);
  const r = R.rng(7);
  let w;
  do w = M.rollBox('gold', r, all); while (w.type !== 'skin');
  assert.equal(w.coins, M.SKIN_COINS);
  // одно сохранение с тем же boxSeed открывает коробки одинаково
  const seq = () => { const s = M.defaultSave(); s.boxSeed = 99; s.boxes.gold = 30; const out = []; while (s.boxes.gold) out.push(JSON.stringify(M.openBox(s, 'gold'))); return out; };
  assert.deepEqual(seq(), seq());
});

test('коробки: открытие кладёт награду в сохранение (монеты, ключи, доски, персонаж или доска), пустую не открыть', () => {
  const s = M.defaultSave();
  s.boxSeed = 1;
  assert.equal(M.openBox(s, 'bronze'), null, 'коробок нет - нечего открывать');
  assert.equal(M.openBox(s, 'platinum'), null);
  s.boxes.gold = 400;
  const seen = new Set();
  while (s.boxes.gold > 0) {
    const before = { coins: s.coins, keys: s.keys, boards: s.boards, chars: s.owned.chars.length, looks: s.owned.boards.length };
    const w = M.openBox(s, 'gold');
    seen.add(w.type);
    assert.equal(w.tier, 'gold');
    if (w.type === 'coins') assert.equal(s.coins - before.coins, w.n);
    if (w.type === 'keys') assert.equal(s.keys - before.keys, w.n);
    if (w.type === 'boards') assert.equal(s.boards - before.boards, w.n);
    if (w.type === 'skin' && w.kind === 'char') { assert.equal(s.owned.chars.length, before.chars + 1); assert.ok(s.owned.chars.includes(w.id)); }
    if (w.type === 'skin' && w.kind === 'board') { assert.equal(s.owned.boards.length, before.looks + 1); assert.ok(s.owned.boards.includes(w.id)); }
    if (w.type === 'skin' && !w.kind) assert.equal(s.coins - before.coins, M.SKIN_COINS);
  }
  assert.deepEqual([...seen].sort(), M.REWARD_TYPES.slice().sort());
  assert.equal(s.stats.boxes, 400);
  assert.equal(s.boxRolls, 400);
  // купленное в коробке - как купленное в магазине: порядок каталога, переживает перезагрузку
  assert.deepEqual(M.sanitizeSave(JSON.stringify(s)).owned, s.owned);
});

test('коробки: одна за каждое достижение - ровно одна, и после перезагрузки, и при переезде с 2.0.5', () => {
  // каждое достижение даёт коробку своего яруса
  for (const a of M.ACHIEVEMENTS) {
    const s = M.defaultSave();
    s.achievements[a.id] = 1;
    M.grantBoxes(s);
    assert.deepEqual(s.boxes, Object.assign({ bronze: 0, silver: 0, gold: 0 }, { [a.tier]: 1 }), a.id);
  }
  // открытие в игре: коробка в запасе, второй проверкой и перезагрузкой не удваивается, открытые не возвращаются
  const s = M.defaultSave();
  M.applyResult(s, res({ score: 12000, coins: 120, distance: 1200, stats: { clean: 1200 } }));
  const got = M.checkAchievements(s);
  const want = { bronze: 0, silver: 0, gold: 0 };
  for (const id of got) want[M.achTier(id)]++;
  assert.deepEqual(s.boxes, want);
  M.checkAchievements(s);
  assert.deepEqual(s.boxes, want, 'вторая проверка - коробок столько же');
  let again = M.sanitizeSave(JSON.stringify(s));
  assert.deepEqual(again.boxes, want, 'перезагрузка - столько же');
  M.openBox(again, 'bronze');
  again = M.sanitizeSave(JSON.stringify(again));
  M.checkAchievements(again);
  assert.equal(again.boxes.bronze, want.bronze - 1, 'открытая коробка не возвращается после перезагрузки');
  // сохранение 2.0.5: достижения есть, коробок и отметок ещё нет - коробка за каждое, один раз
  const OLD = { v: 2, best: 60000, bestDistance: 5200, coins: 900, runs: 40, tutorialDone: true, boardGift: true,
    achievements: { first: 1, km1: 1, km5: 1, score50k: 1, tour: 1, upgrade: 1 }, upgrades: { magnet: 5 }, stats: { maxDistricts: 5 } };
  const m = M.sanitizeSave(JSON.stringify(OLD));
  assert.deepEqual(m.boxes, { bronze: 2, silver: 1, gold: 3 });
  assert.equal(m.coins, 900, 'монеты за старые достижения второй раз не платятся');
  const m2 = M.sanitizeSave(JSON.stringify(m));
  assert.deepEqual(m2.boxes, m.boxes, 'второе чтение - коробки не удваиваются');
  // новые достижения 2.1.0, уже заработанные по старой статистике (здесь «Десять тысяч»), дают свою коробку - тоже одну
  const fresh = M.checkAchievements(m2);
  assert.deepEqual(fresh, ['score10k']);
  assert.deepEqual(m2.boxes, { bronze: 2, silver: 2, gold: 3 });
  M.checkAchievements(m2);
  assert.deepEqual(M.sanitizeSave(JSON.stringify(m2)).boxes, { bronze: 2, silver: 2, gold: 3 });
  assert.equal(Object.keys(m2.boxGot).length, Object.keys(m2.achievements).length, 'отметок столько же, сколько достижений');
  assert.equal(m2.boxSeed, m.boxSeed, 'seed коробок хранится');
});
