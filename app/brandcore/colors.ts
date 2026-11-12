// Responsibility: suggests a starting palette from a logo image by code (ffmpeg scales the logo to raw pixels; a histogram finds its main colours); the user can change every colour afterwards.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { BrandColor } from '../contracts/index.js';
import type { RunResult as ToolResult } from '../proc.js';
import { luminance } from './tokens.js';

export type ColorTool = (cmd: string, args: string[], opts?: { timeoutMs?: number }) => Promise<ToolResult>;

const hex2 = (n: number) => n.toString(16).padStart(2, '0').toUpperCase();
const toHex = (r: number, g: number, b: number) => `#${hex2(r)}${hex2(g)}${hex2(b)}`;
const dist = (a: number[], b: number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
const sat = (c: number[]) => { const mx = Math.max(...c); const mn = Math.min(...c); return mx === 0 ? 0 : (mx - mn) / mx; };

/** The main colours of RGBA pixels (transparent pixels ignored), most frequent first, near-duplicates merged. Pure; tested without ffmpeg. */
export function dominantColors(rgba: Uint8Array, max = 4): string[] {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3]! < 128) continue;
    const r = rgba[i]!; const g = rgba[i + 1]!; const b = rgba[i + 2]!;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const e = buckets.get(key);
    if (e) { e.n++; e.r += r; e.g += g; e.b += b; } else buckets.set(key, { n: 1, r, g, b });
  }
  const sorted = [...buckets.values()].sort((a, b) => b.n - a.n).map((e) => [Math.round(e.r / e.n), Math.round(e.g / e.n), Math.round(e.b / e.n)]);
  const picked: number[][] = [];
  for (const c of sorted) {
    if (picked.every((p) => dist(p, c) > 48)) picked.push(c);
    if (picked.length >= max) break;
  }
  return picked.map((c) => toHex(c[0]!, c[1]!, c[2]!));
}

/** A starting palette: the logo's main colours (the most colourful one is the accent), a near-white background and a dark text colour. */
export function paletteFromColors(found: string[]): BrandColor[] {
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const colourful = [...found].sort((a, b) => sat(rgb(b)) - sat(rgb(a)));
  const out: BrandColor[] = [];
  const accent = colourful.find((h) => luminance(h) > 0.02 && luminance(h) < 0.8) ?? colourful[0];
  if (accent) out.push({ hex: accent, name: 'رنگ اصلی', role: 'accent', use: 'رنگ اصلی برند و عنصرهای فعال' });
  const dark = [...found].sort((a, b) => luminance(a) - luminance(b))[0];
  out.push({ hex: dark && luminance(dark) < 0.08 ? dark : '#111827', name: 'متن', role: 'text', use: 'متن اصلی و عنوان‌ها' });
  const second = found.find((h) => h !== accent && h !== dark && luminance(h) > 0.02);
  if (second) out.push({ hex: second, name: 'رنگ دوم', role: 'highlight', use: 'تأکید و پس‌زمینه‌ی روشن' });
  out.push({ hex: '#FDFDFD', name: 'پس‌زمینه', role: 'background', use: 'پس‌زمینه‌ی اصلی' });
  return out;
}

/** Reads the logo (any image ffmpeg understands) at 64×64 and returns the suggested palette; throws on an unreadable file. */
export async function suggestPalette(tool: ColorTool, logoFile: string): Promise<BrandColor[]> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mms-logo-'));
  const raw = path.join(tmp, 'logo.rgba');
  try {
    const r = await tool('ffmpeg', ['-v', 'error', '-y', '-i', logoFile, '-vf', 'scale=64:64:force_original_aspect_ratio=decrease,format=rgba', '-frames:v', '1', '-f', 'rawvideo', raw], { timeoutMs: 30000 });
    if (r.code !== 0 || !fs.existsSync(raw)) throw new Error(`ffmpeg: ${r.stderr.slice(0, 200)}`);
    const found = dominantColors(new Uint8Array(fs.readFileSync(raw)));
    if (found.length === 0) throw new Error('no opaque pixels');
    return paletteFromColors(found);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}
