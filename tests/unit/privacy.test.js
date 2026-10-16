// Ничего личного в файлах репозитория: путь к папке автора на диске и адрес домашнего
// сервера. Репозиторий уходит на GitHub открытым; скрипт публикации и сам заменит такое во
// всей истории, но этот закон ловит раньше - на том коммите, который это принёс.
// Строки собраны из кусков, иначе закон нашёл бы сам себя.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const PATTERNS = [
  new RegExp('dri' + 've[\\\\/]+' + 'alex' + 'ey', 'i'),
  new RegExp('192\\.' + '168\\.\\d+\\.\\d+'),
  new RegExp('@' + 'gmail\\.com', 'i'),
];

function tracked() {
  try {
    return execFileSync('git', ['ls-files', '-z'], { cwd: ROOT }).toString('utf8').split('\0').filter(Boolean);
  } catch (e) {
    return [];
  }
}

test('в файлах репозитория нет личного пути, адреса домашнего сервера и почты', () => {
  const found = [];
  for (const f of tracked()) {
    if (f.startsWith('web/vendor/')) continue;
    let data;
    try { data = fs.readFileSync(path.join(ROOT, f)); } catch (e) { continue; }
    if (data.subarray(0, 8192).includes(0)) continue;          // картинки и прочее двоичное
    const text = data.toString('utf8');
    for (const re of PATTERNS) if (re.test(text)) found.push(`${f}: ${re}`);
  }
  assert.deepEqual(found, []);
});
