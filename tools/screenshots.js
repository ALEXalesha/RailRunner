// Frames for the README, taken in headless Chromium (no window on the screen):
//   npm run screens  ->  docs/screens/*.png
// The world comes from a fixed seed and the autopilot plays, so the frames are the same
// every time (up to the GPU's rounding).
'use strict';
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'screens');
const url = (q) => pathToFileURL(path.join(ROOT, 'web', 'index.html')).href + q;

async function page(browser, { w = 1280, h = 720, locale = 'ru-RU', theme = 'light' } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale, colorScheme: theme, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.addInitScript(() => { Element.prototype.requestPointerLock = function () {}; });
  await p.goto(url('?seed=21&manual=1&preserve=1'));
  await p.waitForFunction(() => window.RailRunner && RailRunner.overlay === 'menu');
  await p.evaluate((t) => { RailRunner.save.settings.theme = t; document.querySelector('#m-settings').click(); document.querySelector(`#s-theme [data-v="${t}"]`).click(); document.querySelector('#s-done').click(); }, theme);
  return p;
}
async function shot(p, name) {
  await p.waitForTimeout(150);
  await p.screenshot({ path: path.join(OUT, name) });
  console.log('docs/screens/' + name);
}
// play with the autopilot until something interesting is close ahead
async function playTo(p, seconds) {
  await p.click('#m-play');
  await p.evaluate((s) => RailRunner.advance(s, { auto: true }), seconds);
  await p.evaluate(() => { document.getElementById('hud-hint').classList.remove('show'); });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });

  let p = await page(browser);
  await p.evaluate(() => RailRunner.advance(4));
  await shot(p, 'menu.png');
  await playTo(p, 21);
  await shot(p, 'day.png');
  await p.close();

  p = await page(browser, { theme: 'dark' });
  await playTo(p, 33);
  await p.evaluate(() => { RailRunner.run.power.magnet = 6; RailRunner.run.power.x2 = 8; RailRunner.advance(1 / 60); });
  await shot(p, 'night.png');
  await p.keyboard.press('KeyP');
  await p.click('#p-settings');
  await shot(p, 'settings.png');
  await p.close();

  p = await page(browser, { w: 400, h: 820, theme: 'dark' });
  await playTo(p, 15);
  await shot(p, 'phone.png');
  await p.close();

  p = await page(browser, { locale: 'en-US' });
  await p.evaluate(() => { const s = RailRunner.save; s.coins = 2400; s.upgrades.magnet = 2; s.upgrades.board = 1; });
  await p.click('#m-upgrades');
  await shot(p, 'upgrades-en.png');
  await p.close();

  await browser.close();
})();
