import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

/** Rasterize the existing vector mark; installing needs no external icon service. */
const source = await readFile(new URL('../public/favicon.svg', import.meta.url), 'utf8');
const mark = source.match(/<path\b[^>]*\/>/)?.[0];
const background = source.match(/<rect\b[^>]*fill="([^"]+)"/)?.[1];
if (!mark || !background) throw new Error('The favicon needs one path and a background fill');

const icons = [
  { name: 'pwa-192x192.png', size: 192 },
  { name: 'pwa-512x512.png', size: 512 },
  { name: 'pwa-maskable-512x512.png', size: 512, maskable: true },
  { name: 'apple-touch-icon.png', size: 180 },
];
const browser = await chromium.launch();
try {
  for (const icon of icons) {
    const page = await browser.newPage({
      viewport: { width: icon.size, height: icon.size },
      deviceScaleFactor: 1,
    });
    // Keep an opaque background; the maskable mark fits inside the central safe circle.
    const transform = icon.maskable ? 'translate(16 16) scale(.9) translate(-16 -16)' : '';
    await page.setContent(`
      <style>html,body{margin:0;width:100%;height:100%}svg{display:block;width:100%;height:100%}</style>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
        <rect width="32" height="32" fill="${background}"/>
        <g transform="${transform}">${mark}</g>
      </svg>
    `);
    await page.screenshot({
      path: fileURLToPath(new URL(`../public/${icon.name}`, import.meta.url)),
      animations: 'disabled',
    });
    await page.close();
    console.log(`${icon.name}: ${icon.size} × ${icon.size}`);
  }
} finally {
  await browser.close();
}
