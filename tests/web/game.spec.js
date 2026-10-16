// Законы страницы RailRunner: сценарии игрока в headless Chromium.
// Запуск: npx playwright test --workers=1 (RR_WEB - другая папка web/, так гоняет мутанты tools/mutate.js)
'use strict';
const { test, expect } = require('@playwright/test');
const { open, state, advance, clearWorld, pageUrl } = require('./helpers');

test('страница открывается без ошибок и без сети; имя для Хаба; захвата указателя нет', async ({ page }) => {
  const errors = await open(page);
  await expect(page).toHaveTitle('Бег по рельсам');
  await expect(page.locator('meta[name="application-name"]')).toHaveAttribute('content', 'Бег по рельсам');
  expect(await page.evaluate(() => !!document.querySelector('#view').getContext('webgl2'))).toBe(true);
  await page.click('#m-play');
  await advance(page, 5, true);
  expect(await page.evaluate(() => window.__pointerLockCalls)).toBe(0);
  expect(await page.evaluate(() => document.pointerLockElement)).toBeNull();
  expect(errors).toEqual([]);
});

test('«Играть» запускает забег: меню прячется, видны счёт и монеты', async ({ page }) => {
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
});

test('клавиши по умолчанию: стрелки, WASD и пробел', async ({ page }) => {
  await open(page);
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
  await page.keyboard.press('ArrowUp');
  await advance(page, 0.15);
  expect((await state(page)).y).toBeGreaterThan(0.3);
  await advance(page, 1);
  await page.keyboard.press('KeyW');
  await advance(page, 0.15);
  expect((await state(page)).y).toBeGreaterThan(0.3);
  await advance(page, 1);
  await page.keyboard.press('Space');
  await advance(page, 0.15);
  expect((await state(page)).y).toBeGreaterThan(0.3);
  await advance(page, 1);
  await page.keyboard.press('ArrowDown');
  await advance(page, 0.1);
  expect((await state(page)).slideT).toBeGreaterThan(0);
  await advance(page, 1);
  await page.keyboard.press('KeyS');
  await advance(page, 0.1);
  expect((await state(page)).slideT).toBeGreaterThan(0);
});

