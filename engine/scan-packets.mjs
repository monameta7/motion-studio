// Exact-tick anomaly scan for seg03.mp4: which pts ticks deviate from i*512?
import { spawnSync } from 'node:child_process';
const J2 = process.argv[2] || 'jobs/2026-10-23_sh-kari-kh-ik-ai-agent-mi-tvan/project/render/video.mp4';
const f = J2;
const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'packet=pts', '-of', 'csv=p=0', f], { maxBuffer: 1024 ** 3 });
const t = r.stdout.toString().trim().split(/\s+/).map(Number);
console.log('n=', t.length);
const sorted = [...t].sort((a, b) => a - b);
const expect = set(t.length);
function set(n) { const s = new Set(); for (let i = 0; i < n; i++) s.add(i * 512); return s; }
let firstBad = 0;
for (let i = 0; i < sorted.length; i++) if (sorted[i] !== i * 512) { if (!firstBad++) console.log(`sorted[${i}] = ${sorted[i]} (exp exactly ${i * 512}, diff ${sorted[i] - i * 512})`); }
// also detect any pts not on the 512 grid at all
const offgrid = t.filter((v) => v % 512 !== 0);
console.log('off-grid tick values:', offgrid.length ? offgrid.slice(0, 20).join(',') : 'none');
console.log('max pts:', sorted[sorted.length - 1], 'exp', (t.length - 1) * 512);
