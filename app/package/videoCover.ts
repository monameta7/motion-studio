// Responsibility: the 4:5 cover of a video film, made on this PC at no cost (D102 c): one frame of the finished reel under the package's cover headline and subline, in the brand's Persian font and colours with its small logo, rendered by engine/video-cover.mjs and checked (size, text read back, fonts, boxes, contrast).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import type { ContentPackage } from '../contracts/index.js';
import type { RunResult } from '../proc.js';

export type Tool = (cmd: string, args: string[], opts?: { timeoutMs?: number }) => Promise<RunResult>;

export const COVER_W = 1080;
export const COVER_H = 1350;
/** Text and logo keep this margin from the cover's edges; the picture keeps at least 40 % of the height. */
export const COVER_MARGIN = 48;
export const BAND_MAX_SHARE = 0.6;
export const CONTRAST_MIN = 4.5;
/** The headline starts at this size and shrinks (to at least HEADLINE_MIN_PX) until it fits in three lines inside the side padding. */
export const HEADLINE_PX = 176;
export const HEADLINE_MIN_PX = 96;
export const SUBLINE_RATIO = 0.36;
/** Side padding of the centred text: wider than the 4:5 → 3:4 profile-grid crop (about 34 px a side) plus the margin. */
export const TEXT_PAD_X = 96;
/** The frame behind the text: a light blur (it stays recognisable) and a little darkening. */
export const FRAME_BLUR_PX = 7;
/** Opacity of the brand's dark colour behind the middle of the cover; the contrast check takes the worst case (text over a white pixel). */
export const SCRIM_CENTRE = 0.64;
/** The text block's centre may be this far from the cover's centre (rounding of the layout). */
export const CENTRE_TOLERANCE_PX = 6;
/** The frame of the reel under the text: the middle of the first clip (or of a shorter reel). */
export const coverFrameSeconds = (bodyS: number): number => Math.round(Math.min(5, bodyS / 2) * 1000) / 1000;

/** The brand-token fields the cover reads (tokens.json is brand-owned; everything else is ignored). */
const CoverTokens = z.looseObject({
  colors: z.array(z.looseObject({ hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/), role: z.string().optional() })).default([]),
  fonts: z.looseObject({
    persian_primary: z.string().optional(),
    persian_secondary: z.string().optional(),
    files: z.array(z.looseObject({ family: z.string(), weight: z.number().optional(), weights: z.array(z.number()).optional(), file: z.string() })).default([]),
  }).optional(),
  logo: z.looseObject({ files: z.array(z.string()).default([]) }).optional(),
});

/** WCAG contrast ratio of two #RRGGBB colours. */
export function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m) as [number, number];
  return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A brand file named in tokens.json: root-relative (the hand-made brand) or relative to the brand folder (a built brand). */
function brandFile(root: string, brandDir: string, rel: string): string | null {
  for (const f of [path.join(root, rel), path.join(brandDir, rel), path.join(brandDir, path.basename(rel))]) if (fs.existsSync(f)) return f;
  return null;
}

export interface CoverDesign { band: string; text: string; family: string; headlineWeight: number; sublineWeight: number; faces: { file: string; weight: string }[]; logo: string | null }

