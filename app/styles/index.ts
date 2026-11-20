// Responsibility: the visual styles library of the video workspace (Phase 11.5, D86 g): `styles/<slug>/` folders (style.json + card picture) listed, added, edited, moved to `styles/_trash/` and restored, shared by every brand like refs/.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { StyleMeta, readJson, writeJson } from '../contracts/index.js';
import { styleTextProblems } from '../stages/prompts/checks.js';

/** A refused library action, with its Persian reason and the HTTP status the API answers with. */
export class StyleError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 409 = 400) { super(message); }
}

export const MAX_CARD_BYTES = 5 * 1024 * 1024;
const SLUG = /^[a-z0-9][a-z0-9._-]*$/;
const TRASH = '_trash';
type Ext = 'png' | 'jpg' | 'webp';

/** The picture's real type from its first bytes (never from the file name); null = not a PNG, JPEG or WebP. */
export function pictureExt(data: Buffer): Ext | null {
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'jpg';
  if (data.length >= 12 && data.subarray(0, 4).toString('latin1') === 'RIFF' && data.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return null;
}

const sha = (data: Buffer) => createHash('sha256').update(data).digest('hex');
const metaFile = (root: string, slug: string) => path.join(root, slug, 'style.json');

/** The number a title starts with («31 Glass and Light 3D Render» → 31), so the library keeps the owner's own order. */
const leadingNumber = (title: string) => { const m = /^\s*(\d+)/.exec(title); return m ? Number(m[1]) : Number.POSITIVE_INFINITY; };
const byTitle = (a: StyleMeta, b: StyleMeta) => leadingNumber(a.title) - leadingNumber(b.title) || a.title.localeCompare(b.title, 'en', { numeric: true });

/** Every folder with a valid style.json, except `_`-folders (the trash), in the titles' own number order. */
export function listStyles(root: string): StyleMeta[] {
  let dirs: string[];
  try { dirs = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('_')).map((d) => d.name); } catch { return []; }
  const out: StyleMeta[] = [];
  for (const d of dirs) {
    try {
      const m = readJson(metaFile(root, d), StyleMeta);
      if (m.slug === d) out.push(m);
    } catch { /* not a style folder */ }
  }
  return out.sort(byTitle);
}

export function readStyle(root: string, slug: string): StyleMeta | null {
  if (!SLUG.test(slug)) return null;
  try { const m = readJson(metaFile(root, slug), StyleMeta); return m.slug === slug ? m : null; } catch { return null; }
}

/** The picture file of a style, or null. */
export function cardFile(root: string, slug: string): string | null {
  const m = readStyle(root, slug);
  if (!m) return null;
  const f = path.join(root, slug, m.image);
  return fs.existsSync(f) ? f : null;
}

/** Why this style cannot start a video job (Persian), or null when it can: it must be in the library and have its text (D93 rules kept). */
export function styleProblem(root: string, slug: string, colourNames: string[] = []): string | null {
  const m = readStyle(root, slug);
  if (!m) return `سبک تصویری «${slug}» در کتابخانه‌ی سبک‌ها نیست؛ یک سبک از کتابخانه انتخاب کن.`;
  if (!m.text) return `سبک «${m.title}» هنوز متن سبک ندارد؛ در کتابخانه‌ی سبک‌ها متنش را بنویس.`;
  return styleTextProblems(m.text, colourNames)[0] ?? null;
}

function checkTitle(title: string): string {
  const t = title.trim();
  if (!t) throw new StyleError('عنوان سبک را بنویس.');
  if (t.length > 80) throw new StyleError('عنوان سبک بلندتر از ۸۰ حرف است.');
  return t;
}

function checkText(text: string): string {
  const t = text.trim();
  if (!t) throw new StyleError('متن سبک را بنویس؛ همین متن کلمه‌به‌کلمه در پرامپت هر کلیپ می‌رود.');
  if (t.length > 1200) throw new StyleError('متن سبک بلندتر از ۱۲۰۰ حرف است؛ چند خط کوتاه کافی است.');
  const p = styleTextProblems(t);
  if (p.length) throw new StyleError(p[0]!);
  return t;
}

function checkPicture(data: Buffer): Ext {
  if (data.length === 0) throw new StyleError('تصویر سبک را انتخاب کن.');
  if (data.length > MAX_CARD_BYTES) throw new StyleError('تصویر سبک بزرگ‌تر از ۵ مگابایت است.');
  const ext = pictureExt(data);
  if (!ext) throw new StyleError('فقط تصویر PNG، JPG یا WebP پذیرفته می‌شود.');
  return ext;
}

/** A slug from the title's Latin words; a title without them gets `style-<hash>`; never one already used here or in the trash. */
export function newSlug(root: string, title: string, data: Buffer): string {
  const words = title.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
  const base = words && SLUG.test(words) ? words : `style-${sha(data).slice(0, 8)}`;
  const trashed = new Set(trashEntries(root).map((t) => t.slug));
  let s = base;
  for (let n = 2; fs.existsSync(path.join(root, s)) || trashed.has(s); n++) s = `${base}-${n}`;
  return s;
}

