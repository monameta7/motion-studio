// Responsibility: measure one generated clip on this machine (Phase 11.6 task 4, docs/13 V14–V18): ffprobe facts, the exact last frame for the next clip, seam SSIM against the given start image, audio level, speech seconds and colour drift, and the D92 b verdict.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CLIP_SECONDS, type ClipMeasurements, type VideoConfig } from '../contracts/index.js';
import { runTool, type RunResult } from '../proc.js';

export type Tool = (cmd: string, args: string[], opts?: { timeoutMs?: number; env?: NodeJS.ProcessEnv }) => Promise<RunResult>;
const defaultTool: Tool = (c, a, o) => runTool(c, a, o);

export interface Probe { duration_s: number; width: number; height: number; fps: number; frames: number; has_audio: boolean }

/** ffprobe of a clip; null when the file is not a readable video (docs/13 V14 «unreadable»). */
export async function probeClip(file: string, tool: Tool = defaultTool): Promise<Probe | null> {
  const r = await tool('ffprobe', ['-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', file], { timeoutMs: 120000 });
  if (r.code !== 0) return null;
  let j: { streams?: Record<string, unknown>[]; format?: { duration?: string } };
  try { j = JSON.parse(r.stdout) as typeof j; } catch { return null; }
  const v = j.streams?.find((s) => s.codec_type === 'video');
  if (!v) return null;
  const [num = 0, den = 0] = String(v.avg_frame_rate ?? v.r_frame_rate ?? '0/1').split('/').map(Number);
  const fps = den ? num / den : 0;
  const duration = Number(v.duration ?? j.format?.duration ?? NaN);
  const frames = Number(v.nb_read_frames ?? v.nb_frames ?? NaN);
  if (!(duration > 0) || !(fps > 0) || !(Number(v.width) > 0)) return null;
  return {
    duration_s: Math.round(duration * 1000) / 1000, width: Number(v.width), height: Number(v.height), fps: Math.round(fps * 1000) / 1000,
    frames: Number.isFinite(frames) && frames > 0 ? frames : Math.round(duration * fps), has_audio: Boolean(j.streams?.some((s) => s.codec_type === 'audio')),
  };
}

/** The exact last frame of a clip as PNG (11.1: frame 240 of 240): every frame is decoded and the last one written stays. */
export async function lastFrame(clip: string, outPng: string, tool: Tool = defaultTool): Promise<void> {
  fs.mkdirSync(path.dirname(outPng), { recursive: true });
  fs.rmSync(outPng, { force: true });
  const r = await tool('ffmpeg', ['-v', 'error', '-y', '-i', clip, '-map', '0:v:0', '-fps_mode', 'passthrough', '-update', '1', '-frames:v', '100000', outPng], { timeoutMs: 180000 });
  if (r.code !== 0 || !fs.existsSync(outPng)) throw new Error(`last frame of ${path.basename(clip)} failed: ${(r.stderr || r.error || '').slice(-400)}`);
}

/**
 * SSIM of the given start image against the clip's first frame, both at the clip's size, in RGB (docs/13 V15). RGB is how 11.1 measured
 * the 0.744 behind the 0.70 threshold (D87 d); on the same pair ffmpeg's default (YUV) reads 0.842 (measured 2026-11-18).
 */
export async function seamSsim(startPng: string, clip: string, w: number, h: number, tool: Tool = defaultTool): Promise<number | null> {
  const graph = `[0:v]scale=${w}:${h},format=rgb24[a];[1:v]select=eq(n\\,0),scale=${w}:${h},format=rgb24[b];[a][b]ssim`;
  const r = await tool('ffmpeg', ['-v', 'info', '-i', startPng, '-i', clip, '-filter_complex', graph, '-frames:v', '1', '-f', 'null', '-'], { timeoutMs: 120000 });
  const m = /All:([0-9.]+)/.exec(r.stderr);
  return m ? Math.min(1, Math.max(0, Number(m[1]))) : null;
}

async function audioLevels(clip: string, tool: Tool): Promise<{ mean: number | null; max: number | null }> {
  const r = await tool('ffmpeg', ['-v', 'info', '-i', clip, '-vn', '-af', 'volumedetect', '-f', 'null', '-'], { timeoutMs: 120000 });
  const num = (re: RegExp) => { const m = re.exec(r.stderr); return m ? Number(m[1]) : null; };
  return { mean: num(/mean_volume:\s*(-?[0-9.]+|-inf) dB/), max: num(/max_volume:\s*(-?[0-9.]+|-inf) dB/) };
}