/** The cover's colours, font and logo from the brand tokens: band = the `background` colour, text = the `text` colour, the Persian primary font. */
export function coverDesign(root: string, brandDir: string): CoverDesign {
  const f = path.join(brandDir, 'tokens.json');
  const parsed = fs.existsSync(f) ? CoverTokens.safeParse(JSON.parse(fs.readFileSync(f, 'utf8'))) : null;
  const t = parsed?.success ? parsed.data : CoverTokens.parse({});
  const colour = (role: string, def: string) => t.colors.find((c) => c.role === role)?.hex ?? def;
  const files = t.fonts?.files ?? [];
  const family = [t.fonts?.persian_primary, t.fonts?.persian_secondary].find((fam) => fam && files.some((x) => x.family === fam)) ?? null;
  const faces = family ? files.filter((x) => x.family === family).flatMap((x) => {
    const file = brandFile(root, brandDir, x.file);
    if (!file) return [];
    const ws = x.weights?.length ? x.weights : [x.weight ?? 400];
    return [{ file, weight: ws.length > 1 ? `${Math.min(...ws)} ${Math.max(...ws)}` : String(ws[0]), ws }];
  }) : [];
  const weights = faces.flatMap((x) => x.ws);
  const nearest = (want: number) => (weights.length ? weights.reduce((b, w) => (Math.abs(w - want) < Math.abs(b - want) ? w : b)) : want);
  const logo = (t.logo?.files ?? []).map((x) => brandFile(root, brandDir, x)).find((x) => x !== null) ?? null;
  return {
    band: colour('background', '#FFFFFF'), text: colour('text', '#111111'), family: family ?? 'Vazirmatn',
    headlineWeight: nearest(800), sublineWeight: nearest(600), faces: faces.map(({ file, weight }) => ({ file, weight })), logo,
  };
}

/** `#RRGGBB` → `r,g,b` for rgba(). */
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(',');

/** `top` laid over `bottom` at opacity `a`, as #RRGGBB. */
export function blend(top: string, bottom: string, a: number): string {
  const ch = (h: string, i: number) => parseInt(h.slice(i, i + 2), 16);
  return `#${[1, 3, 5].map((i) => Math.round(a * ch(top, i) + (1 - a) * ch(bottom, i)).toString(16).padStart(2, '0')).join('')}`;
}

/** The worst-case contrast of the cover text: light text over the scrim's centre laid on a pure white pixel of the frame. */
export const coverContrast = (d: CoverDesign): number => contrast(d.band, blend(d.text, '#FFFFFF', SCRIM_CENTRE));

/**
 * The cover page (owner, 2026-11-19): the reel frame fills the whole cover, lightly blurred and darkened; the hook headline sits
 * exactly in the middle, large, in the brand's light colour over a soft scrim of its dark colour, the subline smaller under it;
 * the logo small at the bottom left. The headline shrinks from HEADLINE_PX until it fits in three lines, never breaking a word.
 */
export function coverHtml(d: CoverDesign, cover: ContentPackage['cover'], frameFile: string): string {
  const fmt = (f: string) => ({ '.woff2': 'woff2', '.woff': 'woff', '.ttf': 'truetype', '.otf': 'opentype' })[path.extname(f).toLowerCase()] ?? 'woff2';
  const faces = d.faces.map((x) => `@font-face{font-family:'${d.family}';src:url('${pathToFileURL(x.file).href}') format('${fmt(x.file)}');font-weight:${x.weight};}`).join('\n');
  const dark = rgb(d.text);
  return `<!doctype html>
<html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>cover</title><style>
${faces}
html,body{margin:0;width:${COVER_W}px;height:${COVER_H}px;overflow:hidden;background:${d.text}}
body{position:relative;font-family:'${d.family}',Tahoma,sans-serif;color:${d.band}}
#picture{position:absolute;inset:0;overflow:hidden}
#picture>img{position:absolute;inset:-${FRAME_BLUR_PX * 5}px;width:calc(100% + ${FRAME_BLUR_PX * 10}px);height:calc(100% + ${FRAME_BLUR_PX * 10}px);object-fit:cover;object-position:50% 45%;filter:blur(${FRAME_BLUR_PX}px) brightness(.92) saturate(1.05);display:block}
#scrim{position:absolute;inset:0;background:radial-gradient(ellipse 78% 46% at 50% 50%,rgba(${dark},${SCRIM_CENTRE}) 0%,rgba(${dark},${SCRIM_CENTRE}) 38%,rgba(${dark},.34) 78%,rgba(${dark},.26) 100%)}
#band{position:absolute;left:${TEXT_PAD_X}px;right:${TEXT_PAD_X}px;top:50%;transform:translateY(-50%);text-align:center}
#headline{margin:0;font-weight:${d.headlineWeight};font-size:${HEADLINE_PX}px;line-height:1.16;text-wrap:balance;word-break:keep-all;overflow-wrap:normal;text-shadow:0 6px 32px rgba(${dark},.55)}
#subline{margin:28px 0 0;font-weight:${d.sublineWeight};font-size:${Math.round(HEADLINE_PX * SUBLINE_RATIO)}px;line-height:1.35;text-wrap:balance;opacity:.94;text-shadow:0 3px 18px rgba(${dark},.6)}
#logo{position:absolute;left:${COVER_MARGIN}px;bottom:${COVER_MARGIN}px;background:${d.band};border-radius:24px;padding:14px 18px;line-height:0}
#logo img{height:96px;width:auto}
</style></head><body>
<div id="picture"><img src="${esc(pathToFileURL(frameFile).href)}" alt=""></div>
<div id="scrim"></div>
<div id="band"><h1 id="headline">${esc(cover.headline)}</h1>${cover.subline ? `<p id="subline">${esc(cover.subline)}</p>` : ''}</div>
${d.logo ? `<div id="logo"><img src="${esc(pathToFileURL(d.logo).href)}" alt=""></div>` : ''}
<script>
document.fonts.ready.then(function () {
  var h = document.getElementById('headline'), s = document.getElementById('subline'), size = ${HEADLINE_PX};
  var fits = function () { var lh = size * 1.16; return h.scrollWidth <= h.clientWidth + 1 && h.getBoundingClientRect().height <= lh * 3 + 2; };
  while (size > ${HEADLINE_MIN_PX} && !fits()) { size -= 4; h.style.fontSize = size + 'px'; if (s) s.style.fontSize = Math.round(size * ${SUBLINE_RATIO}) + 'px'; }
});
</script>
</body></html>
`;
}

