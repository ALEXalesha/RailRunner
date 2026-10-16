// RailRunner core: the pure rules of the game, without the screen, sound or keyboard.
//
// Everything that decides the game lives here and is checked by the laws in tests/unit:
// speed, the level generator (with a guaranteed passable lane), player physics,
// collisions, coins, power-ups, score, upgrades, save sanitizing, key bindings and
// swipe recognition. The same file runs in the browser (window.RRCore) and in node
// (require), so the laws test exactly the code the player runs.
//
// Coordinates: lanes -1 (left), 0, 1 (right); x = lane * LANE_W metres, positive to the
// right; z grows forward along the track; y is height above the ground.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RRCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const C = Object.freeze({
    LANE_W: 2.2,
    DT: 1 / 120,                // fixed physics step, seconds
    SPEED_MIN: 13,              // m/s at the start
    SPEED_MAX: 30,              // m/s ceiling
    SPEED_GAIN: 0.004,          // m/s added per metre run
    GRAVITY: 34,
    JUMP_V: 10.4,               // apex 1.59 m
    BOOTS_JUMP_V: 15.6,         // apex 3.58 m: high enough for a train roof
    FAST_FALL_V: -18,           // "slide" pressed in the air
    SLIDE_TIME: 0.7,
    LANE_TIME: 0.16,            // seconds to move one lane
    REACT: 0.35,                // reaction time the generator leaves for a lane change
    JUMP_BUFFER: 0.15,          // jump pressed this long before landing still counts
    PLAYER_HALF_W: 0.35,
    PLAYER_HALF_D: 0.3,
    PLAYER_H: 1.7,
    SLIDE_H: 0.8,
    STEP: 0.35,                 // a surface this much higher can be stepped onto (ramps)
    HURDLE_H: 0.95,
    BAR_BOTTOM: 1.15,
    BAR_TOP: 2.6,
    TRAIN_H: 3.0,
    TRAIN_HALF_W: 0.95,
    SMALL_HALF_W: 0.9,          // hurdles and bars
    HURDLE_D: 0.3,
    BAR_D: 0.4,
    RAMP_LEN: 7,
    CAR_LEN: 9,
    CAR_GAP: 0.6,
    MOVING_K: 0.55,             // an oncoming train moves at 0.55 of the player's speed
    TRIGGER_D: 80,              // it starts when the player is this far from it
    COIN_R: 0.9,                // pick-up reach across
    COIN_RZ: 1.0,               // pick-up reach along the track
    MAGNET_RANGE: 9,
    INVULN: 1.2,
    STUMBLE_TIME: 2.5,
    COIN_POINTS: 10,
    START_Z: 0,
    FIRST_ROW: 45,
    AHEAD: 230,                 // the world is generated this far ahead of the player
    BEHIND: 40,                 // and kept this far behind (for the camera)
  });

  const LANES = [-1, 0, 1];
  const ACTIONS = ['left', 'right', 'jump', 'slide', 'pause'];
  const POWERS = ['magnet', 'x2', 'boots', 'board'];
  const POWER_BASE = Object.freeze({ magnet: 10, x2: 12, boots: 10, board: 30 });
  const MAX_LEVEL = 5;
  const UPGRADE_COST = Object.freeze([150, 300, 600, 1200, 2400]);

  // ---------- random numbers: one seed - one world ----------
  function rng(seed) {
    let a = (seed >>> 0) || 0x9e3779b9;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- speed and distances ----------
  const speedAt = (z) => Math.min(C.SPEED_MAX, C.SPEED_MIN + C.SPEED_GAIN * Math.max(0, z));
  // how long before an obstacle a lane change must be able to start
  const switchDist = (v) => v * (C.LANE_TIME + C.REACT) + 2;
  // distance between rows of obstacles
  const rowGap = (v) => Math.max(16, v * 1.1);
  const laneX = (lane) => lane * C.LANE_W;
  const jumpHeightAt = (t, v0) => Math.max(0, v0 * t - 0.5 * C.GRAVITY * t * t);

  // ---------- obstacles ----------
  const halfW = (o) => (o.type === 'train' || o.type === 'ramp' ? C.TRAIN_HALF_W : C.SMALL_HALF_W);
  const isSupport = (o) => o.type === 'train' || o.type === 'ramp';

  // how far a moving train has rolled towards the player (negative z) when the player is at pz
  function offsetAt(o, pz) {
    if (!o.moving || pz <= o.trigger) return 0;
    return -o.k * (pz - o.trigger);
  }
  // the obstacle's extent along the track when the player is at pz
  function extentAt(o, pz) {
    const off = offsetAt(o, pz);
    return [o.z0 + off, o.z1 + off];
  }
  // [bottom, top] of the solid part at track position z
  function solidAt(o, z) {
    switch (o.type) {
      case 'hurdle': return [0, C.HURDLE_H];
      case 'bar': return [C.BAR_BOTTOM, C.BAR_TOP];
      case 'train': return [0, C.TRAIN_H];
      case 'ramp': {
        const f = Math.min(1, Math.max(0, (z - o.z0) / (o.z1 - o.z0)));
        return [0, C.TRAIN_H * f];
      }
      default: return [0, 0];
    }
  }
  // Player positions (pz) during which the obstacle can touch the player: for a moving train
  // its front and back move towards the player, so this is solved from offsetAt.
  function encounter(o) {
    const d = C.PLAYER_HALF_D;
    if (!o.moving) return [o.z0 - d, o.z1 + d];
    const k = o.k;
    // front meets player front: pz + d = z0 - k (pz - trigger)  (after the trigger)
    const a = (o.z0 - d + k * o.trigger) / (1 + k);
    const b = (o.z1 + d + k * o.trigger) / (1 + k);
    return [Math.min(a, o.z0 - d), b];
  }

  // ---------- the level generator ----------
  // The world is built in rows. Every row has a SAFE lane: in it there is only what the player
  // can get past (nothing, a hurdle to jump, a bar to slide under, or a train with a ramp to run
  // up). The safe lane moves by at most one lane per row, and only into a lane that is free for
  // switchDist before the row, so there is always time to change lanes. Other lanes get trains
  // (standing or oncoming), hurdles, bars and coins. world.path lists the safe lanes.
  function createWorld(seed) {
    return {
      seed: seed >>> 0,
      rand: rng(seed),
      obstacles: [],
      coins: [],
      powers: [],
      path: [],                 // { z, lane, kind } - the safe lane from z to the next row
      genZ: C.FIRST_ROW,
      safe: 0,
      busy: [-Infinity, -Infinity, -Infinity],   // per lane (index lane+1): occupied until z
      rideEnd: -Infinity,                         // the safe lane runs on a train roof until
      nextPower: 160,
      nextId: 1,
    };
  }

  function addObstacle(w, o) {
    o.id = w.nextId++;
    o.broken = false;
    o.triggered = false;
    const e = encounter(o);
    o.enc0 = e[0];
    o.enc1 = e[1];
    w.obstacles.push(o);
    return o;
  }
  function addCoin(w, lane, z, y) {
    w.coins.push({ id: w.nextId++, lane, z, y, taken: false, takenAt: 0 });
  }
  function coinLine(w, lane, z, n, y = 0.7) {
    for (let i = 0; i < n; i++) addCoin(w, lane, z + i * 1.8, y);
  }
  function trainLen(cars) { return cars * C.CAR_LEN + (cars - 1) * C.CAR_GAP; }

  function pick(r, table) {
    let sum = 0;
    for (const k in table) sum += table[k];
    let x = r() * sum;
    for (const k in table) { x -= table[k]; if (x < 0) return k; }
    return Object.keys(table)[0];
  }

  // one row at w.genZ
  function genRow(w) {
    const r = w.rand;
    const z = w.genZ;
    const v = speedAt(z);
    const sd = switchDist(v);
    const busy = w.busy;
    const free = (lane, from) => busy[lane + 1] <= from;

    // 1. where the safe lane goes
    let s = w.safe;
    const riding = w.rideEnd > z;
    const moves = [];
    for (const d of [-1, 1]) {
      const n = s + d;
      if (n >= -1 && n <= 1 && free(n, z - sd)) moves.push(n);
    }
    if (moves.length && r() < 0.45) s = moves[Math.floor(r() * moves.length)];
    const onRoof = s === w.safe && riding;
    w.safe = s;

    // 2. the safe lane's content
    let kind = 'empty';
    if (onRoof) kind = 'roof';
    else if (z < w.rideEnd + v * 0.8) kind = 'empty';   // falling from a roof (0.43 s) and time to look
    else if (z < 70) kind = r() < 0.5 ? 'coins' : 'empty';
    else {
      const t = { coins: 30, empty: 12, hurdle: 22, bar: 22 };
      if (z > 200) t.rampTrain = 16;
      kind = pick(r, t);
    }
    if (kind !== 'roof' && w.rideEnd > z) w.rideEnd = -Infinity;   // left the roof sideways
    switch (kind) {
      case 'coins':
        coinLine(w, s, z, 5 + Math.floor(r() * 5));
        break;
      case 'hurdle': {
        addObstacle(w, { type: 'hurdle', lane: s, z0: z, z1: z + C.HURDLE_D, moving: false });
        busy[s + 1] = Math.max(busy[s + 1], z + C.HURDLE_D);
        if (r() < 0.7) {
          const take = z - v * 0.3;
          for (let i = 0; i < 7; i++) {
            const t = 0.06 + i * 0.08;
            addCoin(w, s, take + v * t, 0.7 + jumpHeightAt(t, C.JUMP_V));
          }
        }
        break;
      }
      case 'bar':
        addObstacle(w, { type: 'bar', lane: s, z0: z, z1: z + C.BAR_D, moving: false });
        busy[s + 1] = Math.max(busy[s + 1], z + C.BAR_D);
        if (r() < 0.6) coinLine(w, s, z - 3.6, 5, 0.5);
        break;
      case 'rampTrain': {
        const cars = 1 + Math.floor(r() * 3);
        const len = trainLen(cars);
        const ramp = addObstacle(w, { type: 'ramp', lane: s, z0: z, z1: z + C.RAMP_LEN, moving: false });
        const train = addObstacle(w, { type: 'train', lane: s, z0: z + C.RAMP_LEN, z1: z + C.RAMP_LEN + len, moving: false, cars, color: Math.floor(r() * 4), ridable: true });
        ramp.train = train.id;
        busy[s + 1] = Math.max(busy[s + 1], train.z1 + 1);
        w.rideEnd = train.z1;
        for (let i = 0; i < 4; i++) addCoin(w, s, z + 1 + i * 1.6, 0.7 + C.TRAIN_H * (1 + i * 1.6) / C.RAMP_LEN);
        coinLine(w, s, train.z0 + 1, Math.max(3, Math.floor(len / 1.8) - 1), C.TRAIN_H + 0.7);
        break;
      }
      case 'roof':
        if (r() < 0.5) coinLine(w, s, z, 4, C.TRAIN_H + 0.7);
        break;
      default:
        break;
    }
    w.path.push({ z, lane: s, kind });

    // a power-up in the safe lane, on the ground, where nothing else stands
    if (z >= w.nextPower && (kind === 'empty' || kind === 'coins')) {
      const kinds = POWERS;
      w.powers.push({ id: w.nextId++, kind: kinds[Math.floor(r() * kinds.length)], lane: s, z: z + 4, y: 1.0, taken: false });
      w.nextPower = z + 250 + r() * 250;
    }

    // 3. the other lanes
    for (const L of LANES) {
      if (L === s) continue;
      if (!free(L, z)) continue;
      const t = { nothing: 26, coins: 9, hurdle: 13, bar: 13 };
      if (z > 120) t.train = 18 + Math.min(14, z / 300);
      if (z > 320) t.moving = 9 + Math.min(10, z / 400);
      const what = pick(r, t);
      if (what === 'coins') coinLine(w, L, z, 4 + Math.floor(r() * 4));
      else if (what === 'hurdle') {
        addObstacle(w, { type: 'hurdle', lane: L, z0: z, z1: z + C.HURDLE_D, moving: false });
        busy[L + 1] = z + C.HURDLE_D;
      } else if (what === 'bar') {
        addObstacle(w, { type: 'bar', lane: L, z0: z, z1: z + C.BAR_D, moving: false });
        busy[L + 1] = z + C.BAR_D;
      } else if (what === 'train') {
        const cars = 1 + Math.floor(r() * 3);
        const len = trainLen(cars);
        let z0 = z;
        if (r() < 0.3) {
          addObstacle(w, { type: 'ramp', lane: L, z0: z, z1: z + C.RAMP_LEN, moving: false });
          z0 = z + C.RAMP_LEN;
        }
        addObstacle(w, { type: 'train', lane: L, z0, z1: z0 + len, moving: false, cars, color: Math.floor(r() * 4), ridable: z0 !== z });
        busy[L + 1] = z0 + len + 1;
      } else if (what === 'moving') {
        // it meets the player exactly at z: z0 = zm + k D / (1 + k), see encounter()
        const cars = 1 + Math.floor(r() * 2);
        const len = trainLen(cars);
        const k = C.MOVING_K;
        const z0 = z + C.PLAYER_HALF_D + k * C.TRIGGER_D / (1 + k);
        addObstacle(w, { type: 'train', lane: L, z0, z1: z0 + len, moving: true, k, trigger: z0 - C.TRIGGER_D, cars, color: 4 });
        busy[L + 1] = z0 + len + 1;
      }
    }
    w.genZ = z + rowGap(v);
  }

  function generateUntil(w, zLimit) {
    while (w.genZ < zLimit) genRow(w);
  }

  // drop what is far behind the player (rendering keeps moving trains until they leave the view)
  function prune(w, pz) {
    const lim = pz - C.BEHIND;
    if (w.obstacles.length && w.obstacles[0].enc1 < lim) {
      w.obstacles = w.obstacles.filter((o) => o.enc1 >= lim || extentAt(o, pz)[1] >= lim);
    }
    if (w.coins.length && w.coins[0].z < lim) w.coins = w.coins.filter((c) => c.z >= lim);
    if (w.powers.length && w.powers[0].z < lim) w.powers = w.powers.filter((p) => p.z >= lim);
    if (w.path.length > 4 && w.path[1].z < lim) w.path = w.path.filter((p, i, a) => i === a.length - 1 || a[i + 1].z >= lim);
  }

  // ---------- upgrades ----------
  const powerDuration = (kind, level = 0) => POWER_BASE[kind] * (1 + 0.2 * Math.max(0, Math.min(MAX_LEVEL, level | 0)));
  const upgradeCost = (level) => (level >= 0 && level < MAX_LEVEL ? UPGRADE_COST[level] : null);
  function buyUpgrade(save, kind) {
    if (!POWERS.includes(kind)) return { ok: false, reason: 'kind' };
    const lvl = save.upgrades[kind];
    const cost = upgradeCost(lvl);
    if (cost === null) return { ok: false, reason: 'max' };
    if (save.coins < cost) return { ok: false, reason: 'coins', cost };
    save.coins -= cost;
    save.upgrades[kind] = lvl + 1;
    return { ok: true, cost };
  }

  // ---------- one run ----------
  function newRun(seed, opts = {}) {
    const world = createWorld(seed);
    generateUntil(world, C.START_Z + C.AHEAD);
    return {
      seed: seed >>> 0,
      world,
      upgrades: Object.assign({ magnet: 0, x2: 0, boots: 0, board: 0 }, opts.upgrades || {}),
      t: 0,
      z: C.START_Z,
      x: 0,
      y: 0,
      vy: 0,
      lane: 0,
      laneFrom: 0,
      speed: speedAt(C.START_Z),
      grounded: true,
      slideT: 0,
      slideBuf: false,
      jumpBuf: 0,
      stumbleT: 0,
      invulnT: 0,
      alive: true,
      deathBy: null,
      score: 0,
      points: 0,               // distance points (fractional)
      coins: 0,
      power: { magnet: 0, x2: 0, boots: 0, board: 0 },
      queue: [],
      events: [],
      first: 0,                // index hint into world.obstacles
    };
  }

  const sliding = (run) => run.slideT > 0;
  const playerH = (run) => (sliding(run) ? C.SLIDE_H : C.PLAYER_H);
  const mult = (run) => (run.power.x2 > 0 ? 2 : 1);

  function act(run, action) {
    if (run.alive && action !== 'pause') run.queue.push(action);
  }

  function doJump(run) {
    run.vy = run.power.boots > 0 ? C.BOOTS_JUMP_V : C.JUMP_V;
    run.grounded = false;
    run.slideT = 0;
    run.jumpBuf = 0;
    run.events.push(run.power.boots > 0 ? 'superjump' : 'jump');
  }

  function handleInput(run) {
    while (run.queue.length) {
      const a = run.queue.shift();
      if (a === 'left' || a === 'right') {
        const n = run.lane + (a === 'left' ? -1 : 1);
        if (n < -1 || n > 1) { run.events.push('edge'); continue; }
        run.laneFrom = run.lane;
        run.lane = n;
        run.events.push('lane');
      } else if (a === 'jump') {
        if (run.grounded) doJump(run);
        else run.jumpBuf = C.JUMP_BUFFER;
      } else if (a === 'slide') {
        if (run.grounded) { run.slideT = C.SLIDE_TIME; run.events.push('slide'); }
        else { run.vy = Math.min(run.vy, C.FAST_FALL_V); run.slideBuf = true; run.jumpBuf = 0; }
      }
    }
  }

  // obstacles near the player (by encounter range)
  function nearObstacles(run, reach) {
    const obs = run.world.obstacles;
    const out = [];
    for (let i = 0; i < obs.length; i++) {
      const o = obs[i];
      if (o.enc0 > run.z + reach) { if (o.enc0 > run.z + reach + 80) break; continue; }
      if (o.enc1 < run.z - reach) continue;
      out.push(o);
    }
    return out;
  }

  function supportAt(run, near) {
    let h = 0;
    for (const o of near) {
      if (o.broken || !isSupport(o)) continue;
      if (Math.abs(run.x - laneX(o.lane)) >= C.PLAYER_HALF_W + halfW(o)) continue;
      const [a, b] = extentAt(o, run.z);
      if (run.z < a || run.z > b) continue;
      const top = solidAt(o, run.z)[1];
      if (top > h) h = top;
    }
    return h;
  }

  function overlapsX(x, o) { return Math.abs(x - laneX(o.lane)) < C.PLAYER_HALF_W + halfW(o); }
  function overlapsZ(z, o, pz) {
    const [a, b] = extentAt(o, pz);
    return z + C.PLAYER_HALF_D > a && z - C.PLAYER_HALF_D < b;
  }

  function hit(run, o, lateral, prevX) {
    if (run.invulnT > 0) return;
    if (lateral && run.stumbleT <= 0) {
      // bounced off a side: back to the lane on the side it came from (not the lane of the
      // last key press - after two quick presses across a train that would be the train's
      // own lane), stumbling for a while
      run.lane = Math.max(-1, Math.min(1, Math.round(prevX / C.LANE_W)));
      run.stumbleT = C.STUMBLE_TIME;
      run.events.push('bump');
      return 'bump';
    }
    if (run.power.board > 0) {
      run.power.board = 0;
      o.broken = true;
      run.invulnT = C.INVULN;
      run.events.push('board-break');
      return 'board';
    }
    run.alive = false;
    run.deathBy = o.type;
    run.events.push('crash');
    return 'crash';
  }

  function collide(run, near, prevX, prevZ) {
    const h = playerH(run);
    for (const o of near) {
      if (o.broken || !run.alive) continue;
      if (!overlapsX(run.x, o) || !overlapsZ(run.z, o, run.z)) continue;
      const [a, b] = extentAt(o, run.z);
      const zq = Math.min(b, Math.max(a, run.z + C.PLAYER_HALF_D));
      const [bot, top] = solidAt(o, zq);
      const standOn = isSupport(o) ? C.STEP : 0;
      if (run.y >= top - standOn) continue;          // above it, or on its roof
      if (run.y + h <= bot) continue;                // under it (a bar)
      const lateral = !overlapsX(prevX, o) && overlapsZ(prevZ, o, prevZ);
      const res = hit(run, o, lateral, prevX);
      if (res === 'bump') { run.x = prevX; return; }
    }
  }

  function collect(run) {
    const w = run.world;
    const h = playerH(run);
    const mag = run.power.magnet > 0;
    for (const c of w.coins) {
      if (c.taken) continue;
      const dz = c.z - run.z;
      if (dz > 40) break;
      if (dz < -2) continue;
      let got = false;
      if (mag && dz >= -1 && dz <= C.MAGNET_RANGE) got = true;
      else if (Math.abs(laneX(c.lane) - run.x) < C.COIN_R && Math.abs(dz) < C.COIN_RZ && c.y + 0.5 > run.y && c.y - 0.5 < run.y + h) got = true;
      if (got) {
        c.taken = true;
        c.takenAt = run.t;
        run.coins += 1;
        run.score += C.COIN_POINTS * mult(run);
        run.events.push('coin');
      }
    }
    for (const p of w.powers) {
      if (p.taken) continue;
      const dz = p.z - run.z;
      if (dz > 40) break;
      if (Math.abs(laneX(p.lane) - run.x) < 1.1 && Math.abs(dz) < 1.2 && p.y + 0.7 > run.y && p.y - 0.7 < run.y + h) {
        p.taken = true;
        run.power[p.kind] = powerDuration(p.kind, run.upgrades[p.kind]);
        run.events.push('power:' + p.kind);
      }
    }
  }

  function step(run, dt = C.DT) {
    if (!run.alive) return run;
    handleInput(run);
    const w = run.world;
    const prevX = run.x, prevZ = run.z;
    const v = speedAt(run.z);
    run.speed = v;
    run.t += dt;
    run.z += v * dt;
    const before = Math.floor(run.points);
    run.points += v * dt * mult(run);
    run.score += Math.floor(run.points) - before;

    // timers
    for (const k of POWERS) if (run.power[k] > 0) { run.power[k] = Math.max(0, run.power[k] - dt); if (run.power[k] === 0) run.events.push('power-end:' + k); }
    if (run.stumbleT > 0) run.stumbleT = Math.max(0, run.stumbleT - dt);
    if (run.invulnT > 0) run.invulnT = Math.max(0, run.invulnT - dt);
    if (run.jumpBuf > 0) run.jumpBuf = Math.max(0, run.jumpBuf - dt);
    if (run.slideT > 0) run.slideT = Math.max(0, run.slideT - dt);

    // sideways towards the lane
    const tx = laneX(run.lane);
    const rate = C.LANE_W / C.LANE_TIME * dt;
    run.x = Math.abs(tx - run.x) <= rate ? tx : run.x + Math.sign(tx - run.x) * rate;

    // oncoming trains start rolling (a horn)
    const near = nearObstacles(run, 4);
    for (const o of w.obstacles) {
      if (o.enc0 > run.z + 200) break;
      if (o.moving && !o.triggered && run.z >= o.trigger) { o.triggered = true; run.events.push('horn'); }
    }

    // up and down
    run.vy -= C.GRAVITY * dt;
    run.y += run.vy * dt;
    const sup = supportAt(run, near);
    // below a surface by no more than a step: stand on it (landing, walking up a ramp);
    // deeper means the player is inside its side, and collide() decides what happens
    if (run.y < sup && sup - run.y <= C.STEP) run.y = sup;
    if (run.y <= sup + 1e-6 && run.vy <= 0) {
      run.vy = 0;
      if (!run.grounded) {
        run.grounded = true;
        run.events.push('land');
        if (run.jumpBuf > 0) doJump(run);
        else if (run.slideBuf) { run.slideT = C.SLIDE_TIME; run.events.push('slide'); }
        run.slideBuf = false;
      }
    } else {
      run.grounded = false;
    }

    collide(run, near, prevX, prevZ);
    if (!run.alive) return run;
    collect(run);

    generateUntil(w, run.z + C.AHEAD);
    prune(w, run.z);
    return run;
  }

  // run for a number of seconds in fixed steps
  function advance(run, seconds, each) {
    const n = Math.round(seconds / C.DT);
    for (let i = 0; i < n && run.alive; i++) { if (each) each(run); step(run, C.DT); }
    return run;
  }

  function result(run) {
    return { score: run.score, coins: run.coins, distance: Math.floor(run.z - C.START_Z), deathBy: run.deathBy };
  }

  // ---------- autopilot: follows the safe lane (the menu demo and the passability law) ----------
  function autopilot(run) {
    const w = run.world;
    const v = speedAt(run.z);
    const out = [];
    // the latest row whose lane-change window has begun
    let target = run.lane;
    for (const p of w.path) {
      if (run.z >= p.z - switchDist(speedAt(p.z)) + 1) target = p.lane;
      else break;
    }
    if (target < run.lane) out.push('left');
    else if (target > run.lane) out.push('right');
    // the nearest thing ahead in the lane
    let next = null, dist = Infinity;
    for (const o of nearObstacles(run, 40)) {
      if (o.broken || o.lane !== target) continue;
      const d = extentAt(o, run.z)[0] - (run.z + C.PLAYER_HALF_D);
      if (d < -0.5 || d > 40) continue;
      if (d < dist) { dist = d; next = o; }
    }
    if (next) {
      if (next.type === 'hurdle' && run.grounded && dist <= v * 0.3 + 0.5) out.push('jump');
      if (next.type === 'bar' && run.slideT <= 0.15 && dist <= v * 0.18 + 1.0 && !run.slideBuf) out.push('slide');
    }
    for (const a of out) act(run, a);
    return out;
  }

  // ---------- save: whatever lies in storage becomes a valid save ----------
  const DEFAULT_BINDINGS = Object.freeze({
    left: ['ArrowLeft', 'KeyA', null],
    right: ['ArrowRight', 'KeyD', null],
    jump: ['ArrowUp', 'KeyW', 'Space'],
    slide: ['ArrowDown', 'KeyS', null],
    pause: ['KeyP', 'Escape', null],
  });
  const SLOTS = 3;
  const THEMES = ['auto', 'light', 'dark'];
  const LANGS = ['ru', 'en'];

  function defaultBindings() {
    const b = {};
    for (const a of ACTIONS) b[a] = DEFAULT_BINDINGS[a].slice();
    return b;
  }
  function defaultSave() {
    return {
      v: 1, best: 0, coins: 0, runs: 0, totalCoins: 0, bestDistance: 0,
      upgrades: { magnet: 0, x2: 0, boots: 0, board: 0 },
      settings: { lang: null, theme: 'auto', music: 0.5, sfx: 0.8, quality: 'high', showFps: false, bindings: defaultBindings() },
    };
  }
  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const int = (v, def, min, max) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.floor(v))) : def);
  const num = (v, def, min, max) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def);
  const CODE_RE = /^[A-Za-z][A-Za-z0-9]{0,24}$/;

  function sanitizeBindings(b) {
    const out = defaultBindings();
    if (!isObj(b)) return out;
    const used = new Set();
    for (const a of ACTIONS) {
      const src = Array.isArray(b[a]) ? b[a] : null;
      if (!src) continue;
      const slots = [];
      for (let i = 0; i < SLOTS; i++) {
        const c = src[i];
        slots.push(typeof c === 'string' && CODE_RE.test(c) && !used.has(c) ? c : null);
        if (slots[i]) used.add(slots[i]);
      }
      out[a] = slots;
    }
    // an action left without a single key gets its defaults back (where they are free)
    for (const a of ACTIONS) {
      if (out[a].some(Boolean)) continue;
      const all = new Set(ACTIONS.flatMap((x) => out[x]).filter(Boolean));
      out[a] = DEFAULT_BINDINGS[a].map((c) => (c && !all.has(c) ? c : null));
    }
    return out;
  }

  function sanitizeSave(raw) {
    const d = defaultSave();
    let src = raw;
    if (typeof raw === 'string') { try { src = JSON.parse(raw); } catch (e) { src = null; } }
    if (!isObj(src)) return d;
    d.best = int(src.best, 0, 0, 1e9);
    d.coins = int(src.coins, 0, 0, 1e9);
    d.runs = int(src.runs, 0, 0, 1e9);
    d.totalCoins = int(src.totalCoins, 0, 0, 1e12);
    d.bestDistance = int(src.bestDistance, 0, 0, 1e9);
    if (isObj(src.upgrades)) for (const k of POWERS) d.upgrades[k] = int(src.upgrades[k], 0, 0, MAX_LEVEL);
    const s = isObj(src.settings) ? src.settings : {};
    d.settings.lang = LANGS.includes(s.lang) ? s.lang : null;
    d.settings.theme = THEMES.includes(s.theme) ? s.theme : 'auto';
    d.settings.music = num(s.music, 0.5, 0, 1);
    d.settings.sfx = num(s.sfx, 0.8, 0, 1);
    d.settings.quality = s.quality === 'low' ? 'low' : 'high';
    d.settings.showFps = s.showFps === true;
    d.settings.bindings = sanitizeBindings(s.bindings);
    return d;
  }

  // the run's result goes into the save
  function applyResult(save, res) {
    const rec = res.score > save.best;
    save.best = Math.max(save.best, res.score);
    save.bestDistance = Math.max(save.bestDistance, res.distance);
    save.coins = Math.min(1e9, save.coins + res.coins);
    save.totalCoins += res.coins;
    save.runs += 1;
    return rec;
  }

  // ---------- keys ----------
  const KEY_NAMES = {
    ru: { Space: 'Пробел', Escape: 'Esc', Enter: 'Enter', ShiftLeft: 'Shift', ShiftRight: 'Правый Shift', ControlLeft: 'Ctrl', ControlRight: 'Правый Ctrl', AltLeft: 'Alt', AltRight: 'Правый Alt', Backspace: 'Backspace', Tab: 'Tab' },
    en: { Space: 'Space', Escape: 'Esc', Enter: 'Enter', ShiftLeft: 'Shift', ShiftRight: 'Right Shift', ControlLeft: 'Ctrl', ControlRight: 'Right Ctrl', AltLeft: 'Alt', AltRight: 'Right Alt', Backspace: 'Backspace', Tab: 'Tab' },
  };
  const SYMBOLS = { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', BracketLeft: '[', BracketRight: ']', Minus: '-', Equal: '=', Backquote: '`', Backslash: '\\' };
  function keyName(code, lang = 'ru') {
    if (!code) return '—';
    const names = KEY_NAMES[lang] || KEY_NAMES.en;
    if (names[code]) return names[code];
    if (SYMBOLS[code]) return SYMBOLS[code];
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
    return code;
  }
  // "← / A" - every key bound to the action, in slot order
  function keysText(bindings, action, lang = 'ru') {
    const list = (bindings[action] || []).filter(Boolean).map((c) => keyName(c, lang));
    return list.length ? list.join(' / ') : '—';
  }
  // code -> action
  function actionFor(bindings, code) {
    for (const a of ACTIONS) if ((bindings[a] || []).includes(code)) return a;
    return null;
  }
  // put a key into a slot; the same key leaves any other slot (one key - one action)
  function rebind(bindings, action, slot, code) {
    const b = {};
    for (const a of ACTIONS) b[a] = (bindings[a] || [null, null, null]).slice(0, SLOTS);
    for (const a of ACTIONS) b[a] = b[a].map((c) => (c === code ? null : c));
    b[action][slot] = code;
    return b;
  }

  // ---------- swipes and taps ----------
  // dx, dy - pointer travel in px (dy down is positive), ms - duration, x - where it started,
  // w, h - size of the play area. Returns an action or null.
  function classifySwipe(dx, dy, ms, x, w, h) {
    const thr = Math.max(24, Math.min(w, h) * 0.05);
    const ax = Math.abs(dx), ay = Math.abs(dy);
    if (ax < thr && ay < thr) {
      if (ms > 450) return null;
      if (x < w / 3) return 'left';
      if (x > w * 2 / 3) return 'right';
      return 'jump';
    }
    if (ax > ay) return dx < 0 ? 'left' : 'right';
    return dy < 0 ? 'jump' : 'slide';
  }

  return {
    C, LANES, ACTIONS, POWERS, POWER_BASE, MAX_LEVEL, UPGRADE_COST, SLOTS, THEMES, LANGS, DEFAULT_BINDINGS,
    rng, speedAt, switchDist, rowGap, laneX, jumpHeightAt, trainLen,
    offsetAt, extentAt, solidAt, encounter, isSupport, halfW,
    createWorld, generateUntil, prune,
    powerDuration, upgradeCost, buyUpgrade,
    newRun, act, step, advance, result, autopilot, nearObstacles, playerH, mult,
    defaultSave, defaultBindings, sanitizeSave, sanitizeBindings, applyResult,
    keyName, keysText, actionFor, rebind, classifySwipe,
  };
});
