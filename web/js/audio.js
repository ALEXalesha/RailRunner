// Sound of RailRunner: every effect and the music are synthesised with WebAudio, no samples.
// The context is created on the first click or key press (browsers block sound before that).
// The music follows the run: every district has its own chords and lead, the tempo and the
// number of layers grow with the speed. RRAudio.log keeps the names of the last sounds - the
// page laws read it.
(function (root) {
  'use strict';
  let ctx = null, master = null, musicGain = null, sfxGain = null, noiseBuf = null, musicFilter = null;
  let vol = { music: 0.5, sfx: 0.8 };
  let musicOn = false, musicTimer = 0, nextTime = 0, stepNo = 0;
  let lastCoin = 0, coinPitch = 0;
  let mood = { speed: 13, district: 'city' };
  let jetNode = null;
  const log = [];

  function init() {
    if (ctx) return ctx;
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch (e) { return null; }
    master = ctx.createGain();
    master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 4;
    master.connect(comp).connect(ctx.destination);
    musicGain = ctx.createGain();
    sfxGain = ctx.createGain();
    musicFilter = ctx.createBiquadFilter();
    musicFilter.type = 'lowpass';
    musicFilter.frequency.value = 18000;
    musicGain.connect(musicFilter).connect(master);
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
  const arp = (notes, step, type = 'square', v = 0.12, len = 0.12) => notes.forEach((f, i) => tone(type, f, f, len, v, i * step));

  let comboPitch = 0;
  const SOUNDS = {
    coin() {
      const now = ctx.currentTime;
      coinPitch = now - lastCoin < 0.3 ? Math.min(coinPitch + 1, 7) : 0;
      lastCoin = now;
      const f = 1046 * Math.pow(2, coinPitch / 12);
      tone('square', f, f, 0.05, 0.1);
      tone('square', f * 1.5, f * 1.5, 0.08, 0.08, 0.05);
    },
    jump() { tone('triangle', 260, 720, 0.16, 0.3); },
    superjump() { tone('triangle', 240, 1300, 0.3, 0.3); tone('sine', 480, 1800, 0.25, 0.08, 0.03); },
    slide() { noise(0.28, 0.35, 'bandpass', 2400, 500); },
    lane() { noise(0.07, 0.16, 'highpass', 3000, 1500); },
    land() { tone('sine', 140, 60, 0.09, 0.3); noise(0.06, 0.12, 'lowpass', 900, 200); },
    'jet-land'() { tone('sine', 120, 45, 0.25, 0.5); noise(0.3, 0.35, 'lowpass', 1200, 120); },
    edge() { tone('sine', 200, 160, 0.06, 0.15); },
    bump() { tone('sine', 160, 50, 0.2, 0.5); noise(0.15, 0.4, 'lowpass', 1200, 200); },
    crash() { noise(0.9, 0.75, 'lowpass', 3000, 60); tone('sine', 110, 30, 0.7, 0.6); tone('sawtooth', 220, 50, 0.45, 0.12); noise(0.3, 0.3, 'highpass', 6000, 2000, 0.05); },
    'board-break'() { noise(0.4, 0.5, 'bandpass', 3500, 400); tone('sawtooth', 880, 110, 0.4, 0.12); },
    'board-on'() { tone('sine', 300, 900, 0.25, 0.25); noise(0.3, 0.15, 'bandpass', 1500, 4000); },
    power() { arp([523, 659, 784, 1046], 0.06); },
    'power-end'() { tone('square', 784, 784, 0.07, 0.1); tone('square', 523, 523, 0.1, 0.1, 0.08); },
    key() { arp([1318, 1568, 2093], 0.07, 'triangle', 0.18, 0.2); },
    trick() {
      comboPitch = Math.min(12, comboPitch + 1);
      const f = 660 * Math.pow(2, comboPitch / 12);
      tone('triangle', f, f * 1.5, 0.12, 0.16);
      setTimeout(() => { comboPitch = Math.max(0, comboPitch - 1); }, 3000);
    },
    revive() { arp([392, 523, 659, 784, 1046], 0.07, 'triangle', 0.2, 0.25); noise(0.6, 0.15, 'highpass', 2000, 8000); },
    mission() { arp([784, 988, 1175, 1568], 0.09, 'triangle', 0.2, 0.22); },
    whoosh() { noise(0.9, 0.3, 'bandpass', 300, 3000); },
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
    record() { arp([659, 784, 988, 1318], 0.11, 'triangle', 0.2, 0.14); },
  };

  function play(name) {
    const key = name.startsWith('power:') ? 'power' : name.startsWith('power-end:') ? 'power-end'
      : name.startsWith('trick:') ? 'trick' : name.startsWith('district:') ? 'whoosh' : name;
    log.push(key);
    if (log.length > 200) log.splice(0, log.length - 200);
    if (!ctx || ctx.state !== 'running' || !SOUNDS[key]) return;
    try { SOUNDS[key](); } catch (e) { /* a failed sound never stops the game */ }
  }

  // ---------- the jetpack's roar while flying ----------
  function jet(on) {
    if (!ctx) return;
    if (on && !jetNode) {
      const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = noiseBuf; s.loop = true;
      f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 0.6;
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.linearRampToValueAtTime(0.22, ctx.currentTime + 0.2);
      s.connect(f).connect(g).connect(sfxGain);
      s.start();
      jetNode = { s, g };
    } else if (!on && jetNode) {
      const { s, g } = jetNode;
      jetNode = null;
      try { g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.12); s.stop(ctx.currentTime + 0.6); } catch (e) { /* already stopped */ }
    }
  }

  // ---------- music ----------
  // chords (MIDI), bass and the lead's sound per district
  const SONGS = {
    city: { chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], bass: [33, 29, 36, 31], lead: 'square', cut: 18000 },
    industrial: { chords: [[52, 55, 59], [48, 52, 55], [50, 54, 57], [47, 51, 54]], bass: [28, 24, 26, 23], lead: 'sawtooth', cut: 6000 },
    bridge: { chords: [[50, 53, 57], [46, 50, 53], [53, 57, 60], [48, 52, 55]], bass: [26, 22, 29, 24], lead: 'triangle', cut: 12000 },
    tunnel: { chords: [[57, 60, 64], [57, 60, 64], [55, 59, 62], [53, 57, 60]], bass: [33, 33, 31, 29], lead: 'square', cut: 2200 },
    neon: { chords: [[54, 57, 61], [50, 54, 57], [57, 61, 64], [52, 56, 59]], bass: [30, 26, 33, 28], lead: 'sawtooth', cut: 9000 },
  };
  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
  const bpm = () => 118 + Math.max(0, Math.min(1, (mood.speed - 13) / 17)) * 32;
  function kick(t) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g).connect(musicGain);
    o.start(t); o.stop(t + 0.2);
  }
  function hat(t, v, f = 7000) {
    const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf;
    fl.type = 'highpass';
    fl.frequency.value = f;
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    s.connect(fl).connect(g).connect(musicGain);
    s.start(t, Math.random() * 0.5); s.stop(t + 0.06);
  }
  function snare(t) {
    const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf;
    fl.type = 'bandpass'; fl.frequency.value = 1800;
    g.gain.setValueAtTime(0.35, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    s.connect(fl).connect(g).connect(musicGain);
    s.start(t, Math.random() * 0.5); s.stop(t + 0.15);
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
  // the layers grow with the speed: drums and bass, then hats, then the arpeggio, then a melody
  function musicStep(i, t, sd) {
    const song = SONGS[mood.district] || SONGS.city;
    const level = Math.max(0, Math.min(1, (mood.speed - 13) / 17));
    const bar = Math.floor(i / 16) % 4, s = i % 16;
    if (s % 4 === 0) kick(t);
    if (level > 0.15 && (s === 4 || s === 12)) snare(t);
    if (s % 2 === 1) hat(t, s % 4 === 3 ? 0.22 : 0.1);
    if (level > 0.5 && s % 2 === 0) hat(t, 0.05, 9000);
    if (s % 4 === 2 || s === 0) note('triangle', midi(song.bass[bar]), t, sd * 1.8, 0.45);
    const ch = song.chords[bar];
    const ap = [0, 1, 2, 1];
    if (level > 0.08 && s % 2 === 0) note(song.lead, midi(ch[ap[(s / 2) % 4]] + 12), t, sd * 0.9, 0.05);
    if (level > 0.45 && (s === 0 || s === 6 || s === 10)) note(song.lead, midi(ch[(s / 2) % 3] + 24), t, sd * 2.5, 0.04);
    if (s === 8 && bar === 3) note('square', midi(ch[2] + 24), t, sd * 3, 0.05);
  }
  function schedule() {
    if (!ctx || !musicOn || ctx.state !== 'running') return;
    const sd = 60 / bpm() / 4;
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
  // what the run is like now (called every frame; cheap)
  function setMood(speed, district) {
    if (district !== mood.district && ctx && musicFilter) {
      const song = SONGS[district] || SONGS.city;
      musicFilter.frequency.setTargetAtTime(song.cut, ctx.currentTime, 0.6);
    }
    mood = { speed: speed || 13, district: district || 'city' };
  }

  function suspend() { if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {}); }
  function resume() { if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {}); }

  root.RRAudio = {
    init, play, music, jet, mood: setMood, setVolumes, suspend, resume, log,
    get ctx() { return ctx; },
    get musicOn() { return musicOn; },
    get jetOn() { return !!jetNode; },
    get bpm() { return bpm(); },
    get volumes() { return { ...vol, musicGain: musicGain ? musicGain.gain.value : null, sfxGain: sfxGain ? sfxGain.gain.value : null }; },
  };
})(typeof self !== 'undefined' ? self : this);
