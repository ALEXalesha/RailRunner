// Draws the RailRunner icon (rails going into the distance and a coin) in headless Chromium
// and writes assets/icon.png (256), assets/icon.ico (16-256, PNG inside) and web/favicon.png.
//   npm run icon
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ff9a3d"/><stop offset="1" stop-color="#ff5a1f"/>
    </linearGradient>
    <radialGradient id="coin" cx="0.38" cy="0.35" r="0.7">
      <stop offset="0" stop-color="#fff3b0"/><stop offset="0.55" stop-color="#ffc928"/><stop offset="1" stop-color="#c98b00"/>
    </radialGradient>
  </defs>
  <rect x="8" y="8" width="240" height="240" rx="52" fill="url(#sky)"/>
  <path d="M8 150 H248 V196 A52 52 0 0 1 196 248 H60 A52 52 0 0 1 8 196 Z" fill="#2b2f45"/>
  <g stroke="#6b4f3a" stroke-width="9" stroke-linecap="round">
    <line x1="58" y1="232" x2="198" y2="232"/><line x1="78" y1="204" x2="178" y2="204"/>
    <line x1="94" y1="182" x2="162" y2="182"/><line x1="106" y1="165" x2="150" y2="165"/>
  </g>
  <g stroke="#e9eef5" stroke-width="8" stroke-linecap="round" fill="none">
    <line x1="78" y1="248" x2="120" y2="152"/><line x1="178" y1="248" x2="136" y2="152"/>
  </g>
  <circle cx="128" cy="92" r="46" fill="url(#coin)" stroke="#a86f00" stroke-width="5"/>
  <circle cx="128" cy="92" r="30" fill="none" stroke="#e5a400" stroke-width="5"/>
</svg>`;

function ico(pngs) {
  const head = Buffer.alloc(6 + 16 * pngs.length);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(pngs.length, 4);
  let offset = head.length;
  pngs.forEach(({ size, data }, i) => {
    const o = 6 + 16 * i;
    head.writeUInt8(size >= 256 ? 0 : size, o);
    head.writeUInt8(size >= 256 ? 0 : size, o + 1);
    head.writeUInt8(0, o + 2);
    head.writeUInt8(0, o + 3);
    head.writeUInt16LE(1, o + 4);
    head.writeUInt16LE(32, o + 6);
    head.writeUInt32LE(data.length, o + 8);
    head.writeUInt32LE(offset, o + 12);
    offset += data.length;
  });
  return Buffer.concat([head, ...pngs.map((p) => p.data)]);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const pngs = [];
  for (const size of [16, 24, 32, 48, 64, 128, 256]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0;background:transparent">${SVG.replace('width="256" height="256"', `width="${size}" height="${size}"`)}</body></html>`);
    pngs.push({ size, data: await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } }) });
  }
  await browser.close();
  fs.mkdirSync(path.join(ROOT, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'assets', 'icon.png'), pngs.find((p) => p.size === 256).data);
  fs.writeFileSync(path.join(ROOT, 'assets', 'icon.ico'), ico(pngs));
  fs.writeFileSync(path.join(ROOT, 'web', 'favicon.png'), pngs.find((p) => p.size === 64).data);
  console.log('assets/icon.png, assets/icon.ico, web/favicon.png');
})();
