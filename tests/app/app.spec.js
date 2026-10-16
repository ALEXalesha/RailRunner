// Законы приложения на Electron: окно в тестах невидимо (RR_TEST=1), без фокуса и за экраном.
// Запуск: npm run test:app
'use strict';
const { test, expect, _electron: electron } = require('@playwright/test');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

async function launch(dataDir) {
  const app = await electron.launch({
    executablePath: require('electron'),
    args: [ROOT, '--user-data-dir=' + dataDir],
    env: { ...process.env, RR_TEST: '1' },
  });
  const win = await app.firstWindow();
  await win.addInitScript(() => { Element.prototype.requestPointerLock = function () { window.__pointerLockCalls = (window.__pointerLockCalls || 0) + 1; }; });
  await win.waitForFunction(() => window.RailRunner && window.RailRunner.overlay === 'menu');
  return { app, win };
}

test('окно невидимо и без фокуса, страница игры открыта, захвата указателя нет', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'railrunner-app-'));
  const { app, win } = await launch(dir);
  try {
    const w = await app.evaluate(({ BrowserWindow }) => {
      const b = BrowserWindow.getAllWindows()[0];
      return { visible: b.isVisible(), focusable: b.isFocusable(), bounds: b.getBounds(), menu: b.isMenuBarVisible() };
    });
    expect(w.visible).toBe(false);
    expect(w.focusable).toBe(false);
    expect(w.bounds.x).toBeLessThan(-10000);
    expect(w.menu).toBe(false);
    expect(await win.title()).toBe('Бег по рельсам');
    await win.click('#m-play');
    await win.evaluate(() => RailRunner.advance(3, { auto: true }));
    expect(await win.evaluate(() => RailRunner.state)).toBe('playing');
    expect(await win.evaluate(() => document.pointerLockElement)).toBeNull();
  } finally {
    await app.close();
  }
});

test('рекорд и настройки переживают перезапуск приложения', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'railrunner-app-'));
  let first = await launch(dir);
  await first.win.evaluate(() => {
    const s = RailRunner.core.defaultSave();
    s.best = 4321; s.coins = 77; s.settings.theme = 'dark'; s.settings.lang = 'en';
    localStorage.setItem('railrunner:save', JSON.stringify(s));
  });
  await first.app.close();
  const second = await launch(dir);
  try {
    await expect(second.win.locator('#m-best')).toHaveText('4321');
    await expect(second.win.locator('#m-play')).toHaveText('Play');
    expect(await second.win.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  } finally {
    await second.app.close();
  }
});

test('ссылки и переходы не уводят со страницы игры', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'railrunner-app-'));
  const { app, win } = await launch(dir);
  try {
    const before = win.url();
    await win.evaluate(() => { location.href = 'https://example.com/'; });
    await win.waitForTimeout(500);
    expect(win.url()).toBe(before);
    const opened = await win.evaluate(() => window.open('https://example.com/') === null);
    expect(opened).toBe(true);
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
  } finally {
    await app.close();
  }
});
