// Shared helpers of the page laws. RR_WEB - the web/ folder under test.
'use strict';
const path = require('path');
const { pathToFileURL } = require('url');

const WEB = process.env.RR_WEB || path.join(__dirname, '..', '..', 'web');
const pageUrl = (query = '') => pathToFileURL(path.join(WEB, 'index.html')).href + query;

// Opens the game. Pointer lock is replaced by a counter (a real call in headless Chromium
// on Windows clips the user's cursor), every request that is not a local file is an error.
// save - what lies in storage before the page starts (by default: the tutorial is done,
// so the laws are not slowed down by lessons); fresh: true - nothing in storage.
async function open(page, query = '?manual=1&seed=7', opts = {}) {
  const errors = [];
  const save = opts.fresh ? null : JSON.stringify(Object.assign({ v: 2, tutorialDone: true, boardGift: true }, opts.save || {}));
  await page.addInitScript((save) => {
    window.__pointerLockCalls = 0;
    Element.prototype.requestPointerLock = function () { window.__pointerLockCalls++; };
    document.exitPointerLock = function () {};
    if (save && !sessionStorage.getItem('rr-test-init')) { localStorage.setItem('railrunner:save', save); sessionStorage.setItem('rr-test-init', '1'); }
  }, save);
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('request', (r) => { if (!/^(file|data|blob):/.test(r.url())) errors.push('network: ' + r.url()); });
  await page.goto(pageUrl(query));
  await page.waitForFunction(() => window.RailRunner && window.RailRunner.overlay === 'menu');
  return errors;
}
async function reload(page) {
  await page.reload();
  await page.waitForFunction(() => window.RailRunner && window.RailRunner.overlay === 'menu');
}

const rr = (page, fn, arg) => page.evaluate(fn, arg);
const state = (page) => page.evaluate(() => ({
  state: RailRunner.state, overlay: RailRunner.overlay, lane: RailRunner.run.lane, y: RailRunner.run.y,
  z: RailRunner.run.z, slideT: RailRunner.run.slideT, alive: RailRunner.run.alive, demo: RailRunner.demo,
}));
const advance = (page, s, auto = false) => page.evaluate(([s, auto]) => RailRunner.advance(s, { auto }), [s, auto]);
// advance in steps until a state (the continue offer, the results)
const advanceUntil = (page, states, limit = 120) => page.evaluate(([states, limit]) => {
  for (let i = 0; i < limit * 4 && !states.includes(RailRunner.state); i++) RailRunner.advance(0.25);
  return RailRunner.state;
}, [states, limit]);

// a world with nothing in it: the player can run without crashing
async function clearWorld(page) {
  await page.evaluate(() => {
    const w = RailRunner.run.world;
    w.obstacles.length = 0; w.coins.length = 0; w.powers.length = 0; w.genZ = Infinity; w.tutorial = null;
    w.path = [{ z: -1e9, lane: RailRunner.run.lane, kind: 'empty' }];
  });
}
// an obstacle right ahead in the player's lane
async function obstacleAhead(page, type = 'hurdle', dz = 20) {
  await page.evaluate(([type, dz]) => {
    const r = RailRunner.run, R = RailRunner.core;
    const len = { hurdle: R.C.HURDLE_D, bar: R.C.BAR_D, fence: R.C.FENCE_D, pit: R.C.PIT_LEN, train: 9 }[type];
    const o = { id: 900000 + Math.floor(Math.random() * 99999), type, lane: r.lane, z0: r.z + dz, z1: r.z + dz + len, moving: false, broken: false, passed: false, near: false, cars: 1, color: 0 };
    const e = R.encounter(o); o.enc0 = e[0]; o.enc1 = e[1];
    r.world.obstacles.push(o);
    r.world.obstacles.sort((a, b) => a.enc0 - b.enc0);
  }, [type, dz]);
}

module.exports = { WEB, pageUrl, open, reload, rr, state, advance, advanceUntil, clearWorld, obstacleAhead };