function writeCard(dir: string, data: Buffer, ext: Ext): string {
  for (const old of ['card.png', 'card.jpg', 'card.webp']) fs.rmSync(path.join(dir, old), { force: true });
  const name = `card.${ext}`;
  fs.writeFileSync(path.join(dir, name), data);
  return name;
}

export interface NewStyle { title: string; text: string; picture: Buffer; source?: StyleMeta['source']; slug?: string }

/** Adds a style: title, its text (English, the prompt's style lines word for word) and its picture. */
export function addStyle(root: string, s: NewStyle, now = new Date()): StyleMeta {
  const title = checkTitle(s.title);
  const text = checkText(s.text);
  const ext = checkPicture(s.picture);
  const slug = s.slug ?? newSlug(root, title, s.picture);
  if (!SLUG.test(slug)) throw new StyleError('نام پوشه‌ی سبک نامعتبر است.');
  const dir = path.join(root, slug);
  if (fs.existsSync(dir)) throw new StyleError('سبکی با همین نام هست.', 409);
  fs.mkdirSync(dir, { recursive: true });
  try {
    const image = writeCard(dir, s.picture, ext);
    const at = now.toISOString();
    return writeJson(metaFile(root, slug), StyleMeta, { slug, title, text, image, image_sha256: sha(s.picture), source: s.source ?? 'user', created_at: at, updated_at: at, last_used_at: null });
  } catch (e) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw e;
  }
}

/** Edits the title and the text, and the picture when one is given; the slug, source and times of use stay. */
export function updateStyle(root: string, slug: string, u: { title: string; text: string; picture?: Buffer }, now = new Date()): StyleMeta {
  const m = readStyle(root, slug);
  if (!m) throw new StyleError('این سبک پیدا نشد.', 404);
  const title = checkTitle(u.title);
  const text = checkText(u.text);
  let image = m.image;
  let image_sha256 = m.image_sha256;
  if (u.picture && u.picture.length) {
    const ext = checkPicture(u.picture);
    image = writeCard(path.join(root, slug), u.picture, ext);
    image_sha256 = sha(u.picture);
  }
  return writeJson(metaFile(root, slug), StyleMeta, { ...m, title, text, image, image_sha256, updated_at: now.toISOString() });
}

/** The default of New video: the job that used it last sets this (no Claude call). */
export function markUsed(root: string, slug: string, now = new Date()): void {
  const m = readStyle(root, slug);
  if (m) writeJson(metaFile(root, slug), StyleMeta, { ...m, last_used_at: now.toISOString() });
}

/** Before any style was used (a fresh install): style 31, the one both real films used (owner 2026-11-19: «سبک 31»), when the library has it. */
export const STARTER_STYLE = 'glass-and-light-3d-render';

/** The style used last, else the starter style, else the first of the library; null for an empty library. Only styles with a text count. */
export function defaultStyle(styles: StyleMeta[]): string | null {
  const usable = styles.filter((s) => s.text);
  const used = usable.filter((s) => s.last_used_at).sort((a, b) => b.last_used_at!.localeCompare(a.last_used_at!));
  return used[0]?.slug ?? usable.find((s) => s.slug === STARTER_STYLE)?.slug ?? usable[0]?.slug ?? null;
}

/** Delete = move to `styles/_trash/<slug>-<time>` (the owner empties it himself, like refs/ D57 and D85). Returns the trash name. */
export function deleteStyle(root: string, slug: string, now = new Date()): string {
  if (!readStyle(root, slug)) throw new StyleError('این سبک پیدا نشد.', 404);
  const trash = path.join(root, TRASH);
  fs.mkdirSync(trash, { recursive: true });
  const name = `${slug}-${now.getTime()}`;
  fs.renameSync(path.join(root, slug), path.join(trash, name));
  return name;
}

export interface TrashEntry { name: string; slug: string; title: string; deleted_at: string }

/** The deleted styles that can be restored, newest first. */
export function trashEntries(root: string): TrashEntry[] {
  const trash = path.join(root, TRASH);
  let names: string[];
  try { names = fs.readdirSync(trash, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { return []; }
  const out: TrashEntry[] = [];
  for (const name of names) {
    const at = /-(\d{13})$/.exec(name);
    if (!at) continue;
    try {
      const m = readJson(path.join(trash, name, 'style.json'), StyleMeta);
      if (`${m.slug}-${at[1]}` === name) out.push({ name, slug: m.slug, title: m.title, deleted_at: new Date(Number(at[1])).toISOString() });
    } catch { /* not a style */ }
  }
  return out.sort((a, b) => b.deleted_at.localeCompare(a.deleted_at));
}

/** Moves a deleted style back to `styles/<slug>/`; refused when a style with that slug is there again. */
export function restoreStyle(root: string, name: string): StyleMeta {
  const e = trashEntries(root).find((t) => t.name === name);
  if (!e) throw new StyleError('این سبک در حذف‌شده‌ها نیست.', 404);
  if (fs.existsSync(path.join(root, e.slug))) throw new StyleError(`سبکی با نام «${e.slug}» دوباره در کتابخانه هست؛ اول آن را حذف کن.`, 409);
  fs.renameSync(path.join(root, TRASH, name), path.join(root, e.slug));
  return readStyle(root, e.slug)!;
}
