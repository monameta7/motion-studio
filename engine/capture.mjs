// node capture.mjs <index.html> <outDir> <w> <h> <fps> <tStart> <tEnd> [jpeg|png]
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
const [,, html, out, w, h, fpsS, t0S, t1S, fmt = 'jpeg'] = process.argv;
const fps = Number(fpsS), t0 = Number(t0S), t1 = Number(t1S);
// GPU first (ANGLE on Direct3D 11), SwiftShader when there is no usable GPU. On the 18 Nov 3D film: 4.1 min on the Intel GPU
// against about 30 min on SwiftShader for the same 2295 frames, SSIM ≥ 0.995 between the two (owner, 2026-11-19).
const b = await chromium.launch({ args: ['--allow-file-access-from-files', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: Number(w), height: Number(h) } });
const errors = []; p.on('pageerror', e => errors.push(String(e)));
await p.goto(pathToFileURL(html).href);
await p.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
for (let f = Math.round(t0 * fps); f < Math.round(t1 * fps); f++) {
  await p.evaluate(t => window.__seek(t), f / fps);
  const path = `${out}/${String(f).padStart(6, '0')}.${fmt === 'png' ? 'png' : 'jpg'}`;
  await p.screenshot(fmt === 'png' ? { path } : { path, type: 'jpeg', quality: 92 });
}
await b.close();
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
