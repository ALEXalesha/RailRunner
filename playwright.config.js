// Laws of the page: headless Chromium only, one worker, output in TEMP.
// RR_WEB - another web/ folder (tools/mutate.js runs the laws on broken copies).
const os = require('os');
const path = require('path');
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/web',
  workers: 1,
  fullyParallel: false,
  timeout: 90000,
  expect: { timeout: 10000 },
  reporter: [['list']],
  outputDir: path.join(os.tmpdir(), 'railrunner-playwright'),
  use: {
    headless: true,
    viewport: { width: 1280, height: 760 },
    locale: 'ru-RU',
  },
});
