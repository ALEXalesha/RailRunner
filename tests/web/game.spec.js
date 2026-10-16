// Законы страницы RailRunner: сценарии игрока в headless Chromium (окон на экране нет).
// Запуск: npx playwright test --workers=1 (RR_WEB - другая папка web/, так гоняет мутанты tools/mutate.js)
'use strict';
const { test, expect } = require('@playwright/test');
const { open, reload, state, advance, advanceUntil, clearWorld, obstacleAhead, pageUrl } = require('./helpers');

const SAVE_1_0 = {
  v: 1, best: 5432, coins: 1234, runs: 17, totalCoins: 2890, bestDistance: 1870,
  upgrades: { magnet: 2, x2: 1, boots: 0, board: 5 },
  settings: { lang: 'ru', theme: 'light', music: 0.3, sfx: 0.6, quality: 'low', showFps: false,
    bindings: { left: ['ArrowLeft', 'KeyA', null], right: ['ArrowRight', 'KeyD', null], jump: ['ArrowUp', 'KeyW', 'Space'], slide: ['ArrowDown', 'KeyS', null], pause: ['KeyP', 'Escape', null] } },
};

test('страница открывается без ошибок и без сети; имя для Хаба; версия; захвата указателя нет', async ({ page }) => {
  const errors = await open(page);
  await expect(page).toHaveTitle('Бег по рельсам');
  await expect(page.locator('meta[name="application-name"]')).toHaveAttribute('content', 'Бег по рельсам');
  const pkg = require('../../package.json');
  await expect(page.locator('#m-ver')).toHaveText('RailRunner ' + pkg.version);
  expect(await page.evaluate(() => RailRunner.version)).toBe(pkg.version);
  expect(await page.evaluate(() => !!document.querySelector('#view').getContext('webgl2'))).toBe(true);
  await page.click('#m-play');
  await advance(page, 5, true);
  expect(await page.evaluate(() => window.__pointerLockCalls)).toBe(0);
  expect(await page.evaluate(() => document.pointerLockElement)).toBeNull();
  expect(errors).toEqual([]);
});

test('«Играть» запускает забег: меню прячется, видны счёт, монеты, метры, множитель и кнопка доски', async ({ page }) => {
  await open(page);
  await expect(page.locator('#scr-menu')).toBeVisible();
  await expect(page.locator('#hud')).toBeHidden();
  await page.click('#m-play');
  const s = await state(page);
  expect(s.state).toBe('playing');
  expect(s.demo).toBe(false);
  await expect(page.locator('#scr-menu')).toBeHidden();
  await expect(page.locator('#hud')).toBeVisible();
  await advance(page, 2);
  await expect(page.locator('#hud-score')).not.toHaveText('0');
  await expect(page.locator('#hud-dist')).toContainText('м');
  await expect(page.locator('#hud-mult')).toHaveText('x1');
  await expect(page.locator('#btn-board')).toBeVisible();
});

test('обучение: первый забег новичка - подсказки, время ждёт нужного действия, потом обычный забег; второй раз не показывается', async ({ page }) => {
  await open(page, '?manual=1&seed=7', { fresh: true });
  await page.click('#m-play');
  expect(await page.evaluate(() => !!RailRunner.tutorial)).toBe(true);
  await advance(page, 4);
  await expect(page.locator('#hud-tut')).toHaveClass(/show/);
  await expect(page.locator('#hud-tut')).toContainText('Смени путь');
  expect(await page.evaluate(() => RailRunner.tutorial.waiting)).toBe(true);
  // ожидание: за секунду почти не продвинулись
  const z1 = (await state(page)).z;
  await advance(page, 1);
  const z2 = (await state(page)).z;
  expect(z2 - z1).toBeLessThan(5);
  // не то действие - ждёт дальше, нужное - время пошло
  await page.keyboard.press('ArrowUp');
  expect(await page.evaluate(() => RailRunner.tutorial.waiting)).toBe(true);
  await page.keyboard.press('ArrowLeft');
  expect(await page.evaluate(() => RailRunner.tutorial.waiting)).toBe(false);
  await advance(page, 1);
  expect((await state(page)).z - z2).toBeGreaterThan(10);
  // дальше уроки проходит автопилот; обучение кончается и запоминается
  await advance(page, 60, true);
  expect((await state(page)).alive).toBe(true);
  expect(await page.evaluate(() => RailRunner.save.tutorialDone)).toBe(true);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('railrunner:save')).tutorialDone)).toBe(true);
  await page.keyboard.press('KeyP');
  await page.click('#p-menu');
  await page.click('#m-play');
  expect(await page.evaluate(() => RailRunner.tutorial)).toBeNull();
});

test('обучение: авария на уроке не кончает забег - игрок продолжает бесплатно', async ({ page }) => {
  await open(page, '?manual=1&seed=7', { fresh: true });
  await page.click('#m-play');
  await advance(page, 4);
  await page.keyboard.press('ArrowUp');                // прыжок вместо смены пути - в поезд
  await page.evaluate(() => { RailRunner.tutorial.waiting = false; });
  await advanceUntil(page, ['countdown', 'over', 'continue'], 30);
  expect((await state(page)).state).toBe('countdown');
  await advance(page, 2);
  expect((await state(page)).state).toBe('playing');
  expect(await page.evaluate(() => RailRunner.save.keys)).toBe(0);
});

