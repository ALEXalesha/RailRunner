// Tests of the real Electron app. RR_TEST=1: the window is never shown and cannot take
// focus. One worker: one app at a time.
const os = require('os');
const path = require('path');
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/app',
  workers: 1,
  fullyParallel: false,
  timeout: 120000,
  reporter: [['list']],
  outputDir: path.join(os.tmpdir(), 'railrunner-playwright-app'),
});
