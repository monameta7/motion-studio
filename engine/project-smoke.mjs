// Project smoke-test: load index.html, wait for __ready, seek a few moments, report page errors + text QA.
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';

const html = process.argv[2];
const seeks = process.argv[3] ? process.argv[3].split(',').map(Number) : [0.2, 2.0, 4.0, 7.0, 9.0, 11.0, 14.0, 17.0, 20.0, 26.0, 29.5, 31.5, 34.0, 37.5, 39.5, 42.5, 45.5, 47.5, 50.0, 53.5];
const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });
const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
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
const comp = await p.evaluate(() => window.__comp);
for (const t of seeks) {
  await p.evaluate((x) => window.__seek(x), t);
  const texts = await p.evaluate((x) => window.__qaTexts(x), t);
  console.log(`t=${t.toFixed(2)} scenes visible; texts: ${texts.map((x) => `${x.key}@${x.fontSize}px(${Math.round(x.w)}x${Math.round(x.h)})`).join(' ')}`);
}
await b.close();
if (errors.length) { console.error('ERRORS:\n' + errors.join('\n')); process.exit(1); }
console.log('OK — no page errors');