test('клавиши по умолчанию: стрелки, WASD, пробел, B - доска', async ({ page }) => {
  await open(page, '?manual=1&seed=7', { save: { boards: 1 } });
  await page.click('#m-play');
  await clearWorld(page);
  await page.keyboard.press('ArrowLeft');
  await advance(page, 0.3);
  expect((await state(page)).lane).toBe(-1);
  await page.keyboard.press('KeyD');
  await page.keyboard.press('KeyD');
  await advance(page, 0.4);
  expect((await state(page)).lane).toBe(1);
  await page.keyboard.press('KeyA');
  await advance(page, 0.3);
  expect((await state(page)).lane).toBe(0);
  for (const k of ['ArrowUp', 'KeyW', 'Space']) {
    await page.keyboard.press(k);
    await advance(page, 0.15);
    expect((await state(page)).y).toBeGreaterThan(0.3);
    await advance(page, 1);
  }
  for (const k of ['ArrowDown', 'KeyS']) {
    await page.keyboard.press(k);
    await advance(page, 0.1);
    expect((await state(page)).slideT).toBeGreaterThan(0);
    await advance(page, 1);
  }
  await page.keyboard.press('KeyB');
  await advance(page, 0.1);
  expect(await page.evaluate(() => RailRunner.run.power.board)).toBeGreaterThan(0);
});

test('мышь и палец: свайпы во все стороны и касания третей экрана', async ({ page }) => {
  await open(page);
  await page.click('#m-play');
  await clearWorld(page);
  const box = await page.locator('#view').boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx - 150, cy + 10, { steps: 5 });
  await page.mouse.up();
  await advance(page, 0.3);
  expect((await state(page)).lane).toBe(-1);
  const swipe = (dx, dy, x = cx, y = cy) => page.evaluate(([x, y, dx, dy]) => {
    const c = document.querySelector('#view');
    const ev = (type, px, py) => c.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: px, clientY: py, bubbles: true }));
    ev('pointerdown', x, y);
    ev('pointermove', x + dx / 2, y + dy / 2);
    ev('pointermove', x + dx, y + dy);
    ev('pointerup', x + dx, y + dy);
  }, [x, y, dx, dy]);
  await swipe(160, 0);
  await advance(page, 0.3);
  expect((await state(page)).lane).toBe(0);
  await swipe(0, -160);
  await advance(page, 0.12);
  expect((await state(page)).y).toBeGreaterThan(0.3);
  await advance(page, 1);
  await swipe(0, 160);
  await advance(page, 0.1);
  expect((await state(page)).slideT).toBeGreaterThan(0);
  await advance(page, 1);
  await swipe(0, 0, box.x + box.width * 0.9, cy);
  await advance(page, 0.3);
  expect((await state(page)).lane).toBe(1);
  await swipe(0, 0, box.x + box.width * 0.1, cy);
  await advance(page, 0.3);
  expect((await state(page)).lane).toBe(0);
  await swipe(0, 0, cx, cy);
  await advance(page, 0.12);
  expect((await state(page)).y).toBeGreaterThan(0.3);
});

test('пауза: P, Esc и кнопка; на паузе мир стоит; продолжение - с отсчётом; на паузе видны задания', async ({ page }) => {
  await open(page, '?seed=7');
  await page.click('#m-play');
  await clearWorld(page);
  await page.waitForTimeout(300);
  for (const how of ['KeyP', 'Escape', 'button']) {
    if (how === 'button') await page.click('#btn-pause');
    else await page.keyboard.press(how);
    await expect(page.locator('#scr-pause')).toBeVisible();
    await expect(page.locator('#p-missions .mm')).toHaveCount(3);
    expect((await state(page)).state).toBe('paused');
    const z1 = (await state(page)).z;
    await page.waitForTimeout(700);
    expect((await state(page)).z).toBe(z1);
    if (how === 'button') await page.click('#p-resume');
    else await page.keyboard.press(how);
    expect((await state(page)).state).toBe('countdown');
    await expect(page.locator('#hud-count')).toHaveText(/[123]/);
    await page.waitForFunction(() => RailRunner.state === 'playing', null, { timeout: 8000 });
    await page.waitForTimeout(300);
    expect((await state(page)).z).toBeGreaterThan(z1);
  }
});

test('скрытая вкладка и потеря фокуса ставят паузу', async ({ page }) => {
  await open(page);
  await page.click('#m-play');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect((await state(page)).state).toBe('paused');
  await page.click('#p-resume');
  await advance(page, 2);
  expect((await state(page)).state).toBe('playing');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  expect((await state(page)).state).toBe('paused');
});

test('авария: есть ключ - предложение продолжить, ключ тратится, забег идёт дальше; отказ - итоги', async ({ page }) => {
  await open(page, '?manual=1&seed=7', { save: { keys: 3, coins: 0 } });
  await page.click('#m-play');
  await advance(page, 6, true);
  await clearWorld(page);
  await obstacleAhead(page, 'hurdle');
  expect(await advanceUntil(page, ['continue', 'over'], 20)).toBe('continue');
  await expect(page.locator('#scr-continue')).toBeVisible();
  await expect(page.locator('#c-keys')).toHaveText('Продолжить за 1 🔑');
  await expect(page.locator('#c-keys')).toBeEnabled();
  await expect(page.locator('#c-buy')).toBeHidden();
  await page.click('#c-keys');
  expect(await page.evaluate(() => [RailRunner.save.keys, RailRunner.run.alive, RailRunner.state])).toEqual([2, true, 'countdown']);
  await advance(page, 2);
  expect((await state(page)).state).toBe('playing');
  // вторая авария - уже 2 ключа
  await obstacleAhead(page, 'fence', 45);
  await advance(page, 4);
  expect(await advanceUntil(page, ['continue', 'over'], 20)).toBe('continue');
  await expect(page.locator('#c-keys')).toHaveText('Продолжить за 2 🔑');
  await page.click('#c-no');
  await expect(page.locator('#scr-over')).toBeVisible();
  expect(await page.evaluate(() => RailRunner.save.keys)).toBe(2);
  expect(await page.evaluate(() => RailRunner.save.stats.revives)).toBe(1);
});

