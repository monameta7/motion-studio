// Render QA stills: seek + full-frame screenshot at given times.
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const html = process.argv[2];
const outDir = process.argv[3];
const times = (process.argv[4] ?? '').split(',').map(Number).filter((x) => !Number.isNaN(x));
fs.mkdirSync(outDir, { recursive: true });
const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });
const p = await b.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
const errors = [];
p.on('pageerror', (e) => errors.push(String(e)));
p.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await p.goto(pathToFileURL(html).href);
try {
  await p.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
} catch {
  console.error('ready timeout; errors so far:\n' + (errors.join('\n---\n') || '(none)'));
  await b.close(); process.exit(1);
}
for (const t of times) {
  await p.evaluate((x) => window.__seek(x), t);
  const file = path.join(outDir, `t${String(Math.round(t * 100)).padStart(5, '0')}.png`);
  await p.screenshot({ path: file });
  const texts = await p.evaluate((x) => window.__qaTexts(x), t);
  console.log(`t=${t.toFixed(2)} -> ${path.basename(file)} texts: ${texts.map((x) => `${x.key}(${Math.round(x.x)},${Math.round(x.y)} ${Math.round(x.w)}x${Math.round(x.h)} @${x.fontSize}px)`).join(' | ') || '(none)'}`);
}
await b.close();
if (errors.length) { console.error('ERRORS:\n' + errors.join('\n')); process.exit(1); }
console.log('OK — no page errors');
