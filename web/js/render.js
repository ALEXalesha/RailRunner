// The 3D view of RailRunner (three.js from web/vendor, nothing from the network).
//
// It only draws: the state comes from RRCore (a run), the renderer never changes it.
// Core x (positive = right) becomes three.js -x, because the camera looks along +z.
// The parts: gfx.js (helpers), scenery.js (districts and their look), actors.js (trains,
// obstacles, coins, the runner). Here: light, sky, weather, particles, the camera, quality.
(function (root) {
  'use strict';
  const THREE = root.THREE;
  const R = root.RRCore;
  const G = root.RRGfx;
  const S = root.RRScenery;
  const A = root.RRActors;
  const K = R.C;
  const VIEW_AHEAD = 175;
  const VIEW_BEHIND = 16;
  const QUALITY = {
    high: { ratio: 1.5, shadow: 1024, particles: 1, detail: 1 },
    medium: { ratio: 1.0, shadow: 512, particles: 0.7, detail: 1 },
    low: { ratio: 0.75, shadow: 0, particles: 0.35, detail: 0 },
  };

  function create(canvas, opts = {}) {
    let quality = QUALITY[opts.quality] ? opts.quality : 'high';
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== 'low', powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.preserve });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 420);
    const hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 1);
    const sun = new THREE.DirectionalLight(0xffffff, 1);
    sun.shadow.camera.left = -16; sun.shadow.camera.right = 16;
    sun.shadow.camera.top = 22; sun.shadow.camera.bottom = -22;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 80;
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.03;
    scene.add(hemi, sun, sun.target);
    scene.fog = new THREE.Fog(0xffffff, 40, 160);
    const sky = G.skyDome();
    scene.add(sky);

    let settings = { shadows: opts.shadows !== false, particles: opts.particles || 'high', shake: opts.shake !== false };
    const scenery = S.create(scene, { lang: opts.lang, ahead: VIEW_AHEAD, behind: VIEW_BEHIND, shadows: true });
    const actors = A.createWorldActors(scene, { shadows: true });

    // ---------- the runner and the board ----------
    const P = new THREE.Group();
    P.rotation.y = Math.PI;
    scene.add(P);
    let runner = null, board = null, charId = null, boardId = null;
    function setCharacter(cfg) {
      if (charId === cfg.id) return;
      if (runner) { P.remove(runner.J.root); runner.dispose(); }
      runner = A.createRunner(cfg);
      charId = cfg.id;
      P.add(runner.J.root);
      applyShadowFlags();
    }
    function setBoard(cfg) {
      if (boardId === cfg.id) return;
      if (board) { P.remove(board); board.userData.dispose(); }
      board = A.createBoard(cfg);
      boardId = cfg.id;
      board.visible = false;
      P.add(board);
    }
    const blobTex = G.canvasTex(64, 64, (g, w, h) => {
      const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30);
      gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }));
    blob.rotation.x = -Math.PI / 2;
    scene.add(blob);

    // ---------- particles and rain ----------
    const glow = new G.Particles(scene, 1600, true);
    const soft = new G.Particles(scene, 1000, false);
    const rain = new G.Rain(scene, 900);
    const rnd = G.prng(1234);
    const rr = (a, b) => a + (b - a) * rnd();

    // ---------- state of the view ----------
    let theme = 'light';
    let shake = 0, flash = 0;
    let width = 1, height = 1, baseFov = 62;
    let showcase = null;          // { board: bool, t0 }
    let landT = -9, lastT = 0, smokeT = 0, dustT = 0, sparkT = 0;
    let curLook = null;
    const cam = { x: 0, y: 4.5, z: -6.8, lx: 0, ly: 1.0, fov: 62 };

    function applyShadowFlags() {
      const q = QUALITY[quality];
      const on = settings.shadows && q.shadow > 0;
      if (sun.castShadow !== on) sun.castShadow = on;
      if (on && sun.shadow.mapSize.x !== q.shadow) {
        sun.shadow.mapSize.set(q.shadow, q.shadow);
        if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
      }
      blob.visible = !on;
    }
    function applyParticles() {
      const d = (settings.particles === 'off' ? 0 : settings.particles === 'low' ? 0.4 : 1) * QUALITY[quality].particles;
      glow.density = d; soft.density = d;
      if (!d) { glow.clear(); soft.clear(); }
    }
    function setQuality(q) {
      if (!QUALITY[q]) return;
      quality = q;
      const dpr = root.devicePixelRatio || 1;
      renderer.setPixelRatio(q === 'low' ? Math.min(dpr, 1) * 0.75 : Math.min(dpr, QUALITY[q].ratio));
      scenery.setDetail(QUALITY[q].detail);
      applyShadowFlags();
      applyParticles();
      resize(width, height);
    }
    function setOptions(o) {
      settings = Object.assign(settings, o);
      applyShadowFlags();
      applyParticles();
    }
    function setTheme(name) { theme = name === 'dark' ? 'dark' : 'light'; }
    function resize(w, h) {
      width = Math.max(1, w); height = Math.max(1, h);
      renderer.setSize(width, height, false);
      const aspect = width / height;
      camera.aspect = aspect;
      // narrow (phone) screens: a wider view keeps all three tracks in sight
      baseFov = aspect < 1.25 ? Math.min(92, 62 + (1.25 - aspect) * 42) : 62;
      camera.fov = baseFov;
      camera.updateProjectionMatrix();
      const ps = height * renderer.getPixelRatio() * 0.5;
      glow.mat.uniforms.scale.value = ps;
      soft.mat.uniforms.scale.value = ps;
    }
    function kick(power) { if (settings.shake) shake = Math.max(shake, power); }

    // ---------- the look: light, fog, sky ----------
    function applyLook(look, t) {
      curLook = look;
      scene.fog.color.set(look.fog);
      scene.fog.near = look.fogNear;
      scene.fog.far = look.fogFar;
      hemi.color.set(look.hemiSky); hemi.groundColor.set(look.hemiGround); hemi.intensity = look.hemi;
      sun.color.set(look.sun); sun.intensity = look.sunI;
      const u = sky.material.uniforms;
      u.top.value.set(look.top); u.horizon.value.set(look.horizon); u.bottom.value.set(look.fog);
      u.sunColor.value.set(look.sun); u.sunGlow.value = look.sunGlow; u.stars.value = look.stars; u.cloud.value = look.cloud;
      u.sunDir.value.set(-look.sunDir[0], look.sunDir[1], look.sunDir[2]).normalize();
      u.time.value = t;
      sky.visible = look.district !== 'tunnel';
      scenery.setLook(look);
    }

    // ---------- particle bursts for events of the run ----------
    function at(run, view) { return [-view.x, view.y, view.z]; }
    function burst(sys, n, x, y, z, speed, life, s0, s1, colors, grav = 0, drag = 1.5, up = 0) {
      const k = sys.count(n);
      for (let i = 0; i < k; i++) {
        const a = rnd() * Math.PI * 2, b = rnd() * Math.PI - Math.PI / 2;
        const v = speed * (0.4 + rnd() * 0.6);
        sys.spawn(x, y, z, Math.cos(a) * Math.cos(b) * v, Math.sin(b) * v * 0.7 + up, Math.sin(a) * Math.cos(b) * v,
          life * (0.6 + rnd() * 0.6), s0, s1, colors[i % colors.length], 1, grav, drag);
      }
    }
    const POWER_COLORS = { magnet: [0xff5a5a, 0xffffff], x2: [0xffe14f, 0xffa020], boots: [0x6aff8a, 0xffffff], board: [0xd08aff, 0x4fe3ff], jetpack: [0xffa64d, 0xff5a1a], key: [0x7ad0ff, 0xffffff] };
    function event(name, run, view) {
      const [x, y, z] = at(run, view);
      const v = run.speed || 13;
      if (name === 'coin') burst(glow, 3, x, y + 1.1, z + 0.6, 2.5, 0.3, 0.25, 0.05, [0xffe27a, 0xffffff]);
      else if (name === 'jump') burst(soft, 6, x, y + 0.05, z, 1.5, 0.45, 0.35, 0.9, [0xc8bca8, 0xb0a490]);
      else if (name === 'superjump') { burst(glow, 18, x, y + 0.2, z, 4, 0.5, 0.3, 0.05, [0x6aff8a, 0xffffff]); burst(soft, 8, x, y, z, 2, 0.5, 0.4, 1.2, [0xc8bca8]); }
      else if (name === 'land' || name === 'jet-land') { landT = run.t; burst(soft, name === 'jet-land' ? 22 : 9, x, y + 0.05, z + 0.3, 2.2, 0.5, 0.35, 1.1, [0xc8bca8, 0xa89c88]); }
      else if (name === 'slide') burst(soft, 8, x, y + 0.05, z + 0.4, 1.8, 0.5, 0.3, 1.0, [0xc8bca8]);
      else if (name === 'bump') { burst(glow, 30, x + (run.lane < Math.round(view.x / K.LANE_W) ? 0.5 : -0.5), y + 1.0, z + 0.4, 6, 0.45, 0.18, 0.04, [0xffb040, 0xffffff, 0xff7020], 9, 1); kick(0.25); }
      else if (name === 'crash') {
        burst(glow, 45, x, y + 1.0, z + 0.4, 7, 0.6, 0.2, 0.04, [0xffb040, 0xffffff, 0xff5020], 9, 1);
        burst(soft, 40, x, y + 0.6, z + 0.5, 3.5, 1.2, 0.6, 2.4, [0x9a9488, 0x7a746a, 0xbab4a8], -0.5, 1.2);
        kick(0.6);
      } else if (name === 'board-break') { burst(glow, 40, x, y + 0.3, z, 6, 0.6, 0.25, 0.05, [0xd08aff, 0x4fe3ff, 0xffffff], 6, 1); kick(0.35); }
      else if (name.startsWith('power:')) { const c = POWER_COLORS[name.slice(6)] || [0xffffff]; burst(glow, 36, x, y + 1.0, z + 0.5, 5, 0.55, 0.3, 0.05, c, 0, 2); flash = 0.5; }
      else if (name === 'key') burst(glow, 24, x, y + 1.0, z + 0.5, 4, 0.6, 0.3, 0.05, POWER_COLORS.key, 0, 2);
      else if (name.startsWith('trick:')) burst(glow, 8 + Math.min(12, run.combo * 2), x, y + 1.9, z, 3, 0.45, 0.22, 0.04, run.combo >= 5 ? [0xff5aff, 0xffe14f] : [0xffe14f, 0xffffff], 0, 2);
      else if (name === 'revive') burst(glow, 60, x, y + 1.0, z, 5, 0.8, 0.35, 0.05, [0xffffff, 0x9ad8ff], 0, 1.5);
      else if (name === 'board-on') burst(glow, 24, x, y + 0.1, z, 3, 0.5, 0.25, 0.05, [board ? board.userData.cfg.b : 0x4fe3ff, 0xffffff], 0, 2);
      void v;
    }

    // ---------- continuous effects ----------
    const _v = new THREE.Vector3();
    function continuous(run, view, dt, t) {
      const [x, y, z] = at(run, view);
      if (!dt || !(glow.density > 0)) return;
      const v = run.speed || 13;
      if (run.alive && R.flying(run)) {
        // jet flames and smoke from two nozzles on the back
        for (const sx of [-0.1, 0.1]) {
          const nx = x + sx, ny = y + 1.05, nz = z - 0.28;
          if (rnd() < 0.9) glow.spawn(nx, ny, nz, rr(-0.3, 0.3), rr(-4, -2.5), rr(-1, 0) - v * 0.1, rr(0.12, 0.22), 0.32, 0.05, rnd() < 0.5 ? 0xffb040 : 0xff6020, 1, 0, 0);
          if (rnd() < 0.35 * soft.density) soft.spawn(nx, ny - 0.3, nz, rr(-0.4, 0.4), rr(-1.5, -0.5), -v * 0.6, rr(0.6, 1.0), 0.4, 1.6, 0xc8c8c8, 0.5, -0.5, 0.5);
        }
      }
      if (run.alive && run.power.board > 0 && !R.flying(run) && rnd() < 0.6) {
        glow.spawn(x + rr(-0.3, 0.3), y + 0.04, z + rr(-0.6, 0.6), rr(-0.3, 0.3), rr(0, 0.5), -v * 0.2, 0.35, 0.18, 0.02, board ? board.userData.cfg.b : 0x4fe3ff, 1, 0, 1);
      }
      // dust from the feet and while sliding
      dustT -= dt;
      if (run.alive && run.grounded && y < 0.05 && dustT <= 0) {
        dustT = run.slideT > 0 ? 0.03 : 0.16;
        soft.spawn(x + rr(-0.2, 0.2), 0.08, z - 0.2, rr(-0.3, 0.3), rr(0.2, 0.8), -v * 0.05, rr(0.35, 0.6), 0.25, 0.75, 0xbfb39e, run.slideT > 0 ? 0.55 : 0.28, 0, 1);
        if (run.slideT > 0 && rnd() < 0.5) glow.spawn(x + rr(-0.2, 0.2), 0.12, z + 0.3, rr(-1, 1), rr(0.5, 2), rr(-2, 0), 0.25, 0.12, 0.02, 0xffc060, 1, 8, 0);
      }
      // sparks under moving trains near the player
      sparkT -= dt;
      if (sparkT <= 0) {
        sparkT = 0.05;
        for (const o of run.world.obstacles) {
          if (!o.moving || o.type !== 'train' || o.broken) continue;
          const [a, b] = R.extentAt(o, view.z);
          if (a > view.z + 60 || b < view.z - 4) continue;
          if (rnd() < 0.5) {
            const ox = -R.laneX(o.lane) + (rnd() < 0.5 ? -0.75 : 0.75);
            glow.spawn(ox, 0.15, a + 1.9 + rnd() * (b - a - 3), rr(-1, 1), rr(1, 3), rr(-1, 1), 0.25, 0.14, 0.02, 0xffd080, 1, 9, 0);
          }
        }
      }
      // chimney smoke
      smokeT -= dt;
      if (smokeT <= 0 && soft.density > 0) {
        smokeT = 0.12;
        for (const [sx, sy, sz] of scenery.smoke) {
          if (sz < view.z - 10) continue;
          soft.spawn(sx + rr(-0.5, 0.5), sy, sz + rr(-0.5, 0.5), rr(0.5, 1.5), rr(1.5, 2.5), rr(-0.3, 0.3), rr(3, 5), 2.2, 7, 0x9a948c, 0.45, -0.1, 0.1);
        }
      }
      void t; void _v;
    }

    // ---------- the runner's pose ----------
    function runnerPose(run, view, t) {
      const J = runner.J;
      const sliding = run.slideT > 0 && run.alive;
      const lean = (-R.laneX(run.lane) - (-view.x)) * 0.11;
      const st = { mode: 'run', phase: view.z * 1.38, t, lean, stumble: run.stumbleT > 0 };
      const onBoard = run.power.board > 0 && !R.flying(run);
      if (showcase) { st.mode = 'idle'; st.lean = 0; }
      else if (!run.alive) { st.mode = 'crash'; st.k = view.deadT; st.pit = run.deathBy === 'pit'; }
      else if (R.flying(run)) st.mode = 'jet';
      else if (sliding) { st.mode = 'slide'; st.k = K.SLIDE_TIME - run.slideT; }
      else if (!run.grounded) {
        const v0 = run.power.boots > 0 ? K.BOOTS_JUMP_V : K.JUMP_V;
        if (run.vy > -v0 * 1.05) { st.mode = 'jump'; st.k = (v0 - run.vy) / (2 * v0); st.flip = run.power.boots > 0; }
        else st.mode = 'fall';
      } else if (onBoard) st.mode = 'board';
      const since = run.t - landT;
      if (since >= 0 && since < 0.14 && st.mode === 'run') st.squash = 0.12 * (1 - since / 0.14);
      A.pose(runner, st);
      runner.setBoots(run.power.boots > 0 && !showcase);
      if (board) {
        board.visible = showcase ? !!showcase.board : onBoard && run.alive;
        board.position.set(0, 0.1 + (showcase ? 0.25 + Math.sin(t * 2) * 0.05 : 0.04 * Math.sin(t * 9)), 0);
        board.rotation.set(0, showcase ? 0 : 0, (showcase ? 0 : 0.06 * Math.sin(t * 5)));
        if (board.visible) board.userData.glow.material.opacity = 0.3 + 0.2 * Math.sin(t * 8);
      }
      J.body.position.y += onBoard && !showcase && st.mode !== 'jump' ? 0.16 : (showcase && showcase.board ? 0.3 : 0);
    }

    // view: { z, x, y, deadT } - the run (with interpolated z/x/y), t - seconds for animations
    function draw(run, view, t, dt) {
      const pz = view.z, px = -view.x, py = view.y;
      const look = S.lookAt(run.world, pz);
      applyLook(look, t);
      // in the shop the camera looks back along the track at the runner: the scenery window
      // moves back, trains and obstacles are not shown
      const sz = showcase ? pz - 150 : pz;
      scenery.update(run.world, sz);
      scenery.setShowcase(!!showcase);
      actors.draw(showcase ? EMPTY_RUN : run, pz, t, VIEW_AHEAD, VIEW_BEHIND, look);

      // the runner
      P.position.set(px, py, pz);
      if (runner) {
        runnerPose(run, view, t);
        P.visible = !(run.alive && run.invulnT > 0 && Math.floor(t * 14) % 2 === 0 && !showcase);
      }
      // blob shadow on whatever is under the runner
      let sup = 0;
      for (const o of R.nearObstacles(run, 2)) {
        if (!R.isSupport(o) || o.broken || Math.abs(view.x - R.laneX(o.lane)) > 1.2) continue;
        const [a, b] = R.extentAt(o, pz);
        if (pz >= a && pz <= b) sup = Math.max(sup, R.solidAt(o, pz)[1]);
      }
      blob.position.set(px, sup + 0.03, pz);
      blob.scale.setScalar(Math.max(0.3, 1 - Math.max(0, py - sup) * 0.18));

      // effects
      if (dt > 0) {
        continuous(run, view, dt, t);
        glow.update(dt);
        soft.update(dt);
      }
      rain.update(dt || 0, camera.position.x, camera.position.z, settings.particles === 'off' ? 0 : look.rain, 2);

      // the camera
      const k = 1 - Math.pow(0.0006, dt || 0.016);
      const v = run.speed || K.SPEED_MIN;
      if (showcase) {
        const a = Math.sin((t - showcase.t0) * 0.35) * 0.3;
        const D = width >= height ? 5.2 : 11;
        const cx = px + Math.sin(a) * D, cz = pz + Math.cos(a) * D;
        camera.position.set(cx, py + 1.5, cz);
        camera.lookAt(px, py + 1.0 + (showcase.board ? 0.15 : 0), pz);
        P.rotation.y = Math.atan2(-(cx - px), -(cz - pz)) + Math.sin((t - showcase.t0) * 0.6) * 0.25;
        camera.fov = 38;
        // the panel covers the left part (wide screens) or the top (narrow ones): move the
        // character into the free part
        if (width >= height) camera.setViewOffset(width, height, -width * 0.2, 0, width, height);
        else camera.setViewOffset(width, height, 0, -height * 0.33, width, height);
        camera.updateProjectionMatrix();
      } else {
        P.rotation.y = Math.PI;
        const flying = R.flying(run);
        const dead = !run.alive ? Math.min(1, view.deadT * 1.5) : 0;
        const ty = (flying ? py + 2.3 : 4.5 + py * 0.5) - dead * 1.2;
        const tz = -6.8 - (flying ? 1.4 : 0) + dead * 2.2;
        cam.x += (px * 0.55 - cam.x) * k;
        cam.y += (ty - cam.y) * k;
        cam.z += (tz - cam.z) * k;
        cam.lx += (px * 0.8 - cam.lx) * k;
        cam.ly += ((flying ? py - 0.4 : 1.0 + py * 0.7) - dead * 0.4 - cam.ly) * k;
        const fov = baseFov + Math.min(8, (v - K.SPEED_MIN) * 0.45) + (flying ? 4 : 0);
        cam.fov += (fov - cam.fov) * k;
        shake *= Math.pow(0.02, dt || 0.016);
        const sx = shake > 0.01 ? Math.sin(t * 61) * shake : 0, sy = shake > 0.01 ? Math.cos(t * 47) * shake : 0;
        camera.position.set(cam.x + sx, cam.y + sy, pz + cam.z);
        camera.lookAt(cam.lx, cam.ly, pz + 10);
        if (Math.abs(camera.fov - cam.fov) > 0.01) { camera.fov = cam.fov; camera.updateProjectionMatrix(); }
      }
      scenery.follow(sz, camera.position.z, t);
      sky.position.copy(camera.position);
      // the sun (and its shadow box) follows the player
      const sd = look.sunDir;
      sun.position.set(px - sd[0] * 30, sd[1] * 30 + 4, pz + 8 - sd[2] * 30);
      sun.target.position.set(px, 0, pz + 8);
      flash = Math.max(0, flash - (dt || 0) * 2);
      lastT = t;
      renderer.render(scene, camera);
    }

    const EMPTY_RUN = { world: { obstacles: [], coins: [], powers: [] }, t: 0, x: 0, y: 0 };
    function setShowcase(on, o = {}) {
      showcase = on ? { board: !!o.board, t0: lastT } : null;
      if (!on) { camera.clearViewOffset(); camera.fov = cam.fov = baseFov; camera.updateProjectionMatrix(); }
    }

    setQuality(quality);
    return {
      draw, resize, setTheme, setQuality, setOptions, kick, event, setCharacter, setBoard, setShowcase,
      setLang: (l) => scenery.setLang(l),
      renderer, scene, camera,
      get theme() { return theme; },
      get quality() { return quality; },
      get look() { return curLook; },
      info: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, programs: renderer.info.programs ? renderer.info.programs.length : 0, particles: glow.n + soft.n, shadows: sun.castShadow, ...actors.info() }),
    };
  }

  root.RRRender = { create, QUALITY };
})(typeof self !== 'undefined' ? self : this);