test('авария: ключей нет, но хватает монет - докупить и продолжить; нет ни того, ни другого - сразу итоги; таймер сам закрывает', async ({ page }) => {
  await open(page, '?manual=1&seed=7', { save: { keys: 0, coins: 600 } });
  await page.click('#m-play');
  await clearWorld(page);
  await obstacleAhead(page, 'hurdle');
  expect(await advanceUntil(page, ['continue', 'over'], 20)).toBe('continue');
  await expect(page.locator('#c-keys')).toBeDisabled();
  await expect(page.locator('#c-buy')).toBeVisible();
  await expect(page.locator('#c-buy')).toContainText('500');
  await page.click('#c-buy');
  expect(await page.evaluate(() => [RailRunner.save.keys, RailRunner.save.coins, RailRunner.run.alive])).toEqual([0, 100, true]);
  await advance(page, 2);
  await obstacleAhead(page, 'hurdle', 50);
  expect(await advanceUntil(page, ['continue', 'over'], 20)).toBe('over');
  // таймер предложения
  await page.click('#o-again');
  await page.evaluate(() => { RailRunner.save.keys = 5; });
  await clearWorld(page);
  await obstacleAhead(page, 'hurdle');
  expect(await advanceUntil(page, ['continue', 'over'], 20)).toBe('continue');
  await advance(page, 7.5);
  expect((await state(page)).state).toBe('over');
  expect(await page.evaluate(() => RailRunner.save.keys)).toBe(5);
});

test('итоги: очки, монеты, рекорд, место в рекордах, новости; всё сохраняется и видно после перезагрузки', async ({ page }) => {
  await open(page);
  await page.click('#m-play');
  await advance(page, 12, true);
  await clearWorld(page);
  await obstacleAhead(page, 'hurdle');
  expect(await advanceUntil(page, ['continue', 'over'], 20)).toBe('over');
  await expect(page.locator('#scr-over')).toBeVisible();
  const res = await page.evaluate(() => ({ score: RailRunner.run.score, coins: RailRunner.run.coins }));
  expect(res.coins).toBeGreaterThan(0);
  await expect(page.locator('#o-score')).toHaveText(String(res.score));
  await expect(page.locator('#o-coins')).toHaveText(String(res.coins));
  await expect(page.locator('#o-record')).toBeVisible();
  await expect(page.locator('#o-best')).toContainText('Место в рекордах: 1');
  await expect(page.locator('#o-news')).toContainText('Первый забег');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('railrunner:save')));
  const over = await page.evaluate(() => RailRunner.lastOver);
  expect(saved.best).toBe(res.score);
  expect(saved.coins).toBe(res.coins + over.ach.length * 100 + over.mis.coins);   // + награды за достижения и задания
  expect(over.ach).toContain('first');
  expect(saved.bestRuns[0].score).toBe(res.score);
  await reload(page);
  await expect(page.locator('#m-best')).toHaveText(res.score.toLocaleString('ru-RU'));
  await page.click('#m-records');
  await expect(page.locator('#rc-runs .run')).toHaveCount(1);
  await expect(page.locator('#rc-stats [data-stat="s_runs"]')).toHaveText('1');
  await page.click('#rc-done');
  await page.click('#m-ach');
  await expect(page.locator('.ach:not(.locked)')).toHaveCount(over.ach.length);
  await expect(page.locator('#ac-count')).toContainText(`Открыто ${over.ach.length} из`);
});

test('сохранение 1.0 читается: рекорд, монеты и улучшения на месте, обучение не показывается', async ({ page }) => {
  await open(page, '?manual=1&seed=7', { fresh: true });
  await page.evaluate((s) => localStorage.setItem('railrunner:save', JSON.stringify(s)), SAVE_1_0);
  await reload(page);
  await expect(page.locator('#m-best')).toHaveText((5432).toLocaleString('ru-RU'));
  await expect(page.locator('#m-coins')).toHaveText((1234).toLocaleString('ru-RU'));
  await page.click('#m-shop');
  await page.click('#sh-tabs [data-tab="upgrades"]');
  await expect(page.locator('.upg[data-power="board"] .lvl i.on')).toHaveCount(5);
  await expect(page.locator('.upg[data-power="magnet"] .lvl i.on')).toHaveCount(2);
  await page.click('#sh-done');
  await page.click('#m-play');
  expect(await page.evaluate(() => RailRunner.tutorial)).toBeNull();
  expect(await page.evaluate(() => RailRunner.view.quality)).toBe('low');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('railrunner:save')));
  expect(saved.v).toBe(1);                                  // переписывается только после изменений
  await page.keyboard.press('KeyP');
  await page.click('#p-settings');
  await page.click('#s-theme [data-v="light"]');
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('railrunner:save')));
  expect([after.v, after.best, after.coins, after.upgrades.board]).toEqual([2, 5432, 1234, 5]);
});

