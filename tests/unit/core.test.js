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
function checkPassable(w, upto) {
  const path = w.path.filter((p) => p.z < upto);
  const obs = w.obstacles;
  const blocking = (o) => o.type === 'train' || o.type === 'ramp';
  let ride = null;           // поезд, по крыше которого идёт путь
  let lastAction = -Infinity, lastActionV = 0, rideEndAt = -Infinity;
  const seen = new Set();
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
      if (o.type === 'hurdle' || o.type === 'bar') {
        const v = R.speedAt(o.z0);
        assert.ok(o.z0 - lastAction >= lastActionV * 0.9, `ряд ${a.z.toFixed(1)}: два прыжка/подката слишком близко (${lastAction.toFixed(1)} и ${o.z0.toFixed(1)}, полоса ${o.lane}, seed ${w.seed})`);
        assert.ok(o.z0 - rideEndAt >= v * 0.75, `ряд ${a.z.toFixed(1)}: препятствие сразу за концом крыши`);
        lastAction = o.z0; lastActionV = v;
        continue;
      }
      assert.ok(!o.moving, `ряд ${a.z.toFixed(1)}: встречный поезд в полосе пути`);
      if (o.type === 'ramp') {
        assert.ok(o.z0 >= a.z - 1e-6, `ряд ${a.z.toFixed(1)}: на пандус въезд сбоку`);
        ride = obs.find((t) => t.id === o.train);
        assert.ok(ride, 'у пандуса есть поезд');
        continue;
      }
      // поезд: только тот, на крышу которого въехали по его пандусу
      assert.ok(ride && ride.id === o.id, `ряд ${a.z.toFixed(1)}: поезд в полосе пути без пандуса`);
      rideEndAt = o.z1;
    }
    // смена полосы: новая полоса свободна за switchDist до ряда
    if (b.lane !== a.lane) {
      const sd = R.switchDist(R.speedAt(b.z));
      if (ride) rideEndAt = Math.min(ride.z1, b.z);          // спрыгнул с крыши вбок
      for (const o of obs) {
        if (o.lane !== b.lane || (!o.moving && o.z0 >= b.z - 1e-6)) continue;   // то, что стоит в самом ряду b, проверит ряд b
        assert.ok(!(o.enc1 > b.z - sd && o.enc0 < b.z), `ряд ${b.z.toFixed(1)}: в новой полосе ${o.type} в окне перехода`);
        assert.ok(!(blocking(o) && o.enc0 < b.z && o.enc1 > b.z), `ряд ${b.z.toFixed(1)}: в новую полосу въезд в бок поезда`);
      }
      ride = null;
    }
  }
  return path.length;
}

test('в каждом ряду есть проходимая полоса: 300 миров по 4 км', () => {
  let rows = 0;
  for (let seed = 1; seed <= 300; seed++) rows += checkPassable(worldTo(seed, 4200), 4000);
  assert.ok(rows > 300 * 100, 'рядов много: ' + rows);
});

test('поперёк пути не бывает трёх занятых полос (в любой точке хоть одна свободна или проходима)', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const w = worldTo(seed, 3000);
    for (let z = C.FIRST_ROW; z < 2900; z += 0.5) {
      let blocked = 0;
      for (const L of R.LANES) {
        if (w.obstacles.some((o) => o.lane === L && o.type === 'train' && !o.ridable && o.enc0 <= z && o.enc1 >= z)) blocked++;
      }
      assert.ok(blocked < 3, `seed ${seed} z ${z}: все три полосы закрыты поездами`);
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
      for (const o of r.world.obstacles) kinds.add(o.type + (o.moving ? '-moving' : ''));
    });
    assert.ok(run.alive, `seed ${seed}: авария на ${run.z.toFixed(1)} м (${run.deathBy})`);
  }
  for (const k of ['hurdle', 'bar', 'train', 'ramp', 'train-moving']) assert.ok(kinds.has(k), 'в мирах есть ' + k);
  for (const k of ['jump', 'slide', 'lane', 'coin', 'horn']) assert.ok(total[k] > 100, `автопилот делал ${k}: ${total[k]}`);
  assert.ok(!total.bump, 'автопилот ни разу не ударился боком');
});

