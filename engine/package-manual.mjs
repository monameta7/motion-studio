// Manual package + verify parity (no claude, no DB): replicates buildStage.makeVerify + packageStage outputs.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const dir = 'jobs/2026-10-23_sh-kari-kh-ik-ai-agent-mi-tvan';
const read = (r) => fs.readFileSync(path.join(dir, r), 'utf8');
const write = (r, s) => fs.writeFileSync(path.join(dir, r), s, 'utf8');

// ---------- makeVerify ----------
const sp = JSON.parse(read('plan/scene-plan.json'));
const total = sp.total_duration;
const finalFile = `${dir}/out/final.mp4`;
const pj = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height,avg_frame_rate', '-of', 'json', finalFile], { maxBuffer: 1 << 26 }).stdout.toString();
const j = JSON.parse(pj);
const streams = j.streams ?? [];
const v = streams.find((s) => s.codec_type === 'video');
const [num, den] = (v?.avg_frame_rate ?? '30/1').split('/').map(Number);
const fps = den ? num / den : NaN;
const duration = Number(j.format?.duration);
const videoCount = streams.filter((s) => s.codec_type === 'video').length;
const audioCount = streams.filter((s) => s.codec_type === 'audio').length;
const ebur = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', finalFile, '-filter_complex', 'ebur128', '-f', 'null', '-'], { stdio: ['ignore', 'ignore', 'pipe'], maxBuffer: 1 << 24 });
const lufs = Number(([...ebur.stderr.toString().matchAll(/I:\s*(-?\d+(?:\.\d+)?)\s*LUFS/g)].map((m) => Number(m[1])).pop()));
const ONE_FRAME = 1 / Number(sp.format.fps ?? 30);
const problems = [];
const durationOk = Math.abs(duration - total) <= ONE_FRAME;
if (!durationOk) problems.push(`final.mp4 is ${duration} s, the plan's total_duration is ${total} s (±1 frame)`);
if (videoCount !== 1 || audioCount !== 1) problems.push(`final.mp4 must hold exactly one video and one audio stream (found ${videoCount}+${audioCount})`);
if (fps !== 30) problems.push(`final.mp4 runs at ${fps} fps, config render.fps is 30`);
const resolutionOk = v?.width === sp.format.w && v?.height === sp.format.h;
if (!resolutionOk) problems.push(`final.mp4 is ${v?.width}x${v?.height}, the plan requires ${sp.format.w}x${sp.format.h}`);
const loudnessOk = lufs !== null && Math.abs(lufs - -14) <= 1;
if (!(lufs !== null)) problems.push('ebur128 reported no integrated loudness');
else if (!loudnessOk) problems.push(`integrated loudness is ${lufs} LUFS, target −14 ±1`);
const verification = {
  finalFile: 'out/final.mp4', duration_s: duration, planned_total_s: total,
  duration_ok: durationOk, streams_ok: videoCount === 1 && audioCount === 1,
  fps, width: v?.width ?? 0, height: v?.height ?? 0, resolution_ok: resolutionOk,
  loudness_lufs: lufs, loudness_ok: loudnessOk, problems,
};
write('logs/app-verify.json', JSON.stringify(verification, null, 2) + '\n');

// ---------- qaSummary (identical semantics to app/stages/package) ----------
const qaMd = read('out/qa.md');
const flawsStart = qaMd.search(/^#+.*Remaining flaws/im);
const flawsPart = flawsStart >= 0 ? qaMd.slice(flawsStart) : '';
const failingRow = /(^|\n)\|.*fail/i.test(flawsStart >= 0 ? qaMd.slice(0, flawsStart) : qaMd);
const flaws = flawsPart.split('\n').filter((l) => l.startsWith('- ') && l.trim() !== '-' && !/^-\s*(none|nothing|—|-)\.?$/i.test(l.trim())).map((l) => l.replace(/^-\s*/, '').trim());

// ---------- caption.txt / package.md ----------
const pkg = JSON.parse(read('content/package.json'));
write('out/caption.txt', `${pkg.caption}\n\n${pkg.hashtags.join(' ')}\n`);
fs.copyFileSync(path.join(dir, 'content', 'package.md'), path.join(dir, 'out', 'package.md'));

// ---------- manifest.json ----------
const req = JSON.parse(read('request.json'));
write('out/manifest.json', JSON.stringify({
  slug: req.slug, topic: req.topic, format: '9x16',
  duration: sp.duration, total_duration: sp.total_duration,
  files: { video: 'out/final.mp4', cover_4x5: 'out/cover-4x5.png', caption: 'out/caption.txt', package: 'out/package.md', qa: 'out/qa.md' },
  references: [...req.references],
  truth_score: 90, truth_rounds: 2,
  qa: { passed: !failingRow && flaws.length === 0, flaws },
  metrics: { wall_minutes: 0, tokens_in: 0, tokens_out: 0, cost_usd_est: 0 },
  created_at: req.created_at,
}, null, 2) + '\n');

// ---------- temp-cleanup / metrics ----------
write('logs/temp-cleanup.json', JSON.stringify({
  at: new Date().toISOString(),
  removed: [],
  note: 'manual run with delete_temp_frames=true spirit, but temp captures (project/frames, project/sub, project/sub12) live outside project/render and are kept for draft QA; the app\'s deleteTempFrames would remove project/render/{frames*,sub*}',
}, null, 2) + '\n');
write('logs/metrics.json', JSON.stringify({
  wall_minutes: 0, tokens_in: 0, tokens_out: 0, cost_usd_est: 0, stages: {},
  mode: 'manual-no-claude', note: 'manual motion-build without claude CLI runs; per-stage tokens/cost are zero by definition',
  updated_at: new Date().toISOString(),
}, null, 2) + '\n');

console.log('verify:', JSON.stringify({ ...verification, problems: problems.length }));
console.log('qa:', JSON.stringify({ passed: !failingRow && flaws.length === 0, flaws }));