test('переназначение: новая клавиша работает, старая нет, подсказки называют новую, всё переживает перезагрузку', async ({ page }) => {
  await open(page);
  await page.click('#m-settings');
  await page.click('.key[data-action="jump"][data-slot="0"]');
  await expect(page.locator('.key[data-action="jump"][data-slot="0"]')).toHaveText('Нажмите клавишу…');
  await page.keyboard.press('KeyJ');
  await expect(page.locator('.key[data-action="jump"][data-slot="0"]')).toHaveText('J');
  await page.click('.key[data-action="slide"][data-slot="2"]');
  await page.keyboard.press('KeyA');
  await expect(page.locator('.key[data-action="left"][data-slot="1"]')).toHaveText('—');
  await page.click('.key[data-action="right"][data-slot="0"]');
  await page.keyboard.press('Escape');
  await expect(page.locator('.key[data-action="right"][data-slot="0"]')).toHaveText('→');
  await expect(page.locator('.key[data-action="board"][data-slot="0"]')).toHaveText('B');
  await page.click('#s-done');
  await expect(page.locator('#m-hint')).toContainText('J / W / Пробел - прыжок');
  await expect(page.locator('#m-hint')).toContainText('↓ / S / A - подкат');
  await expect(page.locator('#m-hint')).not.toContainText('↑');
  await page.click('#m-howto');
  await expect(page.locator('#h-text')).toContainText('Прыжок: J / W / Пробел');
  await expect(page.locator('#h-text')).toContainText('Смена пути: ← и → / D');
  await page.click('#h-done');
  await page.click('#m-play');
  await expect(page.locator('#hud-hint')).toContainText('J / W / Пробел - прыжок');
  await clearWorld(page);
  await page.keyboard.press('ArrowUp');
  await advance(page, 0.15);
  expect((await state(page)).y).toBe(0);
  await page.keyboard.press('KeyJ');
  await advance(page, 0.15);
  expect((await state(page)).y).toBeGreaterThan(0.3);
  await advance(page, 1);
  await page.keyboard.press('KeyA');
  await advance(page, 0.1);
  expect((await state(page)).slideT).toBeGreaterThan(0);
  expect((await state(page)).lane).toBe(0);
  await page.keyboard.press('KeyP');
  await expect(page.locator('#p-hint')).toContainText('J / W / Пробел - прыжок');
  await reload(page);
  await expect(page.locator('#m-hint')).toContainText('J / W / Пробел - прыжок');
  await page.click('#m-settings');
  await page.click('#s-reset');
  await expect(page.locator('.key[data-action="jump"][data-slot="0"]')).toHaveText('↑');
});

test('тема: как в системе, светлая и тёмная; в тёмной забег начинается в неоновом городе; выбор переживает перезагрузку', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await open(page);
  expect(await page.evaluate(() => [document.documentElement.dataset.theme, RailRunner.view.theme])).toEqual(['dark', 'dark']);
  expect(await page.evaluate(() => RailRunner.run.district)).toBe('neon');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('light');
  await page.click('#m-settings');
  await page.click('#s-theme [data-v="dark"]');
  expect(await page.evaluate(() => [document.documentElement.dataset.theme, RailRunner.view.theme])).toEqual(['dark', 'dark']);
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.click('#s-theme [data-v="light"]');
  expect(await page.evaluate(() => [document.documentElement.dataset.theme, RailRunner.view.theme])).toEqual(['light', 'light']);
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).not.toBe(bg);
  await page.click('#s-done');
  await page.click('#m-play');
  expect(await page.evaluate(() => RailRunner.run.district)).toBe('city');
  await page.keyboard.press('KeyP');
  await page.click('#p-settings');
  await page.click('#s-theme [data-v="dark"]');
  await page.emulateMedia({ colorScheme: 'light' });
  await reload(page);
  expect(await page.evaluate(() => [document.documentElement.dataset.theme, RailRunner.view.theme])).toEqual(['dark', 'dark']);
});

test.describe('язык браузера английский', () => {
  test.use({ locale: 'en-US' });
  test('язык: по умолчанию - браузера; переключение меняет заголовок, кнопки, задания и подсказки и сохраняется', async ({ page }) => {
    await open(page);
    await expect(page).toHaveTitle('Rail Runner');
    await expect(page.locator('#m-play')).toHaveText('Play');
    await expect(page.locator('#m-hint')).toContainText('↑ / W / Space - jump');
    await expect(page.locator('#m-daily .card-title')).toHaveText('Daily challenge');
    await page.click('#m-settings');
    await page.click('#s-lang [data-v="ru"]');
    await expect(page.locator('#s-done')).toHaveText('Готово');
    await page.click('#s-done');
    await expect(page).toHaveTitle('Бег по рельсам');
    await expect(page.locator('#m-play')).toHaveText('Играть');
    await expect(page.locator('#m-hint')).toContainText('↑ / W / Пробел - прыжок');
    await expect(page.locator('#m-daily .card-title')).toHaveText('Испытание дня');
    expect(await page.evaluate(() => document.documentElement.lang)).toBe('ru');
    await reload(page);
    await expect(page.locator('#m-play')).toHaveText('Играть');
  });
});

// Все видимые кнопки внутри окна и не налезают друг на друга (липкая полоса «Готово» над
// прокручиваемым содержимым - не наложение, её пары не считаются).
async function layoutProblems(page, where) {
  return page.evaluate((where) => {
    const W = innerWidth, H = innerHeight;
    const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && el.offsetParent !== null; };
    const scope = document.querySelector(where);
    const panel = scope.querySelector('.panel') || scope;
    const pr = panel.getBoundingClientRect();
    const out = [];
    if (pr.left < -0.5 || pr.top < -0.5 || pr.right > W + 0.5 || pr.bottom > H + 0.5) out.push(`${where}: панель за окном ${JSON.stringify(pr)}`);
    if (document.documentElement.scrollWidth > W + 1) out.push(`${where}: горизонтальная прокрутка страницы`);
    const els = [...scope.querySelectorAll('button, input, .stats > div, .results > div, h1, h2, .shop-card, .ach, .mission')].filter(vis);
    const clipOf = (el) => { const c = el.closest('.shop-list') || panel; return c.getBoundingClientRect(); };
    for (const el of els) {
      const r = el.getBoundingClientRect();
      const cr = clipOf(el);
      if (r.bottom < cr.top || r.top > cr.bottom) continue;          // прокручено за край
      if (r.left < pr.left - 0.5 || r.right > pr.right + 0.5) out.push(`${where}: ${el.id || el.textContent.trim().slice(0, 20)} вылезает вбок`);
      if (el.scrollWidth > el.clientWidth + 2 && el.tagName === 'BUTTON' && !el.classList.contains('key')) out.push(`${where}: текст не влез в «${el.textContent.trim()}»`);
    }
    for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
      const a = els[i], b = els[j];
      if (a.contains(b) || b.contains(a)) continue;
      if (a.closest('.sticky-bottom') || b.closest('.sticky-bottom')) continue;
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      const ca = clipOf(a), cb = clipOf(b);
      const inA = ra.top >= ca.top - 0.5 && ra.bottom <= ca.bottom + 0.5, inB = rb.top >= cb.top - 0.5 && rb.bottom <= cb.bottom + 0.5;
      if (!inA || !inB) continue;
      const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (w > 1 && h > 1) out.push(`${where}: «${a.textContent.trim().slice(0, 16)}» налезает на «${b.textContent.trim().slice(0, 16)}»`);
    }
    return out;
  }, where);
}

