// Responsibility: renders the outro template (outro.html) to numbered PNG frames with headless Chromium; usage: node render.mjs <params.json> <frames-dir> [fps=30] [duration=3.7].
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const [,, paramsFile, outDir, fpsS = '30', durS = '3.7'] = process.argv;
if (!paramsFile || !outDir) { console.error('usage: node render.mjs <params.json> <frames-dir> [fps] [duration]'); process.exit(2); }
const params = JSON.parse(fs.readFileSync(paramsFile, 'utf8'));
const html = path.join(path.dirname(fileURLToPath(import.meta.url)), 'outro.html');
fs.mkdirSync(outDir, { recursive: true });
const fps = Number(fpsS), dur = Number(durS);
const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
try {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  await page.addInitScript((p) => { window.__params = p; }, params);
  await page.goto(pathToFileURL(html).href);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
  const frames = Math.round(dur * fps);
  for (let f = 0; f < frames; f++) {
    await page.evaluate((t) => window.__seek(t), f / fps);
    await page.screenshot({ path: path.join(outDir, `${String(f).padStart(4, '0')}.png`) });
  }
  console.log(`frames=${frames}`);
} finally { await browser.close(); }
