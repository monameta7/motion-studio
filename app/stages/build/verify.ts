// Responsibility: measure a finished film with ffprobe and ffmpeg ebur128 and compare it with the plan (duration, streams, size, fps, loudness, true peak, voice heard to the end) — docs/03 S6 and docs/13 film acceptance 1–2.
import { type RunResult } from '../../proc.js';

export type Tool = (cmd: string, args: string[], opts?: { cwd?: string; timeoutMs?: number }) => Promise<RunResult>;

export interface Expected { duration: number; fps: number; w: number; h: number }

export interface FilmMeasure {
  duration: number;
  video_streams: number;
  audio_streams: number;
  fps: number | null;
  w: number | null;
  h: number | null;
  lufs: number | null;
  true_peak_dbtp: number | null;
}

export const LUFS_TARGET = -14;
export const LUFS_TOLERANCE = 1;
export const TRUE_PEAK_MAX = -1.5;

const rate = (s: string | undefined): number | null => {
  const m = /^(\d+)\/(\d+)$/.exec(s ?? '');
  return m && Number(m[2]) > 0 ? Number(m[1]) / Number(m[2]) : null;
};

/** Parses `ffmpeg -af ebur128=peak=true` summary text (stderr): integrated loudness and true peak. */
export function parseEbur128(stderr: string): { lufs: number | null; true_peak_dbtp: number | null } {
  const tail = stderr.slice(stderr.lastIndexOf('Summary:'));
  const lufs = /I:\s+(-?[\d.]+)\s+LUFS/.exec(tail);
  const peak = /Peak:\s+(-?[\d.]+)\s+dBFS/.exec(tail);
  return { lufs: lufs ? Number(lufs[1]) : null, true_peak_dbtp: peak ? Number(peak[1]) : null };
}

export async function measureFilm(file: string, run: Tool): Promise<FilmMeasure> {
  const probe = await run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], { timeoutMs: 60000 });
  if (probe.code !== 0) throw new Error(`ffprobe failed: ${(probe.stderr || probe.error || '').slice(-400)}`);
  const j = JSON.parse(probe.stdout) as { format?: { duration?: string }; streams?: { codec_type?: string; width?: number; height?: number; r_frame_rate?: string; avg_frame_rate?: string }[] };
  const streams = j.streams ?? [];
  const v = streams.find((s) => s.codec_type === 'video');
  const loud = await run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-vn', '-af', 'ebur128=peak=true', '-f', 'null', '-'], { timeoutMs: 10 * 60000 });
  const l = parseEbur128(loud.stderr);
  return {
    duration: Number(j.format?.duration ?? 0),
    video_streams: streams.filter((s) => s.codec_type === 'video').length,
    audio_streams: streams.filter((s) => s.codec_type === 'audio').length,
    fps: rate(v?.avg_frame_rate) ?? rate(v?.r_frame_rate),
    w: v?.width ?? null,
    h: v?.height ?? null,
    ...l,
  };
}

export type Span = [number, number];

/** Silence detection threshold and minimum length for the voice-completeness check (D49 follow-up: film B lost its CTA tail and passed qa). */
export const SILENCE_DB = -60;
export const SILENCE_MIN_S = 0.5;
/** Voice missing for at least this long inside the film is a problem. */
export const VOICE_LOST_MIN_S = 0.3;

/** Parses `ffmpeg -af silencedetect` stderr into [start, end] spans; a silence still open at the end runs to `duration`. */
export function parseSilences(stderr: string, duration: number): Span[] {
  const out: Span[] = [];
  let open: number | null = null;
  for (const m of stderr.matchAll(/silence_(start|end): (-?[\d.]+)/g)) {
    const t = Number(m[2]);
    if (m[1] === 'start') open = t;
    else if (open !== null) { out.push([open, t]); open = null; }
  }
  if (open !== null) out.push([open, duration]);
  return out;
}

/**
 * Where the film is silent while the voice track speaks: film silences minus the voice's own silences, inside the voice's length.
 * Returns the spans of at least VOICE_LOST_MIN_S.
 */
export function lostVoice(filmSilences: Span[], voiceSilences: Span[], voiceDuration: number): Span[] {
  const out: Span[] = [];
  for (const [a0, b0] of filmSilences) {
    let pieces: Span[] = [[Math.max(0, a0), Math.min(b0, voiceDuration)]];
    for (const [va, vb] of voiceSilences) {
      pieces = pieces.flatMap(([a, b]): Span[] => (vb <= a || va >= b ? [[a, b]] : [...(va > a ? [[a, va] as Span] : []), ...(vb < b ? [[vb, b] as Span] : [])]));
    }
    for (const [a, b] of pieces) if (b - a >= VOICE_LOST_MIN_S) out.push([Math.round(a * 100) / 100, Math.round(b * 100) / 100]);
  }
  return out;
}

async function silences(file: string, run: Tool): Promise<{ spans: Span[]; duration: number }> {
  const probe = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { timeoutMs: 60000 });
  const duration = Number(probe.stdout.trim()) || 0;
  const r = await run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-vn', '-af', `silencedetect=n=${SILENCE_DB}dB:d=${SILENCE_MIN_S}`, '-f', 'null', '-'], { timeoutMs: 10 * 60000 });
  if (r.code !== 0) throw new Error(`silencedetect failed: ${(r.stderr || r.error || '').slice(-400)}`);
  return { spans: parseSilences(r.stderr, duration), duration };
}

/** Spans where the film lost the voice (film silent, voice speaking); [] when the whole voice is heard. */
export async function measureVoiceLost(film: string, voice: string, run: Tool): Promise<Span[]> {
  const f = await silences(film, run);
  const v = await silences(voice, run);
  return lostVoice(f.spans, v.spans, v.duration);
}

/** Problems found when comparing a measurement with the plan; empty = the film passes the automatic checks. */
export function judgeFilm(m: FilmMeasure, e: Expected): string[] {
  const out: string[] = [];
  const frame = 1 / e.fps;
  if (Math.abs(m.duration - e.duration) > frame + 1e-3) out.push(`duration ${m.duration.toFixed(3)} s, plan says ${e.duration.toFixed(3)} s (±1 frame = ${frame.toFixed(3)} s)`);
  if (m.video_streams !== 1) out.push(`${m.video_streams} video streams, expected 1`);
  if (m.audio_streams !== 1) out.push(`${m.audio_streams} audio streams, expected 1`);
  if (m.fps === null || Math.abs(m.fps - e.fps) > 0.01) out.push(`fps ${String(m.fps)}, expected ${e.fps}`);
  if (m.w !== e.w || m.h !== e.h) out.push(`size ${String(m.w)}x${String(m.h)}, expected ${e.w}x${e.h}`);
  if (m.lufs === null) out.push('loudness could not be measured');
  else if (Math.abs(m.lufs - LUFS_TARGET) > LUFS_TOLERANCE) out.push(`loudness ${m.lufs} LUFS, expected ${LUFS_TARGET} ±${LUFS_TOLERANCE}`);
  if (m.true_peak_dbtp !== null && m.true_peak_dbtp > TRUE_PEAK_MAX) out.push(`true peak ${m.true_peak_dbtp} dBTP is above ${TRUE_PEAK_MAX}`);
  return out;
}