test('мышь и палец: свайпы во все стороны и касания третей экрана', async ({ page }) => {
  await open(page);
  await page.click('#m-play');
  await clearWorld(page);
  const box = await page.locator('#view').boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  // мышью - как пальцем
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx - 150, cy + 10, { steps: 5 });
  await page.mouse.up();
  await advance(page, 0.3);
  expect((await state(page)).lane).toBe(-1);
  // пальцем: события указателя типа touch
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
  // касания: правая треть - вправо, левая - влево, середина - прыжок
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

test('пауза: P, Esc и кнопка; на паузе мир стоит; продолжение - с отсчётом', async ({ page }) => {
  await open(page, '?seed=7');                       // настоящий ход времени, не ручной
  await page.click('#m-play');
  await clearWorld(page);
  await page.waitForTimeout(300);
  for (const how of ['KeyP', 'Escape', 'button']) {
    if (how === 'button') await page.click('#btn-pause');
    else await page.keyboard.press(how);
    await expect(page.locator('#scr-pause')).toBeVisible();
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

test('авария: итоги, рекорд и монеты сохраняются и видны после перезагрузки', async ({ page }) => {
  await open(page);
  await page.click('#m-play');
  await advance(page, 12, true);                       // автопилот собирает монеты
  await page.evaluate(() => { RailRunner.run.world.obstacles.length = 0; RailRunner.run.world.genZ = Infinity; });
  const z = (await state(page)).z;
  await page.evaluate((z) => {
    const r = RailRunner.run;
    const o = { id: 999999, type: 'hurdle', lane: r.lane, z0: z + 20, z1: z + 20.3, moving: false, broken: false };
    const e = RailRunner.core.encounter(o); o.enc0 = e[0]; o.enc1 = e[1];
    r.world.obstacles.push(o);
  }, z);
  await advance(page, 3);
  expect((await state(page)).state).toBe('over');
  await expect(page.locator('#scr-over')).toBeVisible();
  const res = await page.evaluate(() => ({ score: RailRunner.run.score, coins: RailRunner.run.coins }));
  expect(res.coins).toBeGreaterThan(0);
  await expect(page.locator('#o-score')).toHaveText(String(res.score));
  await expect(page.locator('#o-coins')).toHaveText(String(res.coins));
  await expect(page.locator('#o-record')).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('railrunner:save')));
  expect(saved.best).toBe(res.score);
  expect(saved.coins).toBe(res.coins);
  await page.reload();
  await page.waitForFunction(() => window.RailRunner && RailRunner.overlay === 'menu');
  await expect(page.locator('#m-best')).toHaveText(String(res.score));
  await expect(page.locator('#m-coins')).toHaveText(String(res.coins));
});

test('переназначение: новая клавиша работает, старая нет, подсказки называют новую, всё переживает перезагрузку', async ({ page }) => {
  await open(page);
  await page.click('#m-settings');
  await page.click('.key[data-action="jump"][data-slot="0"]');
  await expect(page.locator('.key[data-action="jump"][data-slot="0"]')).toHaveText('Нажмите клавишу…');
  await page.keyboard.press('KeyJ');
  await expect(page.locator('.key[data-action="jump"][data-slot="0"]')).toHaveText('J');
  // клавиша другого действия переезжает: A была «влево»
  await page.click('.key[data-action="slide"][data-slot="2"]');
  await page.keyboard.press('KeyA');
  await expect(page.locator('.key[data-action="left"][data-slot="1"]')).toHaveText('—');
  // Esc отменяет ожидание и ничего не меняет
  await page.click('.key[data-action="right"][data-slot="0"]');
  await page.keyboard.press('Escape');
  await expect(page.locator('.key[data-action="right"][data-slot="0"]')).toHaveText('→');
  await page.click('#s-done');
  // подсказки в меню, в «Как играть», на паузе и в начале забега
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
  await page.reload();
  await page.waitForFunction(() => window.RailRunner && RailRunner.overlay === 'menu');
  await expect(page.locator('#m-hint')).toContainText('J / W / Пробел - прыжок');
  await page.click('#m-settings');
  await page.click('#s-reset');
  await expect(page.locator('.key[data-action="jump"][data-slot="0"]')).toHaveText('↑');
});

test('тема: как в системе, светлая и тёмная; выбор переживает перезагрузку', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await open(page);
  expect(await page.evaluate(() => [document.documentElement.dataset.theme, RailRunner.view.theme])).toEqual(['dark', 'dark']);
  await page.emulateMedia({ colorScheme: 'light' });
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('light');
  await page.click('#m-settings');
  await page.click('#s-theme [data-v="dark"]');
  expect(await page.evaluate(() => [document.documentElement.dataset.theme, RailRunner.view.theme])).toEqual(['dark', 'dark']);
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.click('#s-theme [data-v="light"]');
  expect(await page.evaluate(() => [document.documentElement.dataset.theme, RailRunner.view.theme])).toEqual(['light', 'light']);
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).not.toBe(bg);
  await page.click('#s-theme [data-v="dark"]');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.reload();
  await page.waitForFunction(() => window.RailRunner && RailRunner.overlay === 'menu');
  expect(await page.evaluate(() => [document.documentElement.dataset.theme, RailRunner.view.theme])).toEqual(['dark', 'dark']);
});

