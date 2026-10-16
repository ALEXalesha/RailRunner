// Copies three.js (MIT) from node_modules into web/vendor/three.js as a plain script.
//
// The page must work from file:// (the Electron app, the Hub copy), where ES modules are
// blocked, so the CommonJS build is wrapped and sets window.THREE. Nothing is loaded from
// the network at run time. Run after changing the three version in package.json:
//   npm run vendor
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'node_modules', 'three', 'build', 'three.cjs');
const OUT = path.join(ROOT, 'web', 'vendor', 'three.js');
const version = require(path.join(ROOT, 'node_modules', 'three', 'package.json')).version;

const body = fs.readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT,
  `// three.js ${version} (MIT, https://threejs.org), CommonJS build wrapped by tools/build-vendor.js\n` +
  '(function () {\nvar exports = {};\n' + body + '\nwindow.THREE = exports;\n})();\n');
fs.copyFileSync(path.join(ROOT, 'node_modules', 'three', 'LICENSE'), path.join(path.dirname(OUT), 'three.LICENSE'));
console.log(OUT, fs.statSync(OUT).size);
