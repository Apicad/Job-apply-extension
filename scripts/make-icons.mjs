// Renders assets/icon.svg into the PNG sizes Chrome wants (public/icon/<size>.png).
// Run with: node scripts/make-icons.mjs
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const svg = fs.readFileSync(path.join(root, 'assets/icon.svg'), 'utf8');
const outDir = path.join(root, 'public/icon');
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
try {
  for (const size of [16, 32, 48, 128]) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(
      `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
    );
    await page.screenshot({ path: path.join(outDir, `${size}.png`), omitBackground: true });
    await page.close();
    console.log(`wrote public/icon/${size}.png`);
  }
} finally {
  await browser.close();
}
