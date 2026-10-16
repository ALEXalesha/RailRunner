// Законы чистой логики RailRunner (web/js/core.js): node --test tests/unit
// RR_WEB - папка web/ (проверка проверок, tools/mutate.js, подставляет сломанную копию).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const WEB = process.env.RR_WEB || path.join(__dirname, '..', '..', 'web');
const R = require(path.join(WEB, 'js', 'core.js'));
const C = R.C;

// ---------- помощники ----------

// пустой мир без генератора и с тем, что положили руками
function bare(opts = {}) {
  const run = R.newRun(1, opts);
  run.world.obstacles = [];
  run.world.coins = [];
  run.world.powers = [];
  run.world.path = [{ z: 0, lane: 0, kind: 'empty' }];
  run.world.genZ = Infinity;
  return run;
}
let nextId = 100000;
function place(run, o) {
  const full = Object.assign({ moving: false, broken: false, triggered: false, id: nextId++ }, o);
  const e = R.encounter(full);
  full.enc0 = e[0];
  full.enc1 = e[1];
  run.world.obstacles.push(full);
  run.world.obstacles.sort((a, b) => a.enc0 - b.enc0);
  return full;
}
function coin(run, lane, z, y = 0.7) {
  const c = { id: nextId++, lane, z, y, taken: false, takenAt: 0 };
  run.world.coins.push(c);
  run.world.coins.sort((a, b) => a.z - b.z);
  return c;
}
// бежать, пока z не достигнет цели (или до аварии); each(run) - перед каждым шагом
function runTo(run, z, each) {
  let guard = 0;
  while (run.alive && run.z < z && guard++ < 200000) { if (each) each(run); R.step(run); }
  return run;
}
// нажать действие, когда игрок окажется в точке z
function pressAt(z, action) {
  let done = false;
  return (run) => { if (!done && run.z >= z) { R.act(run, action); done = true; } };
}
function all(...fns) { return (run) => fns.forEach((f) => f(run)); }

// весь мир до zLimit без удаления старого (prune не зовём)
function worldTo(seed, zLimit) {
  const w = R.createWorld(seed);
  R.generateUntil(w, zLimit);
  return w;
}

// ---------- скорость ----------

test('скорость растёт с дистанцией и упирается в потолок', () => {
  assert.equal(R.speedAt(0), C.SPEED_MIN);
  let prev = 0;
  for (let z = 0; z <= 20000; z += 50) {
    const v = R.speedAt(z);
    assert.ok(v >= prev, 'скорость не падает');
    assert.ok(v <= C.SPEED_MAX + 1e-9, 'не выше потолка');
    prev = v;
  }
  assert.equal(R.speedAt(1e6), C.SPEED_MAX);
  assert.ok(R.speedAt(1000) > R.speedAt(100) + 3, 'за километр заметно быстрее');
});

// ---------- генератор ----------

test('один seed - один и тот же мир, другой seed - другой', () => {
  const sig = (w) => JSON.stringify(w.obstacles.map((o) => [o.type, o.lane, +o.z0.toFixed(3), o.moving])) + JSON.stringify(w.coins.map((c) => [c.lane, +c.z.toFixed(3)]));
  assert.equal(sig(worldTo(42, 3000)), sig(worldTo(42, 3000)));
  assert.notEqual(sig(worldTo(42, 3000)), sig(worldTo(43, 3000)));
});

// Независимая проверка: по готовому списку препятствий и пути (без внутренних счётчиков
// генератора) в каждом ряду есть полоса, которую можно пройти, и в неё успеваешь перейти.
// Перейти с крыши на крышу поезда в соседнем пути можно, если новый поезд уже под игроком
// за switchDist до ряда, а старый тянется до самого ряда.
function checkPassable(w, upto) {
  const path = w.path.filter((p) => p.z < upto);
  const obs = w.obstacles;
  const blocking = (o) => o.type === 'train' || o.type === 'ramp' || o.type === 'fence';
  let ride = null;           // поезд, по крыше которого идёт путь
  let lastAction = -Infinity, lastActionV = 0, rideEndAt = -Infinity;
  const seen = new Set();
  let hops = 0;
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i], b = path[i + 1];
    assert.ok(Math.abs(b.lane - a.lane) <= 1, `ряд ${a.z.toFixed(1)}: путь прыгает через полосу`);
    if (ride && ride.lane !== a.lane) ride = null;
    // в полосе пути - только проходимое
    for (const o of obs) {
      if (o.lane !== a.lane || o.enc1 <= a.z || o.enc0 >= b.z) continue;
      if (!o.moving && o.z0 >= b.z - 1e-6) continue;      // стоит в самом ряду b - его проверит ряд b
      if (seen.has(o.id)) continue;
      seen.add(o.id);
      if (o.type === 'hurdle' || o.type === 'bar' || o.type === 'pit') {
        const v = R.speedAt(o.z0);
        assert.ok(o.z0 - lastAction >= lastActionV * 0.9, `ряд ${a.z.toFixed(1)}: два прыжка/подката слишком близко (${lastAction.toFixed(1)} и ${o.z0.toFixed(1)}, полоса ${o.lane}, seed ${w.seed})`);
        assert.ok(o.z0 - rideEndAt >= v * 0.75, `ряд ${a.z.toFixed(1)}: препятствие сразу за концом крыши`);
        lastAction = o.z0; lastActionV = v;
        continue;
      }
      assert.ok(o.type !== 'fence', `ряд ${a.z.toFixed(1)}: ограждение в полосе пути`);
      assert.ok(!o.moving, `ряд ${a.z.toFixed(1)}: движущийся поезд в полосе пути`);
      if (o.type === 'ramp') {
        assert.ok(o.z0 >= a.z - 1e-6, `ряд ${a.z.toFixed(1)}: на пандус въезд сбоку`);
        ride = obs.find((t) => t.id === o.train);
        assert.ok(ride, 'у пандуса есть поезд');
        continue;
      }
      // поезд: только тот, на крышу которого въехали по его пандусу или перешли с соседней крыши
      assert.ok(ride && ride.id === o.id, `ряд ${a.z.toFixed(1)}: поезд в полосе пути без пандуса (seed ${w.seed})`);
      rideEndAt = o.z1;
    }
    // смена полосы: новая полоса свободна за switchDist до ряда
    if (b.lane !== a.lane) {
      const sd = R.switchDist(R.speedAt(b.z));
      if (ride) {
        const next = obs.find((o) => o.lane === b.lane && o.type === 'train' && !o.moving && o.z0 <= b.z - sd + 1e-6 && o.z1 > b.z + 1);
        if (next && ride.z1 >= b.z - 1e-6) {
          // с крыши на крышу: в окне перехода в новой полосе нет ничего, кроме нового поезда
          for (const o of obs) {
            if (o === next || o.lane !== b.lane || (!o.moving && o.z0 >= b.z - 1e-6)) continue;
            assert.ok(!(o.enc1 > b.z - sd && o.enc0 < b.z), `ряд ${b.z.toFixed(1)}: при переходе с крыши в новой полосе ${o.type}`);
          }
          ride = next;
          hops++;
          continue;
        }
        rideEndAt = Math.min(ride.z1, b.z);          // спрыгнул с крыши вбок
      }
      for (const o of obs) {
        if (o.lane !== b.lane || (!o.moving && o.z0 >= b.z - 1e-6)) continue;   // то, что стоит в самом ряду b, проверит ряд b
        assert.ok(!(o.enc1 > b.z - sd && o.enc0 < b.z), `ряд ${b.z.toFixed(1)}: в новой полосе ${o.type} в окне перехода`);
        assert.ok(!(blocking(o) && o.enc0 < b.z && o.enc1 > b.z), `ряд ${b.z.toFixed(1)}: в новую полосу въезд в бок поезда`);
      }
      ride = null;
    }
  }
  return { rows: path.length, hops };
}