test.describe('язык браузера английский', () => {
  test.use({ locale: 'en-US' });
  test('язык: по умолчанию - браузера; переключение меняет заголовок, кнопки и подсказки и сохраняется', async ({ page }) => {
    await open(page);
    await expect(page).toHaveTitle('Rail Runner');
    await expect(page.locator('#m-play')).toHaveText('Play');
    await expect(page.locator('#m-hint')).toContainText('↑ / W / Space - jump');
    await page.click('#m-settings');
    await page.click('#s-lang [data-v="ru"]');
    await expect(page.locator('#s-done')).toHaveText('Готово');
    await page.click('#s-done');
    await expect(page).toHaveTitle('Бег по рельсам');
    await expect(page.locator('#m-play')).toHaveText('Играть');
    await expect(page.locator('#m-hint')).toContainText('↑ / W / Пробел - прыжок');
    expect(await page.evaluate(() => document.documentElement.lang)).toBe('ru');
    await page.reload();
    await page.waitForFunction(() => window.RailRunner && RailRunner.overlay === 'menu');
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
    const els = [...scope.querySelectorAll('button, input, .stats > div, .results > div, h1, h2')].filter(vis);
    const inView = (r) => r.top >= pr.top - 0.5 && r.bottom <= pr.bottom + 0.5;
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.left < pr.left - 0.5 || r.right > pr.right + 0.5) out.push(`${where}: ${el.id || el.textContent.trim().slice(0, 20)} вылезает вбок`);
      if (el.scrollWidth > el.clientWidth + 2 && el.tagName === 'BUTTON' && !el.classList.contains('key')) out.push(`${where}: текст не влез в «${el.textContent.trim()}»`);
    }
    for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
      const a = els[i], b = els[j];
      if (a.contains(b) || b.contains(a)) continue;
      if (a.closest('.sticky-bottom') || b.closest('.sticky-bottom')) continue;
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      if (!inView(ra) || !inView(rb)) continue;
      const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (w > 1 && h > 1) out.push(`${where}: «${a.textContent.trim().slice(0, 16)}» налезает на «${b.textContent.trim().slice(0, 16)}»`);
    }
    return out;
  }, where);
}

test('раскладка: все экраны помещаются от 360x640 до 1920x1080 в обеих темах', async ({ page }) => {
  test.setTimeout(240000);
  await open(page);
  const problems = [];
  for (const [w, h] of [[360, 640], [390, 844], [640, 360], [768, 1024], [1280, 760], [1920, 1080]]) {
    await page.setViewportSize({ width: w, height: h });
    for (const theme of ['light', 'dark']) {
      await page.evaluate((t) => { RailRunner.save.settings.theme = t; document.documentElement.dataset.theme = t; }, theme);
      const tag = `${w}x${h} ${theme}`;
      await page.evaluate(() => RailRunner.toMenu());
      for (const p of await layoutProblems(page, '#scr-menu')) problems.push(tag + ' ' + p);
      for (const [btn, scr] of [['#m-settings', '#scr-settings'], ['#m-upgrades', '#scr-upgrades'], ['#m-howto', '#scr-howto']]) {
        await page.click(btn);
        for (const p of await layoutProblems(page, scr)) problems.push(tag + ' ' + p);
        await page.locator(scr + ' .sticky-bottom .btn').click();
      }
      await page.click('#m-play');
      await clearWorld(page);
      await advance(page, 0.5);
      // HUD: кнопка паузы, счёт и подсказка в окне и не налезают
      const hud = await page.evaluate(() => {
        const r = (id) => document.getElementById(id).getBoundingClientRect();
        const a = r('btn-pause'), b = document.querySelector('.hud-right').getBoundingClientRect(), c = r('hud-hint');
        const inside = (q) => q.left >= 0 && q.top >= 0 && q.right <= innerWidth && q.bottom <= innerHeight;
        const cross = (p, q) => Math.min(p.right, q.right) > Math.max(p.left, q.left) && Math.min(p.bottom, q.bottom) > Math.max(p.top, q.top);
        return [inside(a) && inside(b) && inside(c), !cross(a, b), !cross(c, b) && !cross(c, a)];
      });
      if (hud.includes(false)) problems.push(`${tag} HUD: ${hud}`);
      await page.keyboard.press('KeyP');
      for (const p of await layoutProblems(page, '#scr-pause')) problems.push(tag + ' ' + p);
      await page.click('#p-menu');
    }
  }
  expect(problems).toEqual([]);
});

test('итоги тоже помещаются на маленьком экране', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await open(page);
  await page.click('#m-play');
  await advance(page, 60);
  await advance(page, 2);
  expect((await state(page)).state).toBe('over');
  for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, theme);
    expect(await layoutProblems(page, '#scr-over')).toEqual([]);
  }
});

