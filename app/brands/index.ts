// Responsibility: the brand registry (Phase 8): which brands exist (`brand/<slug>/`), which one is active, and the folder and prompt values of the brand a job belongs to.
import fs from 'node:fs';
import path from 'node:path';
import { BrandFile, BrandTokensHead, ContractError, readJson } from '../contracts/index.js';
import type { LoadedConfig, Paths } from '../config.js';
import type { Db } from '../db/db.js';
import { settingsRepo } from '../db/repositories.js';

/** The settings key of the brand New video and Automation work on. */
export const ACTIVE_BRAND_KEY = 'active_brand';
const SLUG = /^[a-z0-9][a-z0-9._-]*$/;

/** A brand that is missing or whose files cannot be used; nothing is guessed. */
export class BrandError extends Error {
  constructor(public readonly message_fa: string, detail = '') {
    super(`${message_fa}${detail ? ` (${detail})` : ''}`);
    this.name = 'BrandError';
  }
}

export interface Brand {
  slug: string;
  /** What the app shows: brand.json `name`, or for a v1 folder the tokens' Persian name. */
  name: string;
  created_at: string;
  /** Absolute path of `brand/<slug>/`. */
  dir: string;
  /**
   * False for a v1 brand folder without brand.json (Mahdiyar, D74): its entry is read from its tokens.json, because the
   * folder must stay byte-for-byte as it is; nothing is written into it.
   */
  registered: boolean;
}

/** `<brands>/<slug>`; a slug that is not a plain folder name is refused (no `..`, no separators). */
export function brandDir(paths: Pick<Paths, 'brands'>, slug: string): string {
  if (!SLUG.test(slug)) throw new BrandError(`نام برند «${slug}» معتبر نیست.`, slug);
  return path.join(paths.brands, slug);
}

/** How a brand folder is named in Persian messages: `brand/<slug>` (relative to the project root when it is inside it). */
export function brandDirLabel(paths: Pick<Paths, 'brands' | 'root'>, slug: string): string {
  const dir = brandDir(paths, slug);
  const rel = path.relative(paths.root, dir);
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel.split(path.sep).join('/') : dir;
}

const tokensFile = (dir: string) => path.join(dir, 'tokens.json');

function readTokens(dir: string, slug: string): BrandTokensHead {
  const file = tokensFile(dir);
  if (!fs.existsSync(file)) throw new BrandError(`برند «${slug}» فایل tokens.json ندارد.`, file);
  try { return readJson(file, BrandTokensHead); } catch (e) {
    throw new BrandError(`فایل tokens.json برند «${slug}» درست نیست (نام برند و فونت فارسی لازم است).`, e instanceof ContractError ? e.message : (e as Error).message);
  }
}

/** One brand of the registry; throws BrandError when it is missing or unreadable. */
export function readBrand(paths: Pick<Paths, 'brands'>, slug: string): Brand {
  const dir = brandDir(paths, slug);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new BrandError(`برند «${slug}» پیدا نشد.`, dir);
  const file = path.join(dir, 'brand.json');
  if (fs.existsSync(file)) {
    let b: BrandFile;
    try { b = readJson(file, BrandFile); } catch (e) { throw new BrandError(`فایل brand.json برند «${slug}» درست نیست.`, (e as Error).message); }
    if (b.slug !== slug) throw new BrandError(`نام پوشه‌ی برند («${slug}») با brand.json آن («${b.slug}») یکی نیست.`, file);
    return { slug, name: b.name, created_at: b.created_at, dir, registered: true };
  }
  // A v1 folder (D74): the tokens name the brand; the tokens' own `brand` must be this folder.
  const t = readTokens(dir, slug);
  if (t.brand !== undefined && t.brand !== slug) throw new BrandError(`tokens.json پوشه‌ی «${slug}» مال برند «${t.brand}» است.`, tokensFile(dir));
  const name = t.name_fa ?? t.name_en;
  if (!name) throw new BrandError(`برند «${slug}» نه brand.json دارد نه نامی در tokens.json.`, dir);
  return { slug, name, created_at: fs.statSync(tokensFile(dir)).mtime.toISOString(), dir, registered: false };
}