const RGB_W = 96;
const RGB_H = 54;
const rgbArgs = (clip: string, out: string) => ['-v', 'error', '-y', '-i', clip, '-vf', `fps=4,scale=${RGB_W}:${RGB_H}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', out];

/** Speech seconds (faster-whisper VAD) and colour drift against the clip before, through engine/clip-measure.py. */
async function speechAndDrift(clip: string, prev: string | null, hasAudio: boolean, engineDir: string, tool: Tool): Promise<{ speech_s: number | null; drift: number | null }> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mms-clip-'));
  try {
    const args = ['-I', path.join(engineDir, 'clip-measure.py')];
    if (hasAudio) {
      const wav = path.join(tmp, 'a.wav');
      const r = await tool('ffmpeg', ['-v', 'error', '-y', '-i', clip, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wav], { timeoutMs: 120000 });
      if (r.code === 0) args.push('--wav', wav);
    }
    if (prev) {
      const cur = path.join(tmp, 'cur.rgb');
      const before = path.join(tmp, 'prev.rgb');
      const a = await tool('ffmpeg', rgbArgs(clip, cur), { timeoutMs: 120000 });
      const b = await tool('ffmpeg', rgbArgs(prev, before), { timeoutMs: 120000 });
      if (a.code === 0 && b.code === 0) args.push('--cur', cur, '--prev', before, '--w', String(RGB_W), '--h', String(RGB_H));
    }
    if (args.length === 2) return { speech_s: hasAudio ? null : 0, drift: null };
    const r = await tool('python', args, { timeoutMs: 5 * 60000, env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' } });
    const line = r.stdout.trim().split(/\r?\n/).pop() ?? '';
    try {
      const j = JSON.parse(line) as { speech_s: number | null; drift: number | null };
      return { speech_s: hasAudio ? j.speech_s : 0, drift: j.drift };
    } catch { return { speech_s: null, drift: null }; }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

export interface Measured {
  measurements: ClipMeasurements | null;
  verdict: 'ok' | 'flawed' | 'broken';
  flags: ('no_video' | 'unreadable' | 'wrong_length' | 'wrong_size' | 'seam_low' | 'speech' | 'drift')[];
}

/** Expected picture shape of a job: 9:16 → tall, 16:9 → wide. The size itself comes from the model (720p = 720 × 1280). */
export function expectedSize(aspect: '9:16' | '16:9', res: '360p' | '720p' | '1080p'): { w: number; h: number } {
  const short = Number(res.replace('p', ''));
  const long = Math.round((short * 16) / 9);
  return aspect === '9:16' ? { w: short, h: long } : { w: long, h: short };
}

/**
 * D92 b: badly broken (no video, unreadable, not 10 s ± tolerance, wrong size or aspect, seam SSIM under the threshold) may be bought
 * again automatically; small flaws (speech over 1 s) are kept with a flag and never bought again.
 */
export async function measureClip(o: {
  clip: string | null; startPng: string | null; prevClip: string | null; cfg: VideoConfig; aspect: '9:16' | '16:9'; resolution: '360p' | '720p' | '1080p'; engineDir: string; tool?: Tool;
}): Promise<Measured> {
  const tool = o.tool ?? defaultTool;
  if (!o.clip || !fs.existsSync(o.clip) || fs.statSync(o.clip).size === 0) return { measurements: null, verdict: 'broken', flags: ['no_video'] };
  const p = await probeClip(o.clip, tool);
  if (!p) return { measurements: null, verdict: 'broken', flags: ['unreadable'] };
  const t = o.cfg.thresholds;
  const flags: Measured['flags'] = [];
  if (Math.abs(p.duration_s - CLIP_SECONDS) > t.duration_tolerance_s) flags.push('wrong_length');
  const want = expectedSize(o.aspect, o.resolution);
  if (p.width !== want.w || p.height !== want.h) flags.push('wrong_size');
  const seam = o.startPng ? await seamSsim(o.startPng, o.clip, p.width, p.height, tool) : null;
  if (o.startPng && (seam === null || seam < t.seam_ssim_min)) flags.push('seam_low');
  const level = p.has_audio ? await audioLevels(o.clip, tool) : { mean: null, max: null };
  const sd = await speechAndDrift(o.clip, o.prevClip, p.has_audio, o.engineDir, tool);
  if (sd.speech_s !== null && sd.speech_s > t.speech_s_max) flags.push('speech');
  const broken = flags.some((f) => f === 'wrong_length' || f === 'wrong_size' || f === 'seam_low');
  return {
    measurements: { ...p, seam_ssim: seam, speech_s: sd.speech_s, audio_mean_db: level.mean, audio_max_db: level.max, drift: sd.drift },
    verdict: broken ? 'broken' : flags.length ? 'flawed' : 'ok',
    flags,
  };
}
