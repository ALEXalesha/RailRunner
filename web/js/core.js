// RailRunner core: the pure rules of a run, without the screen, sound or keyboard.
//
// Everything that decides a run lives here and is checked by the laws in tests/unit:
// speed, districts, the level generator (with a guaranteed passable lane), player physics,
// collisions, coins, power-ups, tricks and combo, revive, the tutorial, key bindings and
// swipe recognition. Progress between runs (shop, missions, achievements, the save) is in
// meta.js. The same file runs in the browser (window.RRCore) and in node (require), so the
// laws test exactly the code the player runs.
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
    BOOTS_JUMP_V: 15.6,         // apex 3.58 m: high enough for a train roof or a fence
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
    FENCE_H: 2.3,               // a fence: neither jumped (without sneakers) nor slid under
    TRAIN_H: 3.0,
    TRAIN_HALF_W: 0.95,
    SMALL_HALF_W: 0.9,          // hurdles, bars and fences
    HURDLE_D: 0.3,
    BAR_D: 0.4,
    FENCE_D: 0.35,
    PIT_LEN: 3.2,               // a repair pit: the rails are gone, jump over it
    PIT_HALF_W: 0.7,            // the player's centre this close to the lane falls in
    PIT_DEPTH: 0.6,             // deeper than this in a pit - the run is over
    RAMP_LEN: 7,
    CAR_LEN: 9,
    CAR_GAP: 0.6,
    MOVING_K: 0.55,             // an oncoming train moves at 0.55 of the player's speed
    SLOW_K: -0.4,               // a freight train goes the same way at 0.4 of it
    TRIGGER_D: 80,              // they start when the player is this far from them
    COIN_R: 0.9,                // pick-up reach across
    COIN_RZ: 1.0,               // pick-up reach along the track
    MAGNET_RANGE: 9,
    INVULN: 1.2,
    STUMBLE_TIME: 2.5,
    COIN_POINTS: 10,
    JET_Y: 7.2,                 // the jetpack flies this high (over trains and wires)
    JET_RATE: 4,                // how fast it climbs to that height (1/s)
    JET_LAND_INV: 1.8,          // safe time after the jetpack runs out (fall and landing)
    REVIVE_INV: 2.5,
    TRICK_POINTS: 25,
    COMBO_TIME: 3,
    NEAR_TIME: 0.45,            // a lane change this close to a train is a near miss
    START_Z: 0,
    FIRST_ROW: 45,
    AHEAD: 230,                 // the world is generated this far ahead of the player
    BEHIND: 40,                 // and kept this far behind (for the camera)
  });

  const LANES = [-1, 0, 1];
  const ACTIONS = ['left', 'right', 'jump', 'slide', 'board', 'pause'];
  const POWERS = ['magnet', 'x2', 'boots', 'board', 'jetpack'];
  const POWER_BASE = Object.freeze({ magnet: 10, x2: 12, boots: 10, board: 30, jetpack: 7 });
  const POWER_WEIGHT = Object.freeze({ magnet: 24, x2: 20, boots: 18, board: 14, jetpack: 14 });
  const MAX_LEVEL = 5;
  const UPGRADE_COST = Object.freeze([150, 300, 600, 1200, 2400]);
  const DISTRICTS = ['city', 'industrial', 'bridge', 'tunnel', 'neon'];
  const DISTRICT_LEN = Object.freeze({ city: [700, 900], industrial: [600, 800], bridge: [360, 460], tunnel: [280, 380], neon: [700, 900] });
  const OBSTACLES = ['hurdle', 'bar', 'fence', 'pit', 'ramp', 'train'];
  const TRICKS = ['hurdle', 'bar', 'pit', 'fence', 'roof', 'hop', 'near'];

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
  const airTime = (v0) => 2 * v0 / C.GRAVITY;

  // ---------- districts: they follow each other along the run ----------
  // The order is fixed (city, industrial zone, bridge over the river, tunnel, neon night city),
  // the lengths and the weather come from the seed. A run can start in any of them.
  function ensureDistricts(w, z) {
    const d = w.districts;
    while (!d.length || d[d.length - 1].z1 <= z) {
      const prev = d[d.length - 1];
      const idx = prev ? (prev.idx + 1) : w.startIdx;
      const kind = DISTRICTS[idx % DISTRICTS.length];
      const [a, b] = DISTRICT_LEN[kind];
      const r = w.drand;
      const z0 = prev ? prev.z1 : -C.BEHIND - 200;
      const len = a + r() * (b - a) + (prev ? 0 : 200 + C.BEHIND);
      const wr = r();
      const weather = !prev || kind === 'tunnel' ? 'clear' : wr < 0.2 ? 'rain' : wr < 0.32 ? 'fog' : 'clear';
      d.push({ idx, kind, z0, z1: z0 + len, weather, lap: Math.floor(idx / DISTRICTS.length) - Math.floor(w.startIdx / DISTRICTS.length) });
    }
  }
  function districtAt(w, z) {
    ensureDistricts(w, z);
    const d = w.districts;
    for (let i = d.length - 1; i >= 0; i--) if (d[i].z0 <= z) return d[i];
    return d[0];
  }

  // ---------- obstacles ----------
  const halfW = (o) => (o.type === 'train' || o.type === 'ramp' ? C.TRAIN_HALF_W : o.type === 'pit' ? C.PIT_HALF_W : C.SMALL_HALF_W);
  const isSupport = (o) => o.type === 'train' || o.type === 'ramp';
  // the player cannot get past it in its lane (only around it)
  const isBlocking = (o) => o.type === 'train' || o.type === 'fence';

  // how far a moving train has rolled (towards the player for k > 0, away for k < 0)
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
      case 'fence': return [0, C.FENCE_H];
      case 'train': return [0, C.TRAIN_H];
      case 'ramp': {
        const f = Math.min(1, Math.max(0, (z - o.z0) / (o.z1 - o.z0)));
        return [0, C.TRAIN_H * f];
      }
      default: return [0, 0];
    }
  }
  // Player positions (pz) during which the obstacle can touch the player: for a moving train
  // its ends move, so this is solved from offsetAt (k > -1: the player always passes it).
  function encounter(o) {
    const d = C.PLAYER_HALF_D;
    if (!o.moving) return [o.z0 - d, o.z1 + d];
    const k = o.k;
    // front meets player front: pz + d = z0 - k (pz - trigger)  (after the trigger)
    const a = (o.z0 - d + k * o.trigger) / (1 + k);
    const b = (o.z1 + d + k * o.trigger) / (1 + k);
    return [k > 0 ? Math.min(a, o.z0 - d) : a, b];
  }

  // ---------- the level generator ----------
  // The world is built in rows. Every row has a SAFE lane: in it there is only what the player
  // can get past (nothing, a hurdle or a pit to jump, a bar to slide under, a train with a ramp
  // to run up, or - from a roof - the roof of a train in the next lane). The safe lane moves by
  // at most one lane per row, and only into a lane that is free for switchDist before the row,
  // so there is always time to change lanes. Other lanes get trains (standing, oncoming,
  // freight going away), hurdles, bars, fences, pits and coins. world.path lists the safe lanes.
  const SAFE_WEIGHTS = {
    city: { coins: 30, empty: 12, hurdle: 22, bar: 22, pit: 8, rampTrain: 16 },
    industrial: { coins: 26, empty: 10, hurdle: 24, bar: 18, pit: 16, rampTrain: 14 },
    bridge: { coins: 30, empty: 14, hurdle: 22, bar: 22, pit: 0, rampTrain: 18 },
    tunnel: { coins: 30, empty: 12, hurdle: 20, bar: 28, pit: 8, rampTrain: 6 },
    neon: { coins: 40, empty: 10, hurdle: 22, bar: 22, pit: 8, rampTrain: 18 },
  };
  const OTHER_WEIGHTS = {
    city: { nothing: 26, coins: 9, hurdle: 13, bar: 13, fence: 7, pit: 5, train: 18, moving: 9, slow: 5 },
    industrial: { nothing: 24, coins: 7, hurdle: 15, bar: 11, fence: 15, pit: 11, train: 16, moving: 7, slow: 10 },
    bridge: { nothing: 26, coins: 9, hurdle: 12, bar: 12, fence: 6, pit: 0, train: 24, moving: 10, slow: 6 },
    tunnel: { nothing: 24, coins: 9, hurdle: 12, bar: 18, fence: 6, pit: 5, train: 16, moving: 17, slow: 4 },
    neon: { nothing: 24, coins: 16, hurdle: 13, bar: 13, fence: 7, pit: 5, train: 18, moving: 12, slow: 5 },
  };

  function createWorld(seed, opts = {}) {
    const start = DISTRICTS.indexOf(opts.startDistrict);
    const w = {
      seed: seed >>> 0,
      rand: rng(seed),
      drand: rng((seed ^ 0x51ed270b) >>> 0),
      obstacles: [],
      coins: [],
      powers: [],                 // power-ups and keys
      path: [],                   // { z, lane, kind } - the safe lane from z to the next row
      districts: [],
      startIdx: start >= 0 ? start : 0,
      genZ: C.FIRST_ROW,
      safe: 0,
      busy: [-Infinity, -Infinity, -Infinity],   // per lane (index lane+1): occupied until z
      rideEnd: -Infinity,                         // the safe lane runs on a train roof until
      nextPower: 160,
      nextKey: 700 + (seed % 7) * 90,
      nextId: 1,
      pruneZ: -Infinity,
      tutorial: null,
    };
    ensureDistricts(w, 0);
    if (opts.tutorial) buildTutorial(w);
    return w;
  }

  function addObstacle(w, o) {
    o.id = w.nextId++;
    o.broken = false;
    o.triggered = false;
    o.passed = false;
    o.near = false;
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
  // coins along a jump that takes off at zTake
  function coinArc(w, lane, zTake, v, v0 = C.JUMP_V) {
    const n = 7, T = airTime(v0);
    for (let i = 0; i < n; i++) {
      const t = T * (i + 0.5) / n;
      addCoin(w, lane, zTake + v * t, 0.7 + jumpHeightAt(t, v0));
    }
  }
  function trainLen(cars) { return cars * C.CAR_LEN + (cars - 1) * C.CAR_GAP; }
  // where the autopilot (and a calm player) takes off before a pit
  const pitTakeoff = (pitZ0, v) => pitZ0 - C.PLAYER_HALF_D - (v * 0.12 + 0.6);

  function pick(r, table) {
    let sum = 0;
    for (const k in table) sum += table[k];
    let x = r() * sum;
    for (const k in table) { x -= table[k]; if (x < 0 && table[k] > 0) return k; }
    for (const k in table) if (table[k] > 0) return k;
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
    const dist = districtAt(w, z).kind;

    // 1. where the safe lane goes
    let s = w.safe;
    let kind = null;
    const riding = w.rideEnd > z;
    // from a roof onto the roof of a train in the next lane: it starts under the player before
    // the lane-change window and the old roof lasts until the row
    if (riding && z > 300 && w.rideEnd > z + 2 && r() < 0.45) {
      const opts = [];
      for (const d of [-1, 1]) { const n = s + d; if (n >= -1 && n <= 1 && free(n, z - sd - 1.5)) opts.push(n); }
      if (opts.length) {
        const n = opts[Math.floor(r() * opts.length)];
        const cars = 2 + Math.floor(r() * 2);
        const z0 = z - sd - 0.5;
        const t = addObstacle(w, { type: 'train', lane: n, z0, z1: z0 + trainLen(cars), moving: false, cars, color: Math.floor(r() * 4), ridable: true, hop: true });
        w.coins = w.coins.filter((c) => !(c.lane === n && c.z > z0 - 0.6 && c.z < t.z1 + 0.6 && c.y < C.TRAIN_H + 0.3));
        busy[n + 1] = t.z1 + 1;
        w.rideEnd = t.z1;
        coinLine(w, n, z, Math.max(3, Math.floor((t.z1 - z) / 1.8) - 1), C.TRAIN_H + 0.7);
        s = n;
        kind = 'hop';
      }
    }
    if (!kind) {
      const moves = [];
      for (const d of [-1, 1]) {
        const n = s + d;
        if (n >= -1 && n <= 1 && free(n, z - sd)) moves.push(n);
      }
      if (moves.length && r() < 0.45) s = moves[Math.floor(r() * moves.length)];
    }
    const onRoof = kind === 'hop' || (s === w.safe && riding);
    w.safe = s;

    // 2. the safe lane's content
    if (!kind) {
      if (onRoof) kind = 'roof';
      else if (z < w.rideEnd + v * 0.8) kind = 'empty';   // falling from a roof (0.43 s) and time to look
      else if (z < 70) kind = r() < 0.5 ? 'coins' : 'empty';
      else {
        const t = Object.assign({}, SAFE_WEIGHTS[dist]);
        if (z < 150) t.pit = 0;
        if (z < 200) t.rampTrain = 0;
        kind = pick(r, t);
      }
    }
    if (!onRoof && w.rideEnd > z) w.rideEnd = -Infinity;   // left the roof sideways
    switch (kind) {
      case 'coins':
        coinLine(w, s, z, 5 + Math.floor(r() * 5));
        break;
      case 'hurdle': {
        addObstacle(w, { type: 'hurdle', lane: s, z0: z, z1: z + C.HURDLE_D, moving: false });
        busy[s + 1] = Math.max(busy[s + 1], z + C.HURDLE_D);
        if (r() < 0.7) coinArc(w, s, z - v * 0.3, v);
        break;
      }
      case 'pit': {
        addObstacle(w, { type: 'pit', lane: s, z0: z, z1: z + C.PIT_LEN, moving: false });
        busy[s + 1] = Math.max(busy[s + 1], z + C.PIT_LEN);
        if (r() < 0.75) coinArc(w, s, pitTakeoff(z, v) + C.PLAYER_HALF_D, v);
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

    // a power-up or a key in the safe lane, on the ground, where nothing else stands
    if (kind === 'empty' || kind === 'coins') {
      if (z >= w.nextPower) {
        w.powers.push({ id: w.nextId++, kind: pick(r, POWER_WEIGHT), lane: s, z: z + 4, y: 1.0, taken: false });
        w.nextPower = z + 250 + r() * 250;
      } else if (z >= w.nextKey) {
        w.powers.push({ id: w.nextId++, kind: 'key', lane: s, z: z + 4, y: 1.0, taken: false });
        w.nextKey = z + 1100 + r() * 1300;
      }
    }

    // 3. the other lanes
    const k = C.MOVING_K;
    for (const L of LANES) {
      if (L === s) continue;
      if (!free(L, z)) continue;
      const t = Object.assign({}, OTHER_WEIGHTS[dist]);
      if (z < 100) t.fence = 0;
      if (z < 150) t.pit = 0;
      if (z < 120) t.train = 0; else t.train += Math.min(14, z / 300);
      if (z < 320) t.moving = 0; else t.moving += Math.min(10, z / 400);
      if (z < 500) t.slow = 0;
      const what = pick(r, t);
      if (what === 'coins') coinLine(w, L, z, 4 + Math.floor(r() * 4));
      else if (what === 'hurdle' || what === 'bar' || what === 'fence' || what === 'pit') {
        const len = { hurdle: C.HURDLE_D, bar: C.BAR_D, fence: C.FENCE_D, pit: C.PIT_LEN }[what];
        addObstacle(w, { type: what, lane: L, z0: z, z1: z + len, moving: false });
        busy[L + 1] = z + len;
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
        const z0 = z + C.PLAYER_HALF_D + k * C.TRIGGER_D / (1 + k);
        addObstacle(w, { type: 'train', lane: L, z0, z1: z0 + len, moving: true, k, trigger: z0 - C.TRIGGER_D, cars, color: 4 });
        busy[L + 1] = z0 + len + 1;
      } else if (what === 'slow') {
        // a freight train leaves from the row and rolls away; the player catches up later
        const cars = 2 + Math.floor(r() * 3);
        const o = addObstacle(w, { type: 'train', lane: L, z0: z, z1: z + trainLen(cars), moving: true, k: C.SLOW_K, trigger: z - C.TRIGGER_D, cars, color: 5, freight: true });
        busy[L + 1] = o.enc1 + 1;
      }
    }
    w.genZ = z + rowGap(v);
  }

  function generateUntil(w, zLimit) {
    while (w.genZ < zLimit) genRow(w);
  }

  // ---------- the tutorial: the first run starts with a fixed lesson ----------
  // A train in the middle (change lanes), hurdles in all lanes (jump), bars (slide), pits
  // (jump), trains with ramps (run up the roof). The player can be in any lane, so every
  // lesson covers all three. Then the ordinary generator continues.
  function buildTutorial(w) {
    const steps = [];
    const lane = -1;            // the safe lane the generator thinks of
    const rows = [];
    const add = (o) => addObstacle(w, o);
    // 1. change lanes: a long train in the middle lane, coins on both sides
    add({ type: 'train', lane: 0, z0: 70, z1: 70 + trainLen(2), moving: false, cars: 2, color: 0 });
    coinLine(w, -1, 52, 10); coinLine(w, 1, 52, 10);
    steps.push({ id: 'lane', z: 70 - 22, obstacle: 70, need: ['left', 'right'] });
    rows.push({ z: 45, lane, kind: 'coins' });
    // 2. jump: hurdles everywhere
    for (const L of LANES) add({ type: 'hurdle', lane: L, z0: 135, z1: 135 + C.HURDLE_D, moving: false });
    steps.push({ id: 'jump', z: 135 - 16, obstacle: 135, need: ['jump'] });
    rows.push({ z: 135, lane, kind: 'hurdle' });
    // 3. slide: bars everywhere
    for (const L of LANES) add({ type: 'bar', lane: L, z0: 190, z1: 190 + C.BAR_D, moving: false });
    steps.push({ id: 'slide', z: 190 - 14, obstacle: 190, need: ['slide'] });
    rows.push({ z: 190, lane, kind: 'bar' });
    // 4. a pit: jump again
    for (const L of LANES) add({ type: 'pit', lane: L, z0: 250, z1: 250 + C.PIT_LEN, moving: false });
    steps.push({ id: 'pit', z: 250 - 15, obstacle: 250, need: ['jump'] });
    rows.push({ z: 250, lane, kind: 'pit' });
    // 5. ramps to the roofs, coins on top
    let end = 0;
    for (const L of LANES) {
      const ramp = add({ type: 'ramp', lane: L, z0: 310, z1: 310 + C.RAMP_LEN, moving: false });
      const t = add({ type: 'train', lane: L, z0: ramp.z1, z1: ramp.z1 + trainLen(2), moving: false, cars: 2, color: L + 1, ridable: true });
      ramp.train = t.id;
      coinLine(w, L, t.z0 + 1, 9, C.TRAIN_H + 0.7);
      end = t.z1;
    }
    steps.push({ id: 'roof', z: 310 - 20, obstacle: 310, need: null });
    rows.push({ z: 310, lane, kind: 'rampTrain' });
    w.obstacles.sort((a, b) => a.enc0 - b.enc0);
    w.coins.sort((a, b) => a.z - b.z);
    w.path.push(...rows);
    w.safe = lane;
    for (const L of LANES) w.busy[L + 1] = end + 1;
    w.rideEnd = -Infinity;
    w.genZ = end + speedAt(end) * 1.2;
    w.nextPower = w.genZ + 60;
    w.nextKey = w.genZ + 400;
    w.tutorial = { steps, end };
  }

  // drop what is far behind the player (rendering keeps moving trains until they leave the view)
  function prune(w, pz) {
    const lim = pz - C.BEHIND;
    // not only from the front of the list: a freight train meets the player later than the
    // rows after it, so the list is not sorted by the end of the encounter
    if (pz - w.pruneZ > 5) {
      w.pruneZ = pz;
      w.obstacles = w.obstacles.filter((o) => o.enc1 >= lim || extentAt(o, pz)[1] >= lim);
    }
    if (w.coins.length && w.coins[0].z < lim) w.coins = w.coins.filter((c) => c.z >= lim);
    if (w.powers.length && w.powers[0].z < lim) w.powers = w.powers.filter((p) => p.z >= lim);
    if (w.path.length > 4 && w.path[1].z < lim) w.path = w.path.filter((p, i, a) => i === a.length - 1 || a[i + 1].z >= lim);
    if (w.districts.length > 2 && w.districts[1].z1 < lim - 200) w.districts.shift();
  }

  // ---------- upgrades (bought in the shop, see meta.js) ----------
  const powerDuration = (kind, level = 0) => POWER_BASE[kind] * (1 + 0.2 * Math.max(0, Math.min(MAX_LEVEL, level | 0)));
  const upgradeCost = (level) => (level >= 0 && level < MAX_LEVEL ? UPGRADE_COST[level] : null);

  // ---------- one run ----------
  // opts: upgrades, mult (the score multiplier from missions), boards (hoverboards the player
  // can switch on), tutorial, startDistrict
  function newStats() {
    return {
      jumps: 0, slides: 0, lanes: 0, powers: 0, roofs: 0, hops: 0, near: 0, tricks: 0, bestCombo: 0,
      jets: 0, boards: 0, hurdles: 0, bars: 0, pits: 0, fences: 0, keys: 0, bumps: 0, districts: 1,
      firstCoinZ: null,
    };
  }
  function newRun(seed, opts = {}) {
    const world = createWorld(seed, { tutorial: !!opts.tutorial, startDistrict: opts.startDistrict });
    generateUntil(world, C.START_Z + C.AHEAD);
    return {
      seed: seed >>> 0,
      world,
      upgrades: Object.assign({ magnet: 0, x2: 0, boots: 0, board: 0, jetpack: 0 }, opts.upgrades || {}),
      baseMult: Math.max(1, Math.min(99, (opts.mult | 0) || 1)),
      boardsLeft: Math.max(0, opts.boards | 0),
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
      killer: null,
      revives: 0,
      score: 0,
      points: 0,               // distance points (fractional)
      coins: 0,
      keys: 0,                 // keys found in this run
      combo: 0,
      comboT: 0,
      power: { magnet: 0, x2: 0, boots: 0, board: 0, jetpack: 0 },
      jetEnd: false,           // falling after the jetpack ran out
      under: null,             // the ramp or train under the player
      roof: null,              // the train whose roof the player last stood on
      district: districtAt(world, C.START_Z).kind,
      stats: newStats(),
      queue: [],
      events: [],
    };
  }

  const sliding = (run) => run.slideT > 0;
  const flying = (run) => run.power.jetpack > 0;
  const playerH = (run) => (sliding(run) ? C.SLIDE_H : C.PLAYER_H);
  const mult = (run) => run.baseMult * (run.power.x2 > 0 ? 2 : 1);

  function act(run, action) {
    if (run.alive && action !== 'pause') run.queue.push(action);
  }

  function doJump(run) {
    run.vy = run.power.boots > 0 ? C.BOOTS_JUMP_V : C.JUMP_V;
    run.grounded = false;
    run.slideT = 0;
    run.jumpBuf = 0;
    run.stats.jumps++;
    run.events.push(run.power.boots > 0 ? 'superjump' : 'jump');
  }

  function trick(run, kind) {
    run.combo = run.comboT > 0 ? run.combo + 1 : 1;
    run.comboT = C.COMBO_TIME;
    run.score += C.TRICK_POINTS * run.combo * mult(run);
    run.stats.tricks++;
    if (run.combo > run.stats.bestCombo) run.stats.bestCombo = run.combo;
    run.events.push('trick:' + kind);
  }

  // leaving a lane right before a train or a fence that would have hit
  function checkNearMiss(run, fromLane) {
    const v = speedAt(run.z);
    for (const o of nearObstacles(run, v * C.NEAR_TIME + 2)) {
      if (o.lane !== fromLane || o.broken || o.near || !isBlocking(o)) continue;
      if (o.type === 'train' && run.y >= C.TRAIN_H - C.STEP) continue;
      if (o.type === 'fence' && run.y >= C.FENCE_H) continue;
      const d = o.enc0 - run.z;
      if (d < 0 || d > v * C.NEAR_TIME) continue;
      o.near = true;
      run.stats.near++;
      trick(run, 'near');
      return;
    }
  }

  function handleInput(run) {
    while (run.queue.length) {
      const a = run.queue.shift();
      if (a === 'left' || a === 'right') {
        const n = run.lane + (a === 'left' ? -1 : 1);
        if (n < -1 || n > 1) { run.events.push('edge'); continue; }
        run.laneFrom = run.lane;
        run.lane = n;
        run.stats.lanes++;
        run.events.push('lane');
        checkNearMiss(run, run.laneFrom);
      } else if (a === 'board') {
        if (run.boardsLeft > 0 && run.power.board <= 0) {
          run.boardsLeft--;
          run.power.board = powerDuration('board', run.upgrades.board);
          run.stats.boards++;
          run.events.push('board-on');
        } else run.events.push('edge');
      } else if (flying(run)) {
        continue;                                   // no jumps and slides in the air on a jetpack
      } else if (a === 'jump') {
        if (run.grounded) doJump(run);
        else run.jumpBuf = C.JUMP_BUFFER;
      } else if (a === 'slide') {
        if (run.grounded) { run.slideT = C.SLIDE_TIME; run.stats.slides++; run.events.push('slide'); }
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
      if (o.enc0 > run.z + reach) { if (o.enc0 > run.z + reach + 120) break; continue; }
      if (o.enc1 < run.z - reach) continue;
      out.push(o);
    }
    return out;
  }

  // the height of what is under the player: train roofs and ramps, the ground (0) or nothing
  // over a pit (-Infinity; a pit is safe while invulnerable)
  function supportAt(run, near) {
    let h = 0;
    run.under = null;
    for (const o of near) {
      if (o.broken || !isSupport(o)) continue;
      if (Math.abs(run.x - laneX(o.lane)) >= C.PLAYER_HALF_W + halfW(o)) continue;
      const [a, b] = extentAt(o, run.z);
      if (run.z < a || run.z > b) continue;
      const top = solidAt(o, run.z)[1];
      if (top > h) { h = top; run.under = o; }
    }
    if (h === 0 && run.invulnT <= 0) {
      for (const o of near) {
        if (o.type !== 'pit' || o.broken) continue;
        if (Math.abs(run.x - laneX(o.lane)) < C.PIT_HALF_W && run.z >= o.z0 && run.z <= o.z1) return -Infinity;
      }
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
      run.combo = 0;
      run.comboT = 0;
      run.stats.bumps++;
      run.events.push('bump');
      return 'bump';
    }
    if (run.power.board > 0) {
      run.power.board = 0;
      o.broken = true;
      run.invulnT = C.INVULN;
      if (o.type === 'pit') { run.y = 0; run.vy = 0; }
      run.events.push('board-break');
      return 'board';
    }
    run.alive = false;
    run.deathBy = o.type === 'train' && o.moving ? (o.freight ? 'freight' : 'moving') : o.type;
    run.killer = o.id;
    run.combo = 0;
    run.comboT = 0;
    run.events.push('crash');
    return 'crash';
  }

  function collide(run, near, prevX, prevZ) {
    const h = playerH(run);
    for (const o of near) {
      if (o.broken || !run.alive || o.type === 'pit') continue;
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
    // fell into a pit
    if (run.alive && run.y < -C.PIT_DEPTH) {
      if (run.invulnT > 0) { run.y = 0; run.vy = 0; return; }
      const pit = near.find((o) => o.type === 'pit' && !o.broken && Math.abs(run.x - laneX(o.lane)) < C.PIT_HALF_W + 0.5);
      hit(run, pit || { type: 'pit', id: null }, false, prevX);
    }
  }

  // tricks for what the player has just passed: jumped a hurdle, a pit or a fence, slid under
  // a bar, ran along a roof to its end
  function checkPassed(run, near) {
    for (const o of near) {
      if (o.passed || o.broken) continue;
      if (extentAt(o, run.z)[1] >= run.z - C.PLAYER_HALF_D) continue;
      o.passed = true;
      if (Math.abs(run.x - laneX(o.lane)) > 0.9) continue;
      if (o.type === 'hurdle') { run.stats.hurdles++; trick(run, 'hurdle'); }
      else if (o.type === 'bar') { run.stats.bars++; trick(run, 'bar'); }
      else if (o.type === 'pit' && run.y >= -0.05) { run.stats.pits++; trick(run, 'pit'); }
      else if (o.type === 'fence') { run.stats.fences++; trick(run, 'fence'); }
      else if (o.type === 'train' && run.y >= C.TRAIN_H - 0.25 && !flying(run)) {
        run.stats.roofs++;
        trick(run, 'roof');
      }
    }
  }

  // jetpack: coins along the safe lanes high in the air for the whole flight
  function jetCoins(run, dur) {
    const w = run.world;
    const flight = speedAt(run.z + 50) * dur;
    generateUntil(w, run.z + flight + 60);
    const zEnd = run.z + flight - 12;
    let pi = 0;
    for (let z = run.z + 10; z < zEnd; z += 2.2) {
      while (pi + 1 < w.path.length && w.path[pi + 1].z <= z) pi++;
      const lane = w.path[pi] ? w.path[pi].lane : run.lane;
      addCoin(w, lane, z, C.JET_Y + 0.6);
    }
    w.coins.sort((a, b) => a.z - b.z);
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
      if (mag && dz >= -1 && dz <= C.MAGNET_RANGE && Math.abs(c.y - run.y) < 6) got = true;
      else if (Math.abs(laneX(c.lane) - run.x) < C.COIN_R && Math.abs(dz) < C.COIN_RZ && c.y + 0.5 > run.y && c.y - 0.5 < run.y + h) got = true;
      if (got) {
        c.taken = true;
        c.takenAt = run.t;
        run.coins += 1;
        if (run.stats.firstCoinZ === null) run.stats.firstCoinZ = run.z;
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
        if (p.kind === 'key') {
          run.keys++;
          run.stats.keys++;
          run.events.push('key');
          continue;
        }
        const dur = powerDuration(p.kind, run.upgrades[p.kind]);
        if (p.kind === 'jetpack') {
          if (!flying(run)) { run.stats.jets++; jetCoins(run, dur); }
          run.jetEnd = false;
          run.slideT = 0;
          run.invulnT = Math.max(run.invulnT, 0.5);
        }
        run.power[p.kind] = dur;
        run.stats.powers++;
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
    for (const k of POWERS) {
      if (run.power[k] > 0) {
        run.power[k] = Math.max(0, run.power[k] - dt);
        if (run.power[k] === 0) {
          run.events.push('power-end:' + k);
          if (k === 'jetpack') { run.jetEnd = true; run.invulnT = Math.max(run.invulnT, C.JET_LAND_INV); run.vy = 0; }
        }
      }
    }
    if (run.stumbleT > 0) run.stumbleT = Math.max(0, run.stumbleT - dt);
    if (run.invulnT > 0) run.invulnT = Math.max(0, run.invulnT - dt);
    if (run.jumpBuf > 0) run.jumpBuf = Math.max(0, run.jumpBuf - dt);
    if (run.slideT > 0) run.slideT = Math.max(0, run.slideT - dt);
    if (run.comboT > 0) { run.comboT = Math.max(0, run.comboT - dt); if (run.comboT === 0) run.combo = 0; }

    // sideways towards the lane
    const tx = laneX(run.lane);
    const rate = C.LANE_W / C.LANE_TIME * dt;
    run.x = Math.abs(tx - run.x) <= rate ? tx : run.x + Math.sign(tx - run.x) * rate;

    // moving trains start rolling (an oncoming one sounds its horn)
    const near = nearObstacles(run, 4);
    for (const o of w.obstacles) {
      if (o.enc0 > run.z + 260) break;
      if (o.moving && !o.triggered && run.z >= o.trigger) { o.triggered = true; if (o.k > 0) run.events.push('horn'); }
    }

    // up and down
    if (flying(run)) {
      run.y += (C.JET_Y - run.y) * Math.min(1, dt * C.JET_RATE);
      run.vy = 0;
      run.grounded = false;
    } else {
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
          run.events.push(run.jetEnd ? 'jet-land' : 'land');
          run.jetEnd = false;
          if (run.jumpBuf > 0) doJump(run);
          else if (run.slideBuf) { run.slideT = C.SLIDE_TIME; run.stats.slides++; run.events.push('slide'); }
          run.slideBuf = false;
        }
      } else {
        run.grounded = false;
      }
      // from one roof to the roof of a train in the next lane
      if (run.grounded) {
        const u = run.under && run.under.type === 'train' ? run.under : null;
        if (u && run.roof && u.id !== run.roof.id && u.lane !== run.roof.lane) { run.stats.hops++; trick(run, 'hop'); }
        run.roof = u;
      }
    }

    collide(run, near, prevX, prevZ);
    if (!run.alive) return run;
    checkPassed(run, near);
    collect(run);

    // a new district
    const d = districtAt(w, run.z).kind;
    if (d !== run.district) {
      run.district = d;
      run.stats.districts++;
      run.events.push('district:' + d);
    }

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

  // ---------- continue after a crash (paid with keys, see meta.js) ----------
  const reviveCost = (revives) => Math.min(64, 2 ** Math.max(0, revives | 0));
  function revive(run) {
    if (run.alive) return false;
    const o = run.world.obstacles.find((x) => x.id === run.killer);
    if (o) o.broken = true;
    run.alive = true;
    run.deathBy = null;
    run.killer = null;
    run.revives++;
    run.invulnT = C.REVIVE_INV;
    run.stumbleT = 0;
    run.slideT = 0;
    run.queue.length = 0;
    run.lane = Math.max(-1, Math.min(1, Math.round(run.x / C.LANE_W)));
    if (run.y < 0) run.y = 0;
    run.vy = 0;
    run.events.push('revive');
    return true;
  }

  function result(run) {
    return {
      score: run.score, coins: run.coins, keys: run.keys, distance: Math.floor(run.z - C.START_Z),
      deathBy: run.deathBy, time: run.t, combo: run.stats.bestCombo, stats: Object.assign({}, run.stats), seed: run.seed,
    };
  }

  // ---------- autopilot: follows the safe lane (the menu demo and the passability laws) ----------
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
    if (next && !flying(run)) {
      if (next.type === 'hurdle' && run.grounded && dist <= v * 0.3 + 0.5) out.push('jump');
      if (next.type === 'pit' && run.grounded && dist <= v * 0.12 + 0.6) out.push('jump');
      if (next.type === 'bar' && run.slideT <= 0.15 && dist <= v * 0.18 + 1.0 && !run.slideBuf) out.push('slide');
    }
    for (const a of out) act(run, a);
    return out;
  }

  // ---------- keys ----------
  const DEFAULT_BINDINGS = Object.freeze({
    left: ['ArrowLeft', 'KeyA', null],
    right: ['ArrowRight', 'KeyD', null],
    jump: ['ArrowUp', 'KeyW', 'Space'],
    slide: ['ArrowDown', 'KeyS', null],
    board: ['KeyB', 'KeyE', null],
    pause: ['KeyP', 'Escape', null],
  });
  const SLOTS = 3;

  function defaultBindings() {
    const b = {};
    for (const a of ACTIONS) b[a] = DEFAULT_BINDINGS[a].slice();
    return b;
  }
  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const CODE_RE = /^[A-Za-z][A-Za-z0-9]{0,24}$/;

  function sanitizeBindings(b) {
    const out = defaultBindings();
    if (!isObj(b)) return out;
    const used = new Set();
    const given = ACTIONS.filter((a) => Array.isArray(b[a]));
    for (const a of given) {
      const src = b[a];
      const slots = [];
      for (let i = 0; i < SLOTS; i++) {
        const c = src[i];
        slots.push(typeof c === 'string' && CODE_RE.test(c) && !used.has(c) ? c : null);
        if (slots[i]) used.add(slots[i]);
      }
      out[a] = slots;
    }
    // an action missing from the save (a new one) or left without a single key gets its
    // defaults back, where they are free
    for (const a of ACTIONS) {
      if (given.includes(a) && out[a].some(Boolean)) continue;
      out[a] = DEFAULT_BINDINGS[a].map((c) => (c && !used.has(c) ? c : null));
      for (const c of out[a]) if (c) used.add(c);
    }
    return out;
  }

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
    C, LANES, ACTIONS, POWERS, POWER_BASE, MAX_LEVEL, UPGRADE_COST, SLOTS, DEFAULT_BINDINGS, DISTRICTS, OBSTACLES, TRICKS,
    rng, speedAt, switchDist, rowGap, laneX, jumpHeightAt, airTime, trainLen, pitTakeoff,
    offsetAt, extentAt, solidAt, encounter, isSupport, isBlocking, halfW,
    createWorld, generateUntil, prune, districtAt, ensureDistricts,
    powerDuration, upgradeCost,
    newRun, act, step, advance, result, autopilot, nearObstacles, playerH, mult, flying, revive, reviveCost,
    defaultBindings, sanitizeBindings,
    keyName, keysText, actionFor, rebind, classifySwipe,
  };
});
