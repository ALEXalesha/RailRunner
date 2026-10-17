// RailRunner actors: detailed trains (passenger cars with windows, doors, bogies, cabs and
// lights; freight locomotives, box and tank cars), hurdles, bars, fences, repair pits, ramps,
// coins, power-ups and keys - all instanced - and the runner: a character on joints (hips,
// knees, ankles, shoulders, elbows, neck) animated by code, with a hoverboard and a jetpack.
(function (root) {
  'use strict';
  const THREE = root.THREE;
  const R = root.RRCore;
  const G = root.RRGfx;
  const K = R.C;
  const W = K.TRAIN_HALF_W * 2;
  const CAR = K.CAR_LEN;

  const PASSENGER = [0x2e7dd1, 0x3aa35b, 0xe0a526, 0x8a5bd1, 0xd8443a, 0x8a5a3a];
  const FREIGHT = [0x9c4a2e, 0x2e5c8a, 0x3d6e3d, 0x8a8f96, 0xd8762a, 0x6a4a8a];

  // ---------- train cars: four meshes each (paint tinted per train, details, glass, lights) ----------
  // Local frame: the front of the car at z = 0, the car runs to z = CAR; x across, y up.
  function bogie(parts, zc) {
    parts.push(G.box(1.7, 0.32, 2.5, 0x2a2c30, [0, 0.42, zc]));
    for (const dz of [-0.78, 0.78]) for (const sx of [-0.74, 0.74]) parts.push(G.cyl(0.36, 0.36, 0.12, 12, 0x3a3a3e, [sx, 0.36, zc + dz], 'x'));
    parts.push(G.box(1.9, 0.12, 0.3, 0x55585e, [0, 0.62, zc]));
  }
  function passengerCar(head) {
    const paint = [], detail = [], glass = [], lights = [];
    paint.push(G.box(W, 2.0, CAR - 0.1, 0xffffff, [0, 1.62, CAR / 2]));
    paint.push(G.box(W - 0.14, 0.26, CAR - 0.3, 0xe6e6e6, [0, 2.75, CAR / 2]));
    detail.push(G.box(W - 0.4, 0.12, CAR - 0.6, 0xb8bec6, [0, 2.94, CAR / 2]));
    detail.push(G.box(W + 0.02, 0.14, CAR - 0.1, 0x22252a, [0, 0.58, CAR / 2]));
    detail.push(G.box(W + 0.02, 0.1, CAR - 0.1, 0xf4f4f4, [0, 1.18, CAR / 2]));
    detail.push(G.box(W + 0.02, 0.05, CAR - 0.1, 0x22252a, [0, 1.32, CAR / 2]));
    bogie(detail, 1.9); bogie(detail, CAR - 1.9);
    for (const sx of [-1, 1]) {
      const x = sx * (W / 2 + 0.012);
      for (const [z0, z1] of [[0.7, 2.1], [3.6, 5.4], [6.9, 8.3]]) {
        glass.push(G.box(0.02, 0.62, z1 - z0, 0xffffff, [x, 1.95, (z0 + z1) / 2]));
        detail.push(G.box(0.01, 0.72, z1 - z0 + 0.1, 0x30343a, [x * 0.999, 1.95, (z0 + z1) / 2]));
      }
      for (const zd of [2.85, 6.15]) {
        detail.push(G.box(0.03, 1.75, 1.3, 0x50565e, [x, 1.5, zd]));
        glass.push(G.box(0.035, 0.6, 0.42, 0xffffff, [x, 1.95, zd - 0.3]));
        glass.push(G.box(0.035, 0.6, 0.42, 0xffffff, [x, 1.95, zd + 0.3]));
        detail.push(G.box(0.04, 1.6, 0.03, 0x22252a, [x, 1.45, zd]));
      }
    }
    // roof gear (low: the roof is run on)
    detail.push(G.box(1.0, 0.08, 1.6, 0x9aa2ac, [0, 3.01, 2.4]));
    detail.push(G.box(1.0, 0.08, 1.6, 0x9aa2ac, [0, 3.01, CAR - 2.4]));
    // gangway to the next car
    detail.push(G.box(1.4, 2.1, 0.5, 0x2a2c30, [0, 1.65, CAR + 0.2]));
    if (head) {
      // the cab: windscreen, headlights, destination sign, bumper, a folded pantograph
      detail.push(G.box(W, 2.6, 0.12, 0x1d2026, [0, 1.6, 0.0]));
      glass.push(G.box(1.55, 0.95, 0.04, 0xffffff, [0, 2.0, -0.07]));
      detail.push(G.box(0.08, 0.95, 0.06, 0x1d2026, [0, 2.0, -0.09]));
      lights.push(G.box(0.3, 0.16, 0.04, 0xffffff, [-0.62, 0.95, -0.08]));
      lights.push(G.box(0.3, 0.16, 0.04, 0xffffff, [0.62, 0.95, -0.08]));
      lights.push(G.box(0.12, 0.08, 0.04, 0xff3b3b, [-0.62, 0.74, -0.08]));
      lights.push(G.box(0.12, 0.08, 0.04, 0xff3b3b, [0.62, 0.74, -0.08]));
      lights.push(G.box(1.0, 0.18, 0.04, 0xffa64d, [0, 2.6, -0.08]));
      paint.push(G.box(W, 0.5, 0.2, 0xffffff, [0, 0.9, -0.05]));
      detail.push(G.box(1.8, 0.28, 0.3, 0x30343a, [0, 0.55, -0.16]));
      detail.push(G.box(0.3, 0.2, 0.4, 0x55585e, [0, 0.62, -0.35]));
      detail.push(G.box(0.08, 0.08, 1.4, 0x30343a, [-0.35, 3.08, 1.6], [0.25, 0, 0]));
      detail.push(G.box(0.08, 0.08, 1.4, 0x30343a, [0.35, 3.08, 1.6], [0.25, 0, 0]));
      detail.push(G.box(1.2, 0.05, 0.08, 0x30343a, [0, 3.25, 2.2]));
    }
    return { paint: G.merge(paint), detail: G.merge(detail), glass: G.merge(glass), lights: lights.length ? G.merge(lights) : null };
  }
  function freightLoco() {
    const paint = [], detail = [], glass = [], lights = [];
    paint.push(G.box(1.6, 1.7, 5.6, 0xffffff, [0, 1.65, 2.6 + 2.8]));
    paint.push(G.box(W, 2.2, 2.5, 0xffffff, [0, 1.9, 1.35]));
    paint.push(G.box(W, 0.3, 1.0, 0xffffff, [0, 0.95, 0.15]));
    detail.push(G.box(W - 0.2, 0.15, 2.4, 0x2a2c30, [0, 3.06, 1.35]));
    detail.push(G.box(W + 0.05, 0.25, CAR - 0.2, 0x2a2c30, [0, 0.7, CAR / 2]));
    detail.push(G.box(1.62, 0.06, 5.6, 0x888c92, [0, 2.52, 5.4]));
    for (let i = 0; i < 6; i++) detail.push(G.box(1.62, 0.5, 0.06, 0x30343a, [0, 2.0, 3.2 + i * 0.9]));
    for (const sx of [-1, 1]) {
      detail.push(G.box(0.04, 0.04, CAR - 1, 0xf2f2f2, [sx * 0.94, 1.45, CAR / 2]));
      glass.push(G.box(0.03, 0.6, 1.0, 0xffffff, [sx * (W / 2 + 0.01), 2.25, 1.2]));
    }
    bogie(detail, 2.0); bogie(detail, CAR - 2.0);
    glass.push(G.box(1.5, 0.7, 0.04, 0xffffff, [0, 2.3, 0.08]));
    lights.push(G.box(0.26, 0.26, 0.04, 0xffffff, [0, 2.85, 0.06]));
    lights.push(G.box(0.2, 0.14, 0.04, 0xffffff, [-0.6, 1.05, -0.37]));
    lights.push(G.box(0.2, 0.14, 0.04, 0xffffff, [0.6, 1.05, -0.37]));
    detail.push(G.box(1.9, 0.3, 0.3, 0xf2c200, [0, 0.62, -0.2]));
    detail.push(G.box(1.9, 0.08, 0.3, 0x1a1a1a, [0, 0.66, -0.36]));
    return { paint: G.merge(paint), detail: G.merge(detail), glass: G.merge(glass), lights: G.merge(lights) };
  }
  function boxCar() {
    const paint = [], detail = [];
    paint.push(G.box(W, 2.25, CAR - 0.2, 0xffffff, [0, 1.87, CAR / 2]));
    detail.push(G.box(W - 0.2, 0.08, CAR - 0.4, 0x5a5e64, [0, 3.0, CAR / 2]));
    detail.push(G.box(W + 0.04, 0.22, CAR - 0.1, 0x2a2c30, [0, 0.66, CAR / 2]));
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 10; i++) detail.push(G.box(0.05, 2.2, 0.07, 0x3a3d42, [sx * (W / 2 + 0.02), 1.87, 0.5 + i * 0.89]));
      detail.push(G.box(0.06, 1.9, 2.2, 0x4a4e54, [sx * (W / 2 + 0.04), 1.75, CAR / 2]));
      detail.push(G.box(0.08, 0.06, 4.4, 0x22252a, [sx * (W / 2 + 0.06), 2.75, CAR / 2]));
    }
    bogie(detail, 1.6); bogie(detail, CAR - 1.6);
    return { paint: G.merge(paint), detail: G.merge(detail), glass: null, lights: null };
  }
  function tankCar() {
    const paint = [], detail = [];
    paint.push(G.cyl(1.0, 1.0, CAR - 1.4, 18, 0xffffff, [0, 1.95, CAR / 2], 'z'));
    paint.push(G.sphere(1.0, 0xffffff, [0, 1.95, 0.7], [1, 1, 0.35], 18, 8));
    paint.push(G.sphere(1.0, 0xffffff, [0, 1.95, CAR - 0.7], [1, 1, 0.35], 18, 8));
    detail.push(G.cyl(0.35, 0.35, 0.12, 12, 0x5a5e64, [0, 2.98, CAR / 2]));
    detail.push(G.box(1.2, 0.05, 1.6, 0x5a5e64, [0, 2.96, CAR / 2]));
    detail.push(G.box(W, 0.25, CAR - 0.1, 0x2a2c30, [0, 0.72, CAR / 2]));
    for (const zc of [1.6, CAR / 2, CAR - 1.6]) detail.push(G.cyl(1.03, 1.03, 0.1, 18, 0x2a2c30, [0, 1.95, zc], 'z'));
    for (const sx of [-1, 1]) detail.push(G.box(0.05, 1.3, 0.05, 0x888c92, [sx * 0.6, 1.4, CAR / 2]));
    bogie(detail, 1.6); bogie(detail, CAR - 1.6);
    return { paint: G.merge(paint), detail: G.merge(detail), glass: null, lights: null };
  }

  // ---------- obstacles ----------
  // Each model sits inside its hitbox along the track: z from 0 to C.HURDLE_D / BAR_D /
  // FENCE_D (the law «хитбоксы» checks the boxes against core.js).
  function obstacleGeos() {
    const g = {};
    const h = [];
    for (const sx of [-0.85, 0.85]) {
      h.push(G.box(0.1, K.HURDLE_H, 0.1, 0x9aa2ac, [sx, K.HURDLE_H / 2, K.HURDLE_D / 2]));
      h.push(G.box(0.12, 0.06, 0.55, 0x6a7078, [sx, 0.03, K.HURDLE_D / 2]));
    }
    for (const y of [0.5, 0.82]) for (let i = 0; i < 6; i++) h.push(G.box(0.3, 0.24, 0.07, i % 2 ? 0xffffff : 0xd8342a, [-0.75 + i * 0.3, y, K.HURDLE_D / 2]));
    g.hurdle = G.merge(h);
    const b = [];
    for (const sx of [-0.98, 0.98]) {
      b.push(G.box(0.14, K.BAR_TOP + 0.35, 0.14, 0x9aa2ac, [sx, (K.BAR_TOP + 0.35) / 2, K.BAR_D / 2]));
      b.push(G.box(0.3, 0.08, 0.6, 0x6a7078, [sx, 0.04, K.BAR_D / 2]));
      b.push(G.box(0.12, 0.12, 0.12, 0x333333, [sx, K.BAR_TOP + 0.42, K.BAR_D / 2]));
    }
    g.barFrame = G.merge(b);
    g.barSign = G.box(1.84, K.BAR_TOP - K.BAR_BOTTOM, 0.25, 0xffffff, [0, (K.BAR_TOP + K.BAR_BOTTOM) / 2, K.BAR_D / 2]);
    const f = [];
    for (const sx of [-0.92, 0, 0.92]) f.push(G.box(0.08, K.FENCE_H, 0.08, 0x8a9096, [sx, K.FENCE_H / 2, K.FENCE_D / 2]));
    for (const sx of [-0.92, 0.92]) f.push(G.box(0.5, 0.06, 0.5, 0x6a7078, [sx, 0.03, K.FENCE_D / 2]));
    for (const y of [0.1, K.FENCE_H - 0.05]) for (let i = 0; i < 6; i++) f.push(G.box(0.31, 0.1, 0.06, i % 2 ? 0xffffff : 0xd8342a, [-0.775 + i * 0.31, y, K.FENCE_D / 2]));
    g.fenceFrame = G.merge(f);
    g.fenceNet = G.part(new THREE.PlaneGeometry(1.84, K.FENCE_H - 0.15), 0xffffff, { p: [0, K.FENCE_H / 2, K.FENCE_D / 2], r: [0, Math.PI, 0] });
    const p = [];
    p.push(G.box(1.5, 0.05, K.PIT_LEN - 0.2, 0x0b0b0d, [0, 0.165, K.PIT_LEN / 2]));
    p.push(G.box(1.42, 0.6, K.PIT_LEN - 0.3, 0x1a1a1e, [0, -0.15, K.PIT_LEN / 2]));
    for (const zc of [-0.25, K.PIT_LEN + 0.25]) for (const sx of [-1.02, 1.02]) {
      p.push(G.cyl(0.04, 0.16, 0.5, 10, 0xff6a1a, [sx, 0.25, zc]));
      p.push(G.cyl(0.11, 0.13, 0.08, 10, 0xffffff, [sx, 0.3, zc]));
      p.push(G.box(0.36, 0.04, 0.36, 0x222222, [sx, 0.02, zc]));
    }
    g.pit = G.merge(p);
    const rim = [];
    rim.push(G.box(1.7, 0.08, 0.12, 0xffffff, [0, 0.18, 0.0]));
    rim.push(G.box(1.7, 0.08, 0.12, 0xffffff, [0, 0.18, K.PIT_LEN]));
    rim.push(G.box(0.12, 0.08, K.PIT_LEN, 0xffffff, [-0.8, 0.18, K.PIT_LEN / 2]));
    rim.push(G.box(0.12, 0.08, K.PIT_LEN, 0xffffff, [0.8, 0.18, K.PIT_LEN / 2]));
    g.pitRim = G.merge(rim);
    g.ramp = G.merge([G.wedge(W, K.TRAIN_H, K.RAMP_LEN, 0xffffff)]);
    g.rampSide = G.merge([
      G.part(new THREE.BoxGeometry(0.08, 0.08, Math.hypot(K.RAMP_LEN, K.TRAIN_H)), 0xf5c518, { p: [-W / 2 + 0.04, K.TRAIN_H / 2 + 0.05, K.RAMP_LEN / 2], r: [-Math.atan2(K.TRAIN_H, K.RAMP_LEN), 0, 0] }),
      G.part(new THREE.BoxGeometry(0.08, 0.08, Math.hypot(K.RAMP_LEN, K.TRAIN_H)), 0xf5c518, { p: [W / 2 - 0.04, K.TRAIN_H / 2 + 0.05, K.RAMP_LEN / 2], r: [-Math.atan2(K.TRAIN_H, K.RAMP_LEN), 0, 0] }),
      G.box(0.1, K.TRAIN_H, 0.1, 0x6a7078, [-W / 2 + 0.05, K.TRAIN_H / 2, K.RAMP_LEN - 0.1]),
      G.box(0.1, K.TRAIN_H, 0.1, 0x6a7078, [W / 2 - 0.05, K.TRAIN_H / 2, K.RAMP_LEN - 0.1]),
    ]);
    return g;
  }
  function obstacleTextures() {
    const T = {};
    T.hazard = G.canvasTex(256, 192, (g, w, h) => {
      g.fillStyle = '#f5c518'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#1a1a1a';
      for (let x = -h; x < w + h; x += 48) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 24, 0); g.lineTo(x - 16, 40); g.lineTo(x - 40, 40); g.fill(); }
      for (let x = -h; x < w + h; x += 48) { g.beginPath(); g.moveTo(x, h - 40); g.lineTo(x + 24, h - 40); g.lineTo(x - 16, h); g.lineTo(x - 40, h); g.fill(); }
      g.fillStyle = '#ffffff'; g.fillRect(70, 52, 116, 88);
      g.fillStyle = '#d23a2a';
      g.beginPath(); g.moveTo(128, 132); g.lineTo(96, 92); g.lineTo(116, 92); g.lineTo(116, 60); g.lineTo(140, 60); g.lineTo(140, 92); g.lineTo(160, 92); g.fill();
    });
    T.net = G.canvasTex(256, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.strokeStyle = '#c9ced4'; g.lineWidth = 3;
      for (let i = -w; i < w * 2; i += 18) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke(); g.beginPath(); g.moveTo(i, h); g.lineTo(i + h, 0); g.stroke(); }
      g.fillStyle = '#d23a2a'; g.beginPath(); g.arc(w / 2, h * 0.45, 46, 0, 7); g.fill();
      g.fillStyle = '#ffffff'; g.fillRect(w / 2 - 32, h * 0.45 - 10, 64, 20);
    });
    T.stripes = G.canvasTex(128, 32, (g, w, h) => {
      g.fillStyle = '#f5c518'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#1a1a1a';
      for (let x = -h; x < w + h; x += 24) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 12, 0); g.lineTo(x + 12 - h, h); g.lineTo(x - h, h); g.fill(); }
    }, { wrap: true });
    T.ramp = G.canvasTex(64, 256, (g, w, h) => {
      g.fillStyle = '#5b636e'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#727b87';
      for (let y = 0; y < h; y += 16) g.fillRect(0, y, w, 6);
      g.fillStyle = '#f5c518'; g.fillRect(0, 0, 6, h); g.fillRect(w - 6, 0, 6, h);
    });
    return T;
  }

  // ---------- trains, obstacles, coins and power-ups: everything filled per frame ----------
  function createWorldActors(scene, opts) {
    const L = (o) => new THREE.MeshLambertMaterial(o);
    const VC = { vertexColors: true };
    const cast = opts.shadows !== false;
    const TT = obstacleTextures();
    const glassMat = new THREE.MeshPhongMaterial({ color: 0x1b2638, specular: 0x9fb4cc, shininess: 90, emissive: 0xffd590, emissiveIntensity: 0 });
    const lightMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    const paintMat = L(VC), detailMat = L(VC);
    const kinds = { head: passengerCar(true), mid: passengerCar(false), loco: freightLoco(), box: boxCar(), tank: tankCar() };
    const CAP = 70;
    const cars = {};
    for (const k in kinds) {
      const g = kinds[k];
      cars[k] = {
        paint: new G.Pool(scene, g.paint, paintMat, CAP, { color: true, cast, receive: true }),
        detail: new G.Pool(scene, g.detail, detailMat, CAP, { cast }),
        glass: g.glass ? new G.Pool(scene, g.glass, glassMat, CAP) : null,
        lights: g.lights ? new G.Pool(scene, g.lights, lightMat, CAP) : null,
      };
    }
    // headlight glow of moving trains
    const flareTex = G.canvasTex(64, 64, (g, w, h) => {
      const gr = g.createRadialGradient(32, 32, 1, 32, 32, 31);
      gr.addColorStop(0, 'rgba(255,255,240,1)'); gr.addColorStop(0.25, 'rgba(255,240,200,0.55)'); gr.addColorStop(1, 'rgba(255,220,160,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
    const flareMat = new THREE.MeshBasicMaterial({ map: flareTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const flares = new G.Pool(scene, new THREE.PlaneGeometry(1, 1), flareMat, 40);

    const OG = obstacleGeos();
    const pools = {
      hurdle: new G.Pool(scene, OG.hurdle, L(VC), 40, { cast }),
      barFrame: new G.Pool(scene, OG.barFrame, L(VC), 40, { cast }),
      barSign: new G.Pool(scene, OG.barSign, L({ map: TT.hazard }), 40, { cast }),
      fenceFrame: new G.Pool(scene, OG.fenceFrame, L(VC), 40, { cast }),
      fenceNet: new G.Pool(scene, OG.fenceNet, L({ map: TT.net, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide }), 40),
      pit: new G.Pool(scene, OG.pit, L(VC), 40),
      pitRim: new G.Pool(scene, OG.pitRim, L({ map: TT.stripes }), 40),
      ramp: new G.Pool(scene, OG.ramp, L({ map: TT.ramp, vertexColors: true }), 30, { receive: true }),
      rampSide: new G.Pool(scene, OG.rampSide, L(VC), 30),
      warn: new G.Pool(scene, new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff5020 }), 80),
    };

    // coins
    const COINS = 800;
    const coinGeo = G.merge([
      G.cyl(0.36, 0.36, 0.08, 20, 0xffc928, [0, 0, 0]),
      G.cyl(0.26, 0.26, 0.1, 20, 0xffe27a, [0, 0, 0]),
    ]);
    const coinMat = L({ vertexColors: true, emissive: 0x7a5200 });
    const coinMesh = new THREE.InstancedMesh(coinGeo, coinMat, COINS);
    coinMesh.frustumCulled = false;
    scene.add(coinMesh);

    // power-ups and keys: a few groups from pools
    const powerObjs = new Map();
    const powerPools = { magnet: [], x2: [], boots: [], board: [], jetpack: [], key: [] };
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false });
    const x2Tex = G.canvasTex(128, 128, (g) => {
      g.fillStyle = '#ffcf2e'; g.beginPath(); g.arc(64, 64, 60, 0, 7); g.fill();
      g.fillStyle = '#b5121b'; g.font = 'bold 64px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('x2', 64, 68);
    });
    function makePower(kind) {
      const grp = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.05, 6, 28), ringMat.clone());
      ring.material.color.set({ magnet: 0xff6a6a, x2: 0xffe14f, boots: 0x6aff8a, board: 0xd08aff, jetpack: 0xffa64d, key: 0x9ad8ff }[kind]);
      grp.add(ring);
      const parts = [];
      if (kind === 'magnet') {
        parts.push(G.part(new THREE.TorusGeometry(0.3, 0.1, 8, 16, Math.PI), 0xe0322c, { r: [0, 0, Math.PI] }));
        parts.push(G.box(0.2, 0.18, 0.2, 0xcfd6de, [-0.3, 0.08, 0])); parts.push(G.box(0.2, 0.18, 0.2, 0xcfd6de, [0.3, 0.08, 0]));
      } else if (kind === 'boots') {
        for (const sx of [-0.18, 0.18]) {
          parts.push(G.box(0.22, 0.2, 0.42, 0x2fbf5a, [sx, 0.05, 0])); parts.push(G.box(0.24, 0.06, 0.46, 0xffffff, [sx, -0.07, 0]));
          parts.push(G.part(new THREE.TorusGeometry(0.08, 0.025, 4, 10), 0xcfd6de, { p: [sx, -0.16, 0], r: [Math.PI / 2, 0, 0] }));
        }
      } else if (kind === 'board') {
        parts.push(G.box(0.34, 0.07, 0.95, 0x7d3cff, [0, 0, 0], [-0.5, 0, 0])); parts.push(G.box(0.36, 0.02, 0.97, 0xff4fb8, [0, 0.04, 0], [-0.5, 0, 0]));
      } else if (kind === 'jetpack') {
        for (const sx of [-0.15, 0.15]) {
          parts.push(G.cyl(0.12, 0.12, 0.5, 12, 0xd8d8d8, [sx, 0.05, 0])); parts.push(G.cyl(0.12, 0.05, 0.12, 12, 0xff3b3b, [sx, 0.36, 0]));
          parts.push(G.cyl(0.06, 0.1, 0.12, 10, 0x333333, [sx, -0.26, 0]));
        }
        parts.push(G.box(0.2, 0.3, 0.12, 0x2e7dd1, [0, 0.05, 0.06]));
      } else if (kind === 'key') {
        parts.push(G.part(new THREE.TorusGeometry(0.16, 0.05, 8, 16), 0x3fb4ff, { p: [0, 0.22, 0] }));
        parts.push(G.box(0.07, 0.5, 0.07, 0x3fb4ff, [0, -0.1, 0]));
        parts.push(G.box(0.16, 0.06, 0.07, 0x3fb4ff, [0.08, -0.25, 0])); parts.push(G.box(0.12, 0.06, 0.07, 0x3fb4ff, [0.06, -0.12, 0]));
      }
      if (parts.length) grp.add(new THREE.Mesh(G.merge(parts), L({ vertexColors: true, emissive: kind === 'key' ? 0x0a3a6a : 0x222222 })));
      if (kind === 'x2') grp.add(new THREE.Mesh(new THREE.CircleGeometry(0.45, 24), new THREE.MeshBasicMaterial({ map: x2Tex, side: THREE.DoubleSide })));
      grp.userData = { kind, ring };
      scene.add(grp);
      return grp;
    }

    const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
    const carColor = (o) => (o.freight ? FREIGHT : PASSENGER)[o.freight ? (o.id * 7) % FREIGHT.length : o.color % PASSENGER.length];

    function draw(run, pz, t, ahead, behind, look) {
      const w = run.world;
      for (const k in cars) for (const p of Object.values(cars[k])) if (p) p.reset();
      for (const k in pools) pools[k].reset();
      flares.reset();
      const night = Math.min(1, look.windows);
      for (const o of w.obstacles) {
        const [a, b] = R.extentAt(o, pz);
        if (b < pz - behind || a > pz + ahead || o.broken) continue;
        const x = -R.laneX(o.lane);
        if (o.type === 'train') {
          const n = o.cars || 1;
          for (let i = 0; i < n; i++) {
            let kind, z = a + i * (CAR + K.CAR_GAP), ry = 0;
            if (o.freight) kind = i === 0 ? 'loco' : (G.hash3(o.id, i, 3) < 0.5 ? 'box' : 'tank');
            else if (i === 0) kind = 'head';
            else if (i === n - 1) { kind = 'head'; z += CAR; ry = Math.PI; }
            else kind = 'mid';
            const c = cars[kind];
            const col = o.freight && i > 0 ? FREIGHT[(o.id + i * 3) % FREIGHT.length] : carColor(o);
            c.paint.add(x, 0, z, ry, 1, 1, 1, col);
            c.detail.add(x, 0, z, ry);
            if (c.glass) c.glass.add(x, 0, z, ry);
            if (c.lights) c.lights.add(x, 0, z, ry);
          }
          if (o.moving && o.k > 0) {
            const fl = 1.6 + night * 1.8;
            flares.add(x + 0.62, 0.95, a - 0.12, 0, fl, fl, 1);
            flares.add(x - 0.62, 0.95, a - 0.12, 0, fl, fl, 1);
          }
        } else if (o.type === 'hurdle') pools.hurdle.add(x, 0, a);
        else if (o.type === 'bar') {
          pools.barFrame.add(x, 0, a); pools.barSign.add(x, 0, a);
          if (Math.floor(t * 3) % 2 === 0) { pools.warn.add(x - 0.98, K.BAR_TOP + 0.5, a + K.BAR_D / 2); pools.warn.add(x + 0.98, K.BAR_TOP + 0.5, a + K.BAR_D / 2); }
        } else if (o.type === 'fence') { pools.fenceFrame.add(x, 0, a); pools.fenceNet.add(x, 0, a); }
        else if (o.type === 'pit') {
          pools.pit.add(x, 0, a); pools.pitRim.add(x, 0, a);
          if (Math.floor(t * 2.5 + o.id) % 2 === 0) { pools.warn.add(x - 1.02, 0.58, a - 0.25); pools.warn.add(x + 1.02, 0.58, a + K.PIT_LEN + 0.25); }
        } else if (o.type === 'ramp') { pools.ramp.add(x, 0, a); pools.rampSide.add(x, 0, a); }
      }
      for (const k in cars) for (const p of Object.values(cars[k])) if (p) p.done();
      for (const k in pools) pools[k].done();
      flares.done();
      glassMat.emissiveIntensity = night * 0.8;
      lightMat.color.setScalar(0.55 + night * 0.45);

      // coins
      let n = 0;
      const spin = t * 3.4;
      for (const c of w.coins) {
        if (c.z > pz + ahead) break;
        if (c.z < pz - 4 || n >= COINS) continue;
        let x = -R.laneX(c.lane), y = c.y, z = c.z, s = 1;
        if (c.taken) {
          const k = (run.t - c.takenAt) / 0.22;
          if (k >= 1 || k < 0) continue;
          const px = -run.x, py = run.y;
          x += (px - x) * k; y += (py + 1.1 - y) * k; z = c.z + (pz - c.z) * k; s = 1 - k * 0.7;
        }
        _e.set(Math.PI / 2, spin + c.z * 0.3, 0, 'YXZ');
        _q.setFromEuler(_e);
        _s.set(s, s, s);
        _m.compose(_p.set(x, y + Math.sin(t * 4 + c.z) * 0.05, z), _q, _s);
        coinMesh.setMatrixAt(n++, _m);
      }
      coinMesh.count = n;
      coinMesh.instanceMatrix.needsUpdate = true;

      // power-ups
      const seen = new Set();
      for (const p of w.powers) {
        if (p.taken || p.z < pz - 4 || p.z > pz + ahead) continue;
        seen.add(p.id);
        let g = powerObjs.get(p.id);
        if (!g) { g = powerPools[p.kind].pop() || makePower(p.kind); g.visible = true; powerObjs.set(p.id, g); }
        g.position.set(-R.laneX(p.lane), p.y + Math.sin(t * 3 + p.z) * 0.12, p.z);
        g.rotation.y = t * 2;
        g.userData.ring.material.opacity = 0.55 + 0.3 * Math.sin(t * 6);
      }
      for (const [id, g] of [...powerObjs]) if (!seen.has(id)) { g.visible = false; powerPools[g.userData.kind].push(g); powerObjs.delete(id); }
    }
    return { draw, coinMesh, info: () => ({ coins: coinMesh.count, powers: powerObjs.size }) };
  }

  // ---------- the runner ----------
  // cfg - an entry of RRMeta.CHARS. The model faces -z (rotated to +z by its holder).
  // Joint angles: x > 0 swings a hanging limb forward; a knee bends back with x < 0.
  function createRunner(cfg) {
    const L = (c, o) => new THREE.MeshLambertMaterial(Object.assign({ color: c }, o));
    const hs = cfg.height, bs = cfg.build;
    const M = {
      skin: L(cfg.skin), top: L(cfg.top), pants: L(cfg.pants), shoes: L(cfg.shoes), hair: L(cfg.hair),
      hat: L(cfg.hatColor), extra: L(cfg.extraColor, cfg.extra === 'neon' ? { emissive: cfg.extraColor, emissiveIntensity: 0.9 } : {}),
      eye: new THREE.MeshBasicMaterial({ color: 0x15151a }), white: L(0xffffff),
      sole: L(0xdddddd), boots: L(0x2fbf5a, { emissive: 0x0a3a14 }),
    };
    if (cfg.robot) { M.skin = L(cfg.skin, { emissive: 0x111418 }); }
    const meshes = [];
    const mesh = (geo, mat, parent, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      parent.add(m);
      meshes.push(m);
      return m;
    };
    const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
    const cap = (r, h) => new THREE.CapsuleGeometry(r, h, 3, 8);
    const group = (parent, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };

    const root = new THREE.Group();          // position = the player; rotation = facing
    const flip = group(root, 0, 0.95 * hs, 0);   // pivot for flips and falls (body centre)
    const body = group(flip, 0, -0.95 * hs, 0);
    const legLen = 0.86 * hs;
    const hips = group(body, 0, legLen, 0);
    mesh(B(0.34 * bs, 0.18, 0.22), M.pants, hips, 0, 0.02, 0);
    const spine = group(hips, 0, 0.08, 0);
    const chest = group(spine, 0, 0, 0);
    const torsoH = 0.56 * hs;
    mesh(cap(0.2 * bs, torsoH - 0.36), M.top, chest, 0, torsoH / 2, 0).scale.set(1.08, 1, 0.68);
    mesh(B(0.12, 0.05, 0.2), M.top, chest, 0, torsoH - 0.02, 0);
    // neck and head
    const neck = group(chest, 0, torsoH, 0);
    mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 8), M.skin, neck, 0, 0.04, 0);
    const head = group(neck, 0, 0.1, 0);
    const headR = 0.19;
    if (cfg.robot) {
      mesh(B(0.34, 0.32, 0.32), M.skin, head, 0, headR, 0);
      mesh(B(0.26, 0.08, 0.02), new THREE.MeshBasicMaterial({ color: 0x40e0ff }), head, 0, headR + 0.04, -0.165);
    } else {
      mesh(new THREE.SphereGeometry(headR, 16, 12), M.skin, head, 0, headR, 0).scale.set(0.95, 1.05, 1);
      for (const sx of [-0.07, 0.07]) {
        mesh(new THREE.SphereGeometry(0.035, 8, 6), M.white, head, sx, headR + 0.03, -0.165);
        mesh(new THREE.SphereGeometry(0.02, 6, 5), M.eye, head, sx, headR + 0.03, -0.192);
      }
      mesh(B(0.08, 0.025, 0.02), L(0xb5615a), head, 0, headR - 0.08, -0.18);
      mesh(new THREE.SphereGeometry(0.035, 6, 5), M.skin, head, -0.19, headR, 0);
      mesh(new THREE.SphereGeometry(0.035, 6, 5), M.skin, head, 0.19, headR, 0);
    }
    // hair and hats
    const hairCap = (mat, scaleY = 0.62) => mesh(new THREE.SphereGeometry(headR * 1.06, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat, head, 0, headR + 0.02, 0.02).scale.set(1, scaleY / 0.62, 1);
    if (cfg.hat === 'cap') {
      hairCap(M.hat);
      mesh(B(0.3, 0.03, 0.22), M.hat, head, 0, headR + 0.06, -0.2);
      mesh(B(0.38, 0.06, 0.25), M.hair, head, 0, headR - 0.02, 0.06);
    } else if (cfg.hat === 'ponytail') {
      hairCap(M.hair, 0.7);
      mesh(cap(0.06, 0.26), M.hair, head, 0, headR - 0.05, 0.23).rotation.x = 0.5;
      mesh(new THREE.TorusGeometry(0.05, 0.015, 6, 12), M.extra, head, 0, headR + 0.08, 0.2);
    } else if (cfg.hat === 'beanie') {
      hairCap(M.hat, 0.8);
      mesh(new THREE.CylinderGeometry(headR * 1.08, headR * 1.08, 0.08, 16), M.white, head, 0, headR + 0.02, 0.01);
      mesh(new THREE.SphereGeometry(0.06, 8, 6), M.white, head, 0, headR * 2 + 0.08, 0.02);
    } else if (cfg.hat === 'helmet') {
      mesh(new THREE.SphereGeometry(headR * 1.18, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), M.hat, head, 0, headR + 0.01, 0.01);
      mesh(B(0.34, 0.1, 0.04), new THREE.MeshLambertMaterial({ color: 0x223355, transparent: true, opacity: 0.8 }), head, 0, headR + 0.06, -0.21);
    } else if (cfg.hat === 'antenna') {
      mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.25, 6), M.hair, head, 0.08, headR * 2 + 0.1, 0);
      mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: cfg.hatColor }), head, 0.08, headR * 2 + 0.24, 0);
    } else if (cfg.hat === 'spikes') {
      hairCap(M.hair, 0.55);
      for (let i = 0; i < 7; i++) {
        const sp = mesh(new THREE.ConeGeometry(0.05, 0.2, 6), M.hair, head, (i - 3) * 0.05, headR * 1.9 + Math.abs(i - 3) * -0.02, 0.03 + (i % 2) * 0.05);
        sp.rotation.z = (i - 3) * 0.18;
        sp.rotation.x = 0.4;
      }
    }
    // extras
    if (cfg.extra === 'backpack') {
      mesh(new THREE.BoxGeometry(0.34 * bs, 0.4, 0.16), M.extra, chest, 0, torsoH * 0.55, 0.18);
      mesh(B(0.26 * bs, 0.12, 0.06), M.extra, chest, 0, torsoH * 0.3, 0.27);
    } else if (cfg.extra === 'scarf') {
      mesh(new THREE.TorusGeometry(0.1, 0.045, 6, 14), M.extra, chest, 0, torsoH + 0.02, 0).rotation.x = Math.PI / 2;
      mesh(B(0.09, 0.3, 0.03), M.extra, chest, 0.06, torsoH - 0.15, 0.15).rotation.x = 0.3;
    } else if (cfg.extra === 'headphones') {
      mesh(new THREE.TorusGeometry(0.2, 0.025, 6, 16, Math.PI), M.extra, head, 0, headR + 0.02, 0).rotation.y = Math.PI / 2;
      mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 12), M.extra, head, 0.2, headR, 0).rotation.z = Math.PI / 2;
      mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 12), M.extra, head, -0.2, headR, 0).rotation.z = Math.PI / 2;
    } else if (cfg.extra === 'neon') {
      for (const sx of [-0.1, 0.1]) mesh(B(0.025, torsoH * 0.8, 0.02), M.extra, chest, sx * bs, torsoH * 0.5, -0.14);
      mesh(B(0.3 * bs, 0.025, 0.02), M.extra, chest, 0, torsoH * 0.35, -0.14);
    }
    // jetpack on the back (shown while flying)
    const jet = group(chest, 0, torsoH * 0.55, 0.2);
    for (const sx of [-0.1, 0.1]) {
      mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.42, 10), L(0xd8d8d8), jet, sx, 0, 0.02);
      mesh(new THREE.CylinderGeometry(0.08, 0.035, 0.1, 10), L(0xff3b3b), jet, sx, 0.26, 0.02);
      mesh(new THREE.CylinderGeometry(0.045, 0.07, 0.1, 10), L(0x333333), jet, sx, -0.26, 0.02);
    }
    jet.visible = false;

    // arms
    function arm(side) {
      const sh = group(chest, side * 0.25 * bs, torsoH - 0.08, 0);
      mesh(cap(0.06 * bs, 0.2 * hs), M.top, sh, 0, -0.15 * hs, 0);
      const el = group(sh, 0, -0.3 * hs, 0);
      mesh(cap(0.05 * bs, 0.18 * hs), cfg.robot ? M.skin : M.top, el, 0, -0.12 * hs, 0);
      const hand = mesh(new THREE.SphereGeometry(0.06, 8, 6), M.skin, el, 0, -0.27 * hs, 0);
      return { sh, el, hand };
    }
    const armL = arm(1), armR = arm(-1);
    // legs
    function leg(side) {
      const hip = group(hips, side * 0.1 * bs, -0.02, 0);
      mesh(cap(0.08 * bs, 0.27 * hs), M.pants, hip, 0, -0.2 * hs, 0);
      const knee = group(hip, 0, -0.42 * hs, 0);
      mesh(cap(0.065 * bs, 0.26 * hs), M.pants, knee, 0, -0.19 * hs, 0);
      const ankle = group(knee, 0, -0.4 * hs, 0);
      const foot = mesh(B(0.13, 0.09, 0.28), M.shoes, ankle, 0, -0.02, -0.06);
      mesh(B(0.14, 0.03, 0.3), M.sole, ankle, 0, -0.07, -0.06);
      return { hip, knee, ankle, foot };
    }
    const legL = leg(1), legR = leg(-1);

    const J = { root, flip, body, hips, spine, chest, neck, head, armL, armR, legL, legR, jet };
    const base = { hipsY: legLen };
    let bootsOn = false;
    function setBoots(on) {
      if (on === bootsOn) return;
      bootsOn = on;
      for (const l of [legL, legR]) { l.foot.material = on ? M.boots : M.shoes; l.foot.scale.set(on ? 1.2 : 1, on ? 1.8 : 1, on ? 1.1 : 1); }
    }
    function dispose() {
      for (const m of meshes) m.geometry.dispose();
      for (const k in M) M[k].dispose();
    }
    return { J, base, meshes, setBoots, dispose, cfg };
  }

  // reset joints to the standing pose
  function rest(J, base) {
    J.flip.rotation.set(0, 0, 0);
    J.body.position.set(0, -J.flip.position.y, 0);
    J.body.rotation.set(0, 0, 0);
    J.hips.position.y = base.hipsY;
    J.hips.rotation.set(0, 0, 0);
    J.spine.rotation.set(0, 0, 0);
    J.chest.rotation.set(0, 0, 0);
    J.neck.rotation.set(0, 0, 0);
    for (const a of [J.armL, J.armR]) { a.sh.rotation.set(0, 0, 0); a.el.rotation.set(0, 0, 0); }
    for (const l of [J.legL, J.legR]) { l.hip.rotation.set(0, 0, 0); l.knee.rotation.set(0, 0, 0); l.ankle.rotation.set(0, 0, 0); }
  }

  // the pose for this moment; s - { mode, phase, t, k, lean, air, ... }
  function pose(runner, s) {
    const J = runner.J, base = runner.base;
    rest(J, base);
    const sin = Math.sin, cos = Math.cos;
    const set = (a, sh, el, shz = 0) => { a.sh.rotation.x = sh; a.el.rotation.x = el; a.sh.rotation.z = shz; };
    const legs = (l, hip, knee, ankle = 0) => { l.hip.rotation.x = hip; l.knee.rotation.x = knee; l.ankle.rotation.x = ankle; };
    J.jet.visible = s.mode === 'jet';
    J.body.rotation.z = s.lean || 0;
    switch (s.mode) {
      case 'run': {
        const p = s.phase;
        const a = sin(p), c = cos(p);
        legs(J.legL, 0.9 * a, -(0.25 + 1.25 * Math.max(0, c)), 0.3 * Math.max(0, -a));
        legs(J.legR, -0.9 * a, -(0.25 + 1.25 * Math.max(0, -c)), 0.3 * Math.max(0, a));
        set(J.armL, -0.85 * a, 1.35, -0.12);
        set(J.armR, 0.85 * a, 1.35, 0.12);
        J.spine.rotation.x = -0.22;
        J.chest.rotation.y = 0.18 * a;
        J.hips.rotation.y = -0.12 * a;
        J.neck.rotation.x = 0.12;
        J.hips.position.y = base.hipsY - 0.02 + 0.06 * Math.abs(sin(p));
        if (s.stumble) { J.armL.sh.rotation.z = -0.9 - 0.6 * sin(s.t * 22); J.armR.sh.rotation.z = 0.9 + 0.6 * sin(s.t * 19); J.spine.rotation.x = -0.05 + 0.15 * sin(s.t * 25); }
        break;
      }
      case 'jump': {
        const k = s.k;                          // 0 take-off .. 1 landing
        const tuck = Math.sin(Math.min(1, k) * Math.PI);
        legs(J.legL, 0.4 + 0.9 * tuck, -0.5 - 1.3 * tuck, 0.2);
        legs(J.legR, -0.35 + 0.6 * tuck, -0.4 - 0.9 * tuck, 0.3);
        set(J.armL, 2.2 - 0.6 * k, 0.4, -0.35);
        set(J.armR, -0.6 + 1.2 * tuck, 0.9, 0.35);
        J.spine.rotation.x = -0.15 - 0.2 * tuck;
        if (s.flip) J.flip.rotation.x = -Math.PI * 2 * Math.min(1, Math.max(0, k * 1.05));
        break;
      }
      case 'fall': {
        legs(J.legL, 0.3, -0.5); legs(J.legR, -0.2, -0.3);
        set(J.armL, 2.6, 0.3, -0.6); set(J.armR, 2.4, 0.3, 0.6);
        J.spine.rotation.x = 0.05;
        break;
      }
      case 'slide': {
        const k = Math.min(1, s.k * 5);
        J.hips.position.y = base.hipsY - (base.hipsY - 0.34) * k;
        J.flip.rotation.x = 0;
        J.spine.rotation.x = 1.0 * k;
        J.neck.rotation.x = -0.6 * k;
        legs(J.legL, 1.45 * k, -0.15 * k, -0.3); legs(J.legR, 1.2 * k, -0.9 * k, 0);
        set(J.armL, -0.4 * k, 0.6, -0.5 * k); set(J.armR, 0.8 * k, 0.8, 0.4 * k);
        break;
      }
      case 'board': {
        const p = s.phase;
        J.hips.rotation.y = 0.8;
        J.chest.rotation.y = -0.55;
        J.hips.position.y = base.hipsY - 0.12 + 0.02 * sin(p * 0.5);
        legs(J.legL, 0.45, -0.75, 0.25); legs(J.legR, 0.25, -0.6, 0.2);
        J.legL.hip.rotation.z = 0.15; J.legR.hip.rotation.z = -0.15;
        set(J.armL, 0.3, 0.4, -1.1 + 0.1 * sin(p * 0.7)); set(J.armR, 0.2, 0.5, 1.0 + 0.1 * sin(p * 0.6));
        J.spine.rotation.x = -0.15;
        break;
      }
      case 'jet': {
        legs(J.legL, 0.15 + 0.15 * sin(s.t * 6), -0.55, 0.3); legs(J.legR, -0.05 + 0.15 * sin(s.t * 6 + 1), -0.75, 0.3);
        set(J.armL, 0.9, 1.4, -0.2); set(J.armR, 0.9, 1.4, 0.2);
        J.spine.rotation.x = -0.45;
        J.neck.rotation.x = 0.35;
        break;
      }
      case 'crash': {
        const k = Math.min(1, s.k * 2.5);
        const e = 1 - (1 - k) * (1 - k);
        J.flip.rotation.x = s.pit ? 0 : 1.45 * e;
        J.body.position.z = s.pit ? 0 : 0.9 * e;
        J.body.position.y = J.body.position.y + (s.pit ? -1.1 * e : -0.55 * e);
        set(J.armL, 2.4 * e + sin(s.t * 14) * 0.3 * (1 - k), 0.3, -1.2 * e);
        set(J.armR, 2.2 * e + sin(s.t * 12) * 0.3 * (1 - k), 0.4, 1.2 * e);
        legs(J.legL, 0.6 * e, -0.9 * e); legs(J.legR, 0.2 * e, -0.3 * e);
        J.legL.hip.rotation.z = 0.3 * e; J.legR.hip.rotation.z = -0.3 * e;
        J.neck.rotation.x = -0.4 * e;
        break;
      }
      case 'idle': {
        const b = sin(s.t * 2.2);
        J.hips.position.y = base.hipsY - 0.01 * (1 + b);
        J.chest.rotation.x = 0.02 * b;
        set(J.armL, 0.05, 0.2, -0.12);
        const wave = (s.t % 6) < 1.6;
        if (wave) { J.armR.sh.rotation.z = 2.5; J.armR.el.rotation.z = 0; J.armR.el.rotation.x = 0.4 + 0.5 * sin(s.t * 12); }
        else set(J.armR, 0.05, 0.2, 0.12);
        legs(J.legL, 0.05, -0.08); legs(J.legR, -0.05, -0.05);
        J.legL.hip.rotation.z = 0.06; J.legR.hip.rotation.z = -0.06;
        J.neck.rotation.y = 0.25 * sin(s.t * 0.7);
        break;
      }
      default: break;
    }
    if (s.squash) J.body.scale.set(1 + s.squash * 0.5, 1 - s.squash, 1 + s.squash * 0.5); else J.body.scale.set(1, 1, 1);
  }

  // ---------- the hoverboard ----------
  function boardTexture(cfg) {
    const hex = (n) => '#' + n.toString(16).padStart(6, '0');
    return G.canvasTex(256, 64, (g, w, h) => {
      g.fillStyle = hex(cfg.base); g.fillRect(0, 0, w, h);
      const r = G.prng(cfg.id.length * 31 + 7);
      const A = hex(cfg.a), Bc = hex(cfg.b);
      if (cfg.pattern === 'stripes') { g.fillStyle = A; g.fillRect(0, 20, w, 9); g.fillStyle = Bc; g.fillRect(0, 34, w, 9); }
      else if (cfg.pattern === 'flames') {
        for (let i = 0; i < 9; i++) { g.fillStyle = i % 2 ? A : Bc; g.beginPath(); const x = i * 26; g.moveTo(x, h); g.quadraticCurveTo(x + 18, h * 0.3, x + 6, 0); g.quadraticCurveTo(x + 40, h * 0.4, x + 30, h); g.fill(); }
      } else if (cfg.pattern === 'waves') {
        for (let k = 0; k < 3; k++) { g.strokeStyle = k % 2 ? A : Bc; g.lineWidth = 6; g.beginPath(); for (let x = 0; x <= w; x += 4) g.lineTo(x, 18 + k * 14 + Math.sin(x / 16 + k) * 6); g.stroke(); }
      } else if (cfg.pattern === 'stars') {
        for (let i = 0; i < 26; i++) { g.fillStyle = r() < 0.5 ? A : Bc; const x = r() * w, y = r() * h, s = 2 + r() * 5; g.beginPath(); for (let k = 0; k < 10; k++) { const a = k * Math.PI / 5, rr = k % 2 ? s * 0.45 : s; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.fill(); }
      } else if (cfg.pattern === 'grid') {
        g.strokeStyle = A; g.lineWidth = 2;
        for (let x = 0; x < w; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
        g.strokeStyle = Bc;
        for (let y = 8; y < h; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      } else if (cfg.pattern === 'checker') {
        for (let y = 0; y < h; y += 16) for (let x = 0; x < w; x += 16) if ((x + y) / 16 % 2 === 0) { g.fillStyle = A; g.fillRect(x, y, 16, 16); }
        g.fillStyle = Bc; g.fillRect(0, 0, w, 4); g.fillRect(0, h - 4, w, 4);
      }
    });
  }
  function createBoard(cfg) {
    const grp = new THREE.Group();
    const tex = boardTexture(cfg);
    const top = new THREE.MeshLambertMaterial({ map: tex, emissive: cfg.glow ? 0x223344 : 0x000000 });
    const edge = new THREE.MeshLambertMaterial({ color: cfg.a });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.07, 1.3), [edge, edge, top, edge, edge, edge]);
    deck.castShadow = true;
    grp.add(deck);
    for (const z of [-0.65, 0.65]) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.07, 18, 1, false, z < 0 ? Math.PI / 2 : -Math.PI / 2, Math.PI), [edge, top, edge]);
      c.position.z = z;
      grp.add(c);
    }
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.9), new THREE.MeshBasicMaterial({ color: cfg.b, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = -0.09;
    grp.add(glow);
    grp.userData = { glow, cfg, dispose() { tex.dispose(); top.dispose(); edge.dispose(); } };
    return grp;
  }

  root.RRActors = { createWorldActors, createRunner, pose, createBoard, obstacleGeos, PASSENGER, FREIGHT };
})(typeof self !== 'undefined' ? self : this);