test('в каждом ряду есть проходимая полоса: 300 миров по 4 км', () => {
  let rows = 0, hops = 0;
  for (let seed = 1; seed <= 300; seed++) { const c = checkPassable(worldTo(seed, 4200), 4000); rows += c.rows; hops += c.hops; }
  assert.ok(rows > 300 * 100, 'рядов много: ' + rows);
  assert.ok(hops > 300, 'переходов с крыши на крышу много: ' + hops);
});

test('поперёк пути не бывает трёх занятых полос (в любой точке хоть одна свободна или проходима)', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const w = worldTo(seed, 3000);
    for (let z = C.FIRST_ROW; z < 2900; z += 0.5) {
      let blocked = 0;
      for (const L of R.LANES) {
        if (w.obstacles.some((o) => o.lane === L && (o.type === 'fence' || (o.type === 'train' && !o.ridable)) && o.enc0 <= z && o.enc1 >= z)) blocked++;
      }
      assert.ok(blocked < 3, `seed ${seed} z ${z}: все три полосы закрыты поездами и ограждениями`);
    }
  }
});

function eventsOf(run) {
  const ev = {};
  for (const e of run.events) ev[e] = (ev[e] || 0) + 1;
  run.events.length = 0;
  return ev;
}

test('автопилот по безопасной полосе проходит 4 км на 60 мирах, и мир не пустой', () => {
  const total = {};
  const kinds = new Set();
  for (let seed = 1; seed <= 60; seed++) {
    const run = R.newRun(seed);
    runTo(run, 4000, (r) => {
      R.autopilot(r);
      for (const [k, n] of Object.entries(eventsOf(r))) total[k] = (total[k] || 0) + n;
      for (const o of r.world.obstacles) kinds.add(o.type + (o.moving ? (o.k > 0 ? '-moving' : '-slow') : ''));
    });
    assert.ok(run.alive, `seed ${seed}: авария на ${run.z.toFixed(1)} м (${run.deathBy})`);
  }
  for (const k of ['hurdle', 'bar', 'fence', 'pit', 'train', 'ramp', 'train-moving', 'train-slow']) assert.ok(kinds.has(k), 'в мирах есть ' + k);
  for (const k of ['jump', 'slide', 'lane', 'coin', 'horn', 'trick:hurdle', 'trick:bar', 'trick:pit', 'trick:roof', 'trick:hop', 'key']) assert.ok(total[k] > 50, `автопилот делал ${k}: ${total[k]}`);
  for (const d of R.DISTRICTS) assert.ok(total['district:' + d] > 0, 'побывал в районе ' + d);
  assert.ok(!total.bump, 'автопилот ни разу не ударился боком');
});

test('с ускорителями (ботинки, магнит, x2, доска, ранец) автопилот тоже проходит', () => {
  for (const kind of R.POWERS) {
    for (let seed = 1; seed <= 12; seed++) {
      const run = R.newRun(seed * 7 + 3);
      runTo(run, 2500, (r) => { if (kind !== 'jetpack' || r.z % 400 < 1) r.power[kind] = Math.max(r.power[kind], kind === 'jetpack' ? 3 : 5); R.autopilot(r); });
      assert.ok(run.alive, `${kind}, seed ${seed}: авария на ${run.z.toFixed(1)} м`);
      if (kind === 'board') assert.ok(!run.events.includes('board-break'), 'доска не понадобилась');
    }
  }
});

test('бездействие кончается аварией: препятствия настоящие', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const run = R.newRun(seed);
    R.advance(run, 90);
    assert.ok(!run.alive, `seed ${seed}: стоя в средней полосе прожил 90 с`);
  }
});

test('монеты и ускорители не лежат внутри препятствий', () => {
  for (let seed = 1; seed <= 80; seed++) {
    const w = worldTo(seed, 3000);
    const items = w.coins.map((c) => ({ ...c, r: 0.4, what: 'монета' })).concat(w.powers.map((p) => ({ ...p, r: 0.6, what: p.kind })));
    for (const it of items) {
      for (const o of w.obstacles) {
        if (o.moving || o.lane !== it.lane || it.z < o.z0 - 0.3 || it.z > o.z1 + 0.3) continue;
        const [bot, top] = R.solidAt(o, it.z);
        const inside = it.y + it.r > bot && it.y - it.r < top;
        assert.ok(!inside, `seed ${seed}: ${it.what} в ${o.type} (z ${it.z.toFixed(1)}, y ${it.y.toFixed(2)})`);
      }
    }
  }
});