test('с ускорителями (ботинки, магнит, x2, доска) автопилот тоже проходит', () => {
  for (const kind of R.POWERS) {
    for (let seed = 1; seed <= 12; seed++) {
      const run = R.newRun(seed * 7 + 3);
      runTo(run, 2500, (r) => { r.power[kind] = 5; R.autopilot(r); });
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
  assert.ok(w.powers.length >= 10, 'ускорителей ' + w.powers.length);
  for (let i = 1; i < w.powers.length; i++) assert.ok(w.powers[i].z - w.powers[i - 1].z >= 240, 'не чаще 250 м');
  for (const p of w.powers) {
    const row = [...w.path].reverse().find((r) => r.z <= p.z);
    assert.equal(row.lane, p.lane, 'в безопасной полосе');
    assert.ok(R.POWERS.includes(p.kind));
  }
  const kinds = new Set(worldTo(9, 30000).powers.map((p) => p.kind));
  assert.deepEqual([...kinds].sort(), [...R.POWERS].sort(), 'все четыре вида');
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

test('улучшения: длительность растёт, цены, покупка без монет и сверх потолка отказывает', () => {
  for (const k of R.POWERS) {
    for (let l = 0; l < R.MAX_LEVEL; l++) assert.ok(R.powerDuration(k, l + 1) > R.powerDuration(k, l));
    assert.equal(R.powerDuration(k, 99), R.powerDuration(k, R.MAX_LEVEL));
  }
  assert.deepEqual([0, 1, 2, 3, 4].map(R.upgradeCost), [...R.UPGRADE_COST]);
  assert.equal(R.upgradeCost(R.MAX_LEVEL), null);
  const s = R.defaultSave();
  s.coins = 100;
  assert.deepEqual(R.buyUpgrade(s, 'magnet'), { ok: false, reason: 'coins', cost: 150 });
  assert.equal(s.coins, 100);
  s.coins = 10000;
  assert.equal(R.buyUpgrade(s, 'magnet').ok, true);
  assert.equal(s.coins, 9850);
  assert.equal(s.upgrades.magnet, 1);
  for (let i = 0; i < 10; i++) R.buyUpgrade(s, 'magnet');
  assert.equal(s.upgrades.magnet, R.MAX_LEVEL);
  assert.equal(s.coins, 10000 - R.UPGRADE_COST.reduce((a, b) => a + b, 0));
  assert.equal(R.buyUpgrade(s, 'magnet').reason, 'max');
  assert.equal(R.buyUpgrade(s, 'nope').ok, false);
});

// ---------- сохранение ----------

test('сохранение: мусор и испорченные поля становятся значениями по умолчанию, числа - в пределах', () => {
  const d = R.defaultSave();
  for (const junk of [null, undefined, 5, 'x', '{', '[]', '"str"', [], { best: 'много' }]) {
    const s = R.sanitizeSave(junk);
    assert.equal(s.best, 0);
    assert.deepEqual(s.settings, d.settings);
  }
  const s = R.sanitizeSave({ best: -5, coins: 1e20, runs: 3.7, upgrades: { magnet: 9, x2: -1, boots: 'a' }, settings: { lang: 'de', theme: 'pink', music: 7, sfx: -1, quality: 'ultra', showFps: 'yes', extra: 1 } });
  assert.equal(s.best, 0);
  assert.equal(s.coins, 1e9);
  assert.equal(s.runs, 3);
  assert.deepEqual(s.upgrades, { magnet: 5, x2: 0, boots: 0, board: 0 });
  assert.equal(s.settings.lang, null);
  assert.equal(s.settings.theme, 'auto');
  assert.equal(s.settings.music, 1);
  assert.equal(s.settings.sfx, 0);
  assert.equal(s.settings.quality, 'high');
  assert.equal(s.settings.showFps, false);
  assert.ok(!('extra' in s.settings));
  // строка JSON и круг туда-обратно
  const good = R.defaultSave();
  good.best = 123; good.coins = 45; good.settings.theme = 'dark'; good.settings.lang = 'en';
  assert.deepEqual(R.sanitizeSave(JSON.stringify(good)), good);
});

test('итог забега: рекорд, банк монет и счётчики', () => {
  const s = R.defaultSave();
  assert.equal(R.applyResult(s, { score: 100, coins: 7, distance: 300 }), true);
  assert.equal(R.applyResult(s, { score: 50, coins: 3, distance: 500 }), false);
  assert.equal(s.best, 100);
  assert.equal(s.bestDistance, 500);
  assert.equal(s.coins, 10);
  assert.equal(s.totalCoins, 10);
  assert.equal(s.runs, 2);
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
