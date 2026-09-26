// usage (from repo root, needs playwright + sharp + cwebp): node brand/samples/src/render.mjs [name ...]
import { chromium } from 'playwright';
import sharp from 'sharp';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
const DIR = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const SIZES = {
  'sample-dashboard-light': [1440, 900],
  'sample-editor-dark': [1440, 900],
  'sample-mobile-habits': [393, 852],
  'sample-landing-hero': [1440, 900],
  'sample-terminal-code': [1200, 760],
  'sample-kanban-light': [1440, 900],
  'sample-tablet-reader': [1180, 820],
  'sample-settings-dark': [1100, 720],
};
const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SIZES);
const b = await chromium.launch();
for (const n of names) {
  const [w, h] = SIZES[n];
  const src = `${DIR}/src/${n}.html`;
  if (!fs.existsSync(src)) { console.log('skip', n); continue; }
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  await p.goto('file://' + src, { waitUntil: 'networkidle', timeout: 45000 });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(400);
  const overflow = await p.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight]);
  const raw = await p.screenshot({ type: 'png' });
  await p.close();
  const png = `${DIR}/${n}.png`;
  let buf = await sharp(raw).png({ compressionLevel: 9, effort: 10 }).toBuffer();
  if (buf.length > 1.5e6) buf = await sharp(raw).png({ palette: true, quality: 95, colours: 256, dither: 0.6, effort: 10 }).toBuffer();
  fs.writeFileSync(png, buf);
  execFileSync('cwebp', ['-quiet', '-q', '90', png, '-o', `${DIR}/${n}.webp`]);
  const meta = await sharp(png).metadata();
  console.log(n, `${meta.width}x${meta.height}`, (buf.length / 1e6).toFixed(2) + 'MB', 'doc', overflow.join('x'));
}
await b.close();
