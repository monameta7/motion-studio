// Cover screenshot: 1080x1350 from cover.html -> out/cover-4x5.png
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';

const html = process.argv[2];
const out = process.argv[3];
const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });
const p = await b.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
const errors = [];
p.on('pageerror', (e) => errors.push(String(e)));
p.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await p.goto(pathToFileURL(html).href);
await p.evaluate(() => document.fonts.ready);
await p.waitForTimeout(400);
await p.screenshot({ path: out, type: 'png' });
await b.close();
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log('cover OK ->', out);