test('ускорители попадаются каждые 250-500 м и на земле в полосе пути', () => {
  const w = worldTo(5, 6000);
  const powers = w.powers.filter((p) => p.kind !== 'key');
  assert.ok(powers.length >= 10, 'ускорителей ' + powers.length);
  for (let i = 1; i < powers.length; i++) assert.ok(powers[i].z - powers[i - 1].z >= 240, 'не чаще 250 м');
  for (const p of w.powers) {
    const row = [...w.path].reverse().find((r) => r.z <= p.z);
    assert.equal(row.lane, p.lane, 'в безопасной полосе');
    assert.ok(R.POWERS.includes(p.kind) || p.kind === 'key');
  }
  const kinds = new Set(worldTo(9, 30000).powers.map((p) => p.kind));
  assert.deepEqual([...kinds].sort(), [...R.POWERS, 'key'].sort(), 'все пять видов и ключи');
  const keys = worldTo(9, 30000).powers.filter((p) => p.kind === 'key');
  assert.ok(keys.length >= 10 && keys.length <= 30, 'ключей на 30 км: ' + keys.length);
});

test('мир не растёт бесконечно: пройденное удаляется', () => {
  const run = R.newRun(3);
  runTo(run, 5000, R.autopilot);
  assert.ok(run.alive);
  assert.ok(run.world.obstacles.length < 120, 'препятствий в памяти ' + run.world.obstacles.length);
  assert.ok(run.world.coins.length < 600, 'монет в памяти ' + run.world.coins.length);
  assert.ok(run.world.obstacles.every((o) => o.enc1 > run.z - C.BEHIND - 1 || R.extentAt(o, run.z)[1] > run.z - C.BEHIND - 1));
});

// ---------- физика и столкновения ----------

test('барьер: бег в него - авария, прыжок вовремя - проходит, подкат - авария', () => {
  let run = bare();
  place(run, { type: 'hurdle', lane: 0, z0: 30, z1: 30 + C.HURDLE_D });
  runTo(run, 40);
  assert.equal(run.alive, false);
  assert.equal(run.deathBy, 'hurdle');

  run = bare();
  place(run, { type: 'hurdle', lane: 0, z0: 30, z1: 30 + C.HURDLE_D });
  runTo(run, 40, pressAt(30 - R.speedAt(30) * 0.3, 'jump'));
  assert.equal(run.alive, true);

  run = bare();
  place(run, { type: 'hurdle', lane: 0, z0: 30, z1: 30 + C.HURDLE_D });
  runTo(run, 40, pressAt(28, 'slide'));
  assert.equal(run.alive, false);
});

test('перекладина: бег - авария, подкат - проходит, обычный прыжок - авария', () => {
  let run = bare();
  place(run, { type: 'bar', lane: 0, z0: 30, z1: 30 + C.BAR_D });
  runTo(run, 40);
  assert.equal(run.alive, false);
  assert.equal(run.deathBy, 'bar');

  run = bare();
  place(run, { type: 'bar', lane: 0, z0: 30, z1: 30 + C.BAR_D });
  runTo(run, 40, pressAt(27, 'slide'));
  assert.equal(run.alive, true);

  run = bare();
  place(run, { type: 'bar', lane: 0, z0: 30, z1: 30 + C.BAR_D });
  runTo(run, 40, pressAt(30 - R.speedAt(30) * 0.3, 'jump'));
  assert.equal(run.alive, false);
});

test('поезд: в лоб - авария; по пандусу - на крышу, в конце спрыгивает на землю', () => {
  let run = bare();
  place(run, { type: 'train', lane: 0, z0: 30, z1: 39, cars: 1 });
  runTo(run, 45);
  assert.equal(run.alive, false);
  assert.equal(run.deathBy, 'train');

  run = bare();
  const ramp = place(run, { type: 'ramp', lane: 0, z0: 30, z1: 30 + C.RAMP_LEN });
  const tr = place(run, { type: 'train', lane: 0, z0: ramp.z1, z1: ramp.z1 + 18.6, cars: 2, ridable: true });
  ramp.train = tr.id;
  let roof = 0;
  runTo(run, tr.z1 + 30, (r) => { if (r.z > tr.z0 + 1 && r.z < tr.z1 - 1) roof = Math.min(roof || 99, r.y); });
  assert.equal(run.alive, true);
  assert.ok(Math.abs(roof - C.TRAIN_H) < 1e-6, 'по крыше на высоте поезда: ' + roof);
  assert.equal(run.y, 0, 'после поезда снова на земле');
});

test('боковой удар отбрасывает в прежнюю полосу и даёт спотыкание, второй за это время - авария', () => {
  const run = bare();
  place(run, { type: 'train', lane: 1, z0: 20, z1: 80, cars: 6 });
  runTo(run, 30, pressAt(28, 'right'));
  runTo(run, 33);
  assert.equal(run.alive, true);
  assert.ok(run.events.includes('bump'), 'удар боком');
  assert.equal(run.lane, 0, 'вернулся в свою полосу');
  assert.ok(run.stumbleT > 0, 'спотыкается');
  runTo(run, 40, pressAt(35, 'right'));
  assert.equal(run.alive, false, 'второй удар за время спотыкания - авария');

  // после спотыкания снова можно удариться без аварии
  const r2 = bare();
  place(r2, { type: 'train', lane: 1, z0: 20, z1: 200, cars: 20 });
  runTo(r2, 30, pressAt(28, 'right'));
  runTo(r2, 30 + R.speedAt(30) * (C.STUMBLE_TIME + 0.3));
  assert.equal(r2.stumbleT, 0);
  runTo(r2, r2.z + 5, pressAt(r2.z + 1, 'right'));
  assert.equal(r2.alive, true);
});

