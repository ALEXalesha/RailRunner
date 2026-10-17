// RailRunner scenery: the track and what stands around it, district by district - the city by
// day, the industrial zone at sunset, the bridge over the river at dusk, the tunnel and the
// neon city at night - plus catenary, signals and stations. The world is cut into SEG-metre
// segments; a segment always looks the same (hash of its number), and every kind of thing is
// one instanced pool (one draw call). Core x (right) is three.js -x: the camera looks along +z.
(function (root) {
  'use strict';
  const THREE = root.THREE;
  const R = root.RRCore;
  const G = root.RRGfx;
  const K = R.C;
  const SEG = 12;
  const WALL_X = K.LANE_W * 1.5 + 1.15;
  // The contact wire hangs higher than anything the player reaches: a super jump from a train
  // roof (feet at 6.6 m, head at 8.3 m), the jetpack (feet at 7.2 m, head at 8.9 m) and the
  // camera that follows them (up to 9.5 m). In 2.0.0 the wire hung at 5.85 m: on a roof the
  // camera sat 0.15 m above it and the black wire covered the runner, a jump went through it.
  const CATENARY_WIRE_Y = 10.2;
  const CATENARY_LOW = CATENARY_WIRE_Y - 0.05;   // the lowest part over the tracks (droppers)
  // The tunnel vault (its ribs) is higher still: the wires run under it. In 2.0.0 the ribs were
  // at 7.3 m - a super jump from a roof put the camera inside a rib (the screen went brown) and
  // on a jetpack the camera flew above the tunnel roof, the runner was not seen at all.
  const TUNNEL_LOW = CATENARY_WIRE_Y + 0.7;

  // ---------- looks: light and colours of every district (and the second lap's morning) ----------
  const LOOKS = {
    city: {
      top: 0x4f9fe0, horizon: 0xcfe8f6, fog: 0xc6e2f2, fogNear: 55, fogFar: 185, hemiSky: 0xffffff, hemiGround: 0x8f8470, hemi: 0.95,
      sun: 0xfff1d8, sunI: 1.45, sunDir: [-0.45, 0.85, 0.35], sunGlow: 1, stars: 0, cloud: 0.55,
      ground: 0x9a968d, wall: 0xb9b3a8, bed: 0x8d8478, windows: 0, lamps: 0.15, neon: 0.25, water: 0x3f7fa8, skyline: 0x9fb7c9,
    },
    morning: {
      top: 0x6f9fd8, horizon: 0xffd2b0, fog: 0xf0d6c4, fogNear: 50, fogFar: 175, hemiSky: 0xfff0e0, hemiGround: 0x8a7a6a, hemi: 0.9,
      sun: 0xffd2a0, sunI: 1.3, sunDir: [0.6, 0.45, 0.6], sunGlow: 1.2, stars: 0, cloud: 0.45,
      ground: 0x9a9088, wall: 0xc2b5a8, bed: 0x8d8478, windows: 0.15, lamps: 0.3, neon: 0.35, water: 0x5a7fa0, skyline: 0xc9b2b0,
    },
    industrial: {
      top: 0x34477e, horizon: 0xff9a55, fog: 0xd9976a, fogNear: 42, fogFar: 165, hemiSky: 0xffd0a8, hemiGround: 0x5a4a3a, hemi: 0.82,
      sun: 0xffa060, sunI: 1.25, sunDir: [-0.85, 0.22, 0.55], sunGlow: 1.6, stars: 0, cloud: 0.6,
      ground: 0x8a7458, wall: 0xa8968a, bed: 0x7d7064, windows: 0.35, lamps: 0.6, neon: 0.5, water: 0x6a5a6a, skyline: 0x8a5a5a,
    },
    bridge: {
      top: 0x1f2c5e, horizon: 0xd98877, fog: 0x7a6e90, fogNear: 50, fogFar: 200, hemiSky: 0xb8a8e0, hemiGround: 0x3a3450, hemi: 0.78,
      sun: 0xffb08a, sunI: 0.75, sunDir: [0.75, 0.12, 0.6], sunGlow: 1.3, stars: 0.25, cloud: 0.45,
      ground: 0x6a6470, wall: 0x8a8494, bed: 0x6d6670, windows: 0.75, lamps: 1, neon: 0.8, water: 0x2d4a78, skyline: 0x4a4466,
    },
    tunnel: {
      top: 0x15161c, horizon: 0x2a2620, fog: 0x1d1a16, fogNear: 22, fogFar: 105, hemiSky: 0xffe0b0, hemiGround: 0x3a342c, hemi: 0.85,
      sun: 0xffd9a0, sunI: 0.35, sunDir: [0.1, 1, 0.2], sunGlow: 0, stars: 0, cloud: 0,
      ground: 0x4a4640, wall: 0x6a645a, bed: 0x4d4840, windows: 1, lamps: 1, neon: 1, water: 0x111111, skyline: 0x111111,
    },
    neon: {
      top: 0x050716, horizon: 0x2c1646, fog: 0x1c1232, fogNear: 30, fogFar: 160, hemiSky: 0x6a5ac8, hemiGround: 0x1b1424, hemi: 0.62,
      sun: 0x9fb4ff, sunI: 0.42, sunDir: [-0.3, 0.7, 0.6], sunGlow: 0.35, stars: 1, cloud: 0.25,
      ground: 0x34303c, wall: 0x4a4556, bed: 0x34313a, windows: 1, lamps: 1, neon: 1.3, water: 0x101a30, skyline: 0x241a3a,
    },
  };
  const COLOR_KEYS = ['top', 'horizon', 'fog', 'hemiSky', 'hemiGround', 'sun', 'ground', 'wall', 'bed', 'water', 'skyline'];
  const NUM_KEYS = ['fogNear', 'fogFar', 'hemi', 'sunI', 'sunGlow', 'stars', 'cloud', 'windows', 'lamps', 'neon'];
  const lookOf = (d) => (d.kind === 'city' && d.lap > 0 && d.lap % 2 === 1 ? 'morning' : d.kind);
  const _ca = new THREE.Color(), _cb = new THREE.Color();
  function blendLook(a, b, k) {
    const out = {};
    for (const key of COLOR_KEYS) out[key] = _ca.set(a[key]).lerp(_cb.set(b[key]), k).getHex();
    for (const key of NUM_KEYS) out[key] = a[key] + (b[key] - a[key]) * k;
    out.sunDir = a.sunDir.map((v, i) => v + (b.sunDir[i] - v) * k);
    return out;
  }
  // the look at the player: district, its weather, smooth change over 70 m at the borders
  function lookAt(world, z) {
    const d = R.districtAt(world, z);
    const BL = 70;
    let look = LOOKS[lookOf(d)], rain = d.weather === 'rain' ? 1 : 0, fog = d.weather === 'fog' ? 1 : 0;
    if (z > d.z1 - BL) {
      const n = R.districtAt(world, d.z1 + 1);
      const k = (z - (d.z1 - BL)) / BL;
      look = blendLook(look, LOOKS[lookOf(n)], k * 0.5);
      rain += ((n.weather === 'rain' ? 1 : 0) - rain) * k * 0.5;
      fog += ((n.weather === 'fog' ? 1 : 0) - fog) * k * 0.5;
    } else if (z < d.z0 + BL && d.z0 > -100) {
      const p = R.districtAt(world, d.z0 - 1);
      const k = 0.5 - (z - d.z0) / BL * 0.5;
      look = blendLook(look, LOOKS[lookOf(p)], k);
      rain += ((p.weather === 'rain' ? 1 : 0) - rain) * k;
      fog += ((p.weather === 'fog' ? 1 : 0) - fog) * k;
    } else look = blendLook(look, look, 0);
    if (rain > 0) {
      const dark = { top: 0x4a5566, horizon: 0x8a96a4, fog: 0x8792a0, fogNear: 30, fogFar: 120, sunI: look.sunI * 0.35, sunGlow: 0, cloud: 1, hemi: look.hemi * 0.85 };
      for (const key of Object.keys(dark)) {
        if (COLOR_KEYS.includes(key)) look[key] = _ca.set(look[key]).lerp(_cb.set(dark[key]), rain * (d.kind === 'neon' ? 0.3 : 0.7)).getHex();
        else look[key] += (dark[key] - look[key]) * rain * 0.8;
      }
    }
    if (fog > 0) { look.fogNear *= 1 - 0.7 * fog; look.fogFar *= 1 - 0.45 * fog; look.cloud = Math.min(1, look.cloud + fog * 0.4); }
    look.rain = rain;
    look.fogAmt = fog;
    look.district = d.kind;
    return look;
  }

  // ---------- textures ----------
  function textures(lang) {
    const T = {};
    T.gravel = G.canvasTex(256, 256, (g, w, h) => G.noiseFill(g, w, h, '#ffffff', 160, 5000, 7), { repeat: [10, 60] });
    T.bed = G.canvasTex(128, 256, (g, w, h) => {
      G.noiseFill(g, w, h, '#ffffff', 200, 2600, 11);
    }, { repeat: [1, 120] });
    T.concrete = G.canvasTex(256, 256, (g, w, h) => {
      G.noiseFill(g, w, h, '#f0f0f0', 70, 3000, 21);
      g.fillStyle = 'rgba(0,0,0,0.12)';
      for (let x = 0; x < w; x += 64) g.fillRect(x, 0, 2, h);
      g.fillStyle = 'rgba(0,0,0,0.08)'; g.fillRect(0, h - 18, w, 18);
    }, { wrap: true });
    // windows: 4 x 4 per tile, 4 m x 3.2 m of a facade; the lit ones are the emissive map
    const winMap = (lit) => G.canvasTex(256, 256, (g, w, h) => {
      const r = G.prng(lit ? 5 : 3);
      g.fillStyle = lit ? '#000000' : '#ffffff'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        const px = x * 64 + 10, py = y * 64 + 12;
        if (lit) {
          if (r() < 0.42) { const c = ['#ffd27a', '#ffe9b0', '#ffc46a', '#cfe6ff'][Math.floor(r() * 4)]; g.fillStyle = c; g.fillRect(px, py, 44, 36); }
        } else {
          g.fillStyle = 'rgba(0,0,0,0.14)'; g.fillRect(px - 4, py - 4, 52, 46);
          g.fillStyle = r() < 0.5 ? '#4f6178' : '#3e4e63'; g.fillRect(px, py, 44, 36);
          g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(px + 3, py + 3, 14, 10);
          g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(px + 21, py, 2, 36);
          g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(px - 4, py + 40, 52, 4);
        }
      }
    }, { wrap: true });
    T.windows = winMap(false);
    T.windowsLit = winMap(true);
    T.corrugated = G.canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 8) { g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x, 0, 3, h); g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(x + 4, 0, 1, h); }
      const r = G.prng(4);
      for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(120,60,20,${r() * 0.15})`; g.fillRect(r() * w, r() * h, 2 + r() * 8, 2 + r() * 12); }
    }, { wrap: true });
    T.bands = G.canvasTex(64, 256, (g, w, h) => {
      for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#ffffff' : '#d23a2a'; g.fillRect(0, i * 32, w, 32); }
    }, { wrap: true });
    T.water = G.canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
      const r = G.prng(8);
      for (let i = 0; i < 260; i++) {
        g.strokeStyle = `rgba(255,255,255,${0.2 + r() * 0.4})`;
        g.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.12})`;
        const x = r() * w, y = r() * h, l = 8 + r() * 26;
        g.fillRect(x, y, l, 2);
      }
    }, { repeat: [40, 40] });
    // graffiti: bubble letters and shapes, made up here
    const WORDS = ['РЕЛЬС', 'ХОП', 'RUN', 'ДЕПО', 'GO!', 'ВОЛНА', 'ZIP', 'БЕГИ'];
    const PAL = [['#ff3bb4', '#ffe14f'], ['#16f0ff', '#2a2aff'], ['#7dff4f', '#1b6b1b'], ['#ff8c1a', '#7a1fd1'], ['#ffffff', '#ff3b3b'], ['#ffe14f', '#0b6fb8'], ['#c46bff', '#16f0ff'], ['#ff5a5a', '#1d1d22']];
    T.graffiti = G.atlas(4, 2, 256, (g, x, y, w, h, i) => {
      const r = G.prng(100 + i);
      g.clearRect(x, y, w, h);
      const [a, b] = PAL[i];
      for (let k = 0; k < 5; k++) { g.fillStyle = a + '55'; g.beginPath(); g.ellipse(x + r() * w, y + h * (0.3 + r() * 0.4), 20 + r() * 40, 10 + r() * 20, r() * 3, 0, 7); g.fill(); }
      g.font = `900 ${Math.round(h * 0.42)}px Arial Black, Arial, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.save(); g.translate(x + w / 2, y + h / 2); g.rotate((r() - 0.5) * 0.25);
      g.lineJoin = 'round';
      g.lineWidth = 18; g.strokeStyle = '#111111'; g.strokeText(WORDS[i], 0, 0);
      g.lineWidth = 9; g.strokeStyle = b; g.strokeText(WORDS[i], 0, 0);
      g.fillStyle = a; g.fillText(WORDS[i], 0, 0);
      g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect(-w * 0.35, -h * 0.12, w * 0.7, 4);
      for (let k = 0; k < 6; k++) { g.fillStyle = a; g.fillRect(-w * 0.4 + r() * w * 0.8, h * 0.12, 4, 10 + r() * 30); }
      g.restore();
    });
    // billboards: invented goods and slogans
    const ADS = [
      ['СОК «ЛЕТО»', '#ff8c1a', '#fff1a8'], ['КИНО 3D', '#1d1d40', '#16f0ff'], ['RAIL TV', '#d23a2a', '#ffffff'], ['ЧАЙ ГОРА', '#2f9e6a', '#e8ffe8'],
      ['БЕГИ!', '#7a1fd1', '#ffe14f'], ['ПИЦЦА 24', '#ffcf2e', '#b5121b'], ['МОРЕ', '#0b6fb8', '#ffffff'], ['GAME ON', '#111111', '#7dff4f'],
    ];
    T.ads = G.atlas(4, 2, 256, (g, x, y, w, h, i) => {
      const [txt, bg, fg] = ADS[i];
      const gr = g.createLinearGradient(x, y, x, y + h);
      gr.addColorStop(0, bg); gr.addColorStop(1, '#000000');
      g.fillStyle = gr; g.fillRect(x, y, w, h);
      g.fillStyle = fg;
      g.globalAlpha = 0.25; g.beginPath(); g.arc(x + w * 0.78, y + h * 0.3, h * 0.35, 0, 7); g.fill(); g.globalAlpha = 1;
      g.font = `900 ${Math.round(h * 0.2)}px Arial, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(txt, x + w / 2, y + h * 0.62);
      g.fillRect(x + w * 0.2, y + h * 0.78, w * 0.6, 4);
      g.strokeStyle = '#ffffff'; g.lineWidth = 6; g.strokeRect(x + 3, y + 3, w - 6, h - 6);
    });
    // neon signs: outlines that glow
    const NEON = [['КАФЕ', '#ff3bb4'], ['24/7', '#16f0ff'], ['♥', '#ff5a8a'], ['ОТЕЛЬ', '#c46bff'], ['★', '#ffe14f'], ['БАР', '#16f0ff'], ['→', '#7dff4f'], ['НЕОН', '#ff8c1a']];
    T.neon = G.atlas(4, 2, 256, (g, x, y, w, h, i) => {
      const [txt, c] = NEON[i];
      g.fillStyle = '#05050a'; g.fillRect(x, y, w, h);
      g.font = `700 ${Math.round(h * (txt.length > 3 ? 0.28 : 0.55))}px Arial, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowColor = c; g.shadowBlur = 24;
      g.strokeStyle = c; g.lineWidth = 8; g.strokeText(txt, x + w / 2, y + h / 2);
      g.fillStyle = '#ffffff'; g.fillText(txt, x + w / 2, y + h / 2);
      g.shadowBlur = 0;
      g.strokeStyle = c; g.lineWidth = 5; g.strokeRect(x + 14, y + 14, w - 28, h - 28);
    });
    T.stations = stationTex(lang);
    return T;
  }
  const STATIONS = {
    ru: ['Заречная', 'Депо', 'Северная', 'Парковая', 'Мостовая', 'Сортировочная', 'Огни', 'Тоннельная'],
    en: ['Riverside', 'Depot', 'North', 'Park', 'Bridge St', 'Freight Yard', 'Lights', 'Tunnel'],
  };
  function stationTex(lang) {
    const names = STATIONS[lang] || STATIONS.en;
    return G.atlas(2, 4, 256, (g, x, y, w, h, i) => {
      g.fillStyle = '#1c4f8f'; g.fillRect(x, y, w, h);
      g.fillStyle = '#ffffff';
      g.font = `700 ${Math.round(h * 0.22)}px Arial, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(names[i], x + w / 2, y + h * 0.5, w * 0.92);
      g.fillStyle = '#ffd23a'; g.fillRect(x, y + h * 0.82, w, h * 0.08);
    });
  }

  // ---------- geometries ----------
  function geometries() {
    const Gm = {};
    const unit = () => new THREE.BoxGeometry(1, 1, 1);
    Gm.box = unit();
    Gm.plane = new THREE.PlaneGeometry(1, 1);
    // a warehouse: box with a gable roof (unit size, scaled per instance)
    Gm.shed = G.merge([
      G.box(1, 0.78, 1, 0xffffff, [0, 0.39, 0]),
      G.part(new THREE.CylinderGeometry(0.5, 0.5, 1, 3, 1), 0xd8d8d8, { p: [0, 0.78, 0], r: [Math.PI / 2, 0, Math.PI / 2], s: [1, 1, 0.44] }),
      G.box(0.18, 0.4, 0.02, 0x3a3a3a, [0.2, 0.2, -0.51]),
    ]);
    Gm.tank = G.merge([
      G.cyl(1, 1, 1, 16, 0xe8e8e8, [0, 0.5, 0]),
      G.sphere(1, 0xdadada, [0, 1, 0], [1, 0.25, 1], 16, 6),
      G.box(0.06, 1.1, 0.08, 0x777777, [0, 0.55, -1.0]),
      G.cyl(1.03, 1.03, 0.03, 16, 0x9a9a9a, [0, 0.98, 0]),
    ]);
    Gm.chimney = new THREE.CylinderGeometry(0.75, 1, 1, 14, 1, true);
    Gm.chimney.translate(0, 0.5, 0);
    Gm.crane = G.merge([
      G.box(0.6, 18, 0.6, 0xf2b705, [-6, 9, 0]), G.box(0.6, 18, 0.6, 0xf2b705, [6, 9, 0]),
      G.box(14, 1.0, 1.2, 0xf2b705, [0, 18, 0]), G.box(2, 1.6, 2, 0xd9a400, [2, 16.9, 0]),
      G.box(0.08, 9, 0.08, 0x333333, [2, 11.5, 0]), G.box(1.4, 0.6, 1.4, 0x555555, [2, 7, 0]),
      G.box(2.4, 0.5, 0.8, 0x333333, [-6, 0.25, 0]), G.box(2.4, 0.5, 0.8, 0x333333, [6, 0.25, 0]),
    ]);
    Gm.tree = G.merge([
      G.cyl(0.14, 0.2, 2.2, 6, 0x6b4a2e, [0, 1.1, 0]),
      G.sphere(1.25, 0x3e8a3a, [0, 2.9, 0], [1, 0.95, 1], 9, 7),
      G.sphere(0.9, 0x4f9e44, [0.5, 3.5, 0.3], [1, 1, 1], 8, 6),
    ]);
    Gm.roofBits = G.merge([
      G.cyl(0.9, 0.9, 1.6, 10, 0x8a6a4a, [0, 1.4, 0]), G.cyl(1, 0.2, 0.6, 10, 0x6a4a2a, [0, 2.5, 0]),
      G.box(0.1, 0.8, 0.1, 0x555555, [-0.6, 0.4, -0.6]), G.box(0.1, 0.8, 0.1, 0x555555, [0.6, 0.4, 0.6]),
      G.box(1.6, 0.8, 1.2, 0xb0b0b0, [2.2, 0.4, 0.5]), G.cyl(0.4, 0.4, 0.1, 10, 0x444444, [2.2, 0.82, 0.5]),
    ]);
    // a lamp post on the track side: pole, arm over the tracks, head (glow is separate)
    Gm.lamp = G.merge([
      G.cyl(0.07, 0.1, 6.2, 6, 0x6d757d, [0, 3.1, 0]),
      G.box(1.3, 0.08, 0.08, 0x6d757d, [-0.62, 6.1, 0]),
      G.box(0.5, 0.12, 0.26, 0x4a5056, [-1.25, 6.0, 0]),
    ]);
    Gm.glow = new THREE.SphereGeometry(0.16, 8, 6);
    // a catenary gantry across the three tracks: everything over the tracks is higher than
    // CATENARY_LOW (see there)
    const C0 = CATENARY_WIRE_Y;
    const gant = [
      G.box(0.32, C0 + 1.35, 0.32, 0x7d858d, [-5.0, (C0 + 1.35) / 2, 0]), G.box(0.32, C0 + 1.35, 0.32, 0x7d858d, [5.0, (C0 + 1.35) / 2, 0]),
      G.box(10.6, 0.3, 0.3, 0x7d858d, [0, C0 + 1.05, 0]), G.box(10.6, 0.12, 0.12, 0x7d858d, [0, C0 + 0.6, 0]),
    ];
    for (const lx of [-K.LANE_W, 0, K.LANE_W]) {
      gant.push(G.box(0.04, 0.8, 0.04, 0x444444, [lx, C0 + 0.35, 0]));
      gant.push(G.cyl(0.07, 0.07, 0.25, 6, 0x9b5a3a, [lx, C0 + 0.75, 0]));
    }
    Gm.gantry = G.merge(gant);
    // a signal: pole, head with three lights facing the player (lights separate)
    Gm.signal = G.merge([
      G.cyl(0.06, 0.08, 3.6, 6, 0x5a6066, [0, 1.8, 0]),
      G.box(0.42, 1.2, 0.3, 0x1a1c20, [0, 3.7, 0]),
      G.box(0.6, 1.4, 0.03, 0x111111, [0, 3.7, 0.15]),
      G.box(0.5, 0.05, 0.4, 0x5a6066, [0, 3.15, 0]),
    ]);
    // a station platform, one segment long, on the +x side (built for side +1, mirrored for -1)
    const plat = [
      G.box(5.0, 1.1, SEG, 0xbdb6aa, [2.5, 0.55, 0]),
      G.box(0.4, 0.03, SEG, 0xffd23a, [0.3, 1.11, 0]),
      G.box(0.12, 3.2, 0.12, 0x8a9096, [3.6, 2.7, -3]), G.box(0.12, 3.2, 0.12, 0x8a9096, [3.6, 2.7, 3]),
      G.box(4.4, 0.18, SEG, 0x9aa3ad, [2.6, 4.35, 0]),
      G.box(4.6, 0.06, SEG, 0x6a737d, [2.6, 4.48, 0]),
      G.box(0.5, 0.08, 2.0, 0x6b4a2e, [3.9, 1.55, 0]), G.box(0.08, 0.5, 2.0, 0x6b4a2e, [4.15, 1.8, 0]),
      G.box(0.08, 0.45, 0.08, 0x333333, [3.8, 1.32, -0.8]), G.box(0.08, 0.45, 0.08, 0x333333, [3.8, 1.32, 0.8]),
      G.box(0.25, 1.0, 0.25, 0x2e7dd1, [4.2, 1.6, 4.5]),
    ];
    Gm.platform = G.merge(plat);
    // tunnel: walls, ceiling and a rib, one segment
    const TV = TUNNEL_LOW;          // the ribs' bottom; the ceiling 0.5 m above it
    Gm.tunnel = G.merge([
      G.box(1.2, TV + 1.7, SEG, 0x8a8478, [-6.0, (TV + 1.7) / 2, 0]), G.box(1.2, TV + 1.7, SEG, 0x8a8478, [6.0, (TV + 1.7) / 2, 0]),
      G.box(13.2, 1.2, SEG, 0x7a746a, [0, TV + 1.1, 0]),
      G.box(0.6, TV + 0.6, 0.8, 0x6a645a, [-5.3, (TV + 0.6) / 2, 0]), G.box(0.6, TV + 0.6, 0.8, 0x6a645a, [5.3, (TV + 0.6) / 2, 0]), G.box(11.2, 0.6, 0.8, 0x6a645a, [0, TV + 0.3, 0]),
      G.box(0.15, 0.25, SEG, 0x3a3a3a, [-5.25, 2.2, 0]), G.box(0.15, 0.25, SEG, 0x3a3a3a, [5.25, 2.2, 0]),
      G.box(0.1, 0.12, SEG, 0x2a2a2a, [-5.25, 2.6, 0]), G.box(0.1, 0.12, SEG, 0x2a2a2a, [5.25, 2.6, 0]),
    ]);
    // a portal: the hill face with an opening for the tracks
    Gm.portal = G.merge([
      G.box(40, 30, 6, 0x6f6a5f, [-25.6, 15, 3]), G.box(40, 30, 6, 0x6f6a5f, [25.6, 15, 3]),
      G.box(11.2, 30 - (TV + 0.6), 6, 0x6f6a5f, [0, (30 + TV + 0.6) / 2, 3]),
      G.box(12.4, 1.2, 0.8, 0x9a948a, [0, TV + 0.6, -0.2]), G.box(1.2, TV + 1.2, 0.8, 0x9a948a, [-6.2, (TV + 1.2) / 2, -0.2]), G.box(1.2, TV + 1.2, 0.8, 0x9a948a, [6.2, (TV + 1.2) / 2, -0.2]),
      G.box(90, 12, 30, 0x4f6b3a, [0, 32, 18], null, {}), G.box(70, 10, 30, 0x5a7a40, [0, 40, 30]),
    ]);
    // bridge: truss on one side of a segment and the deck
    const T = 0x5d6b7c;
    Gm.truss = G.merge([
      G.box(0.35, 7, 0.35, T, [0, 3.5, -SEG / 2 + 0.2]),
      G.part(new THREE.BoxGeometry(0.25, Math.hypot(SEG, 6.6), 0.25), T, { p: [0, 3.5, 0], r: [Math.atan2(SEG, 6.6), 0, 0] }),
      G.box(0.45, 0.45, SEG, T, [0, 7.0, 0]),
      G.box(0.45, 0.6, SEG, T, [0, 0.0, 0]),
      G.box(0.06, 0.06, SEG, 0xa0a8b0, [0, 1.0, 0]),
      G.box(0.08, 1.0, 0.08, 0xa0a8b0, [0, 0.5, 0]),
    ]);
    Gm.deck = G.merge([
      G.box(10.4, 1.4, SEG, 0x6b6e72, [0, -0.72, 0]),
      G.box(9.2, 1.4, SEG, 0x55585c, [0, -2.1, 0]),
      G.box(1.0, 0.25, SEG, 0x9aa0a6, [-5.0, 0.1, 0]), G.box(1.0, 0.25, SEG, 0x9aa0a6, [5.0, 0.1, 0]),
    ]);
    Gm.pier = G.merge([G.box(7, 1, 3.4, 0x8a857a, [0, -0.5, 0]), G.box(8.4, 0.08, 4.2, 0x6a655a, [0, -0.02, 0])]);
    return Gm;
  }

  // ---------- the scenery object ----------
  function create(scene, opts = {}) {
    const T = textures(opts.lang || 'ru');
    const Gm = geometries();
    const L = (o) => new THREE.MeshLambertMaterial(o);
    const VC = { vertexColors: true };
    const mats = {
      ground: L({ map: T.gravel }),
      bed: L({ map: T.bed, color: 0x8d8478 }),
      wall: L({ map: T.concrete }),
      building: L({ map: T.windows, emissiveMap: T.windowsLit, emissive: 0x000000 }),
      roof: L({}),
      vc: L(VC),
      vcShadow: L(VC),
      graffiti: L({ map: T.graffiti, transparent: true, alphaTest: 0.1, depthWrite: true, polygonOffset: true, polygonOffsetFactor: -2 }),
      ads: L({ map: T.ads, emissiveMap: T.ads, emissive: 0x000000 }),
      neon: new THREE.MeshBasicMaterial({ map: T.neon }),
      glow: new THREE.MeshBasicMaterial({ color: 0xffffff }),
      corrugated: L({ map: T.corrugated }),
      chimney: L({ map: T.bands }),
      station: L({ map: T.stations, emissiveMap: T.stations, emissive: 0x000000 }),
      water: L({ map: T.water, color: 0x3f7fa8 }),
      skyline: new THREE.MeshBasicMaterial({ color: 0x9fb7c9, fog: true }),
      rail: new THREE.MeshLambertMaterial({ color: 0xc7ced6 }),
      wire: new THREE.MeshBasicMaterial({ color: 0x222222 }),
      sleeper: L({ color: 0x6b4f3a }),
    };
    const cast = opts.shadows !== false;
    const P = {};
    const pool = (name, geo, mat, cap, o) => (P[name] = new G.Pool(scene, geo, mat, cap, o));
    const SEGS = Math.ceil((opts.ahead + opts.behind) / SEG) + 3;
    const N2 = SEGS * 2;
    pool('ground', Gm.box, mats.ground, N2, { color: true, receive: true });
    pool('wall', Gm.box, mats.wall, N2, { color: true, uvt: true, receive: true });
    pool('graffiti', Gm.plane, mats.graffiti, N2 * 2, { uvt: true });
    pool('building', Gm.box, mats.building, N2 * 2, { color: true, uvt: true });
    pool('roof', Gm.box, mats.roof, N2 * 2, { color: true });
    pool('roofBits', Gm.roofBits, mats.vc, N2);
    pool('ads', Gm.plane, mats.ads, N2, { uvt: true });
    pool('neon', Gm.plane, mats.neon, N2 * 2, { uvt: true });
    pool('tree', Gm.tree, mats.vcShadow, N2 * 2, { cast });
    pool('lamp', Gm.lamp, mats.vc, N2);
    pool('glow', Gm.glow, mats.glow, N2 + SEGS * 4, { color: true });
    pool('shed', Gm.shed, mats.corrugated, N2, { color: true, uvt: true });
    pool('container', Gm.box, mats.corrugated, N2 * 3, { color: true, uvt: true });
    pool('tank', Gm.tank, mats.vc, N2);
    pool('chimney', Gm.chimney, mats.chimney, N2, { uvt: true });
    pool('crane', Gm.crane, mats.vc, N2);
    pool('gantry', Gm.gantry, mats.vc, SEGS);
    pool('signal', Gm.signal, mats.vc, SEGS);
    pool('platform', Gm.platform, mats.vcShadow, SEGS, { receive: true });
    pool('station', Gm.plane, mats.station, SEGS, { uvt: true });
    pool('tunnel', Gm.tunnel, mats.vc, SEGS, { receive: true });
    pool('portal', Gm.portal, mats.vc, 4);
    pool('truss', Gm.truss, mats.vc, N2);
    pool('deck', Gm.deck, mats.vc, SEGS);
    pool('pier', Gm.pier, mats.vc, SEGS);

    // ---------- the track (moves with the player; textures shift back so the ground stays) ----------
    const track = new THREE.Group();
    scene.add(track);
    const LEN = 420;
    const base = new THREE.Mesh(new THREE.PlaneGeometry(WALL_X * 2, LEN), mats.ground);
    base.rotation.x = -Math.PI / 2;
    base.position.y = -0.03;
    base.receiveShadow = true;
    track.add(base);
    for (const lane of [-1, 0, 1]) {
      const bed = new THREE.Mesh(new THREE.PlaneGeometry(2.1, LEN), mats.bed);
      bed.rotation.x = -Math.PI / 2;
      bed.position.set(-lane * K.LANE_W, 0.0, 0);
      bed.receiveShadow = true;
      track.add(bed);
    }
    const rails = [];
    for (const lane of [-1, 0, 1]) for (const s of [-0.62, 0.62]) {
      rails.push(G.box(0.08, 0.13, LEN, 0xffffff, [-lane * K.LANE_W + s, 0.1, 0]));
      rails.push(G.box(0.16, 0.03, LEN, 0xdddddd, [-lane * K.LANE_W + s, 0.03, 0]));
    }
    const railMesh = new THREE.Mesh(G.merge(rails), new THREE.MeshLambertMaterial({ vertexColors: true, color: 0xc7ced6 }));
    railMesh.receiveShadow = true;
    track.add(railMesh);
    mats.rail = railMesh.material;
    const wires = [];
    for (const lx of [-K.LANE_W, 0, K.LANE_W]) {
      wires.push(G.box(0.03, 0.03, LEN, 0x222222, [lx, CATENARY_WIRE_Y, 0]));
      wires.push(G.box(0.025, 0.025, LEN, 0x222222, [lx, CATENARY_WIRE_Y + 0.6, 0]));
    }
    const wireMesh = new THREE.Mesh(G.merge(wires), new THREE.MeshBasicMaterial({ vertexColors: true }));
    wireMesh.name = 'catenary-wires';
    P.gantry.mesh.name = 'catenary-gantry';
    P.tunnel.mesh.name = 'tunnel-vault';
    P.portal.mesh.name = 'tunnel-portal';
    track.add(wireMesh);
    const SLEEPER_STEP = 1.1, SLEEPERS = Math.ceil((opts.ahead + opts.behind + 10) / SLEEPER_STEP);
    const sleepers = new THREE.InstancedMesh(new THREE.BoxGeometry(1.75, 0.08, 0.24), mats.sleeper, SLEEPERS * 3);
    {
      const m = new THREE.Matrix4();
      let i = 0;
      for (const lane of [-1, 0, 1]) for (let k = 0; k < SLEEPERS; k++) { m.makeTranslation(-lane * K.LANE_W, 0.04, k * SLEEPER_STEP - opts.behind - 4); sleepers.setMatrixAt(i++, m); }
    }
    sleepers.frustumCulled = false;
    sleepers.receiveShadow = true;
    scene.add(sleepers);

    // water far below (seen from the bridge) and a skyline far away (both follow the camera)
    const water = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), mats.water);
    water.rotation.x = -Math.PI / 2;
    water.position.y = -9;
    scene.add(water);
    const sky = [];
    const sr = G.prng(77);
    for (const side of [-1, 1]) {
      for (let z = -150; z < 380; z += 14 + sr() * 18) {
        const h = 18 + sr() * 55, w = 10 + sr() * 22;
        sky.push(G.box(w, h, 12 + sr() * 10, 0xffffff, [side * (120 + sr() * 60), h / 2 - 10, z]));
      }
    }
    for (let i = 0; i < 6; i++) sky.push(G.sphere(70, 0xffffff, [(i - 2.5) * 70, -40, 330], [1.4, 0.7, 0.5], 10, 6));
    const skyline = new THREE.Mesh(G.merge(sky), mats.skyline);
    skyline.material.vertexColors = false;
    skyline.frustumCulled = false;
    scene.add(skyline);

    // ---------- dressing segments ----------
    const H = (n, k) => G.hash3(n, k, 17);
    const smoke = [];                     // chimney tops for smoke particles
    let shown = null;
    let detail = 1;
    const PAL = {
      city: [0xe9c9a0, 0xd8a48f, 0xb7c9d6, 0xe2d6c0, 0xc9b8e0, 0xa8c8b0],
      morning: [0xf0d0b8, 0xe0b8a8, 0xc8d0e0, 0xeadcc8],
      industrial: [0x8a6a5a, 0x7a7a70, 0x9a8a70, 0x6a7078],
      bridge: [0x5a5a6a, 0x4a5060, 0x6a5a60],
      neon: [0x3a3550, 0x2f3a4f, 0x45394a, 0x2b3242, 0x3a2a4a],
      tunnel: [0x555555],
    };
    const CONTAINERS = [0xc0392b, 0x2e7dd1, 0x3aa35b, 0xe0a526, 0x8a5bd1, 0xd8762a, 0x5d6b7c];

    function dressSide(world, n, s, d, zc) {
      const kind = d.kind;
      const pal = PAL[lookOf(d)] || PAL.city;
      const h = (k) => H(n * 2 + (s > 0 ? 1 : 0), k);
      const station = (kind === 'city' || kind === 'neon') && s > 0 && ((n % 45) + 45) % 45 < 5;
      if (kind === 'bridge') {
        P.truss.add(s * 5.0, 0, zc, s > 0 ? 0 : Math.PI);
        if (s > 0) { P.deck.add(0, 0, zc); if (n % 4 === 0) P.pier.add(0, -2.8, zc, 0, 1, 7.6, 1); }
        if (n % 2 === 0) { P.lamp.add(s * 4.9, 0, zc, s > 0 ? 0 : Math.PI); P.glow.add(s * 3.65, 6.0, zc, 0, 1, 1, 1, 0xffe0a0); }
        return;
      }
      if (kind === 'tunnel') {
        if (s > 0) {
          P.tunnel.add(0, 0, zc);
          P.glow.add(5.05, 4.6, zc, 0, 1.4, 0.6, 2.6, 0xffd9a0);
          P.glow.add(-5.05, 4.6, zc, 0, 1.4, 0.6, 2.6, 0xffd9a0);
        }
        P.ground.add(s * (WALL_X + 0.8), -0.15, zc, 0, 1.7, 0.3, SEG, null);
        return;
      }
      P.ground.add(s * (WALL_X + 75), -0.16, zc, 0, 150, 0.3, SEG, null);
      // wall with graffiti
      const wh = kind === 'industrial' ? 1.7 : 1.25;
      if (!station) {
        P.wall.add(s * WALL_X, wh / 2, zc, 0, 0.35, wh, SEG, null, [0, 0, SEG / 4, wh / 4]);
        const gp = kind === 'industrial' ? 0.6 : kind === 'neon' ? 0.45 : 0.3;
        if (h(1) < gp) {
          const len = 3.4 + h(2) * 2.2;
          P.graffiti.add(s * (WALL_X - 0.19), wh * 0.52, zc + (h(3) - 0.5) * (SEG - len), s > 0 ? -Math.PI / 2 : Math.PI / 2, len, wh * 0.92, 1, null, G.tileUv(Math.floor(h(4) * 8), 4, 2));
        }
      } else {
        P.platform.add(s * (WALL_X - 0.2), 0, zc, s > 0 ? 0 : Math.PI);
        if (((n % 45) + 45) % 45 === 2) P.station.add(s * (WALL_X + 0.1), 3.4, zc, s > 0 ? -Math.PI / 2 : Math.PI / 2, 3.6, 0.9, 1, null, G.tileUv(Math.floor(H(Math.floor(n / 45), 9) * 8), 2, 4));
      }
      // lamp posts
      if (n % 2 === (s > 0 ? 0 : 1) && !station) {
        P.lamp.add(s * (WALL_X + 0.5), 0, zc, s > 0 ? 0 : Math.PI);
        P.glow.add(s * (WALL_X + 0.5 - 1.25), 5.88, zc, 0, 1.2, 0.5, 1.2, kind === 'neon' ? (h(5) < 0.5 ? 0xff7ad8 : 0x7af0ff) : 0xfff1c4);
      }
      const back = station ? 6.5 : 0;
      if (kind === 'industrial') {
        const r = h(6);
        const x0 = s * (WALL_X + 4 + back);
        if (r < 0.42) {
          const w = 10 + h(7) * 10, ht = 6 + h(8) * 6, len = SEG - 0.6;
          P.shed.add(x0 + s * (w / 2 + h(9) * 4), 0, zc, 0, w, ht, len, pal[Math.floor(h(10) * pal.length)], [0, 0, len / 3, ht / 3]);
        } else if (r < 0.68) {
          const cols = 1 + Math.floor(h(11) * 3);
          for (let i = 0; i < cols; i++) {
            const stack = 1 + Math.floor(h(12 + i) * 3);
            for (let j = 0; j < stack; j++) P.container.add(x0 + s * (2 + i * 2.7), 1.3 + j * 2.6, zc + (h(20 + i) - 0.5) * 3, 0, 2.4, 2.6, 6, CONTAINERS[Math.floor(h(30 + i * 3 + j) * CONTAINERS.length)], [0, 0, 2, 1]);
          }
        } else if (r < 0.84) {
          const rad = 3 + h(13) * 2.5, ht = 6 + h(14) * 6;
          P.tank.add(x0 + s * (rad + 1 + h(15) * 3), 0, zc, h(16) * 6, rad, ht, rad);
        } else if (r < 0.93 && detail > 0) {
          const ht = 26 + h(17) * 18, x = x0 + s * (6 + h(18) * 6);
          P.chimney.add(x, 0, zc, 0, 1.5, ht, 1.5, null, [0, 0, 1, ht / 8]);
          smoke.push([x, ht, zc]);
        } else {
          P.crane.add(x0 + s * 10, 0, zc, s > 0 ? 0 : Math.PI);
        }
        return;
      }
      // city and neon: a building per segment side, trees in front of some
      if (kind === 'city' && h(19) < 0.32 && detail > 0) {
        P.tree.add(s * (WALL_X + 2.2 + back), 0, zc + (h(20) - 0.5) * 6, h(21) * 6, 0.8 + h(22) * 0.5, 0.8 + h(23) * 0.5, 0.8 + h(22) * 0.5);
      }
      const bd = 7 + h(24) * 8, bw = SEG - 1 - h(25) * 2.5;
      const bh = (kind === 'neon' ? 14 : 9) + h(26) * (kind === 'neon' ? 26 : 20);
      const bx = s * (WALL_X + 4.2 + back + bd / 2 + h(27) * 3);
      P.building.add(bx, bh / 2, zc, 0, bd, bh, bw, pal[Math.floor(h(28) * pal.length)], [0, 0, Math.max(1, Math.round(bw / 4)), Math.max(1, Math.round(bh / 3.2))]);
      P.roof.add(bx, bh + 0.15, zc, 0, bd + 0.4, 0.3, bw + 0.4, kind === 'neon' ? 0x1a1824 : 0x6a625a);
      if (detail > 0 && h(29) < 0.45) P.roofBits.add(bx + (h(30) - 0.5) * bd * 0.4, bh + 0.3, zc + (h(31) - 0.5) * bw * 0.4, h(32) * 6);
      const face = bx - s * (bd / 2 + 0.03);
      if (kind === 'city' && h(33) < 0.2 && bh > 13) {
        P.ads.add(face, bh * 0.62, zc, s > 0 ? -Math.PI / 2 : Math.PI / 2, 6, 6, 1, null, G.tileUv(Math.floor(h(34) * 8), 4, 2));
      }
      if (kind === 'neon') {
        const k = 1 + Math.floor(h(35) * 2);
        for (let i = 0; i < k; i++) {
          const sz = 2.4 + h(36 + i) * 2.4;
          P.neon.add(face, 3 + h(38 + i) * (bh - 6), zc + (i - (k - 1) / 2) * 4.5, s > 0 ? -Math.PI / 2 : Math.PI / 2, sz, sz, 1, null, G.tileUv(Math.floor(h(40 + i) * 8), 4, 2));
        }
      }
    }

    function dressCommon(world, n, d, zc) {
      if (d.kind !== 'tunnel' && n % 3 === 0) P.gantry.add(0, 0, zc - SEG / 2 + 1);
      if (n % 9 === 4 && d.kind !== 'bridge') {
        const sx = n % 18 === 4 ? 1 : -1;
        P.signal.add(sx * 3.9, 0, zc, 0);
        const c = [0xff3030, 0xffc020, 0x30ff60][Math.floor(G.hash3(n, 3, 5) * 3)];
        P.glow.add(sx * 3.9, 3.7 + (c === 0xff3030 ? 0.35 : c === 0xffc020 ? 0 : -0.35), zc - 0.17, 0, 0.9, 0.9, 0.3, c);
      }
      // tunnel portals: before the first tunnel segment and after the last one
      if (d.kind === 'tunnel') {
        if (R.districtAt(world, zc - SEG).kind !== 'tunnel') P.portal.add(0, 0, n * SEG - 6, 0);
        if (R.districtAt(world, zc + SEG).kind !== 'tunnel') P.portal.add(0, 0, (n + 1) * SEG + 6, Math.PI);
      }
    }

    function update(world, pz, force) {
      const first = Math.floor((pz - opts.behind) / SEG) - 1;
      if (!force && first === shown) return;
      shown = first;
      for (const k in P) P[k].reset();
      smoke.length = 0;
      for (let i = 0; i < SEGS; i++) {
        const n = first + i;
        const zc = n * SEG + SEG / 2;
        const d = R.districtAt(world, zc);
        dressSide(world, n, 1, d, zc);
        dressSide(world, n, -1, d, zc);
        dressCommon(world, n, d, zc);
      }
      for (const k in P) P[k].done();
    }

    // the track follows the player; pz - the player's z, cam - the camera position
    function follow(pz, camZ, t) {
      track.position.z = pz + 150;
      T.gravel.offset.y = -(((pz + 150) / (LEN / 60)) % 1);
      T.bed.offset.y = -(((pz + 150) * 120 / LEN) % 1);
      sleepers.position.z = Math.floor(pz / SLEEPER_STEP) * SLEEPER_STEP;
      water.position.set(0, -9, camZ + 200);
      T.water.offset.set(t * 0.004, -((camZ + 200) / (900 / 40)) % 1 + t * 0.01);
      skyline.position.set(0, 0, camZ);
    }

    function setLook(look) {
      mats.ground.color.set(look.ground);
      mats.wall.color.set(look.wall);
      mats.bed.color.set(look.bed);
      mats.water.color.set(look.water);
      mats.skyline.color.set(look.skyline);
      skyline.visible = look.district !== 'tunnel' || false;
      const w = Math.min(1, look.windows);
      mats.building.emissive.setScalar(w * 0.72);
      mats.ads.emissive.setScalar(0.15 + 0.6 * w);
      mats.station.emissive.setScalar(0.1 + 0.5 * w);
      mats.neon.color.setScalar(Math.min(1.2, 0.35 + look.neon * 0.7));
      mats.glow.color.setScalar(0.35 + 0.65 * Math.min(1, look.lamps));
    }

    function setDetail(level) { if (level !== detail) { detail = level; shown = null; } }
    function setLang(lang) {
      const t = stationTex(lang);
      mats.station.map = t; mats.station.emissiveMap = t; mats.station.needsUpdate = true;
      T.stations.dispose(); T.stations = t;
    }

    // the shop shows the runner from the front: catenary gantries and wires would hang across
    function setShowcase(on) { wireMesh.visible = !on; P.gantry.mesh.visible = !on && P.gantry.n > 0; P.signal.mesh.visible = !on && P.signal.n > 0; }

    return { update, follow, setLook, setDetail, setLang, setShowcase, smoke, pools: P, mats, track, water, skyline };
  }

  root.RRScenery = { create, lookAt, LOOKS, SEG, CATENARY_LOW };
})(typeof self !== 'undefined' ? self : this);