interface Box { text: string; x: number; y: number; w: number; h: number; family: string; weight: string; size: string }
export interface CoverReport { headline: Box | null; subline: Box | null; band: Box | null; logo: Box | null; picture: Box | null; fonts: { family: string; weight: string; status: string }[]; errors: string[] }

/** Width and height from a PNG header; null when the file is not a PNG. */
export function pngSize(file: string): { w: number; h: number } | null {
  const b = fs.readFileSync(file);
  return b.length > 24 && b.toString('latin1', 1, 4) === 'PNG' ? { w: b.readUInt32BE(16), h: b.readUInt32BE(20) } : null;
}

/** Every rule the cover must keep; empty = good. */
export function coverProblems(r: CoverReport, size: { w: number; h: number } | null, cover: ContentPackage['cover'], d: CoverDesign): string[] {
  const out: string[] = [];
  if (!size || size.w !== COVER_W || size.h !== COVER_H) out.push(`cover is ${size ? `${size.w}x${size.h}` : 'not a PNG'}, expected ${COVER_W}x${COVER_H}`);
  if (r.headline?.text !== cover.headline) out.push('the headline on the cover is not the package headline word for word');
  if (cover.subline && r.subline?.text !== cover.subline) out.push('the subline on the cover is not the package subline word for word');
  const inside = (b: Box | null, name: string) => {
    if (!b) { out.push(`${name} is missing`); return; }
    if (b.x < COVER_MARGIN - 0.5 || b.x + b.w > COVER_W - COVER_MARGIN + 0.5 || b.y < 0 || b.y + b.h > COVER_H) out.push(`${name} is outside the cover's safe area`);
  };
  inside(r.headline, 'headline');
  if (cover.subline) inside(r.subline, 'subline');
  if (d.logo) inside(r.logo, 'logo');
  if (r.band && r.band.h > COVER_H * BAND_MAX_SHARE) out.push(`the text block takes ${Math.round(r.band.h)} px, more than ${Math.round(BAND_MAX_SHARE * 100)} % of the cover`);
  if (r.band) {
    const dy = r.band.y + r.band.h / 2 - COVER_H / 2;
    const dx = r.band.x + r.band.w / 2 - COVER_W / 2;
    if (Math.abs(dy) > CENTRE_TOLERANCE_PX || Math.abs(dx) > CENTRE_TOLERANCE_PX) out.push(`the text block is not in the middle of the cover (off by ${Math.round(dx)} px across, ${Math.round(dy)} px down)`);
  }
  if (r.headline && parseFloat(r.headline.size) < HEADLINE_MIN_PX) out.push(`the headline is only ${r.headline.size}; it is too long for a large cover headline`);
  const loaded = r.fonts.some((f) => f.family === d.family && f.status === 'loaded');
  if (!loaded) out.push(`the brand font «${d.family}» did not load`);
  const c = coverContrast(d);
  if (c < CONTRAST_MIN) out.push(`text contrast ${c}:1 is under ${CONTRAST_MIN}:1`);
  out.push(...r.errors.map((e) => `cover page: ${e}`));
  return out;
}