test('два быстрых нажатия через поезд в средней полосе: удар отбрасывает туда, откуда бежал, а не в полосу поезда', () => {
  const run = bare();
  run.lane = -1; run.x = R.laneX(-1); run.laneFrom = -1;
  place(run, { type: 'train', lane: 0, z0: 10, z1: 100, cars: 9 });
  runTo(run, 30, (r) => { if (r.z >= 28 && r.z < 28.2) { R.act(r, 'right'); R.act(r, 'right'); } });
  runTo(run, 40);
  assert.equal(run.alive, true, 'не авария');
  assert.ok(run.events.includes('bump'));
  assert.equal(run.lane, -1, 'вернулся в свою полосу');
  assert.equal(run.x, R.laneX(-1));
});

test('доска спасает от одной аварии, потом пропадает', () => {
  const run = bare();
  run.power.board = 30;
  place(run, { type: 'hurdle', lane: 0, z0: 30, z1: 30 + C.HURDLE_D });
  place(run, { type: 'hurdle', lane: 0, z0: 90, z1: 90 + C.HURDLE_D });
  runTo(run, 60);
  assert.equal(run.alive, true, 'первый барьер разбит доской');
  assert.equal(run.power.board, 0, 'доски больше нет');
  assert.ok(run.events.includes('board-break'));
  runTo(run, 100);
  assert.equal(run.alive, false, 'второй барьер - авария');
});

test('неуязвимость после разбитой доски длится INVULN секунд', () => {
  const run = bare();
  run.power.board = 30;
  place(run, { type: 'hurdle', lane: 0, z0: 30, z1: 30 + C.HURDLE_D });
  const v = R.speedAt(31);
  place(run, { type: 'hurdle', lane: 0, z0: 30 + v * (C.INVULN * 0.5), z1: 30 + v * (C.INVULN * 0.5) + C.HURDLE_D });
  runTo(run, 30 + v * C.INVULN * 0.8);
  assert.equal(run.alive, true, 'второй барьер в пределах неуязвимости не страшен');
});

test('встречный поезд трогается по сигналу и встречает игрока там, где рассчитано', () => {
  const k = C.MOVING_K;
  const o = { type: 'train', lane: 1, z0: 200, z1: 209, moving: true, k, trigger: 120 };
  assert.equal(R.offsetAt(o, 100), 0, 'до сигнала стоит');
  assert.ok(R.offsetAt(o, 130) < 0, 'после сигнала едет навстречу');
  const [enc0] = R.encounter(o);
  const front = (pz) => R.extentAt(o, pz)[0];
  assert.ok(Math.abs(front(enc0) - (enc0 + C.PLAYER_HALF_D)) < 1e-9, 'встреча: нос поезда у носа игрока');
  // в живом прогоне: игрок в полосе поезда разбивается ровно там
  const run = bare();
  const tr = place(run, { type: 'train', lane: 0, z0: 200, z1: 209, moving: true, k, trigger: 120, cars: 1 });
  runTo(run, 300);
  assert.equal(run.alive, false);
  assert.ok(Math.abs(run.z - tr.enc0) < 0.5, `авария на ${run.z.toFixed(2)}, ждали ${tr.enc0.toFixed(2)}`);
  assert.ok(run.events.includes('horn'), 'сигнал при старте');
});

test('ботинки: прыжок выше крыши поезда, обычный - ниже', () => {
  const apex = (v0) => v0 * v0 / (2 * C.GRAVITY);
  assert.ok(apex(C.JUMP_V) > C.HURDLE_H + 0.3 && apex(C.JUMP_V) < C.TRAIN_H - C.STEP);
  assert.ok(apex(C.BOOTS_JUMP_V) > C.TRAIN_H + 0.2);
  const run = bare();
  run.power.boots = 10;
  place(run, { type: 'train', lane: 0, z0: 40, z1: 80, cars: 4 });
  const v = R.speedAt(30);
  runTo(run, 70, pressAt(40 - v * 0.45, 'jump'));
  assert.equal(run.alive, true, 'запрыгнул на крышу');
  assert.ok(Math.abs(run.y - C.TRAIN_H) < 1e-6);
});

test('подкат в воздухе - быстрое падение и подкат при приземлении; прыжок перед приземлением срабатывает', () => {
  let run = bare();
  runTo(run, 10, pressAt(5, 'jump'));
  assert.ok(run.y > 0);
  R.act(run, 'slide');
  R.step(run);
  assert.ok(run.vy <= C.FAST_FALL_V + 1e-9, 'быстрое падение');
  let landed = false;
  runTo(run, 30, (r) => { if (!landed && r.grounded) { landed = true; assert.ok(r.slideT > 0, 'подкат начался при приземлении'); } });
  assert.ok(landed);

  run = bare();
  R.act(run, 'jump');
  R.step(run);
  // ждём почти до приземления и жмём прыжок
  while (!(run.vy < 0 && run.y < 0.15)) R.step(run);
  R.act(run, 'jump');
  let again = false;
  for (let i = 0; i < 40; i++) { R.step(run); if (run.vy > 0) again = true; }
  assert.ok(again, 'прыжок из буфера');

  run = bare();
  R.act(run, 'jump');
  R.step(run);
  for (let i = 0; i < 6; i++) R.step(run);
  run.events.length = 0;
  R.act(run, 'jump');                                // слишком рано: буфер истёк до приземления
  let jumps = 0;
  for (let i = 0; i < 200; i++) { R.step(run); jumps += run.events.filter((e) => e === 'jump').length; run.events.length = 0; }
  assert.equal(jumps, 0, 'ранний прыжок в воздухе не копится');
});

test('два нажатия влево подряд - две полосы; у края полоса не меняется', () => {
  const run = bare();
  run.lane = 1; run.x = R.laneX(1);
  R.act(run, 'left'); R.act(run, 'left');
  R.step(run);
  assert.equal(run.lane, -1);
  R.act(run, 'left');
  R.step(run);
  assert.equal(run.lane, -1);
  assert.ok(run.events.includes('edge'));
  runTo(run, 20);
  assert.equal(run.x, R.laneX(-1), 'добежал до полосы');
});

test('смена полосы занимает LANE_TIME', () => {
  const run = bare();
  R.act(run, 'right');
  const n = Math.round(C.LANE_TIME / C.DT);
  for (let i = 0; i < n - 2; i++) R.step(run);
  assert.ok(run.x < R.laneX(1));
  for (let i = 0; i < 3; i++) R.step(run);
  assert.equal(run.x, R.laneX(1));
});

