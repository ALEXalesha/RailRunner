// Законы CI RailRunner. node --test tests/unit
// Ревизия GitHub 25.10: CI на GitHub делил Playwright на три части (--shard), но при fullyParallel: false
// Playwright делит по файлам, а файл один - весь набор уходил в часть 1 и обрывался по таймауту 40 минут.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

// сколько частей делает CI и какие опции у конфига страницы - по тексту, без загрузки Playwright
function shardsInCi(yml) {
  const m = yml.match(/--shard=\$\{\{\s*matrix\.shard\s*\}\}\/(\d+)/);
  return m ? Number(m[1]) : 1;
}
function fullyParallel(config) {
  const m = config.match(/fullyParallel:\s*(true|false)/);
  return m ? m[1] === 'true' : false;
}

test('части CI делятся по тестам, если spec-файлов меньше, чем частей', () => {
  const yml = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
  const config = fs.readFileSync(path.join(ROOT, 'playwright.config.js'), 'utf8');
  const specs = fs.readdirSync(path.join(ROOT, 'tests', 'web')).filter((f) => f.endsWith('.spec.js'));
  const shards = shardsInCi(yml);
  if (shards > 1 && specs.length < shards) {
    assert.ok(fullyParallel(config), `${shards} части CI на ${specs.length} spec-файл(ов): без fullyParallel лишние части пустые`);
  }
});

test('разбор опций ловит выключенное деление', () => {
  assert.equal(shardsInCi('run: npx playwright test --workers=1 --shard=${{ matrix.shard }}/3'), 3);
  assert.equal(shardsInCi('run: npx playwright test'), 1);
  assert.equal(fullyParallel('  fullyParallel: false,'), false);
  assert.equal(fullyParallel('  fullyParallel: true, // x'), true);
  assert.equal(fullyParallel('workers: 1'), false);
});
