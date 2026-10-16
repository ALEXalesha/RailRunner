// Sound of RailRunner: every effect and the music are synthesised with WebAudio, no samples.
// The context is created on the first click or key press (browsers block sound before that).
// RRAudio.log keeps the names of the last sounds - the page laws read it.
(function (root) {
  'use strict';
  let ctx = null, master = null, musicGain = null, sfxGain = null, noiseBuf = null;
  let vol = { music: 0.5, sfx: 0.8 };
  let musicOn = false, musicTimer = 0, nextTime = 0, stepNo = 0;
  let lastCoin = 0, coinPitch = 0;
  const log = [];

  function init() {
    if (ctx) return ctx;
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch (e) { return null; }
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
    musicGain = ctx.createGain();
    sfxGain = ctx.createGain();
    musicGain.connect(master);
    sfxGain.connect(master);
    applyVolumes();
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    let seed = 12345;
    for (let i = 0; i < d.length; i++) { seed = (seed * 1103515245 + 12345) >>> 0; d[i] = seed / 2147483648 - 1; }
    return ctx;
  }
  function applyVolumes() {
    if (!ctx) return;
    musicGain.gain.value = vol.music * 0.35;
    sfxGain.gain.value = vol.sfx * 0.6;
  }
  function setVolumes(music, sfx) {
    vol = { music, sfx };
    applyVolumes();
  }

  // ---------- building blocks ----------
  function tone(type, f0, f1, dur, v, at = 0, out = sfxGain) {
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + Math.min(0.01, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.03);
  }
  function noise(dur, v, filter = 'lowpass', f0 = 2000, f1 = 300, at = 0, out = sfxGain) {
    const t = ctx.currentTime + at;
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf;
    f.type = filter;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(out);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.03);
  }

  const SOUNDS = {
    coin() {
      const now = ctx.currentTime;
      coinPitch = now - lastCoin < 0.3 ? Math.min(coinPitch + 1, 7) : 0;
      lastCoin = now;
      const f = 1046 * Math.pow(2, coinPitch / 12);
      tone('square', f, f, 0.05, 0.12);
      tone('square', f * 1.5, f * 1.5, 0.08, 0.1, 0.05);
    },
    jump() { tone('triangle', 260, 720, 0.16, 0.3); },
    superjump() { tone('triangle', 240, 1300, 0.3, 0.3); tone('sine', 480, 1800, 0.25, 0.08, 0.03); },
    slide() { noise(0.28, 0.35, 'bandpass', 2400, 500); },
    lane() { noise(0.07, 0.18, 'highpass', 3000, 1500); },
    land() { tone('sine', 140, 60, 0.09, 0.3); },
    edge() { tone('sine', 200, 160, 0.06, 0.15); },
    bump() { tone('sine', 160, 50, 0.2, 0.5); noise(0.15, 0.4, 'lowpass', 1200, 200); },
    crash() { noise(0.7, 0.7, 'lowpass', 3000, 80); tone('sine', 110, 35, 0.6, 0.6); tone('sawtooth', 220, 60, 0.4, 0.12); },
    'board-break'() { noise(0.4, 0.5, 'bandpass', 3500, 400); tone('sawtooth', 880, 110, 0.4, 0.12); },
    power() { [523, 659, 784, 1046].forEach((f, i) => tone('square', f, f, 0.07, 0.12, i * 0.06)); },
    'power-end'() { tone('square', 784, 784, 0.07, 0.1); tone('square', 523, 523, 0.1, 0.1, 0.08); },
    horn() {
      for (const f of [311, 370]) {
        const t = ctx.currentTime;
        const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
        o.type = 'sawtooth';
        o.frequency.value = f;
        lp.type = 'lowpass';
        lp.frequency.value = 1400;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.09, t + 0.05);
        g.gain.setValueAtTime(0.09, t + 0.55);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
        o.connect(lp).connect(g).connect(sfxGain);
        o.start(t);
        o.stop(t + 0.85);
      }
    },
    click() { tone('square', 660, 660, 0.04, 0.08); },
    record() { [659, 784, 988, 1318].forEach((f, i) => tone('triangle', f, f, 0.14, 0.2, i * 0.11)); },
  };

  function play(name) {
    const key = name.startsWith('power:') ? 'power' : name.startsWith('power-end:') ? 'power-end' : name;
    log.push(key);
    if (log.length > 200) log.splice(0, log.length - 200);
    if (!ctx || ctx.state !== 'running' || !SOUNDS[key]) return;
    try { SOUNDS[key](); } catch (e) { /* a failed sound never stops the game */ }
  }

  // ---------- music: 4 bars of Am - F - C - G, 128 bpm, 16 steps per bar ----------
  const BPM = 128;
  const CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
  const BASS = [33, 29, 36, 31];
  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
  function kick(t) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g).connect(musicGain);
    o.start(t); o.stop(t + 0.2);
  }
  function hat(t, v) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf;
    f.type = 'highpass';
    f.frequency.value = 7000;
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    s.connect(f).connect(g).connect(musicGain);
    s.start(t, Math.random() * 0.5); s.stop(t + 0.06);
  }
  function note(type, f, t, d, v) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(musicGain);
    o.start(t); o.stop(t + d + 0.02);
  }
  function musicStep(i, t, sd) {
    const bar = Math.floor(i / 16) % 4, s = i % 16;
    if (s % 4 === 0) kick(t);
    if (s % 2 === 1) hat(t, s % 4 === 3 ? 0.25 : 0.12);
    if (s % 4 === 2 || s === 0) note('triangle', midi(BASS[bar]), t, sd * 1.8, 0.45);
    const ch = CHORDS[bar];
    const arp = [0, 1, 2, 1];
    if (s % 2 === 0) note('square', midi(ch[arp[(s / 2) % 4]] + 12), t, sd * 0.9, 0.06);
    if (s === 8 && bar === 3) note('square', midi(ch[2] + 24), t, sd * 3, 0.05);
  }
  function schedule() {
    if (!ctx || !musicOn || ctx.state !== 'running') return;
    const sd = 60 / BPM / 4;
    if (nextTime < ctx.currentTime) nextTime = ctx.currentTime + 0.05;
    while (nextTime < ctx.currentTime + 0.15) {
      musicStep(stepNo++, nextTime, sd);
      nextTime += sd;
    }
  }
  function music(on) {
    musicOn = !!on;
    clearInterval(musicTimer);
    musicTimer = 0;
    if (musicOn && ctx) { nextTime = 0; musicTimer = setInterval(schedule, 25); schedule(); }
  }

  function suspend() { if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {}); }
  function resume() { if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {}); }

  root.RRAudio = {
    init, play, music, setVolumes, suspend, resume, log,
    get ctx() { return ctx; },
    get musicOn() { return musicOn; },
    get volumes() { return { ...vol, musicGain: musicGain ? musicGain.gain.value : null, sfxGain: sfxGain ? sfxGain.gain.value : null }; },
  };
})(typeof self !== 'undefined' ? self : this);