// ---------- монеты, очки, ускорители ----------

test('монеты: в своей полосе подбираются, в соседней - нет; x2 удваивает очки', () => {
  const run = bare();
  coin(run, 0, 20); coin(run, 1, 25);
  runTo(run, 30);
  assert.equal(run.coins, 1);
  const r1 = bare(); runTo(r1, 500);
  const r2 = bare(); r2.power.x2 = 1000; runTo(r2, 500);
  assert.ok(Math.abs(r1.score - 500) <= 2, 'очки = метры: ' + r1.score);
  assert.ok(Math.abs(r2.score - 1000) <= 3, 'с x2 вдвое: ' + r2.score);
  const with2 = bare(); with2.power.x2 = 1000; coin(with2, 0, 20); runTo(with2, 21);
  const no2 = bare(); no2.power.x2 = 1000; runTo(no2, 21);
  assert.equal(with2.score - no2.score, 2 * C.COIN_POINTS, 'монета с x2 - вдвое');
  const with1 = bare(); coin(with1, 0, 20); runTo(with1, 21);
  const no1 = bare(); runTo(no1, 21);
  assert.equal(with1.score - no1.score, C.COIN_POINTS, 'монета без x2');
});

test('монета над прыжком: снизу не берётся, в прыжке - берётся', () => {
  let run = bare();
  coin(run, 0, 20, 2.6);
  runTo(run, 25);
  assert.equal(run.coins, 0);
  run = bare();
  coin(run, 0, 20, 2.6);
  runTo(run, 25, pressAt(20 - R.speedAt(20) * 0.3, 'jump'));
  assert.equal(run.coins, 1);
});

test('магнит берёт монеты всех полос в пределах дальности, но не дальше', () => {
  const run = bare();
  run.power.magnet = 100;
  coin(run, -1, 20, 0.7); coin(run, 1, 20, 3.7);
  runTo(run, 20 - C.MAGNET_RANGE - 0.5);
  assert.equal(run.coins, 0, 'дальше дальности не берёт');
  runTo(run, 20 - C.MAGNET_RANGE + 0.5);
  assert.equal(run.coins, 2, 'обе - из соседних полос и с крыши');
});

test('ускоритель подбирается и действует своё время с учётом улучшения', () => {
  const run = bare({ upgrades: { magnet: 2 } });
  run.world.powers.push({ id: 1, kind: 'magnet', lane: 0, z: 20, y: 1, taken: false });
  runTo(run, 21);
  assert.ok(Math.abs(run.power.magnet - R.powerDuration('magnet', 2)) < 0.2);
  assert.ok(run.events.includes('power:magnet'));
  R.advance(run, R.powerDuration('magnet', 2) + 0.1);
  assert.equal(run.power.magnet, 0);
});

// ---------- районы ----------

test('районы идут по порядку без дыр, длины в пределах, в туннеле без погоды, старт с любого', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const w = R.createWorld(seed);
    R.districtAt(w, 20000);
    const d = w.districts;
    assert.equal(d[0].kind, 'city', 'по умолчанию - город');
    assert.equal(d[0].weather, 'clear', 'первый район - ясно');
    for (let i = 1; i < d.length; i++) {
      assert.equal(d[i].z0, d[i - 1].z1, 'без дыр');
      assert.equal(d[i].kind, R.DISTRICTS[(R.DISTRICTS.indexOf(d[i - 1].kind) + 1) % R.DISTRICTS.length], 'порядок');
      const len = d[i].z1 - d[i].z0;
      const lim = { city: [700, 900], industrial: [600, 800], bridge: [360, 460], tunnel: [280, 380], neon: [700, 900] }[d[i].kind];
      assert.ok(len >= lim[0] && len <= lim[1], `${d[i].kind}: ${len}`);
      if (d[i].kind === 'tunnel') assert.equal(d[i].weather, 'clear');
      assert.ok(['clear', 'rain', 'fog'].includes(d[i].weather));
    }
    assert.equal(R.districtAt(w, 0).kind, 'city');
  }
  const night = R.createWorld(1, { startDistrict: 'neon' });
  assert.equal(R.districtAt(night, 0).kind, 'neon');
  assert.equal(R.districtAt(night, 1200).kind, 'city', 'после неона - снова город');
  const weather = new Set();
  for (let seed = 1; seed <= 40; seed++) { const w = R.createWorld(seed); R.districtAt(w, 20000); w.districts.forEach((x) => weather.add(x.weather)); }
  assert.deepEqual([...weather].sort(), ['clear', 'fog', 'rain'], 'бывает дождь и туман');
});

test('на мосту ям не бывает, в промзоне ограждений и ям больше, чем в городе', () => {
  const count = { city: {}, industrial: {}, bridge: {} };
  const len = { city: 0, industrial: 0, bridge: 0 };
  for (let seed = 1; seed <= 60; seed++) {
    const w = worldTo(seed, 9000);
    for (const d of w.districts) if (len[d.kind] !== undefined) len[d.kind] += Math.max(0, Math.min(d.z1, 9000) - Math.max(d.z0, 200));
    for (const o of w.obstacles) {
      const k = R.districtAt(w, o.z0).kind;
      if (!count[k] || o.z0 < 200) continue;
      count[k][o.type] = (count[k][o.type] || 0) + 1;
    }
  }
  assert.equal(count.bridge.pit || 0, 0, 'ям на мосту нет');
  const per = (k, t) => (count[k][t] || 0) / len[k];
  assert.ok(per('industrial', 'fence') > per('city', 'fence') * 1.4, 'ограждений в промзоне больше');
  assert.ok(per('industrial', 'pit') > per('city', 'pit') * 1.4, 'ям в промзоне больше');
});

// ---------- новые препятствия ----------