test('раскладка: все экраны помещаются от 360x640 до 1920x1080 в обеих темах', async ({ page }) => {
  test.setTimeout(420000);
  await open(page, '?manual=1&seed=7', { save: { coins: 3000, keys: 1 } });
  const problems = [];
  for (const [w, h] of [[360, 640], [390, 844], [640, 360], [768, 1024], [1280, 760], [1920, 1080]]) {
    await page.setViewportSize({ width: w, height: h });
    for (const theme of ['light', 'dark']) {
      await page.evaluate((t) => { RailRunner.save.settings.theme = t; document.documentElement.dataset.theme = t; }, theme);
      const tag = `${w}x${h} ${theme}`;
      await page.evaluate(() => RailRunner.toMenu());
      for (const p of await layoutProblems(page, '#scr-menu')) problems.push(tag + ' ' + p);
      for (const [btn, scr] of [['#m-settings', '#scr-settings'], ['#m-missions', '#scr-missions'], ['#m-ach', '#scr-ach'], ['#m-records', '#scr-records'], ['#m-howto', '#scr-howto']]) {
        await page.click(btn);
        for (const p of await layoutProblems(page, scr)) problems.push(tag + ' ' + p);
        await page.locator(scr + ' .sticky-bottom .btn').click();
      }
      await page.click('#m-shop');
      for (const tab of ['chars', 'boards', 'upgrades', 'items']) {
        await page.click(`#sh-tabs [data-tab="${tab}"]`);
        for (const p of await layoutProblems(page, '#scr-shop')) problems.push(`${tag} ${tab} ${p}`);
      }
      await page.click('#sh-done');
      await page.click('#m-play');
      await clearWorld(page);
      await page.evaluate(() => { RailRunner.run.power.magnet = 5; RailRunner.run.power.x2 = 5; RailRunner.run.combo = 3; RailRunner.run.comboT = 2; });
      await advance(page, 0.5);
      const hud = await page.evaluate(() => {
        const r = (id) => document.getElementById(id).getBoundingClientRect();
        const a = r('btn-pause'), b = document.querySelector('.hud-right').getBoundingClientRect(), c = r('hud-hint'), d = r('btn-board'), e = r('hud-combo'), f = r('hud-powers');
        const inside = (q) => q.left >= 0 && q.top >= 0 && q.right <= innerWidth && q.bottom <= innerHeight;
        const cross = (p, q) => Math.min(p.right, q.right) > Math.max(p.left, q.left) && Math.min(p.bottom, q.bottom) > Math.max(p.top, q.top);
        return [inside(a) && inside(b) && inside(c) && inside(d) && inside(e), !cross(a, b), !cross(c, b) && !cross(c, a) && !cross(c, d), !cross(e, b) && !cross(e, a), !cross(f, b)];
      });
      if (hud.includes(false)) problems.push(`${tag} HUD: ${hud}`);
      await page.keyboard.press('KeyP');
      for (const p of await layoutProblems(page, '#scr-pause')) problems.push(tag + ' ' + p);
      await page.click('#p-menu');
    }
  }
  expect(problems).toEqual([]);
});

test('итоги и продолжение тоже помещаются на маленьком экране', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await open(page, '?manual=1&seed=7', { save: { keys: 2 } });
  await page.click('#m-play');
  await clearWorld(page);
  await obstacleAhead(page, 'hurdle');
  expect(await advanceUntil(page, ['continue', 'over'], 20)).toBe('continue');
  for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, theme);
    expect(await layoutProblems(page, '#scr-continue')).toEqual([]);
  }
  await page.click('#c-no');
  for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, theme);
    expect(await layoutProblems(page, '#scr-over')).toEqual([]);
  }
});

test('звук: синтез после щелчка, монеты звенят, ранец ревёт, громкость 0 глушит, музыка только в забеге и быстрее со скоростью', async ({ page }) => {
  await open(page);
  expect(await page.evaluate(() => RailRunner.audio.ctx)).toBeNull();
  await advance(page, 3);
  expect(await page.evaluate(() => RailRunner.audio.log.length)).toBe(0);
  await page.click('#m-play');
  expect(await page.evaluate(() => !!RailRunner.audio.ctx)).toBe(true);
  expect(await page.evaluate(() => RailRunner.audio.musicOn)).toBe(true);
  const bpm0 = await page.evaluate(() => RailRunner.audio.bpm);
  await advance(page, 10, true);
  const log = await page.evaluate(() => RailRunner.audio.log.slice());
  expect(log).toContain('coin');
  expect(log).toContain('jump');
  await page.evaluate(() => { const r = RailRunner.run; r.world.powers.push({ id: 5e6, kind: 'jetpack', lane: r.lane, z: r.z + 2, y: Math.max(1, r.y + 1), taken: false }); r.world.powers.sort((a, b) => a.z - b.z); });
  await advance(page, 1, true);
  expect(await page.evaluate(() => RailRunner.audio.jetOn)).toBe(true);
  await advance(page, 60, true);
  expect(await page.evaluate(() => RailRunner.audio.jetOn)).toBe(false);
  expect(await page.evaluate(() => RailRunner.audio.bpm)).toBeGreaterThan(bpm0 + 5);
  await page.keyboard.press('KeyP');
  await page.click('#p-settings');
  for (const id of ['#s-sfx', '#s-music']) {
    await page.locator(id).evaluate((el) => { el.value = '0'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  }
  expect(await page.evaluate(() => RailRunner.audio.volumes)).toMatchObject({ sfxGain: 0, musicGain: 0 });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('railrunner:save')).settings.sfx)).toBe(0);
  await page.click('#s-done');
  await page.click('#p-menu');
  expect(await page.evaluate(() => RailRunner.audio.musicOn)).toBe(false);
});

