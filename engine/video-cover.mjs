// Responsibility: render a video film's cover page to a 1080x1350 PNG and report what is on it (the text read back from the page, each box, the fonts the page loaded), for the checks of the video package (Phase 11.7).
// Usage: node engine/video-cover.mjs <cover.html> <out.png>   → one JSON line on stdout
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';

const [, , html, out] = process.argv;
const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });
const p = await b.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
const errors = [];
p.on('pageerror', (e) => errors.push(String(e)));
p.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
p.on('requestfailed', (r) => errors.push('request failed: ' + r.url()));
await p.goto(pathToFileURL(html).href);
await p.evaluate(() => document.fonts.ready);
await p.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 30000 }).catch(() => errors.push('an image did not load'));
await p.waitForTimeout(300);
const report = await p.evaluate(() => {
  const box = (id) => {
    const e = document.getElementById(id);
    if (!e) return null;
    const r = e.getBoundingClientRect();
    const s = getComputedStyle(e);
    return { text: e.textContent, x: r.x, y: r.y, w: r.width, h: r.height, family: s.fontFamily, weight: s.fontWeight, size: s.fontSize };
  };
  return {
    headline: box('headline'), subline: box('subline'), band: box('band'), logo: box('logo'), picture: box('picture'),
    fonts: [...document.fonts].map((f) => ({ family: f.family.replace(/"/g, ''), weight: f.weight, status: f.status })),
  };
});
await p.screenshot({ path: out, type: 'png' });
await b.close();
console.log(JSON.stringify({ ...report, errors }));
if (errors.length) process.exit(1);