test('ограждение: ни прыжком, ни подкатом не пройти, только объехать; с кроссовками - перепрыгнуть', () => {
  for (const how of [null, 'jump', 'slide']) {
    const run = bare();
    place(run, { type: 'fence', lane: 0, z0: 30, z1: 30 + C.FENCE_D });
    runTo(run, 40, how ? pressAt(30 - R.speedAt(30) * 0.3, how) : null);
    assert.equal(run.alive, false, 'через ограждение: ' + how);
    assert.equal(run.deathBy, 'fence');
  }
  const side = bare();
  place(side, { type: 'fence', lane: 0, z0: 30, z1: 30 + C.FENCE_D });
  runTo(side, 40, pressAt(20, 'left'));
  assert.equal(side.alive, true, 'объехал');
  const boots = bare();
  boots.power.boots = 10;
  place(boots, { type: 'fence', lane: 0, z0: 30, z1: 30 + C.FENCE_D });
  runTo(boots, 45, pressAt(30 - R.speedAt(30) * 0.3, 'jump'));
  assert.equal(boots.alive, true, 'перепрыгнул на кроссовках');
  assert.ok(boots.events.includes('trick:fence'));
});

test('яма: бег - падение и авария, прыжок вовремя - проходит, подкат - авария, доска спасает', () => {
  const pit = (run) => place(run, { type: 'pit', lane: 0, z0: 30, z1: 30 + C.PIT_LEN });
  let run = bare();
  pit(run);
  let low = 0;
  runTo(run, 40, (r) => { low = Math.min(low, r.y); });
  assert.equal(run.alive, false);
  assert.equal(run.deathBy, 'pit');
  assert.ok(low < -C.PIT_DEPTH + 0.2, 'упал в яму: ' + low);

  run = bare();
  pit(run);
  const v = R.speedAt(30);
  runTo(run, 45, pressAt(R.pitTakeoff(30, v), 'jump'));
  assert.equal(run.alive, true, 'перепрыгнул');
  assert.ok(run.events.includes('trick:pit'));
  assert.equal(run.y, 0);

  // слишком рано: приземлился в яму
  run = bare();
  pit(run);
  runTo(run, 45, pressAt(30 - v * R.airTime(C.JUMP_V) - 0.5, 'jump'));
  assert.equal(run.alive, false, 'ранний прыжок - в яму');

  run = bare();
  pit(run);
  runTo(run, 45, pressAt(27, 'slide'));
  assert.equal(run.alive, false, 'подкат - в яму');

  run = bare();
  pit(run);
  run.power.board = 30;
  runTo(run, 60);
  assert.equal(run.alive, true, 'доска спасла');
  assert.ok(run.events.includes('board-break'));
  assert.equal(run.y, 0);

  // соседняя полоса: яма не мешает
  run = bare();
  place(run, { type: 'pit', lane: 1, z0: 30, z1: 30 + C.PIT_LEN });
  runTo(run, 45);
  assert.equal(run.alive, true);
});

test('проскочить над ямой соседней полосы при смене двух полос можно', () => {
  const run = bare();
  run.lane = -1; run.x = R.laneX(-1);
  place(run, { type: 'pit', lane: 0, z0: 25, z1: 25 + C.PIT_LEN });
  runTo(run, 40, (r) => { if (r.z >= 25.5 && r.z < 25.6) { R.act(r, 'right'); R.act(r, 'right'); } });
  assert.equal(run.alive, true);
  assert.equal(run.lane, 1);
  assert.equal(run.y, 0);
});

test('товарный поезд уезжает вперёд: игрок догоняет его там, где рассчитано', () => {
  const k = C.SLOW_K;
  const o = { type: 'train', lane: 0, z0: 100, z1: 128.2, moving: true, k, trigger: 20 };
  assert.equal(R.offsetAt(o, 10), 0, 'до сигнала стоит');
  assert.ok(R.offsetAt(o, 50) > 0, 'потом едет вперёд, от игрока');
  const [enc0, enc1] = R.encounter(o);
  assert.ok(enc0 > o.z0, 'встреча дальше места, где он стоял');
  assert.ok(Math.abs(R.extentAt(o, enc0)[0] - (enc0 + C.PLAYER_HALF_D)) < 1e-9, 'в точке встречи хвост поезда у носа игрока');
  assert.ok(enc1 - enc0 > (o.z1 - o.z0) * 1.5, 'обгонять его дольше, чем стоящий');
  const run = bare();
  const tr = place(run, Object.assign({ cars: 3, freight: true }, o));
  runTo(run, 400);
  assert.equal(run.alive, false);
  assert.equal(run.deathBy, 'freight');
  assert.ok(Math.abs(run.z - tr.enc0) < 0.5, `авария на ${run.z.toFixed(2)}, ждали ${tr.enc0.toFixed(2)}`);
  assert.ok(!run.events.includes('horn'), 'попутный не гудит');
  // в соседней полосе его можно обогнать
  const pass = bare();
  pass.lane = 1; pass.x = R.laneX(1);
  place(pass, Object.assign({ cars: 3, freight: true }, o));
  runTo(pass, 400);
  assert.equal(pass.alive, true);
});

test('с крыши на крышу: переход по вагонам соседнего пути на высоте поезда, это трюк', () => {
  const run = bare();
  const ramp = place(run, { type: 'ramp', lane: 0, z0: 20, z1: 20 + C.RAMP_LEN });
  const a = place(run, { type: 'train', lane: 0, z0: ramp.z1, z1: ramp.z1 + 18.6, cars: 2, ridable: true });
  ramp.train = a.id;
  const b = place(run, { type: 'train', lane: 1, z0: a.z0 + 8, z1: a.z0 + 8 + 28.2, cars: 3, ridable: true });
  let minY = 99;
  runTo(run, b.z1 - 2, (r) => {
    if (r.z >= a.z0 + 12 && r.z < a.z0 + 12.1) R.act(r, 'right');
    if (r.z > a.z0 + 14) minY = Math.min(minY, r.y);
  });
  assert.equal(run.alive, true);
  assert.equal(run.lane, 1);
  assert.ok(Math.abs(minY - C.TRAIN_H) < 1e-6, 'всё время на крыше: ' + minY);
  assert.ok(run.events.includes('trick:hop'));
  assert.equal(run.stats.hops, 1);
});

// ---------- реактивный ранец ----------