/** Every usable brand, the v1 ones first, then by creation time; folders that are not a brand are left out (with the reason). */
export function listBrands(paths: Pick<Paths, 'brands'>): { brands: Brand[]; skipped: { slug: string; reason: string }[] } {
  const brands: Brand[] = [];
  const skipped: { slug: string; reason: string }[] = [];
  // `_`-folders are not brands (`_trash` holds deleted ones).
  const names = fs.existsSync(paths.brands) ? fs.readdirSync(paths.brands, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('_')).map((e) => e.name) : [];
  for (const slug of names) {
    try { brands.push(readBrand(paths, slug)); } catch (e) { skipped.push({ slug, reason: (e as Error).message }); }
  }
  brands.sort((a, b) => Number(a.registered) - Number(b.registered) || a.created_at.localeCompare(b.created_at) || a.slug.localeCompare(b.slug));
  return { brands, skipped };
}

/** The brand New video and Automation work on: the owner's pick, else the configured default, else the oldest brand. */
export function activeBrand(db: Db, config: LoadedConfig): Brand {
  const picked = settingsRepo.get<unknown>(db, ACTIVE_BRAND_KEY);
  for (const slug of [typeof picked === 'string' ? picked : null, config.cfg.brand.default]) {
    if (!slug) continue;
    try { return readBrand(config.paths, slug); } catch { /* gone or broken: the next choice */ }
  }
  const first = listBrands(config.paths).brands[0];
  if (!first) throw new BrandError('هنوز هیچ برندی در پوشه‌ی brand نیست.', config.paths.brands);
  return first;
}

/**
 * The active brand's slug for records outside a job (a suggestion's or a library read's usage row, an unsaved schedule); never
 * throws: with no brand at all it is the configured default.
 */
export function activeBrandSlug(db: Db, config: LoadedConfig): string {
  try { return activeBrand(db, config).slug; } catch { return config.cfg.brand.default; }
}

/** The folder a Claude call outside a job may read (the active brand's), or null when there is no brand yet. */
export function activeBrandDir(db: Db, config: LoadedConfig): string | null {
  try { return activeBrand(db, config).dir; } catch { return null; }
}

export function setActiveBrand(db: Db, config: LoadedConfig, slug: string): Brand {
  const b = readBrand(config.paths, slug);
  settingsRepo.set(db, ACTIVE_BRAND_KEY, b.slug);
  return b;
}

/**
 * Delete = move `brand/<slug>/` to `brand/_trash/<slug>-<time>` (recoverable, like a reference, D85). A v1 brand without brand.json
 * (Mahdiyar) is never moved: its folder must stay as it is. Returns the trash folder.
 */
export function trashBrand(paths: Pick<Paths, 'brands'>, slug: string): string {
  const b = readBrand(paths, slug);
  if (!b.registered) throw new BrandError('این برند فایل‌های دست‌ساز مالک است و حذف نمی‌شود.', slug);
  const trash = path.join(paths.brands, '_trash');
  fs.mkdirSync(trash, { recursive: true });
  const to = path.join(trash, `${slug}-${Date.now()}`);
  fs.renameSync(b.dir, to);
  return to;
}

/** What the content prompts say about a brand (Phase 8): its folder, its name, a short name, and the Persian font its tokens decide. */
export interface BrandPrompt {
  /** The folder as the hook prompt names it: `brand/<slug>` (relative to the project root, which runtime/CLAUDE.md names). */
  brandDir: string;
  /** The brand's Latin name (tokens `name_en`, else its registry name), e.g. «Mahdiyar Hoosh Afza». */
  brandName: string;
  /** The first word of `brandName` (truth's «for the Mahdiyar brand», D74). */
  brandShortName: string;
  /** tokens `fonts.persian_primary`. */
  brandFont: string;
}

export function brandPrompt(paths: Pick<Paths, 'brands' | 'root'>, slug: string): BrandPrompt {
  const b = readBrand(paths, slug);
  const t = readTokens(b.dir, slug);
  const brandName = t.name_en ?? b.name;
  return { brandDir: brandDirLabel(paths, slug), brandName, brandShortName: brandName.split(/\s+/)[0]!, brandFont: t.fonts.persian_primary };
}
