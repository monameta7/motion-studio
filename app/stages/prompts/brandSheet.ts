// Responsibility: read and check a video brand sheet (`brand/_sheets/<slug>.md`, owner 2026-11-16: its own folder), the brand's part of the video-prompts template (D86 c–d).
import fs from 'node:fs';
import path from 'node:path';
import { hasArabicScript } from '../../contracts/index.js';

/** The sections of a sheet, in the order the skill writes them («Brand sheet for a new brand»). */
export const SHEET_KEYS = ['name', 'brand_and_audience', 'colours', 'main_accent', 'banned_colours', 'work_shown', 'look_and_light', 'lettering', 'words_to_avoid', 'cta', 'notes'] as const;
export type SheetKey = (typeof SHEET_KEYS)[number];
export type BrandSheet = Record<SheetKey, string>;

/** Sections that reach a prompt: English only (D93), no colour code. `cta` and `notes` are for the edit and never reach a prompt. */
const PROMPT_KEYS: SheetKey[] = ['name', 'brand_and_audience', 'colours', 'main_accent', 'banned_colours', 'work_shown', 'look_and_light', 'lettering', 'words_to_avoid'];
/** Sections a sheet cannot leave empty (the template's slots that have no "if any"). */
const REQUIRED: SheetKey[] = ['name', 'brand_and_audience', 'colours', 'main_accent', 'banned_colours', 'work_shown', 'lettering', 'words_to_avoid'];

export const COLOUR_CODE = /#[0-9A-Fa-f]{6}\b|#[0-9A-Fa-f]{3}\b/;

export const sheetsDir = (root: string) => path.join(root, 'brand', '_sheets');
export const sheetFile = (root: string, brand: string) => path.join(sheetsDir(root), `${brand}.md`);

/** Parses «## key» sections (HTML comments dropped, text trimmed). Throws on an unknown, repeated or missing heading. */
export function parseSheet(text: string): BrandSheet {
  const body = text.replace(/\r\n/g, '\n').replace(/<!--[\s\S]*?-->/g, '');
  const found: Partial<BrandSheet> = {};
  const order: string[] = [];
  const parts = body.split(/^## +(.+?) *$/m);
  for (let i = 1; i < parts.length; i += 2) {
    const key = parts[i]!.trim();
    if (!(SHEET_KEYS as readonly string[]).includes(key)) throw new Error(`brand sheet: unknown section «${key}»`);
    if (key in found) throw new Error(`brand sheet: section «${key}» twice`);
    found[key as SheetKey] = parts[i + 1]!.trim();
    order.push(key);
  }
  const missing = SHEET_KEYS.filter((k) => !(k in found));
  if (missing.length) throw new Error(`brand sheet: missing sections ${missing.join(', ')}`);
  if (order.join() !== SHEET_KEYS.join()) throw new Error(`brand sheet: sections must be in the order ${SHEET_KEYS.join(', ')}`);
  return found as BrandSheet;
}

/** The rules a sheet must keep before it may fill a prompt; empty = good. */
export function sheetProblems(sheet: BrandSheet): string[] {
  const out: string[] = [];
  for (const k of REQUIRED) if (!sheet[k]) out.push(`brand sheet section «${k}» is empty`);
  for (const k of PROMPT_KEYS) {
    if (hasArabicScript(sheet[k])) out.push(`brand sheet section «${k}» has a Persian or Arabic letter; it reaches the prompt, so it is English only (D93)`);
    if (COLOUR_CODE.test(sheet[k])) out.push(`brand sheet section «${k}» has a colour code; colours are plain words`);
    if (/\n/.test(sheet[k])) out.push(`brand sheet section «${k}» has more than one line; it fills one place inside a line of the template`);
  }
  return out;
}

/** Reads the brand's sheet, or null when it has none yet. Throws when it exists but is broken. */
export function readSheet(root: string, brand: string): BrandSheet | null {
  const f = sheetFile(root, brand);
  if (!fs.existsSync(f)) return null;
  const sheet = parseSheet(fs.readFileSync(f, 'utf8'));
  const p = sheetProblems(sheet);
  if (p.length) throw new Error(p.join('; '));
  return sheet;
}