test('меню: за экраном бежит демо, оно не звучит и не трогает счёт', async ({ page }) => {
  await open(page, '?seed=7');
  await page.click('#m-howto');
  await page.click('#h-done');
  const z1 = (await state(page)).z;
  await page.waitForTimeout(800);
  const s = await state(page);
  expect(s.demo).toBe(true);
  expect(s.z).toBeGreaterThan(z1);
  expect(await page.evaluate(() => RailRunner.audio.log.filter((x) => x !== 'click').length)).toBe(0);
  expect(await page.evaluate(() => RailRunner.save.runs)).toBe(0);
});

test('магазин: персонаж - просмотр не выбирает, покупка списывает монеты и выбирает, всё сохраняется; без монет кнопка неактивна', async ({ page }) => {
  await open(page, '?manual=1&seed=7', { save: { coins: 2000 } });
  await page.click('#m-shop');
  expect(await page.evaluate(() => RailRunner.view.info().calls)).toBeGreaterThan(0);
  await expect(page.locator('#sh-coins')).toHaveText('2 000');
  await page.click('.shop-card[data-id="zoe"]');
  await expect(page.locator('.shop-card[data-id="zoe"]')).toHaveClass(/on/);
  expect(await page.evaluate(() => RailRunner.save.char)).toBe('kit');
  await expect(page.locator('.shop-card[data-id="zoe"] .btn')).toBeDisabled();       // 2500 > 2000
  await page.locator('.shop-card[data-id="mila"] .btn').click();
  await expect(page.locator('#sh-coins')).toHaveText('500');
  expect(await page.evaluate(() => [RailRunner.save.char, RailRunner.save.owned.chars])).toEqual(['mila', ['kit', 'mila']]);
  await expect(page.locator('.shop-card[data-id="mila"] .btn')).toHaveText('Выбрано');
  await page.locator('.shop-card[data-id="kit"] .btn').click();
  expect(await page.evaluate(() => RailRunner.save.char)).toBe('kit');
  await expect(page.locator('.shop-card[data-id="mila"] .btn')).toHaveText('Выбрать');
  await page.locator('.shop-card[data-id="mila"] .btn').click();
  await reload(page);
  expect(await page.evaluate(() => [RailRunner.save.char, RailRunner.save.coins])).toEqual(['mila', 500]);
  await page.click('#m-shop');
  await page.click('#sh-tabs [data-tab="boards"]');
  await expect(page.locator('.shop-card[data-id="flame"] .btn')).toBeDisabled();
  await page.click('#sh-tabs [data-tab="items"]');
  await expect(page.locator('.upg[data-item="hoverboard"] .btn')).toBeEnabled();
  await page.locator('.upg[data-item="hoverboard"] .btn').click();
  await page.locator('.upg[data-item="hoverboard"] .btn').click();
  await expect(page.locator('.upg[data-item="hoverboard"] .btn')).toBeDisabled();
  expect(await page.evaluate(() => [RailRunner.save.boards, RailRunner.save.coins])).toEqual([2, 100]);
  await expect(page.locator('.upg[data-item="key"] .btn')).toBeDisabled();
});

test('магазин: улучшения - покупка списывает, уровень растёт и действует в забеге; ранец тоже улучшается', async ({ page }) => {
  await open(page, '?manual=1&seed=7', { save: { coins: 500 } });
  await page.click('#m-shop');
  await page.click('#sh-tabs [data-tab="upgrades"]');
  await expect(page.locator('.upg')).toHaveCount(5);
  const magnet = page.locator('.upg[data-power="magnet"] .buy');
  await expect(magnet).toHaveText('Купить за 150');
  await magnet.click();
  await expect(page.locator('#sh-coins')).toHaveText('350');
  await page.locator('.upg[data-power="jetpack"] .buy').click();
  await expect(page.locator('#sh-coins')).toHaveText('200');
  await expect(page.locator('.upg[data-power="magnet"] .buy')).toBeDisabled();
  await reload(page);
  expect(await page.evaluate(() => [RailRunner.save.coins, RailRunner.save.upgrades.magnet, RailRunner.save.upgrades.jetpack])).toEqual([200, 1, 1]);
  await page.click('#m-play');
  expect(await page.evaluate(() => RailRunner.run.upgrades.jetpack)).toBe(1);
});