test('звук: синтез после щелчка, монеты звенят, громкость 0 глушит, музыка только в забеге', async ({ page }) => {
  await open(page);
  expect(await page.evaluate(() => RailRunner.audio.ctx)).toBeNull();
  await advance(page, 3);
  expect(await page.evaluate(() => RailRunner.audio.log.length)).toBe(0);
  await page.click('#m-play');
  expect(await page.evaluate(() => !!RailRunner.audio.ctx)).toBe(true);
  expect(await page.evaluate(() => RailRunner.audio.musicOn)).toBe(true);
  await advance(page, 10, true);
  const log = await page.evaluate(() => RailRunner.audio.log.slice());
  expect(log).toContain('coin');
  expect(log).toContain('jump');
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

test('улучшения: покупка списывает монеты, уровень растёт и сохраняется; без монет кнопка неактивна', async ({ page }) => {
  await open(page);
  await page.evaluate(() => { const s = RailRunner.core.defaultSave(); s.coins = 500; localStorage.setItem('railrunner:save', JSON.stringify(s)); });
  await page.reload();
  await page.waitForFunction(() => window.RailRunner && RailRunner.overlay === 'menu');
  await page.click('#m-upgrades');
  await expect(page.locator('#u-coins')).toHaveText('500');
  const magnet = page.locator('.upg[data-power="magnet"] .buy');
  await expect(magnet).toHaveText('Купить за 150');
  await magnet.click();
  await expect(page.locator('#u-coins')).toHaveText('350');
  await expect(page.locator('.upg[data-power="magnet"] .lvl i.on')).toHaveCount(1);
  await page.locator('.upg[data-power="magnet"] .buy').click();
  await expect(page.locator('#u-coins')).toHaveText('50');
  await expect(page.locator('.upg[data-power="magnet"] .buy')).toBeDisabled();
  await expect(page.locator('.upg[data-power="x2"] .buy')).toBeDisabled();
  await page.reload();
  await page.waitForFunction(() => window.RailRunner && RailRunner.overlay === 'menu');
  expect(await page.evaluate(() => [RailRunner.save.coins, RailRunner.save.upgrades.magnet])).toEqual([50, 2]);
  await page.click('#m-play');
  expect(await page.evaluate(() => RailRunner.run.upgrades.magnet)).toBe(2);
});

test('ускорители видны в HUD: x2 и полоски оставшегося времени', async ({ page }) => {
  await open(page);
  await page.click('#m-play');
  await clearWorld(page);
  await page.evaluate(() => { const r = RailRunner.run; r.world.powers.push({ id: 5, kind: 'x2', lane: 0, z: r.z + 6, y: 1, taken: false }); r.power.magnet = 5; });
  await advance(page, 1);
  await expect(page.locator('#hud-mult')).toBeVisible();
  await expect(page.locator('#hud-powers .chip')).toHaveCount(2);
  await expect(page.locator('#hud-toast')).toHaveText('Двойные очки');
  await advance(page, 15);
  await expect(page.locator('#hud-mult')).toBeHidden();
  await expect(page.locator('#hud-powers .chip')).toHaveCount(0);
});

test('хранилище: только ключ railrunner:save, испорченная запись не ломает игру', async ({ page }) => {
  await open(page);
  await page.evaluate(() => { localStorage.setItem('railrunner:save', '{"best": "много", "settings": 5'); });
  await page.reload();
  await page.waitForFunction(() => window.RailRunner && RailRunner.overlay === 'menu');
  await expect(page.locator('#m-best')).toHaveText('0');
  await page.click('#m-settings');
  await page.click('#s-theme [data-v="dark"]');
  await page.click('#s-done');
  await page.click('#m-play');
  await advance(page, 60);
  await advance(page, 2);
  const keys = await page.evaluate(() => Object.keys(localStorage));
  expect(keys).toEqual(['railrunner:save']);
});

test('производительность: в кадре меньше 250 вызовов отрисовки и 100 тыс. треугольников', async ({ page }) => {
  await open(page);
  await page.click('#m-play');
  let worst = { calls: 0, triangles: 0 };
  for (let i = 0; i < 12; i++) {
    await advance(page, 5, true);
    const info = await page.evaluate(() => RailRunner.view.info());
    worst = { calls: Math.max(worst.calls, info.calls), triangles: Math.max(worst.triangles, info.triangles) };
  }
  expect((await state(page)).alive).toBe(true);
  expect(worst.calls).toBeLessThan(250);
  expect(worst.triangles).toBeLessThan(100000);
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