test('ранец: летит над поездами, собирает монеты в воздухе, прыжки не нужны, посадка безопасна', () => {
  const run = R.newRun(12);
  runTo(run, 400, R.autopilot);
  assert.ok(run.alive);
  const z = run.z;
  run.world.powers.push({ id: 777777, kind: 'jetpack', lane: run.lane, z: z + 3, y: Math.max(1, run.y + 1), taken: false });
  run.world.powers.sort((p, q) => p.z - q.z);
  const coins0 = run.coins;
  let maxY = 0, flyT = 0;
  R.advance(run, 0.5);
  assert.ok(run.power.jetpack > 0, 'ранец подобран');
  assert.equal(run.stats.jets, 1);
  const air = run.world.coins.filter((c) => c.y > C.TRAIN_H + 2).length;
  assert.ok(air > 30, 'монет в воздухе: ' + air);
  R.act(run, 'jump'); R.act(run, 'slide');
  runTo(run, run.z + 300, (r) => { R.autopilot(r); if (R.flying(r)) { flyT += C.DT; maxY = Math.max(maxY, r.y); } });
  assert.ok(run.alive, 'долетел и приземлился: ' + run.deathBy);
  assert.ok(Math.abs(maxY - C.JET_Y) < 0.05, 'высота полёта ' + maxY);
  assert.ok(Math.abs(flyT + 0.5 - R.powerDuration('jetpack', 0)) < 0.6, 'летел своё время: ' + flyT);
  assert.ok(run.coins - coins0 > 30, 'собрал в воздухе: ' + (run.coins - coins0));
});

test('ранец: с автопилотом 2 км на 15 мирах, ранец каждые 300 м', () => {
  for (let seed = 1; seed <= 15; seed++) {
    const run = R.newRun(seed * 11);
    let next = 200;
    runTo(run, 2000, (r) => {
      if (r.z > next && !R.flying(r)) {
        r.world.powers.push({ id: 900000 + Math.floor(r.z), kind: 'jetpack', lane: r.lane, z: r.z + 1.5, y: Math.max(1, r.y + 1), taken: false });
        r.world.powers.sort((p, q) => p.z - q.z);
        next = r.z + 300;
      }
      R.autopilot(r);
    });
    assert.ok(run.alive, `seed ${seed}: авария на ${run.z.toFixed(1)} (${run.deathBy})`);
    assert.ok(run.stats.jets >= 3, 'летал: ' + run.stats.jets);
  }
});

// ---------- трюки, комбо, множитель ----------

test('комбо: трюки подряд растят комбо и дают больше очков, пауза в COMBO_TIME его сбрасывает', () => {
  const run = bare();
  const v = R.speedAt(30);
  const zs = [30, 30 + v * 1.2, 30 + v * 2.4];
  for (const z of zs) place(run, { type: 'hurdle', lane: 0, z0: z, z1: z + C.HURDLE_D });
  runTo(run, zs[2] + 5, all(...zs.map((z) => pressAt(z - R.speedAt(z) * 0.3, 'jump'))));
  assert.ok(run.alive);
  assert.equal(run.stats.hurdles, 3);
  assert.equal(run.combo, 3);
  assert.equal(run.stats.bestCombo, 3);
  const base = Math.floor(run.points);
  assert.equal(run.score - base, C.TRICK_POINTS * (1 + 2 + 3), 'очки за комбо 1+2+3');
  R.advance(run, C.COMBO_TIME + 0.1);
  assert.equal(run.combo, 0, 'комбо сброшено');
});

test('промах на волосок: уйти с пути поезда в последний момент - трюк, заранее - нет', () => {
  const late = bare();
  const v = R.speedAt(40);
  place(late, { type: 'train', lane: 0, z0: 40, z1: 49 });
  runTo(late, 60, pressAt(40 - C.PLAYER_HALF_D - v * 0.25, 'left'));
  assert.ok(late.alive);
  assert.equal(late.stats.near, 1);
  assert.ok(late.events.includes('trick:near'));
  const early = bare();
  place(early, { type: 'train', lane: 0, z0: 40, z1: 49 });
  runTo(early, 60, pressAt(10, 'left'));
  assert.equal(early.stats.near, 0);
});

test('удар боком сбрасывает комбо', () => {
  const run = bare();
  place(run, { type: 'hurdle', lane: 0, z0: 20, z1: 20 + C.HURDLE_D });
  place(run, { type: 'train', lane: 1, z0: 30, z1: 90, cars: 6 });
  runTo(run, 40, all(pressAt(20 - R.speedAt(20) * 0.3, 'jump'), pressAt(37, 'right')));
  assert.ok(run.alive);
  assert.ok(run.events.includes('bump'));
  assert.equal(run.combo, 0);
});

test('множитель очков из заданий умножает очки за метры и монеты', () => {
  const r1 = bare(); runTo(r1, 300);
  const r3 = bare({ mult: 3 }); runTo(r3, 300);
  assert.ok(Math.abs(r3.score - 3 * r1.score) <= 6, `${r3.score} против ${r1.score}`);
  const c = bare({ mult: 4 }); c.power.x2 = 100; coin(c, 0, 20);
  const n = bare({ mult: 4 }); n.power.x2 = 100;
  runTo(c, 21); runTo(n, 21);
  assert.equal(c.score - n.score, C.COIN_POINTS * 8, 'монета: 4 x 2');
  assert.equal(R.mult(c), 8);
});

// ---------- доска, ключи, продолжение ----------

test('доска по кнопке: тратит одну из запаса, вторая не включается, пока горит первая', () => {
  const run = bare({ boards: 2 });
  R.act(run, 'board');
  R.step(run);
  assert.ok(run.power.board > 0);
  assert.equal(run.boardsLeft, 1);
  assert.ok(run.events.includes('board-on'));
  R.act(run, 'board');
  R.step(run);
  assert.equal(run.boardsLeft, 1, 'вторая не потрачена');
  run.power.board = 0;
  R.act(run, 'board'); R.step(run);
  assert.equal(run.boardsLeft, 0);
  run.power.board = 0;
  R.act(run, 'board'); R.step(run);
  assert.equal(run.power.board, 0, 'без запаса - ничего');
  assert.equal(run.stats.boards, 2);
});