test('доска по кнопке на экране: тратит одну из запаса, в итогах запас уменьшился', async ({ page }) => {
  await open(page, '?manual=1&seed=7', { save: { boards: 2 } });
  await page.click('#m-play');
  await clearWorld(page);
  await advance(page, 0.2);
  await expect(page.locator('#hud-boards')).toHaveText('2');
  await page.click('#btn-board');
  await advance(page, 0.2);
  expect(await page.evaluate(() => RailRunner.run.power.board)).toBeGreaterThan(0);
  await expect(page.locator('#hud-boards')).toHaveText('1');
  await expect(page.locator('#btn-board')).toBeDisabled();
  await expect(page.locator('#hud-powers .chip[data-power="board"]')).toHaveCount(1);
  await obstacleAhead(page, 'hurdle');
  await advance(page, 3);
  expect((await state(page)).alive).toBe(true);
  await expect(page.locator('#hud-toast')).toHaveText('Доска спасла!');
  await obstacleAhead(page, 'hurdle');
  expect(await advanceUntil(page, ['continue', 'over'], 20)).toBe('over');
  expect(await page.evaluate(() => RailRunner.save.boards)).toBe(1);
});

test('HUD: ускорители с полосками времени, x2 удваивает множитель, комбо и трюки видны, смена района - надпись', async ({ page }) => {
  await open(page);
  await page.click('#m-play');
  await clearWorld(page);
  await page.evaluate(() => { const r = RailRunner.run; r.world.powers.push({ id: 5, kind: 'x2', lane: 0, z: r.z + 6, y: 1, taken: false }); r.power.magnet = 5; });
  await advance(page, 1);
  await expect(page.locator('#hud-mult')).toHaveText('x2');
  await expect(page.locator('#hud-mult')).toHaveClass(/x2/);
  await expect(page.locator('#hud-powers .chip')).toHaveCount(2);
  await expect(page.locator('#hud-toast')).toHaveText('Двойные очки');
  await advance(page, 15);
  await expect(page.locator('#hud-mult')).toHaveText('x1');
  await expect(page.locator('#hud-powers .chip')).toHaveCount(0);
  // комбо из трёх барьеров
  const v = await page.evaluate(() => RailRunner.run.speed);
  for (const k of [0, 1, 2]) await obstacleAhead(page, 'hurdle', 20 + k * v * 1.1);
  await advance(page, 4, true);
  await expect(page.locator('#hud-combo')).toHaveClass(/show/);
  await expect(page.locator('#hud-combo-n')).toHaveText(/Комбо x[23]/);
  await expect(page.locator('#hud-trick')).toContainText('Прыжок +');
  // новый район
  await page.evaluate(() => { const r = RailRunner.run; const d = RailRunner.core.districtAt(r.world, r.z); r.z = d.z1 - 2; });
  await advance(page, 1);
  await expect(page.locator('#hud-banner')).toContainText('Промзона');
  expect(await page.evaluate(() => RailRunner.audio.log.includes('whoosh'))).toBe(true);
});

test('задания: выполнено в забеге - надпись; в итогах - награда; все три - множитель растёт и сохраняется', async ({ page }) => {
  await open(page, '?manual=1&seed=7', { save: { missions: { level: 1, ids: ['runs', 'jumps', 'coins_run'], progress: [2, 14, 0], done: [false, false, false] } } });
  // набор из сохранения не совпадает с набором уровня 1 - прогресс с нуля; ставим свой набор уровня
  const ids = await page.evaluate(() => RailRunner.save.missions.ids);
  // задания «за забег» уже выполнены, остальным не хватает по одному
  await page.evaluate(() => {
    const m = RailRunner.save.missions, M = RailRunner.meta;
    m.done = m.ids.map((id) => M.MISSIONS[id].scope === 'run');
    m.progress = m.ids.map((id, i) => (m.done[i] ? M.missionTarget(id, 1) : M.missionTarget(id, 1) - 1));
  });
  await page.click('#m-missions');
  await expect(page.locator('#mi-list .mission')).toHaveCount(3);
  await expect(page.locator('#mi-mult')).toHaveText('Множитель очков x1');
  await page.click('#mi-done');
  await page.click('#m-play');
  await advance(page, 25, true);
  await clearWorld(page);
  await obstacleAhead(page, 'hurdle');
  expect(await advanceUntil(page, ['continue', 'over'], 20)).toBe('over');
  const after = await page.evaluate(() => RailRunner.save.missions);
  expect(after.level).toBe(2);
  expect(after.ids).not.toEqual(ids);
  await expect(page.locator('#o-news')).toContainText('Множитель x2');
  expect(await page.evaluate(() => RailRunner.save.keys)).toBe(1);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('railrunner:save')).missions.level)).toBe(2);
  await page.click('#o-again');
  await expect(page.locator('#hud-mult')).toHaveText('x2');
});

test('задание можно пропустить за ключ', async ({ page }) => {
  await open(page, '?manual=1&seed=7', { save: { keys: 1 } });
  await page.click('#m-missions');
  const first = page.locator('#mi-list .mission').first();
  await first.locator('.btn').click();
  await expect(first).toHaveClass(/done/);
  expect(await page.evaluate(() => [RailRunner.save.keys, RailRunner.save.missions.done[0]])).toEqual([0, true]);
  await expect(page.locator('#mi-list .mission').nth(1).locator('.btn')).toBeDisabled();
});

