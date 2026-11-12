// Responsibility: the §9c boundary check by hand: one frame (0-based index) of a job's out/final.mp4 must equal frame 0 of its brand's logo-outro.mp4.
// Usage: node engine/outro-frame-check.mjs <job-dir> <brand-dir> <frame-index>   (the brand folder is the job's own, e.g. brand/<slug>; Phase 8)
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const [, , jobDir, brandDir, frameArg] = process.argv;
const frame = Number(frameArg);
if (!jobDir || !brandDir || !Number.isInteger(frame) || frame < 0) {
  console.error('usage: node engine/outro-frame-check.mjs <job-dir> <brand-dir> <frame-index>');
  process.exit(2);
}
const final = path.join(jobDir, 'out', 'final.mp4');
const outro = path.join(brandDir, 'logo-outro.mp4');
for (const f of [final, outro]) if (!fs.existsSync(f)) { console.error(`not found: ${f}`); process.exit(2); }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'outro-check-'));
const run = (args, tag) => {
  const r = spawnSync('ffmpeg', args, { maxBuffer: 1024 ** 3, stdio: ['ignore', 'ignore', 'pipe'] });
  if (r.status !== 0) { console.error(tag + ' FAILED:\n' + r.stderr.toString().slice(-600)); process.exit(1); }
};
const raw = (file) => {
  const r = spawnSync('ffmpeg', ['-i', file, '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'], { maxBuffer: 1024 ** 3, stdio: ['ignore', 'pipe', 'ignore'] });
  return r.stdout;
};
const filmPng = path.join(tmp, `f${frame}.png`);
const brandPng = path.join(tmp, 'brand0.png');
run(['-y', '-i', final, '-vf', `select=eq(n\\,${frame})`, '-fps_mode', 'vfr', '-frames:v', '1', '-pix_fmt', 'rgb24', filmPng], `final${frame}`);
run(['-y', '-ss', '0', '-i', outro, '-frames:v', '1', '-pix_fmt', 'rgb24', brandPng], 'brand0');
const a = raw(filmPng), b = raw(brandPng);
let max = 0, sum = 0;
for (let i = 0; i < Math.min(a.length, b.length); i++) { const d = Math.abs(a[i] - b[i]); sum += d; if (d > max) max = d; }
console.log(`frame${frame}-vs-brand0: max=${max} mean=${(sum / Math.min(a.length, b.length)).toFixed(3)}`);
fs.rmSync(tmp, { recursive: true, force: true });
