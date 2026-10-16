// Frames for the README, taken in headless Chromium (no window on the screen):
//   npm run screens  ->  docs/screens/*.png
// The world comes from a fixed seed and the autopilot plays, so the frames are the same
// every time (up to the GPU's rounding). Old frames that are no longer made are listed.
'use strict';
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'screens');
const url = (q) => pathToFileURL(path.join(ROOT, 'web', 'index.html')).href + q;
const made = [];

// a page with a ready save (the tutorial done, some coins and progress, high quality)
async function page(browser, { w = 1280, h = 720, locale = 'ru-RU', theme = 'light', district = '', save = {} } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale, colorScheme: theme, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const s = Object.assign({ v: 2, tutorialDone: true, best: 18450, coins: 3260, keys: 3, boards: 2, runs: 23, settings: { quality: 'high', theme } }, save);
  await p.addInitScript((s) => { Element.prototype.requestPointerLock = function () {}; if (!sessionStorage.getItem('init')) { localStorage.setItem('railrunner:save', s); sessionStorage.setItem('init', '1'); } }, JSON.stringify(s));
  await p.goto(url(`?seed=21&manual=1&preserve=1&date=2026-10-17${district ? '&district=' + district : ''}`));
  await p.waitForFunction(() => window.RailRunner && RailRunner.overlay === 'menu');
  return p;
}
// a few drawn frames so that the camera and the particles settle
const settle = (p, n = 45, auto = true) => p.evaluate(([n, auto]) => { for (let i = 0; i < n; i++) RailRunner.advance(1 / 60, { auto }); }, [n, auto]);
async function shot(p, name) {
  await p.waitForTimeout(150);
  await p.screenshot({ path: path.join(OUT, name) });
  made.push(name);
  console.log('docs/screens/' + name);
}
async function playTo(p, seconds) {
  await p.click('#m-play');
  await p.evaluate((s) => RailRunner.advance(s, { auto: true }), seconds);
  await settle(p);
  await p.evaluate(() => { document.getElementById('hud-hint').classList.remove('show'); });
}
const givePower = (p, kind) => p.evaluate((kind) => {
  const r = RailRunner.run;
  r.world.powers.push({ id: 9e6, kind, lane: r.lane, z: r.z + 2, y: Math.max(1, r.y + 1), taken: false });
  r.world.powers.sort((a, b) => a.z - b.z);
}, kind);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });

  let p = await page(browser, { save: { missions: { level: 4 } } });
  await settle(p, 120);
  await shot(p, 'menu.png');
  await playTo(p, 21);
  await p.evaluate(() => { const r = RailRunner.run; r.power.magnet = 6; r.combo = 4; r.comboT = 2.5; });
  await settle(p, 10);
  await shot(p, 'city.png');
  await p.close();

  p = await page(browser, { district: 'industrial' });
  await playTo(p, 17);
  await shot(p, 'industrial.png');
  await p.close();

  p = await page(browser, { district: 'bridge' });
  await playTo(p, 14);
  await shot(p, 'bridge.png');
  await p.close();

  p = await page(browser, { district: 'neon', theme: 'dark' });
  await playTo(p, 12);
  await givePower(p, 'jetpack');
  await settle(p, 150);
  await shot(p, 'neon-jetpack.png');
  await p.close();

  p = await page(browser, { district: 'tunnel' });
  await playTo(p, 9);
  await p.evaluate(() => { RailRunner.run.power.board = 20; RailRunner.run.power.x2 = 8; });
  await settle(p, 30);
  await shot(p, 'tunnel-board.png');
  await p.close();

  p = await page(browser, { save: { coins: 6400, owned: { chars: ['kit', 'mila', 'max'], boards: ['basic', 'neon'] }, char: 'max', board: 'neon' } });
  await p.click('#m-shop');
  await settle(p, 60, false);
  await shot(p, 'shop.png');
  await p.close();

  p = await page(browser, { locale: 'en-US', save: { missions: { level: 3 }, keys: 2, daily: { date: '2026-10-16', done: true, streak: 2, last: '2026-10-16' } } });
  await p.evaluate(() => { const m = RailRunner.save.missions; m.progress = [1, 0, 0]; m.done = [false, true, false]; });
  await p.click('#m-missions');
  await shot(p, 'missions-en.png');
  await p.close();

  p = await page(browser, { w: 400, h: 820, theme: 'dark', save: { tutorialDone: false } });
  await p.click('#m-play');
  await p.evaluate(() => RailRunner.advance(4.1));
  await settle(p, 30, false);
  await shot(p, 'phone-tutorial.png');
  await p.close();

  await browser.close();
  // frames of older versions that are not made any more (to the Recycle Bin by hand)
  for (const f of fs.readdirSync(OUT)) if (f.endsWith('.png') && !made.includes(f)) console.log('old frame, not made any more: docs/screens/' + f);
})();