test('испытание дня: цель дня в меню, забег в мире дня, награда один раз, серия дней', async ({ page }) => {
  await open(page, '?manual=1&date=2026-10-17');
  const daily = await page.evaluate(() => RailRunner.meta.dailyFor('2026-10-17'));
  await expect(page.locator('#m-daily-goal')).not.toHaveText('');
  await page.click('#m-daily');
  expect(await page.evaluate(() => RailRunner.run.seed)).toBe(daily.seed);
  expect(await page.evaluate(() => RailRunner.run.district)).toBe('city');
  await advance(page, 3, true);
  // цель выполнена (подставляем значения забега)
  await page.evaluate((g) => { const r = RailRunner.run; if (g.type === 'score') r.score = g.n; else if (g.type === 'coins') r.coins = g.n; else if (g.type === 'distance') r.z = g.n + 1; else r.stats[g.type] = g.n; }, daily.goal);
  await advance(page, 0.5);
  await expect(page.locator('#hud-toast')).toContainText('Испытание дня выполнено');
  await clearWorld(page);
  await obstacleAhead(page, 'hurdle');
  expect(await advanceUntil(page, ['continue', 'over'], 20)).toBe('over');
  await expect(page.locator('#o-news')).toContainText('Испытание дня');
  const s1 = await page.evaluate(() => [RailRunner.save.daily, RailRunner.save.keys]);
  expect(s1[0]).toMatchObject({ date: '2026-10-17', done: true, streak: 1 });
  expect(s1[1]).toBe(1);
  await page.click('#o-menu');
  await expect(page.locator('#m-daily-state')).toContainText('Выполнено сегодня');
  // на следующий день - серия 2
  await page.goto(pageUrl('?manual=1&date=2026-10-18'));
  await page.waitForFunction(() => window.RailRunner && RailRunner.overlay === 'menu');
  const d2 = await page.evaluate(() => RailRunner.meta.dailyFor('2026-10-18'));
  await page.click('#m-daily');
  await page.evaluate((g) => { const r = RailRunner.run; if (g.type === 'score') r.score = g.n; else if (g.type === 'coins') r.coins = g.n; else if (g.type === 'distance') r.z = g.n + 1; else r.stats[g.type] = g.n; }, d2.goal);
  await clearWorld(page);
  await obstacleAhead(page, 'hurdle');
  expect(['continue', 'over']).toContain(await advanceUntil(page, ['continue', 'over'], 20));
  if (await page.evaluate(() => RailRunner.state === 'continue')) await page.click('#c-no');
  expect(await page.evaluate(() => RailRunner.save.daily.streak)).toBe(2);
});

test('графика: качество, тени и частицы меняются и сохраняются; «Авто» снижает качество на медленных кадрах', async ({ page }) => {
  await open(page, '?seed=7');
  expect(await page.evaluate(() => RailRunner.save.settings.quality)).toBe('auto');
  // в headless кадры рисуются программно и медленно - «Авто» должно уйти с «высокого»
  await expect.poll(() => page.evaluate(() => RailRunner.view.quality), { timeout: 20000 }).not.toBe('high');
  await page.click('#m-settings');
  await page.click('#s-quality [data-v="high"]');
  expect(await page.evaluate(() => [RailRunner.view.quality, RailRunner.view.info().shadows])).toEqual(['high', true]);
  await page.click('#s-shadows');
  expect(await page.evaluate(() => RailRunner.view.info().shadows)).toBe(false);
  await page.click('#s-quality [data-v="low"]');
  expect(await page.evaluate(() => RailRunner.view.quality)).toBe('low');
  await page.click('#s-particles [data-v="off"]');
  await page.click('#s-shake');
  const s = await page.evaluate(() => JSON.parse(localStorage.getItem('railrunner:save')).settings);
  expect([s.quality, s.shadows, s.particles, s.shake]).toEqual(['low', false, 'off', false]);
  await page.click('#s-done');
  await page.click('#m-play');
  await advance(page, 3, true);
  expect(await page.evaluate(() => RailRunner.view.info().particles)).toBe(0);
});

test('хранилище: только ключ railrunner:save, испорченная запись не ломает игру', async ({ page }) => {
  await open(page);
  await page.evaluate(() => { localStorage.setItem('railrunner:save', '{"best": "много", "settings": 5'); });
  await reload(page);
  await expect(page.locator('#m-best')).toHaveText('0');
  await page.click('#m-settings');
  await page.click('#s-theme [data-v="dark"]');
  await page.click('#s-done');
  await page.click('#m-play');
  await page.evaluate(() => { RailRunner.run.world.tutorial = null; });
  await advanceUntil(page, ['continue', 'over'], 120);
  const keys = await page.evaluate(() => Object.keys(localStorage));
  expect(keys).toEqual(['railrunner:save']);
});

test('производительность: в кадре меньше 250 вызовов отрисовки и 160 тыс. треугольников во всех районах', async ({ page }) => {
  test.setTimeout(240000);
  await open(page, '?manual=1&seed=7', { save: { settings: { quality: 'high' } } });
  await page.click('#m-play');
  let worst = { calls: 0, triangles: 0 };
  const seen = new Set();
  for (let i = 0; i < 40; i++) {
    await page.evaluate(() => { const r = RailRunner.run; r.power.board = 5; });
    await advance(page, 6, true);
    const info = await page.evaluate(() => ({ ...RailRunner.view.info(), d: RailRunner.run.district }));
    seen.add(info.d);
    worst = { calls: Math.max(worst.calls, info.calls), triangles: Math.max(worst.triangles, info.triangles) };
    if (seen.size === 5) break;
  }
  expect([...seen].sort()).toEqual(['bridge', 'city', 'industrial', 'neon', 'tunnel']);
  expect((await state(page)).alive).toBe(true);
  expect(worst.calls).toBeLessThan(250);
  expect(worst.triangles).toBeLessThan(160000);
  // шаг расчёта не дороже 0,3 мс (на кадр 60 к/с приходится два шага)
  const ms = await page.evaluate(() => {
    const R = RailRunner.core, r = R.newRun(11);
    const t0 = performance.now();
    for (let i = 0; i < 2400; i++) { R.autopilot(r); R.step(r); }
    return (performance.now() - t0) / 2400;
  });
  expect(ms).toBeLessThan(0.3);
});

test('без WebGL - понятное сообщение вместо пустого экрана', async ({ page }) => {
  await page.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) { return /webgl/.test(type) ? null : orig.call(this, type, ...rest); };
  });
  await page.goto(pageUrl('?manual=1'));
  await expect(page.locator('#fatal')).toBeVisible();
  await expect(page.locator('#fatal')).toContainText('WebGL');
});
