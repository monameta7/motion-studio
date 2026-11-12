// Responsibility: renders a brand's `logo-outro.mp4` by code (D67): frames from engine/outro, the fixed code-built sting, and one ffmpeg encode (1080×1920, 30 fps, 3.70 s, H.264 + AAC 48 kHz, −15 LUFS); never Claude.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { BrandAnswers } from '../contracts/index.js';
import type { RunResult as ToolResult } from '../proc.js';
import { sha } from './store.js';
import { isPersian, outroColors } from './tokens.js';

export type OutroTool = (cmd: string, args: string[], opts?: { cwd?: string; timeoutMs?: number }) => Promise<ToolResult>;
export const OUTRO_FILE = 'logo-outro.mp4';
export const OUTRO_SECONDS = 3.7;

export class OutroError extends Error {
  constructor(public readonly message_fa: string, detail = '') { super(`${message_fa}${detail ? ` (${detail})` : ''}`); this.name = 'OutroError'; }
}

/** The tagline the outro shows: the owner's own, else the brand's one-liner is NOT used (it is too long); no tagline means a logo-only outro. */
export const outroTagline = (a: BrandAnswers): string => (a.visual.outro_tagline ?? a.identity.tagline ?? '').trim();

/** Which font file the tagline uses: the Persian font for a Persian tagline, else the Latin one. */
export function taglineFont(a: BrandAnswers): { family: string; file: string | null } {
  const f = isPersian(outroTagline(a)) || outroTagline(a) === '' ? a.visual.persian_font : a.visual.latin_font;
  return { family: f.family, file: f.file };
}

/** A hash of everything the outro picture and sound depend on; the same hash means the existing file is still right. */
export function outroInputHash(dir: string, a: BrandAnswers, fontFile: string | null): string {
  const logo = path.join(dir, a.visual.logo);
  const c = outroColors(a);
  const tf = taglineFont(a);
  return sha(JSON.stringify({
    v: 1, logo: fs.existsSync(logo) ? sha(fs.readFileSync(logo)) : null, tagline: outroTagline(a), colors: c, family: tf.family,
    font: fontFile && fs.existsSync(fontFile) ? sha(fs.readFileSync(fontFile)) : null,
  }));
}

/** Renders `<dir>/logo-outro.mp4`. `engineDir` holds outro/ (render.mjs, sting.py); `fontFile` is the absolute font file for the tagline (or null: the system sans-serif). */
export async function renderOutro(opts: { dir: string; answers: BrandAnswers; engineDir: string; fontFile: string | null; tool: OutroTool }): Promise<string> {
  const { dir, answers: a, engineDir, tool } = opts;
  const logo = path.join(dir, a.visual.logo);
  if (!fs.existsSync(logo)) throw new OutroError('فایل لوگو پیدا نشد؛ لوگو را دوباره بارگذاری کن.', logo);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mms-outro-'));
  try {
    const c = outroColors(a);
    const tagline = outroTagline(a);
    const params = { logoUrl: pathToFileURL(logo).href, fontUrl: opts.fontFile ? pathToFileURL(opts.fontFile).href : null, tagline, rtl: isPersian(tagline) || tagline === '', bg: c.bg, textColor: c.text, lineColor: c.line };
    const paramsFile = path.join(tmp, 'params.json');
    fs.writeFileSync(paramsFile, JSON.stringify(params), 'utf8');
    const frames = path.join(tmp, 'frames');
    const wav = path.join(tmp, 'sting.wav');
    const out = path.join(tmp, OUTRO_FILE);
    const r1 = await tool('node', [path.join(engineDir, 'outro', 'render.mjs'), paramsFile, frames, '30', String(OUTRO_SECONDS)], { cwd: path.join(engineDir, 'outro'), timeoutMs: 5 * 60000 });
    if (r1.code !== 0) throw new OutroError('ساخت تصویر لوگوموشن انجام نشد.', (r1.error ?? r1.stderr).slice(0, 300));
    const r2 = await tool('python', ['-I', path.join(engineDir, 'outro', 'sting.py'), wav], { timeoutMs: 120000 });
    if (r2.code !== 0) throw new OutroError('ساخت صدای لوگوموشن انجام نشد.', (r2.error ?? r2.stderr).slice(0, 300));
    // RGB frames → limited-range BT.601 YUV, untagged: exactly what motion-build §9c expects of a brand clip.
    const r3 = await tool('ffmpeg', [
      '-v', 'error', '-y', '-framerate', '30', '-i', path.join(frames, '%04d.png'), '-i', wav,
      '-vf', 'scale=out_range=tv:out_color_matrix=bt601,format=yuv420p', '-c:v', 'libx264', '-crf', '16', '-preset', 'slow', '-pix_fmt', 'yuv420p',
      '-af', 'loudnorm=I=-15:TP=-1.5:LRA=7,aresample=48000', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-t', String(OUTRO_SECONDS), '-movflags', '+faststart', out,
    ], { timeoutMs: 5 * 60000 });
    if (r3.code !== 0 || !fs.existsSync(out)) throw new OutroError('ساخت فایل لوگوموشن انجام نشد.', (r3.error ?? r3.stderr).slice(0, 300));
    const dest = path.join(dir, OUTRO_FILE);
    fs.copyFileSync(out, dest);
    return dest;
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}
