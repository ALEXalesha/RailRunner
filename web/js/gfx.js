// RailRunner graphics helpers: merged geometry with vertex colours, canvas textures and
// texture atlases, instanced pools, the sky dome and particles. Everything is drawn by code,
// there are no image files (three.js comes from web/vendor).
(function (root) {
  'use strict';
  const THREE = root.THREE;

  // ---------- small random numbers for textures (always the same picture) ----------
  function prng(seed) {
    let s = (seed >>> 0) % 2147483647 || 1;
    return () => ((s = (s * 16807) % 2147483647) / 2147483647);
  }
  // a number 0..1 for (a, b, c) - the scenery uses it so that a place always looks the same
  function hash3(a, b = 0, c = 0) {
    let x = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1);
    x = Math.imul(x ^ (x >>> 15), 0x85ebca6b);
    x ^= x >>> 13;
    x = Math.imul(x, 0xc2b2ae35);
    x ^= x >>> 16;
    return (x >>> 0) / 4294967296;
  }

  // ---------- merged geometry ----------
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
  const _c = new THREE.Color();
  // geo - a three.js geometry; color - hex; at: { p: [x,y,z], r: [rx,ry,rz], s: [sx,sy,sz] }
  function part(geo, color, at = {}) {
    const g = geo.index ? geo : geo;
    const p = at.p || [0, 0, 0], r = at.r || [0, 0, 0], s = at.s || [1, 1, 1];
    _e.set(r[0], r[1], r[2]);
    _q.setFromEuler(_e);
    _m.compose(_p.set(p[0], p[1], p[2]), _q, _s.set(s[0], s[1], s[2]));
    g.applyMatrix4(_m);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    _c.set(color);
    const shade = at.shade || 1;
    for (let i = 0; i < n; i++) { col[i * 3] = _c.r * shade; col[i * 3 + 1] = _c.g * shade; col[i * 3 + 2] = _c.b * shade; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    return g;
  }
  function merge(parts) {
    let nv = 0, ni = 0;
    for (const g of parts) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
    const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    let ov = 0, oi = 0;
    for (const g of parts) {
      const n = g.attributes.position.count;
      pos.set(g.attributes.position.array, ov * 3);
      nor.set(g.attributes.normal.array, ov * 3);
      col.set(g.attributes.color.array, ov * 3);
      uv.set(g.attributes.uv.array, ov * 2);
      if (g.index) { const a = g.index.array; for (let i = 0; i < a.length; i++) idx[oi + i] = a[i] + ov; oi += a.length; }
      else { for (let i = 0; i < n; i++) idx[oi + i] = ov + i; oi += n; }
      ov += n;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    out.setIndex(new THREE.BufferAttribute(idx, 1));
    out.computeBoundingSphere();
    return out;
  }
  // shortcuts: a box by its centre and size, a cylinder along an axis
  const box = (w, h, d, color, p, r, extra) => part(new THREE.BoxGeometry(w, h, d), color, Object.assign({ p, r }, extra));
  function cyl(rt, rb, h, seg, color, p, axis = 'y', extra) {
    const r = axis === 'x' ? [0, 0, Math.PI / 2] : axis === 'z' ? [Math.PI / 2, 0, 0] : [0, 0, 0];
    return part(new THREE.CylinderGeometry(rt, rb, h, seg), color, Object.assign({ p, r }, extra));
  }
  const sphere = (rad, color, p, s, ws = 10, hs = 8) => part(new THREE.SphereGeometry(rad, ws, hs), color, { p, s });
  // a wedge from height 0 at z=0 to height H at z=L, width W (centred on x)
  function wedge(W, H, L, color) {
    const hw = W / 2;
    const v = [
      -hw, 0, 0, hw, 0, 0, hw, H, L, -hw, 0, 0, hw, H, L, -hw, H, L,
      -hw, 0, 0, -hw, H, L, -hw, 0, L,
      hw, 0, 0, hw, 0, L, hw, H, L,
      -hw, 0, L, -hw, H, L, hw, H, L, -hw, 0, L, hw, H, L, hw, 0, L,
    ];
    const uv = [0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1, 1, 1, 0, 0, 0, 1, 0, 1, 1, 0, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    return part(g, color);
  }

  // ---------- canvas textures ----------
  function canvasTex(w, h, draw, opts = {}) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = opts.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    if (opts.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(opts.repeat[0], opts.repeat[1]); }
    if (opts.wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    return t;
  }
  function noiseFill(g, w, h, base, spread, n, seed) {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    const r = prng(seed);
    for (let i = 0; i < n; i++) {
      const v = Math.floor(spread * (r() - 0.5));
      g.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${Math.abs(v) / 255})`;
      g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3);
    }
  }
  // an atlas: cols x rows tiles, draw(g, x, y, w, h, index) for each
  function atlas(cols, rows, tile, draw, opts) {
    return canvasTex(cols * tile, rows * tile, (g) => {
      for (let i = 0; i < cols * rows; i++) {
        const x = (i % cols) * tile, y = Math.floor(i / cols) * tile;
        g.save();
        g.beginPath(); g.rect(x, y, tile, tile); g.clip();
        draw(g, x, y, tile, tile, i);
        g.restore();
      }
    }, opts);
  }

  // ---------- instanced pools ----------
  // A pool is one InstancedMesh (one draw call) that is refilled when the view moves.
  // uvt: per-instance texture offset and scale (atlas tiles, windows repeated by size).
  function patchUv(material) {
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = 'attribute vec4 aUvT;\n' + shader.vertexShader.replace('#include <uv_vertex>', [
        '#include <uv_vertex>',
        '#ifdef USE_MAP', 'vMapUv = vMapUv * aUvT.zw + aUvT.xy;', '#endif',
        '#ifdef USE_EMISSIVEMAP', 'vEmissiveMapUv = vEmissiveMapUv * aUvT.zw + aUvT.xy;', '#endif',
      ].join('\n'));
    };
    material.customProgramCacheKey = () => 'rr-uvt';
    return material;
  }
  class Pool {
    constructor(scene, geometry, material, capacity, opts = {}) {
      this.cap = capacity;
      if (opts.uvt) {
        geometry.setAttribute('aUvT', new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4).fill(1), 4));
        patchUv(material);
      }
      this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
      this.mesh.frustumCulled = false;
      this.mesh.castShadow = !!opts.cast;
      this.mesh.receiveShadow = !!opts.receive;
      this.colored = !!opts.color;
      if (this.colored) for (let i = 0; i < capacity; i++) this.mesh.setColorAt(i, _c.set(0xffffff));
      this.uvt = opts.uvt ? geometry.attributes.aUvT : null;
      this.n = 0;
      this.mesh.count = 0;
      this.mesh.visible = false;
      scene.add(this.mesh);
    }
    reset() { this.n = 0; }
    // position, rotation y, scale; color hex or null; uvt [ox, oy, sx, sy] or null
    add(x, y, z, ry = 0, sx = 1, sy = 1, sz = 1, color = null, uvt = null) {
      if (this.n >= this.cap) return -1;
      const i = this.n++;
      _e.set(0, ry, 0);
      _q.setFromEuler(_e);
      _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
      this.mesh.setMatrixAt(i, _m);
      if (this.colored) this.mesh.setColorAt(i, _c.set(color === null ? 0xffffff : color));
      if (this.uvt && uvt) this.uvt.setXYZW(i, uvt[0], uvt[1], uvt[2], uvt[3]);
      return i;
    }
    addMatrix(m, color = null) {
      if (this.n >= this.cap) return -1;
      const i = this.n++;
      this.mesh.setMatrixAt(i, m);
      if (this.colored) this.mesh.setColorAt(i, _c.set(color === null ? 0xffffff : color));
      return i;
    }
    done() {
      this.mesh.count = this.n;
      this.mesh.visible = this.n > 0;
      this.mesh.instanceMatrix.needsUpdate = true;
      if (this.colored && this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
      if (this.uvt) this.uvt.needsUpdate = true;
    }
  }
  // atlas tile -> uvt for a cols x rows atlas (texture v grows upwards)
  const tileUv = (i, cols, rows) => [(i % cols) / cols, 1 - (Math.floor(i / cols) + 1) / rows, 1 / cols, 1 / rows];

  // ---------- sky ----------
  function skyDome() {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        top: { value: new THREE.Color(0x5aa9e6) },
        horizon: { value: new THREE.Color(0xcfe9f7) },
        bottom: { value: new THREE.Color(0x9a9a9a) },
        sunDir: { value: new THREE.Vector3(0.3, 0.6, 0.7).normalize() },
        sunColor: { value: new THREE.Color(0xfff2dc) },
        sunGlow: { value: 1 },
        stars: { value: 0 },
        cloud: { value: 0.5 },
        time: { value: 0 },
      },
      vertexShader: [
        'varying vec3 vDir;',
        'void main() {',
        '  vDir = normalize(position);',
        '  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
        '  gl_Position = p.xyww;',
        '}',
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunColor;',
        'uniform float sunGlow; uniform float stars; uniform float cloud; uniform float time;',
        'varying vec3 vDir;',
        'float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
        'float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);',
        '  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }',
        'void main() {',
        '  vec3 d = normalize(vDir);',
        '  float h = d.y;',
        '  vec3 c = mix(horizon, top, smoothstep(0.0, 0.6, h));',
        '  c = mix(c, bottom, smoothstep(0.0, -0.25, h));',
        '  float s = max(dot(d, normalize(sunDir)), 0.0);',
        '  c += sunColor * (pow(s, 900.0) * 3.0 + pow(s, 16.0) * 0.35 + pow(s, 3.0) * 0.12) * sunGlow;',
        '  if (h > 0.0) {',
        '    vec2 uv = d.xz / (h + 0.25) * 2.0 + vec2(time * 0.01, 0.0);',
        '    float n = noise(uv) * 0.6 + noise(uv * 2.3) * 0.3 + noise(uv * 5.1) * 0.1;',
        '    float cl = smoothstep(0.55, 0.85, n) * cloud * smoothstep(0.0, 0.25, h);',
        '    c = mix(c, mix(horizon, vec3(1.0), 0.6 - stars * 0.5), cl * 0.7);',
        '    vec2 g = floor(d.xz / (h + 0.4) * 160.0);',
        '    float st = step(0.996, h21(g)) * stars * smoothstep(0.05, 0.4, h) * (0.6 + 0.4 * sin(time * 3.0 + h21(g + 3.0) * 30.0));',
        '    c += vec3(st) * (1.0 - cl);',
        '  }',
        '  gl_FragColor = vec4(c, 1.0);',
        '  #include <colorspace_fragment>',
        '}',
      ].join('\n'),
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(390, 32, 16), mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = -10;
    return mesh;
  }

  // ---------- particles ----------
  // Soft round points; additive ones glow (sparks, coins, flames), normal ones are dust and smoke.
  class Particles {
    constructor(scene, capacity, additive) {
      this.cap = capacity;
      this.n = 0;
      this.px = new Float32Array(capacity * 3);
      this.v = new Float32Array(capacity * 3);
      this.life = new Float32Array(capacity);
      this.max = new Float32Array(capacity);
      this.size0 = new Float32Array(capacity);
      this.size1 = new Float32Array(capacity);
      this.grav = new Float32Array(capacity);
      this.drag = new Float32Array(capacity);
      this.col = new Float32Array(capacity * 3);
      this.alpha0 = new Float32Array(capacity);
      const g = new THREE.BufferGeometry();
      this.aPos = new THREE.BufferAttribute(new Float32Array(capacity * 3), 3);
      this.aCol = new THREE.BufferAttribute(new Float32Array(capacity * 3), 3);
      this.aSize = new THREE.BufferAttribute(new Float32Array(capacity), 1);
      this.aAlpha = new THREE.BufferAttribute(new Float32Array(capacity), 1);
      for (const a of [this.aPos, this.aCol, this.aSize, this.aAlpha]) a.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('position', this.aPos);
      g.setAttribute('aColor', this.aCol);
      g.setAttribute('aSize', this.aSize);
      g.setAttribute('aAlpha', this.aAlpha);
      this.mat = new THREE.ShaderMaterial({
        uniforms: { scale: { value: 400 } },
        vertexShader: [
          'attribute vec3 aColor; attribute float aSize; attribute float aAlpha;',
          'uniform float scale; varying vec3 vColor; varying float vAlpha;',
          'void main() {',
          '  vColor = aColor; vAlpha = aAlpha;',
          '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
          '  gl_PointSize = aSize * scale / max(0.5, -mv.z);',
          '  gl_Position = projectionMatrix * mv;',
          '}',
        ].join('\n'),
        fragmentShader: [
          'varying vec3 vColor; varying float vAlpha;',
          'void main() {',
          '  float d = length(gl_PointCoord - 0.5);',
          '  float a = vAlpha * smoothstep(0.5, 0.05, d);',
          '  if (a < 0.01) discard;',
          additive ? '  gl_FragColor = vec4(vColor * a, a);' : '  gl_FragColor = vec4(vColor, a);',
          '  #include <colorspace_fragment>',
          '}',
        ].join('\n'),
        transparent: true,
        depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      });
      this.points = new THREE.Points(g, this.mat);
      this.points.frustumCulled = false;
      this.points.renderOrder = 5;
      g.setDrawRange(0, 0);
      scene.add(this.points);
      this.density = 1;
    }
    // one particle: position, velocity, life (s), size from-to, colour, alpha, gravity, drag
    spawn(x, y, z, vx, vy, vz, life, s0, s1, color, alpha = 1, grav = 0, drag = 0) {
      if (this.n >= this.cap) return;
      const i = this.n++;
      this.px[i * 3] = x; this.px[i * 3 + 1] = y; this.px[i * 3 + 2] = z;
      this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
      this.life[i] = life; this.max[i] = life;
      this.size0[i] = s0; this.size1[i] = s1;
      _c.set(color);
      this.col[i * 3] = _c.r; this.col[i * 3 + 1] = _c.g; this.col[i * 3 + 2] = _c.b;
      this.alpha0[i] = alpha;
      this.grav[i] = grav;
      this.drag[i] = drag;
    }
    // how many of n to really make (graphics setting "particles")
    count(n) { return Math.round(n * this.density); }
    update(dt) {
      let j = 0;
      for (let i = 0; i < this.n; i++) {
        const l = this.life[i] - dt;
        if (l <= 0) continue;
        if (j !== i) {
          for (let k = 0; k < 3; k++) { this.px[j * 3 + k] = this.px[i * 3 + k]; this.v[j * 3 + k] = this.v[i * 3 + k]; this.col[j * 3 + k] = this.col[i * 3 + k]; }
          this.max[j] = this.max[i]; this.size0[j] = this.size0[i]; this.size1[j] = this.size1[i];
          this.alpha0[j] = this.alpha0[i]; this.grav[j] = this.grav[i]; this.drag[j] = this.drag[i];
        }
        this.life[j] = l;
        const dr = Math.max(0, 1 - this.drag[j] * dt);
        this.v[j * 3] *= dr; this.v[j * 3 + 1] = this.v[j * 3 + 1] * dr - this.grav[j] * dt; this.v[j * 3 + 2] *= dr;
        this.px[j * 3] += this.v[j * 3] * dt; this.px[j * 3 + 1] += this.v[j * 3 + 1] * dt; this.px[j * 3 + 2] += this.v[j * 3 + 2] * dt;
        j++;
      }
      this.n = j;
      const P = this.aPos.array, Cc = this.aCol.array, S = this.aSize.array, A = this.aAlpha.array;
      for (let i = 0; i < j; i++) {
        const k = 1 - this.life[i] / this.max[i];
        P[i * 3] = this.px[i * 3]; P[i * 3 + 1] = this.px[i * 3 + 1]; P[i * 3 + 2] = this.px[i * 3 + 2];
        Cc[i * 3] = this.col[i * 3]; Cc[i * 3 + 1] = this.col[i * 3 + 1]; Cc[i * 3 + 2] = this.col[i * 3 + 2];
        S[i] = this.size0[i] + (this.size1[i] - this.size0[i]) * k;
        A[i] = this.alpha0[i] * (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85);
      }
      this.points.geometry.setDrawRange(0, j);
      if (j) {
        this.aPos.needsUpdate = true; this.aCol.needsUpdate = true; this.aSize.needsUpdate = true; this.aAlpha.needsUpdate = true;
      }
    }
    clear() { this.n = 0; this.points.geometry.setDrawRange(0, 0); }
  }

  // ---------- rain: short lines around the camera ----------
  class Rain {
    constructor(scene, n) {
      this.n = n;
      this.pos = new Float32Array(n * 6);
      this.seed = prng(99);
      const g = new THREE.BufferGeometry();
      this.attr = new THREE.BufferAttribute(this.pos, 3);
      this.attr.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('position', this.attr);
      this.mat = new THREE.LineBasicMaterial({ color: 0xbfd4ee, transparent: true, opacity: 0, depthWrite: false, fog: false });
      this.lines = new THREE.LineSegments(g, this.mat);
      this.lines.frustumCulled = false;
      this.lines.visible = false;
      this.drops = [];
      for (let i = 0; i < n; i++) this.drops.push({ x: (this.seed() - 0.5) * 26, y: this.seed() * 14, z: this.seed() * 40 - 4 });
      scene.add(this.lines);
    }
    update(dt, cx, cz, amount, wind) {
      this.lines.visible = amount > 0.02;
      this.mat.opacity = 0.42 * amount;
      if (!this.lines.visible) return;
      const P = this.pos;
      const show = Math.floor(this.n * Math.min(1, amount));
      for (let i = 0; i < this.n; i++) {
        const d = this.drops[i];
        d.y -= 24 * dt;
        d.x += wind * dt;
        if (d.y < 0) { d.y += 14; d.x = (this.seed() - 0.5) * 26; d.z = this.seed() * 40 - 4; }
        const x = cx + d.x, z = cz + d.z, y = i < show ? d.y : -50;
        P[i * 6] = x; P[i * 6 + 1] = y; P[i * 6 + 2] = z;
        P[i * 6 + 3] = x - wind * 0.03; P[i * 6 + 4] = y + 0.7; P[i * 6 + 5] = z + 0.15;
      }
      this.attr.needsUpdate = true;
    }
  }

  root.RRGfx = { prng, hash3, part, merge, box, cyl, sphere, wedge, canvasTex, noiseFill, atlas, Pool, tileUv, patchUv, skyDome, Particles, Rain };
})(typeof self !== 'undefined' ? self : this);
