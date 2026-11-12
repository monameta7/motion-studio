// Responsibility: the brand contracts of docs/04 (Phase 8): `brand/<slug>/brand.json`, and the few `tokens.json` fields the app itself reads.
import { z } from 'zod';
import { isoDateTime, slug } from './common.js';

/**
 * The brand of everything made before Phase 8 (v1 had one brand, D3): older request.json files, and the jobs, calendar days,
 * usage rows and schedule the 004 migration labels.
 */
export const LEGACY_BRAND = 'mahdiyar';

/** `brand/<slug>/brand.json`: the registry entry of a brand (Phase 8). `name` is what the app shows (the sidebar switcher, job cards). */
export const BrandFile = z.strictObject({
  name: z.string().trim().min(1).max(60),
  slug,
  created_at: isoDateTime,
});
export type BrandFile = z.infer<typeof BrandFile>;

/**
 * The fields of `brand/<slug>/tokens.json` the app reads (the file belongs to the brand and the skills; every other field is kept
 * untouched): the brand's names and its Persian font, which the content prompts name (Phase 8).
 */
export const BrandTokensHead = z.looseObject({
  brand: z.string().optional(),
  name_fa: z.string().trim().min(1).optional(),
  name_en: z.string().trim().min(1).optional(),
  fonts: z.looseObject({ persian_primary: z.string().trim().min(1) }),
});
export type BrandTokensHead = z.infer<typeof BrandTokensHead>;
