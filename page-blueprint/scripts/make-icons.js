// Renders extension/icons/icon.svg into the PNG sizes Chrome asks for.
// Run it after editing the SVG:  node scripts/make-icons.js

import { readFile, writeFile } from 'node:fs/promises';
import { launchBrowser } from '../tests/helpers/browser.js';

const SIZES = [16, 32, 48, 128];
const iconsDir = new URL('../extension/icons/', import.meta.url);

const svg = await readFile(new URL('icon.svg', iconsDir), 'utf8');
const browser = await launchBrowser();
try {
  const page = await browser.openPage();
  // Keep the corners outside the rounded square transparent.
  await page.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  for (const size of SIZES) {
    const html = `<body style="margin:0"><div style="width:${size}px;height:${size}px;display:grid">${svg}</div></body>`;
    await page.goto(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    const { data } = await page.send('Page.captureScreenshot', {
      format: 'png',
      clip: { x: 0, y: 0, width: size, height: size, scale: 1 },
    });
    await writeFile(new URL(`icon-${size}.png`, iconsDir), Buffer.from(data, 'base64'));
    console.log(`icon-${size}.png`);
  }
} finally {
  await browser.close();
}
