// The 3D view of RailRunner (three.js from web/vendor, nothing from the network).
//
// It only draws: the state comes from RRCore (a run), the renderer never changes it.
// Core x (positive = right) becomes three.js -x, because the camera looks along +z.
// Everything that repeats is pooled: trains, hurdles, bars, buildings, lamps; coins and
// sleepers are instanced meshes - about a hundred draw calls in a busy frame.
(function (root) {
  'use strict';
  const THREE = root.THREE;
  const K = root.RRCore.C;
  const VIEW_AHEAD = 165;
  const VIEW_BEHIND = 14;

  const THEMES = {
    light: {
      sky: 0x9fd4f2, fog: 0xbfe2f5, fogNear: 45, fogFar: 160,
      hemiSky: 0xffffff, hemiGround: 0x8f8470, hemi: 1.05, sun: 0xfff2dc, sunI: 1.25,
      ground: 0xc7b79c, bed: 0x8d8478, wall: 0xb4ada2, rail: 0xb9c2cc, sleeper: 0x6b4f3a,
      buildings: [0xe9c9a0, 0xd8a48f, 0xb7c9d6, 0xe2d6c0], windowsLit: false, lamps: 0.15,
    },
    dark: {
      sky: 0x0d1430, fog: 0x0d1430, fogNear: 30, fogFar: 140,
      hemiSky: 0x5466a8, hemiGround: 0x1b1b26, hemi: 0.75, sun: 0x9fb4ff, sunI: 0.45,
      ground: 0x4a4650, bed: 0x34313a, wall: 0x4f4b57, rail: 0x8d97a6, sleeper: 0x3b2c22,
      buildings: [0x3a3550, 0x2f3a4f, 0x45394a, 0x2b3242], windowsLit: true, lamps: 1,
    },
  };
  const TRAIN_COLORS = [0x2e7dd1, 0x3aa35b, 0xe0a526, 0x8a5bd1, 0xd8443a];

  // ---------- canvas textures ----------
  function canvasTex(w, h, draw, repeat) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
    t.anisotropy = 4;
    return t;
  }
  function noiseFill(g, w, h, base, spread, n, seed) {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    let s = seed;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < n; i++) {
      const v = Math.floor(spread * (r() - 0.5));
      g.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${Math.abs(v) / 255})`;
      g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3);
    }
  }
  const TEX = {};
  function makeTextures() {
    TEX.gravel = canvasTex(256, 256, (g, w, h) => noiseFill(g, w, h, '#ffffff', 160, 5000, 7), [8, 80]);
    TEX.bed = canvasTex(128, 128, (g, w, h) => noiseFill(g, w, h, '#ffffff', 200, 1800, 11), [1, 120]);
    TEX.trainSide = canvasTex(512, 128, (g, w, h) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, h * 0.78, w, h * 0.08);
      g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(0, h * 0.7, w, h * 0.05);
      for (let i = 0; i < 6; i++) {
        g.fillStyle = '#1d2a3a';
        g.fillRect(24 + i * 82, h * 0.2, 58, h * 0.36);
        g.fillStyle = 'rgba(255,255,255,0.25)';
        g.fillRect(28 + i * 82, h * 0.22, 18, h * 0.1);
      }
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 0, w, 4); g.fillRect(0, h - 6, w, 6);
    });
    TEX.trainFront = canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#1d2a3a'; g.fillRect(14, 18, w - 28, 44);
      g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(20, 22, 30, 12);
      g.fillStyle = '#fff6c0'; g.beginPath(); g.arc(28, 92, 10, 0, 7); g.arc(w - 28, 92, 10, 0, 7); g.fill();
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, h - 10, w, 10);
    });
    TEX.trainFrontLit = canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = '#000000'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#fff3a0'; g.beginPath(); g.arc(28, 92, 12, 0, 7); g.arc(w - 28, 92, 12, 0, 7); g.fill();
      g.fillStyle = '#3c5a78'; g.fillRect(14, 18, w - 28, 44);
    });
    TEX.hazard = canvasTex(256, 64, (g, w, h) => {
      g.fillStyle = '#f5c518'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#1a1a1a';
      for (let x = -h; x < w + h; x += 40) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 20, 0); g.lineTo(x + 20 - h, h); g.lineTo(x - h, h); g.fill(); }
    });
    TEX.barSign = canvasTex(256, 192, (g, w, h) => {
      g.fillStyle = '#f5c518'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#1a1a1a';
      for (let x = -h; x < w + h; x += 48) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 24, 0); g.lineTo(x + 24 - 40, 40); g.lineTo(x - 40, 40); g.fill(); }
      for (let x = -h; x < w + h; x += 48) { g.beginPath(); g.moveTo(x, h - 40); g.lineTo(x + 24, h - 40); g.lineTo(x + 24 - 40, h); g.lineTo(x - 40, h); g.fill(); }
      g.fillStyle = '#ffffff'; g.fillRect(70, 52, 116, 88);
      g.fillStyle = '#d23a2a';
      g.beginPath(); g.moveTo(128, 132); g.lineTo(96, 92); g.lineTo(116, 92); g.lineTo(116, 60); g.lineTo(140, 60); g.lineTo(140, 92); g.lineTo(160, 92); g.fill();
    });
    TEX.hurdle = canvasTex(256, 64, (g, w, h) => {
      for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#ffffff' : '#d8342a'; g.fillRect(i * 32, 0, 32, h); }
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, h - 6, w, 6);
    });
    TEX.ramp = canvasTex(64, 256, (g, w, h) => {
      g.fillStyle = '#5b636e'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#727b87';
      for (let y = 0; y < h; y += 16) g.fillRect(0, y, w, 6);
      g.fillStyle = '#f5c518'; g.fillRect(0, 0, 6, h); g.fillRect(w - 6, 0, 6, h);
    });
    TEX.windows = canvasTex(128, 256, (g, w, h) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
      let s = 3;
      const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      for (let y = 10; y < h - 10; y += 22) for (let x = 10; x < w - 10; x += 26) {
        g.fillStyle = r() < 0.5 ? '#5a6b80' : '#46566a';
        g.fillRect(x, y, 16, 14);
      }
    }, [1, 1]);
    TEX.windowsLit = canvasTex(128, 256, (g, w, h) => {
      g.fillStyle = '#000000'; g.fillRect(0, 0, w, h);
      let s = 5;
      const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      for (let y = 10; y < h - 10; y += 22) for (let x = 10; x < w - 10; x += 26) {
        if (r() < 0.45) { g.fillStyle = r() < 0.5 ? '#ffd27a' : '#ffe9b0'; g.fillRect(x, y, 16, 14); }
      }
    }, [1, 1]);
    TEX.blob = canvasTex(64, 64, (g, w, h) => {
      const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30);
      gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
    TEX.x2 = canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = '#ffcf2e'; g.beginPath(); g.arc(64, 64, 60, 0, 7); g.fill();
      g.fillStyle = '#b5121b'; g.font = 'bold 64px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('x2', 64, 68);
    });
    TEX.board = canvasTex(256, 64, (g, w, h) => {
      g.fillStyle = '#7d3cff'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#ff4fb8'; g.fillRect(0, 22, w, 8);
      g.fillStyle = '#4fe3ff'; g.fillRect(0, 34, w, 8);
    });
  }

  // a wedge from height 0 at z=0 to height H at z=L, width W (centred on x)
  function rampGeometry(W, H, L) {
    const hw = W / 2;
    const v = [
      // slope
      -hw, 0, 0, hw, 0, 0, hw, H, L, -hw, 0, 0, hw, H, L, -hw, H, L,
      // left side
      -hw, 0, 0, -hw, H, L, -hw, 0, L,
      // right side
      hw, 0, 0, hw, 0, L, hw, H, L,
    ];
    const uv = [0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1, 1, 1, 0, 0, 0, 1, 0, 1, 1];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    return g;
  }

  function create(canvas, opts = {}) {
    makeTextures();
    const quality = opts.quality || 'high';
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality === 'high', powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.preserve });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 400);
    const hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 1);
    const sun = new THREE.DirectionalLight(0xffffff, 1);
    sun.position.set(-6, 14, -4);
    scene.add(hemi, sun, sun.target);
    scene.fog = new THREE.Fog(0xffffff, 40, 160);

    const lambert = (o) => new THREE.MeshLambertMaterial(o);
    const M = {
      ground: lambert({ map: TEX.gravel }),
      bed: lambert({ map: TEX.bed }),
      rail: lambert({ color: 0xb9c2cc }),
      sleeper: lambert({ color: 0x6b4f3a }),
      post: lambert({ color: 0x8b939c }),
      hurdle: lambert({ map: TEX.hurdle }),
      bar: lambert({ map: TEX.barSign }),
      hazard: lambert({ map: TEX.hazard }),
      ramp: lambert({ map: TEX.ramp }),
      coin: lambert({ color: 0xffc928, emissive: 0x6b4a00 }),
      lamp: new THREE.MeshBasicMaterial({ color: 0xfff1c4 }),
      blob: new THREE.MeshBasicMaterial({ map: TEX.blob, transparent: true, depthWrite: false }),
      roof: lambert({ color: 0x9aa3ad }),
    };
    M.buildings = [lambert({ map: TEX.windows, emissiveMap: TEX.windowsLit, emissive: 0x000000 })];
    M.trains = TRAIN_COLORS.map((c, i) => {
      const side = lambert({ map: TEX.trainSide, color: c });
      const front = lambert({ map: TEX.trainFront, color: c, emissiveMap: TEX.trainFrontLit, emissive: i === 4 ? 0xffffff : 0x000000 });
      const roof = lambert({ color: new THREE.Color(c).multiplyScalar(0.7) });
      const plain = lambert({ color: new THREE.Color(c).multiplyScalar(0.85) });
      // box faces: +x, -x, +y, -y, +z (back), -z (front, towards the player)
      return { head: [side, side, roof, plain, plain, front], body: [side, side, roof, plain, plain, plain] };
    });

    // ---------- track and ground (they move with the player) ----------
    const track = new THREE.Group();
    scene.add(track);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(90, 400), M.ground);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    track.add(ground);
    const rails = [];
    for (const lane of [-1, 0, 1]) {
      const bed = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 400), M.bed);
      bed.rotation.x = -Math.PI / 2;
      bed.position.set(-lane * K.LANE_W, 0.0, 0);
      track.add(bed);
      for (const s of [-0.62, 0.62]) {
        const r = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 400), M.rail);
        r.position.set(-lane * K.LANE_W + s, 0.1, 0);
        track.add(r);
        rails.push(r);
      }
    }
    // low concrete walls along the track
    const wallMat = lambert({ color: 0xa9a49a });
    M.wall = wallMat;
    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.9, 400), wallMat);
      wall.position.set(side * (K.LANE_W * 1.5 + 1.15), 0.45, 0);
      track.add(wall);
    }
    const SLEEPER_STEP = 1.1, SLEEPERS = 170;
    const sleepers = new THREE.InstancedMesh(new THREE.BoxGeometry(1.7, 0.07, 0.24), M.sleeper, SLEEPERS * 3);
    {
      const m = new THREE.Matrix4();
      let i = 0;
      for (const lane of [-1, 0, 1]) for (let k = 0; k < SLEEPERS; k++) { m.makeTranslation(-lane * K.LANE_W, 0.035, k * SLEEPER_STEP - VIEW_BEHIND); sleepers.setMatrixAt(i++, m); }
    }
    sleepers.frustumCulled = false;
    scene.add(sleepers);

    // ---------- scenery: buildings and lamps by segment number (always the same for a place) ----------
    const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3(), tmpE = new THREE.Euler();
    const SEG = 14;
    const hash = (n) => { let x = Math.imul(n ^ 0x5bd1e995, 0x27d4eb2d); x ^= x >>> 15; return ((x >>> 0) % 10000) / 10000; };
    // instanced: all buildings are one draw call, poles, arms and lamps - one each
    const SEGS = Math.ceil((VIEW_AHEAD + VIEW_BEHIND) / SEG) + 2;
    const N = SEGS * 2;
    const buildings = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), M.buildings[0], N);
    const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.09, 5.2, 6), M.post, N);
    const arms = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.08, 0.08), M.post, N);
    const lamps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 8, 6), M.lamp, N);
    for (const m of [buildings, poles, arms, lamps]) { m.frustumCulled = false; scene.add(m); }
    const bColor = new THREE.Color();
    let palette = [0xffffff, 0xffffff, 0xffffff, 0xffffff];
    function placeScenery(pz) {
      const first = Math.floor((pz - VIEW_BEHIND) / SEG);
      const id = new THREE.Quaternion();
      for (let s = 0; s < SEGS; s++) {
        const n = first + s;
        for (let side = 0; side < 2; side++) {
          const i = s * 2 + side;
          const h = hash(n * 2 + side);
          const height = 5 + h * 13, width = 5 + hash(n * 7 + side) * 4, depth = SEG - 1.5 - hash(n * 3 + side) * 3;
          const dir = side ? 1 : -1;
          tmpP.set(dir * (K.LANE_W * 1.5 + 5.5 + width / 2 + hash(n * 11 + side) * 3), height / 2, n * SEG + SEG / 2);
          tmpS.set(width, height, depth);
          tmpM.compose(tmpP, id, tmpS);
          buildings.setMatrixAt(i, tmpM);
          buildings.setColorAt(i, bColor.set(palette[Math.floor(hash(n * 5 + side) * 4) % 4]));
          const lx = dir * (K.LANE_W * 1.5 + 1.6), lz = n * SEG + 3;
          tmpS.set(1, 1, 1);
          tmpM.compose(tmpP.set(lx, 2.6, lz), id, tmpS); poles.setMatrixAt(i, tmpM);
          tmpM.compose(tmpP.set(lx - dir * 0.45, 5.1, lz), id, tmpS); arms.setMatrixAt(i, tmpM);
          tmpM.compose(tmpP.set(lx - dir * 0.85, 5.0, lz), id, tmpS); lamps.setMatrixAt(i, tmpM);
        }
      }
      for (const m of [buildings, poles, arms, lamps]) m.instanceMatrix.needsUpdate = true;
      buildings.instanceColor.needsUpdate = true;
    }

    // ---------- pools of obstacles ----------
    const carGeo = new THREE.BoxGeometry(K.TRAIN_HALF_W * 2, K.TRAIN_H, K.CAR_LEN);
    const pools = { hurdle: [], bar: [], ramp: [], train: [] };
    const used = new Map();          // obstacle id -> object
    function makeObject(type) {
      const g = new THREE.Group();
      if (type === 'hurdle') {
        for (const s of [-0.8, 0.8]) {
          const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, K.HURDLE_H, 0.12), M.post);
          p.position.set(s, K.HURDLE_H / 2, 0.15);
          g.add(p);
        }
        for (const y of [0.48, 0.8]) {
          const b = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.26, 0.08), M.hurdle);
          b.position.set(0, y, 0.1);
          g.add(b);
        }
      } else if (type === 'bar') {
        for (const s of [-0.95, 0.95]) {
          const p = new THREE.Mesh(new THREE.BoxGeometry(0.16, K.BAR_TOP + 0.3, 0.16), M.post);
          p.position.set(s, (K.BAR_TOP + 0.3) / 2, 0.2);
          g.add(p);
        }
        const sign = new THREE.Mesh(new THREE.BoxGeometry(1.8, K.BAR_TOP - K.BAR_BOTTOM, 0.3), [M.hazard, M.hazard, M.hazard, M.hazard, M.bar, M.bar]);
        sign.position.set(0, (K.BAR_TOP + K.BAR_BOTTOM) / 2, 0.2);
        g.add(sign);
      } else if (type === 'ramp') {
        g.add(new THREE.Mesh(rampGeometry(K.TRAIN_HALF_W * 2, K.TRAIN_H, K.RAMP_LEN), M.ramp));
      } else if (type === 'train') {
        for (let i = 0; i < 3; i++) {
          const car = new THREE.Mesh(carGeo, M.trains[0].body);
          car.position.set(0, K.TRAIN_H / 2, i * (K.CAR_LEN + K.CAR_GAP) + K.CAR_LEN / 2);
          g.add(car);
        }
      }
      g.userData.type = type;
      scene.add(g);
      return g;
    }
    function take(type) {
      const pool = pools[type];
      const g = pool.pop() || makeObject(type);
      g.visible = true;
      return g;
    }
    function release(id) {
      const g = used.get(id);
      g.visible = false;
      pools[g.userData.type].push(g);
      used.delete(id);
    }
    function dressTrain(g, o) {
      const m = M.trains[o.color % M.trains.length];
      g.children.forEach((car, i) => {
        car.visible = i < (o.cars || 1);
        car.material = i === 0 ? m.head : m.body;
      });
    }

    // ---------- coins and power-ups ----------
    const COINS = 700;
    const coinMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.36, 0.36, 0.09, 18), M.coin, COINS);
    coinMesh.frustumCulled = false;
    scene.add(coinMesh);
    const powerObjs = new Map();
    const powerPools = { magnet: [], x2: [], boots: [], board: [] };
    function makePower(kind) {
      const g = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.05, 6, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }));
      g.add(ring);
      if (kind === 'magnet') {
        const red = lambert({ color: 0xe0322c });
        const u = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.1, 8, 16, Math.PI), red);
        u.rotation.z = Math.PI;
        g.add(u);
        for (const s of [-0.3, 0.3]) { const tip = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, 0.2), M.post); tip.position.set(s, 0.08, 0); g.add(tip); }
      } else if (kind === 'x2') {
        const disc = new THREE.Mesh(new THREE.CircleGeometry(0.45, 24), new THREE.MeshBasicMaterial({ map: TEX.x2, side: THREE.DoubleSide }));
        g.add(disc);
      } else if (kind === 'boots') {
        const green = lambert({ color: 0x2fbf5a });
        for (const s of [-0.18, 0.18]) {
          const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.42), green);
          shoe.position.set(s, 0.05, 0);
          const spring = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.025, 4, 10), M.post);
          spring.rotation.x = Math.PI / 2;
          spring.position.set(s, -0.12, 0);
          g.add(shoe, spring);
        }
      } else {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.07, 0.95), lambert({ map: TEX.board }));
        b.rotation.x = -0.5;
        g.add(b);
      }
      g.userData.kind = kind;
      g.userData.ring = ring;
      scene.add(g);
      return g;
    }

    // ---------- the runner ----------
    const P = new THREE.Group();
    P.rotation.y = Math.PI;          // the model is built facing -z; the run goes along +z
    scene.add(P);
    const body = new THREE.Group();
    P.add(body);
    const mat = (c) => lambert({ color: c });
    const skin = mat(0xf1c39b), hoodie = mat(0xff6a2a), pants = mat(0x2b3a67), shoe = mat(0xf4f4f4), cap = mat(0x1f8fff), pack = mat(0x2f9e6a);
    const bootMat = mat(0x2fbf5a);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.3), hoodie);
    torso.position.y = 1.15;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 14, 10), skin);
    head.position.y = 1.63;
    const capTop = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), cap);
    capTop.position.y = 1.67;
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.22), cap);
    brim.position.set(0, 1.68, -0.2);
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.42, 0.16), pack);
    bag.position.set(0, 1.2, 0.22);
    body.add(torso, head, capTop, brim, bag);
    function limb(w, h, m, x, y) {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, 0);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), m);
      mesh.position.y = -h / 2;
      pivot.add(mesh);
      body.add(pivot);
      return pivot;
    }
    const armL = limb(0.12, 0.55, hoodie, 0.32, 1.42), armR = limb(0.12, 0.55, hoodie, -0.32, 1.42);
    const legL = limb(0.17, 0.78, pants, 0.13, 0.85), legR = limb(0.17, 0.78, pants, -0.13, 0.85);
    const feet = [legL, legR].map((leg) => { const f = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.12, 0.32), shoe); f.position.set(0, -0.8, -0.05); leg.add(f); return f; });
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.08, 1.5), lambert({ map: TEX.board, emissive: 0x2a0060 }));
    board.position.y = 0.04;
    P.add(board);
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3), M.blob);
    blob.rotation.x = -Math.PI / 2;
    scene.add(blob);

    // ---------- state of the view ----------
    let theme = 'light';
    let shake = 0;
    const cam = { x: 0, y: 4.5, lx: 0, ly: 1.0 };

    function setTheme(name) {
      theme = THEMES[name] ? name : 'light';
      const t = THEMES[theme];
      scene.background = new THREE.Color(t.sky);
      scene.fog.color.set(t.fog);
      scene.fog.near = t.fogNear;
      scene.fog.far = t.fogFar;
      hemi.color.set(t.hemiSky); hemi.groundColor.set(t.hemiGround); hemi.intensity = t.hemi;
      sun.color.set(t.sun); sun.intensity = t.sunI;
      M.ground.color.set(t.ground);
      M.bed.color.set(t.bed);
      M.rail.color.set(t.rail);
      M.wall.color.set(t.wall);
      M.sleeper.color.set(t.sleeper);
      palette = t.buildings;
      M.buildings[0].emissive.set(t.windowsLit ? 0xffffff : 0x000000);
      M.lamp.color.set(t.lamps > 0.5 ? 0xfff1c4 : 0xd9dde2);
      M.trains.forEach((m, i) => { m.head[5].emissive.set(i === 4 || t.windowsLit ? 0xffffff : 0x000000); });
    }
    function setQuality(q) {
      const dpr = root.devicePixelRatio || 1;
      renderer.setPixelRatio(q === 'low' ? Math.min(1, dpr) * 0.8 : Math.min(dpr, 1.5));
    }
    let width = 1, height = 1;
    function resize(w, h) {
      width = Math.max(1, w); height = Math.max(1, h);
      renderer.setSize(width, height, false);
      const aspect = width / height;
      camera.aspect = aspect;
      // narrow (phone) screens: a wider view keeps all three tracks in sight
      camera.fov = aspect < 1.25 ? Math.min(92, 62 + (1.25 - aspect) * 42) : 62;
      camera.updateProjectionMatrix();
    }
    function kick(power) { shake = Math.max(shake, power); }


    // view: { z, x, y, ... } - the run (with interpolated z/x/y), t - seconds for animations
    function draw(run, view, t, dt) {
      const pz = view.z, px = -view.x, py = view.y;
      // track follows the player; sleepers jump by whole steps (invisible)
      // (the textures are shifted back by the same distance, so the gravel stays in place)
      track.position.z = pz + 150;
      TEX.gravel.offset.y = -(((pz + 150) / 5) % 1);
      TEX.bed.offset.y = -(((pz + 150) * 120 / 400) % 1);
      sleepers.position.z = Math.floor(pz / SLEEPER_STEP) * SLEEPER_STEP;
      placeScenery(pz);

      // obstacles
      const w = run.world;
      const seen = new Set();
      for (const o of w.obstacles) {
        const [a, b] = root.RRCore.extentAt(o, pz);
        if (b < pz - VIEW_BEHIND || a > pz + VIEW_AHEAD || o.broken) continue;
        seen.add(o.id);
        let g = used.get(o.id);
        if (!g) {
          g = take(o.type);
          used.set(o.id, g);
          if (o.type === 'train') dressTrain(g, o);
        }
        g.position.set(-root.RRCore.laneX(o.lane), 0, a);
      }
      for (const id of [...used.keys()]) if (!seen.has(id)) release(id);

      // coins
      let n = 0;
      const spin = t * 3.2;
      for (const c of w.coins) {
        if (c.z > pz + VIEW_AHEAD) break;
        if (c.z < pz - 4 || n >= COINS) continue;
        let x = -root.RRCore.laneX(c.lane), y = c.y, z = c.z, s = 1;
        if (c.taken) {
          const k = (run.t - c.takenAt) / 0.22;
          if (k >= 1 || k < 0) continue;
          x += (px - x) * k; y += (py + 1.1 - y) * k; z = c.z + (pz - c.z) * k; s = 1 - k * 0.7;
        }
        tmpE.set(Math.PI / 2, spin + c.z * 0.3, 0, 'YXZ');
        tmpQ.setFromEuler(tmpE);
        tmpS.set(s, s, s);
        tmpP.set(x, y, z);
        tmpM.compose(tmpP, tmpQ, tmpS);
        coinMesh.setMatrixAt(n++, tmpM);
      }
      coinMesh.count = n;
      coinMesh.instanceMatrix.needsUpdate = true;

      // power-ups
      const seenP = new Set();
      for (const p of w.powers) {
        if (p.taken || p.z < pz - 4 || p.z > pz + VIEW_AHEAD) continue;
        seenP.add(p.id);
        let g = powerObjs.get(p.id);
        if (!g) { g = powerPools[p.kind].pop() || makePower(p.kind); g.visible = true; powerObjs.set(p.id, g); }
        g.position.set(-root.RRCore.laneX(p.lane), p.y + Math.sin(t * 3 + p.z) * 0.12, p.z);
        g.rotation.y = t * 2;
        g.userData.ring.material.opacity = 0.55 + 0.3 * Math.sin(t * 6);
      }
      for (const [id, g] of [...powerObjs]) if (!seenP.has(id)) { g.visible = false; powerPools[g.userData.kind].push(g); powerObjs.delete(id); }

      // the runner
      const sliding = run.slideT > 0 && run.alive;
      P.position.set(px, py, pz);
      const hover = run.power.board > 0;
      board.visible = hover;
      body.position.y = hover ? 0.12 : 0;
      const phase = pz * 1.45;
      const air = !run.grounded;
      const lean = (-root.RRCore.laneX(run.lane) - px) * 0.12;
      if (!run.alive) {
        const k = Math.min(1, view.deadT * 3);
        body.rotation.set(k * 1.25, 0, 0);
        body.position.y = 0.15 * k;
        armL.rotation.x = armR.rotation.x = -2.6 * k;
        legL.rotation.x = legR.rotation.x = 0.3 * k;
      } else if (sliding) {
        body.rotation.set(1.1, 0, lean);
        body.position.y = (hover ? 0.12 : 0) - 0.05;
        armL.rotation.x = armR.rotation.x = -2.2;
        legL.rotation.x = -0.25; legR.rotation.x = -0.05;
      } else if (air) {
        body.rotation.set(-0.1, 0, lean);
        armL.rotation.x = -2.4; armR.rotation.x = -2.0;
        legL.rotation.x = -0.9; legR.rotation.x = 0.3;
      } else {
        const sw = Math.sin(phase);
        body.rotation.set(-0.12 + (run.stumbleT > 0 ? Math.sin(t * 25) * 0.08 : 0), 0, lean);
        armL.rotation.x = sw * 0.9; armR.rotation.x = -sw * 0.9;
        legL.rotation.x = -sw * 0.85; legR.rotation.x = sw * 0.85;
        body.position.y += Math.abs(Math.cos(phase)) * 0.06;
      }
      const boots = run.power.boots > 0;
      feet.forEach((f) => { f.material = boots ? bootMat : shoe; f.scale.y = boots ? 1.6 : 1; });
      // blink while invulnerable
      P.visible = !(run.invulnT > 0 && Math.floor(t * 14) % 2 === 0);
      // shadow on whatever is under the runner
      let sup = 0;
      for (const o of root.RRCore.nearObstacles(run, 2)) {
        if (!root.RRCore.isSupport(o) || o.broken || Math.abs(view.x - root.RRCore.laneX(o.lane)) > 1.2) continue;
        const [a, b] = root.RRCore.extentAt(o, pz);
        if (pz >= a && pz <= b) sup = Math.max(sup, root.RRCore.solidAt(o, pz)[1]);
      }
      blob.position.set(px, sup + 0.03, pz);
      const hgt = Math.max(0, py - sup);
      blob.scale.setScalar(Math.max(0.35, 1 - hgt * 0.2));

      // camera: behind and above, a little lag
      const k = 1 - Math.pow(0.0005, dt || 0.016);
      cam.x += (px * 0.55 - cam.x) * k;
      cam.y += (4.5 + py * 0.5 - cam.y) * k;
      cam.lx += (px * 0.8 - cam.lx) * k;
      cam.ly += (1.0 + py * 0.7 - cam.ly) * k;
      shake *= Math.pow(0.02, dt || 0.016);
      const sx = shake > 0.01 ? (Math.sin(t * 61) * shake) : 0, sy = shake > 0.01 ? (Math.cos(t * 47) * shake) : 0;
      camera.position.set(cam.x + sx, cam.y + sy, pz - 6.8);
      camera.lookAt(cam.lx, cam.ly, pz + 10);
      sun.position.set(-6, 14, pz - 4);
      sun.target.position.set(0, 0, pz + 10);

      renderer.render(scene, camera);
    }

    setTheme('light');
    setQuality(quality);
    return {
      draw, resize, setTheme, setQuality, kick, renderer, scene, camera,
      get theme() { return theme; },
      info: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, objects: used.size, coins: coinMesh.count }),
    };
  }

  root.RRRender = { create, THEMES };
})(typeof self !== 'undefined' ? self : this);
