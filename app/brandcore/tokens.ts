// Responsibility: writes `tokens.json` of a built brand: colours, fonts, logo, names and outro fields straight from the answers (code, never Claude), merged with the text part Claude wrote (tone summary, shape, motion personality); same shape as brand/mahdiyar/tokens.json.
import path from 'node:path';
import { z } from 'zod';
import type { BrandAnswers } from '../contracts/index.js';

/** The part of tokens.json Claude writes (`brand-build` skill, DOC=tokens): how the brand feels, not what its colours are. */
export const TokensText = z.looseObject({
  tone_summary: z.string().trim().min(1).max(600),
  motion_personality: z.enum(['calm', 'energetic', 'technical', 'editorial', 'playful', 'luxury']),
  banned_colors: z.array(z.string().trim().min(1)).max(20),
  error_style: z.string().trim().min(1).max(200),
  numbers: z.string().trim().max(300).optional(),
  shape: z.looseObject({ radius_px: z.number().nullable(), radius_ui_px: z.number().nullable().optional(), radius_max_px: z.number().nullable().optional(), stroke_px: z.number().nullable(), shadow: z.string().nullable(), grid_px: z.number().nullable() }),
  motion: z.looseObject({
    preferred: z.array(z.string()).max(20),
    avoid: z.array(z.string()).max(20),
    durations_ms: z.looseObject({ micro: z.tuple([z.number(), z.number()]), ui: z.tuple([z.number(), z.number()]), reveal: z.tuple([z.number(), z.number()]) }),
  }),
  color_ratios: z.record(z.string(), z.string()).optional(),
});
export type TokensText = z.infer<typeof TokensText>;

/** What the code uses when Claude has not written the text part yet (a brand made before its first build still has a valid tokens.json). */
export const DEFAULT_TEXT: TokensText = {
  tone_summary: 'روشن و قابل‌فهم، مثل یک همکار باتجربه',
  motion_personality: 'calm',
  banned_colors: [],
  error_style: 'dashed text-colour frame, never red',
  shape: { radius_px: 0, radius_ui_px: 4, radius_max_px: 8, stroke_px: 1, shadow: null, grid_px: 8 },
  motion: { preferred: ['fade', 'masked reveal', 'vertical slide', 'line drawing'], avoid: [], durations_ms: { micro: [120, 180], ui: [180, 260], reveal: [300, 600] } },
};

export interface OutroFacts {
  /** `logo-outro.mp4` exists. */
  file: string | null;
  tagline: string;
  bg: string;
  text_color: string;
  line_color: string;
  font: string;
}

const PERSIAN_RE = /[؀-ۿ]/;
export const isPersian = (s: string) => PERSIAN_RE.test(s);

const weightsOf = (file: string | null): number[] => (file && /wght|variable/i.test(file) ? [400, 500, 600, 700] : [400, 700]);

/** The colour of a role (first match), else the first colour whose role is `other`, else the fallback. */
export function colorOf(a: BrandAnswers, roles: BrandAnswers['visual']['colors'][number]['role'][], fallback: string): string {
  for (const r of roles) { const c = a.visual.colors.find((x) => x.role === r); if (c) return c.hex.toUpperCase(); }
  return fallback;
}

/** Light or dark: relative luminance of a hex colour (0 black … 1 white). */
export function luminance(hex: string): number {
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * v[0]! + 0.7152 * v[1]! + 0.0722 * v[2]!;
}

/** The outro's colours from the palette: background (lightest), text (darkest), line (accent). All decided by code. */
export function outroColors(a: BrandAnswers): { bg: string; text: string; line: string } {
  const bg = colorOf(a, ['background'], [...a.visual.colors].sort((x, y) => luminance(y.hex) - luminance(x.hex))[0]!.hex.toUpperCase());
  const text = colorOf(a, ['text'], [...a.visual.colors].sort((x, y) => luminance(x.hex) - luminance(y.hex))[0]!.hex.toUpperCase());
  const line = colorOf(a, ['accent', 'highlight'], text);
  return { bg, text, line };
}

export function buildTokens(slug: string, a: BrandAnswers, text: TokensText | null, outro: OutroFacts, fontFiles: { family: string; script: 'persian' | 'latin'; file: string | null }[]): Record<string, unknown> {
  const t = text ?? DEFAULT_TEXT;
  const rel = (f: string) => `brand/${slug}/${f}`;
  const files = fontFiles.filter((f) => f.file).map((f) => ({ family: f.family, weights: weightsOf(f.file), script: f.script, file: rel(`fonts/${f.file}`) }));
  const tagline = a.identity.tagline ?? '';
  const c = outroColors(a);
  return {
    brand: slug,
    name_fa: a.identity.name,
    ...(a.identity.name_en ? { name_en: a.identity.name_en } : {}),
    ...(tagline ? { tagline_fa: tagline } : {}),
    sources: [
      { file: rel('design-system.md'), version: '1.0', priority: 1 },
      { file: rel('brand-guide.md'), version: '1.0', priority: 2 },
    ],
    colors: a.visual.colors.map((x) => ({ name: x.name, hex: x.hex.toUpperCase(), role: x.role, ...(x.use ? { use: x.use } : {}) })),
    ...(t.color_ratios ? { color_ratios_light: t.color_ratios } : {}),
    error_style: t.error_style,
    banned_colors: t.banned_colors,
    fonts: {
      persian_primary: a.visual.persian_font.family,
      latin_heading: a.visual.latin_font.family,
      latin_body: a.visual.latin_font.family,
      files,
      rules: ['max two families per film', 'Persian headings 700, body 400/500', 'Persian line height: headings 1.25-1.45, body 1.7-2.0', 'no decorative fonts'],
    },
    shape: t.shape,
    motion_personality: t.motion_personality,
    motion: t.motion,
    ...(t.numbers ? { numbers: t.numbers } : {}),
    logo: { files: [rel(a.visual.logo)], placements: [], rule: 'the logo appears only in the brand outro (logo-outro.mp4), never inside the film body', backgrounds: [c.bg, c.text] },
    outro: {
      file: outro.file ? rel(outro.file) : null, duration: 3.7, fps: 30, size: [1080, 1920], has_audio: true, use_audio: true, bg: outro.bg, logo_hit: 1.0,
      tagline: { text: outro.tagline, in: 1.45, font: `${outro.font} 700 62px`, color: outro.text_color, line: outro.line_color },
      audio: { kind: 'fixed code-built sting', loudness_lufs: -15, true_peak_db: -1.5, events: { node_blips: [0.15, 0.62], logo_hit: 1.0, tagline_chime: 1.45 } },
      source: 'engine/outro/ (outro.html, render.mjs, sting.py)',
      rules: ['hard cut after the CTA scene', 'no other logo end card', 'never edited per film', 'music fades out 0.3 s before the outro; the outro plays its own sting', '16:9: centre on a 1920x1080 frame of the outro background'],
    },
    tone: { summary: t.tone_summary, do: a.language.use ?? [], dont: [...(a.language.avoid ?? []), ...(a.language.ai_isms ?? [])] },
    language: 'fa',
  };
}

export const tokensPath = (dir: string) => path.join(dir, 'tokens.json');
