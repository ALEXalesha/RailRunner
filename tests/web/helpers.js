// Shared helpers of the page laws. RR_WEB - the web/ folder under test.
'use strict';
const path = require('path');
const { pathToFileURL } = require('url');

const WEB = process.env.RR_WEB || path.join(__dirname, '..', '..', 'web');
const pageUrl = (query = '') => pathToFileURL(path.join(WEB, 'index.html')).href + query;

// Opens the game. Pointer lock is replaced by a counter (a real call in headless Chromium
// on Windows clips the user's cursor), every request that is not a local file is an error.
async function open(page, query = '?manual=1&seed=7') {
  const errors = [];
  await page.addInitScript(() => {
    window.__pointerLockCalls = 0;
    Element.prototype.requestPointerLock = function () { window.__pointerLockCalls++; };
    document.exitPointerLock = function () {};
  });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('request', (r) => { if (!/^(file|data|blob):/.test(r.url())) errors.push('network: ' + r.url()); });
  await page.goto(pageUrl(query));
  await page.waitForFunction(() => window.RailRunner && window.RailRunner.overlay === 'menu');
  return errors;
}

const rr = (page, fn, arg) => page.evaluate(fn, arg);
const state = (page) => page.evaluate(() => ({
  state: RailRunner.state, overlay: RailRunner.overlay, lane: RailRunner.run.lane, y: RailRunner.run.y,
  z: RailRunner.run.z, slideT: RailRunner.run.slideT, alive: RailRunner.run.alive, demo: RailRunner.demo,
}));
const advance = (page, s, auto = false) => page.evaluate(([s, auto]) => RailRunner.advance(s, { auto }), [s, auto]);

// a world with nothing in it: the player can run without crashing
async function clearWorld(page) {
  await page.evaluate(() => {
    const w = RailRunner.run.world;
    w.obstacles.length = 0; w.coins.length = 0; w.powers.length = 0; w.genZ = Infinity;
  });
}

module.exports = { WEB, pageUrl, open, rr, state, advance, clearWorld };