export interface CoverResult { file: string; frame_s: number; problems: string[]; contrast: number; design: Omit<CoverDesign, 'faces'> & { faces: number }; report: CoverReport | null }

/**
 * Makes `out/cover-4x5.png`: the frame at `frameS` of the finished film, the page in `video/cover/`, the screenshot, the checks.
 * Throws when nothing could be rendered; a cover that renders but breaks a rule comes back with its problems.
 */
export async function makeCover(o: { dir: string; root: string; brandDir: string; engineDir: string; cover: ContentPackage['cover']; frameS: number; tool: Tool }): Promise<CoverResult> {
  const work = path.join(o.dir, 'video', 'cover');
  fs.mkdirSync(work, { recursive: true });
  const frame = path.join(work, 'frame.png');
  fs.rmSync(frame, { force: true });
  const f = await o.tool('ffmpeg', ['-v', 'error', '-y', '-ss', String(o.frameS), '-i', path.join(o.dir, 'out', 'final.mp4'), '-frames:v', '1', '-update', '1', frame], { timeoutMs: 120000 });
  if (f.code !== 0 || !fs.existsSync(frame)) throw new Error(`cover frame at ${o.frameS} s failed: ${(f.stderr || f.error || '').slice(-300)}`);
  const d = coverDesign(o.root, o.brandDir);
  const html = path.join(work, 'cover.html');
  const page = coverHtml(d, o.cover, frame);
  const png = path.join(o.dir, 'out', 'cover-4x5.png');
  // The same frame and the same page make the same cover: kept as it is (a sound or caption revision must not change it).
  const key = crypto.createHash('sha256').update(fs.readFileSync(frame)).update(page).digest('hex');
  const keyFile = path.join(work, 'key.txt');
  const qaFile = path.join(o.dir, 'logs', 'cover-qa.json');
  if (fs.existsSync(png) && fs.existsSync(qaFile) && fs.existsSync(keyFile) && fs.readFileSync(keyFile, 'utf8') === key) {
    try { return JSON.parse(fs.readFileSync(qaFile, 'utf8')) as CoverResult; } catch { /* render again */ }
  }
  fs.writeFileSync(html, page, 'utf8');
  fs.rmSync(png, { force: true });
  const r = await o.tool('node', [path.join(o.engineDir, 'video-cover.mjs'), html, png], { timeoutMs: 180000 });
  let report: CoverReport | null = null;
  try { report = JSON.parse(r.stdout.trim().split(/\r?\n/).pop() ?? '') as CoverReport; } catch { /* no report */ }
  if (!fs.existsSync(png)) throw new Error(`cover render failed: ${(r.stderr || r.error || r.stdout).slice(-400)}`);
  const problems = report ? coverProblems(report, pngSize(png), o.cover, d) : ['the cover page gave no report'];
  const { faces, ...rest } = d;
  fs.writeFileSync(keyFile, key, 'utf8');
  return { file: 'out/cover-4x5.png', frame_s: o.frameS, problems, contrast: coverContrast(d), design: { ...rest, faces: faces.length }, report };
}