test('ключ на пути подбирается и считается', () => {
  const run = bare();
  run.world.powers.push({ id: 1, kind: 'key', lane: 0, z: 20, y: 1, taken: false });
  runTo(run, 25);
  assert.equal(run.keys, 1);
  assert.ok(run.events.includes('key'));
  assert.equal(R.result(run).keys, 1);
});

test('продолжение: игрок снова бежит, виновник аварии убран, неуязвимость; цена растёт вдвое', () => {
  for (const type of ['hurdle', 'train', 'pit', 'fence']) {
    const run = bare();
    const o = place(run, { type, lane: 0, z0: 30, z1: 30 + (type === 'train' ? 9 : type === 'pit' ? C.PIT_LEN : 0.35), cars: 1 });
    runTo(run, 50);
    assert.equal(run.alive, false, type);
    assert.equal(run.killer, o.id);
    assert.equal(R.revive(run), true);
    assert.ok(run.alive && o.broken && run.invulnT > 0);
    assert.ok(run.y >= 0);
    runTo(run, 80);
    assert.equal(run.alive, true, 'после продолжения бежит: ' + type);
    assert.equal(run.revives, 1);
  }
  assert.deepEqual([0, 1, 2, 3, 4].map(R.reviveCost), [1, 2, 4, 8, 16]);
  const alive = bare();
  assert.equal(R.revive(alive), false, 'живого не продолжить');
});

// ---------- обучение ----------

test('обучение: уроки покрывают все три пути, автопилот проходит его и дальше обычный мир', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const run = R.newRun(seed, { tutorial: true });
    const tut = run.world.tutorial;
    assert.deepEqual(tut.steps.map((s) => s.id), ['lane', 'jump', 'slide', 'pit', 'roof']);
    for (const step of tut.steps.slice(1)) {
      const lanes = run.world.obstacles.filter((o) => Math.abs(o.z0 - step.obstacle) < 0.01).map((o) => o.lane).sort();
      assert.deepEqual(lanes, [-1, 0, 1], step.id + ': во всех путях');
    }
    runTo(run, 1500, R.autopilot);
    assert.ok(run.alive, `seed ${seed}: авария на ${run.z.toFixed(1)} (${run.deathBy})`);
    assert.ok(run.stats.hurdles >= 1 && run.stats.bars >= 1 && run.stats.pits >= 1 && run.stats.roofs >= 1);
  }
});

// ---------- клавиши ----------

test('имена клавиш по-русски и по-английски', () => {
  assert.equal(R.keyName('ArrowLeft', 'ru'), '←');
  assert.equal(R.keyName('Space', 'ru'), 'Пробел');
  assert.equal(R.keyName('Space', 'en'), 'Space');
  assert.equal(R.keyName('KeyJ', 'en'), 'J');
  assert.equal(R.keyName('Digit5', 'ru'), '5');
  assert.equal(R.keyName('Numpad8', 'ru'), 'Num 8');
  assert.equal(R.keyName(null), '—');
});

test('подсказка перечисляет все назначенные клавиши; переназначение убирает клавишу у другого действия', () => {
  const b = R.defaultBindings();
  assert.equal(R.keysText(b, 'jump', 'ru'), '↑ / W / Пробел');
  assert.equal(R.keysText(b, 'left', 'en'), '← / A');
  const b2 = R.rebind(b, 'jump', 0, 'KeyA');
  assert.equal(R.keysText(b2, 'jump', 'en'), 'A / W / Space');
  assert.equal(R.keysText(b2, 'left', 'en'), '←', 'A ушла от «влево»');
  assert.equal(R.actionFor(b2, 'KeyA'), 'jump');
  assert.equal(R.actionFor(b2, 'ArrowUp'), null, 'старая клавиша прыжка свободна');
  assert.equal(R.actionFor(b2, 'ArrowLeft'), 'left');
  assert.deepEqual(b, R.defaultBindings(), 'исходные привязки не тронуты');
});

test('привязки из хранилища: дубли убираются, действие без клавиш получает свои по умолчанию', () => {
  const s = R.sanitizeBindings({ left: ['KeyQ', 'KeyQ', 5], right: [], jump: ['KeyQ', 'KeyJ', null], slide: 'x', pause: [null, null, null] });
  assert.deepEqual(s.left, ['KeyQ', null, null]);
  assert.deepEqual(s.jump, [null, 'KeyJ', null]);
  assert.deepEqual(s.right, ['ArrowRight', 'KeyD', null]);
  assert.deepEqual(s.slide, ['ArrowDown', 'KeyS', null]);
  assert.deepEqual(s.pause, ['KeyP', 'Escape', null]);
  assert.deepEqual(s.board, ['KeyB', 'KeyE', null], 'новое действие 2.0 получило свои клавиши');
  const codes = R.ACTIONS.flatMap((a) => s[a]).filter(Boolean);
  assert.equal(new Set(codes).size, codes.length, 'одна клавиша - одно действие');
  assert.deepEqual(R.sanitizeBindings({ left: ['<script>', 'ArrowLeft'] }).left, [null, 'ArrowLeft', null]);
});

// ---------- свайпы ----------

test('свайпы и касания', () => {
  const W = 800, H = 600;
  assert.equal(R.classifySwipe(-120, 10, 150, 400, W, H), 'left');
  assert.equal(R.classifySwipe(120, -10, 150, 400, W, H), 'right');
  assert.equal(R.classifySwipe(5, -150, 150, 400, W, H), 'jump');
  assert.equal(R.classifySwipe(5, 150, 150, 400, W, H), 'slide');
  assert.equal(R.classifySwipe(2, 3, 100, 100, W, H), 'left', 'касание слева');
  assert.equal(R.classifySwipe(2, 3, 100, 700, W, H), 'right', 'касание справа');
  assert.equal(R.classifySwipe(2, 3, 100, 400, W, H), 'jump', 'касание посередине');
  assert.equal(R.classifySwipe(2, 3, 900, 400, W, H), null, 'долгое нажатие - ничего');
  assert.equal(R.classifySwipe(20, 0, 100, 400, W, H), 'jump', 'дрожание пальца - касание, а не свайп');
});
