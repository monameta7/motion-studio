// Responsibility: the brand folder's code-made assets (D67): copies the free default fonts a brand did not replace, checks uploaded files exist, and writes tokens.json from the answers plus the text part Claude wrote.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson, type BrandAnswers } from '../contracts/index.js';
import { OUTRO_FILE, outroTagline, taglineFont } from './outro.js';
import { TokensText, buildTokens, isPersian, outroColors, tokensPath } from './tokens.js';

export const DEFAULTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'defaults', 'fonts');
/** The free fonts a brand gets when it brings none (D67): Vazirmatn for Persian, Inter for Latin (both OFL, licence files copied along). */
export const DEFAULT_FONTS = {
  persian: { family: 'Vazirmatn', file: 'Vazirmatn[wght].woff2', licence: 'OFL-Vazirmatn.txt' },
  latin: { family: 'Inter', file: 'Inter[wght].woff2', licence: 'OFL-Inter.txt' },
} as const;
export const TOKENS_TEXT_FILE = 'tokens-text.json';

export class AssetError extends Error {
  constructor(public readonly message_fa: string, detail = '') { super(`${message_fa}${detail ? ` (${detail})` : ''}`); this.name = 'AssetError'; }
}

/** A font without a file is a free default: its family is the default's own name (never a name the brand does not have). */
export function normalizeFonts(a: BrandAnswers): BrandAnswers {
  const fix = (f: BrandAnswers['visual']['persian_font'], d: { family: string }) => (f.file === null ? { family: d.family, file: null, licence_ok: true } : f);
  return { ...a, visual: { ...a.visual, persian_font: fix(a.visual.persian_font, DEFAULT_FONTS.persian), latin_font: fix(a.visual.latin_font, DEFAULT_FONTS.latin) } };
}

/** Absolute path of the font file a brand uses for a script (the default copy when the brand brought none). */
export const fontFileOf = (dir: string, a: BrandAnswers, script: 'persian' | 'latin'): string => {
  const f = script === 'persian' ? a.visual.persian_font : a.visual.latin_font;
  return path.join(dir, 'fonts', f.file ?? DEFAULT_FONTS[script].file);
};

/** The font file the outro's tagline is set in: the Persian font for a Persian (or no) tagline, else the Latin one; null when the file is not there yet. */
export function taglineFontFile(dir: string, a: BrandAnswers): string | null {
  const t = outroTagline(a);
  const f = fontFileOf(dir, a, isPersian(t) || t === '' ? 'persian' : 'latin');
  return fs.existsSync(f) ? f : null;
}

/** Makes sure every file the answers name is in the brand folder; copies the free defaults. Throws AssetError in Persian when an uploaded file is missing. */
export function ensureFiles(dir: string, a: BrandAnswers): void {
  if (!fs.existsSync(path.join(dir, a.visual.logo))) throw new AssetError('فایل لوگو پیدا نشد؛ لوگو را دوباره بارگذاری کن.', a.visual.logo);
  fs.mkdirSync(path.join(dir, 'fonts'), { recursive: true });
  for (const script of ['persian', 'latin'] as const) {
    const f = script === 'persian' ? a.visual.persian_font : a.visual.latin_font;
    if (f.file) {
      if (!fs.existsSync(path.join(dir, 'fonts', f.file))) throw new AssetError(`فایل فونت «${f.file}» پیدا نشد؛ دوباره بارگذاری کن.`, f.file);
      continue;
    }
    const d = DEFAULT_FONTS[script];
    for (const n of [d.file, d.licence]) {
      const dest = path.join(dir, 'fonts', n);
      if (!fs.existsSync(dest)) fs.copyFileSync(path.join(DEFAULTS_DIR, n), dest);
    }
  }
}

export function readTokensText(dir: string): TokensText | null {
  const f = path.join(dir, TOKENS_TEXT_FILE);
  return fs.existsSync(f) ? readJson(f, TokensText) : null;
}

/** Writes tokens.json from the answers (colours, fonts, logo, names, outro: code) and the saved text part (or the defaults). */
export function writeTokens(slug: string, dir: string, a: BrandAnswers): Record<string, unknown> {
  const c = outroColors(a);
  const tf = taglineFont(a);
  const tokens = buildTokens(slug, a, readTokensText(dir), {
    file: fs.existsSync(path.join(dir, OUTRO_FILE)) ? OUTRO_FILE : null, tagline: outroTagline(a), bg: c.bg, text_color: c.text, line_color: c.line, font: tf.family,
  }, [
    { family: a.visual.persian_font.family, script: 'persian', file: a.visual.persian_font.file ?? DEFAULT_FONTS.persian.file },
    { family: a.visual.latin_font.family, script: 'latin', file: a.visual.latin_font.file ?? DEFAULT_FONTS.latin.file },
  ]);
  fs.writeFileSync(tokensPath(dir), `${JSON.stringify(tokens, null, 2)}\n`, 'utf8');
  return tokens;
}
