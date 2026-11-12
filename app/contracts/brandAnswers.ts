// Responsibility: the contract of `brand/<slug>/answers.json` (Phase 9, docs/04): the brand questionnaire's answers, 12 required fields, the rest optional; the section ids are the keys the partial rebuild maps to docs.
import { z } from 'zod';
import { hexColor, isoDateTime } from './common.js';

const text = z.string().trim().max(4000);
const req = z.string().trim().min(1, 'required').max(4000);
const list = z.array(z.string().trim().min(1).max(1000)).max(60);
const reqList = list.min(1, 'required');

/** Section ids in the order the page shows them (docs/11). */
export const BRAND_SECTIONS = ['identity', 'position', 'audience', 'offers', 'message', 'voice', 'language', 'strategy', 'guardrails', 'examples', 'visual'] as const;
export type BrandSection = (typeof BRAND_SECTIONS)[number];

const pair = <K extends string>(...keys: K[]) => z.looseObject(Object.fromEntries(keys.map((k) => [k, text.optional()])) as Record<K, z.ZodOptional<typeof text>>);

/** A slider position, 0 (left word) to 100 (right word): رسمی↔خودمانی، جدی↔شوخ، محترمانه↔بی‌پروا، پرشور↔خونسرد. */
const slider = z.number().int().min(0).max(100);

export const BrandColor = z.strictObject({
  hex: hexColor,
  name: z.string().trim().min(1).max(40),
  role: z.enum(['background', 'surface', 'text', 'accent', 'highlight', 'success', 'other']),
  use: text.optional(),
});
export type BrandColor = z.infer<typeof BrandColor>;

/** A font the user brought (file in `brand/<slug>/fonts/`, licence ticked) or a free default (`file` null: the app's own copy of Vazirmatn / Inter). */
export const BrandFont = z.strictObject({
  family: z.string().trim().min(1).max(60),
  /** File name inside `fonts/`; null for a free default the app supplies. */
  file: z.string().trim().min(1).max(120).nullable(),
  /** «مجوز استفاده دارم»: required for an uploaded file. */
  licence_ok: z.boolean(),
}).refine((f) => f.file === null || f.licence_ok, { message: 'a font file needs the licence tick' });
export type BrandFont = z.infer<typeof BrandFont>;

export const BrandAnswers = z.strictObject({
  version: z.literal(1),
  updated_at: isoDateTime,
  identity: z.strictObject({
    name: req,
    name_en: text.optional(),
    oneliner: req,
    face: text.optional(), channels: list.optional(), bio: text.optional(), tagline: text.optional(),
    mission: text.optional(), vision: text.optional(), story: text.optional(),
    values: z.array(pair('value', 'means')).max(8).optional(),
    story_bank: z.array(pair('moment', 'lesson', 'share')).max(20).optional(),
  }),
  position: z.strictObject({
    different: reqList,
    category: text.optional(), alternatives: list.optional(), positioning: text.optional(), pov: list.optional(),
  }),
  audience: z.strictObject({
    who: req,
    pains: reqList,
    data: text.optional(), goals: list.optional(), words: list.optional(), context: list.optional(), not_for: list.optional(),
    segments: z.array(pair('name', 'need')).max(10).optional(),
    objections: z.array(pair('doubt', 'answer')).max(20).optional(),
  }),
  offers: z.strictObject({
    offers: z.array(pair('name', 'what', 'who', 'price', 'format', 'status', 'link', 'when')).max(20).optional(),
    free: list.optional(), path: text.optional(), rules: list.optional(),
    dates: z.array(pair('what', 'when')).max(20).optional(),
  }),
  message: z.strictObject({
    core: req,
    transformation: text.optional(), plan: list.optional(), testimonials: list.optional(),
    keys: z.array(pair('msg', 'proof')).max(10).optional(),
    proofs: z.array(pair('claim', 'source')).max(30).optional(),
  }),
  voice: z.strictObject({
    is: reqList,
    address: req,
    person: text.optional(), isnt: list.optional(), register: text.optional(), phrases: list.optional(),
    tone: z.strictObject({ formal: slider, funny: slider, respect: slider, energy: slider }).optional(),
    situations: z.array(pair('when', 'how')).max(12).optional(),
    samples: z.array(pair('text', 'where')).max(10).optional(),
  }),
  language: z.strictObject({
    avoid: reqList,
    terms: text.optional(), use: list.optional(), ai_isms: list.optional(), mechanics: list.optional(),
    glossary: z.array(pair('term', 'write')).max(40).optional(),
  }),
  strategy: z.strictObject({
    content_goals: list.optional(),
    platforms: text.optional(), mix: text.optional(), cadence: text.optional(), learnings: list.optional(), sources: list.optional(),
    pillars: z.array(pair('name', 'share', 'what', 'topics')).max(10).optional(),
    formats: z.array(pair('fmt', 'role')).max(10).optional(),
    series: z.array(pair('name', 'what')).max(10).optional(),
  }),
  guardrails: z.strictObject({
    claims: reqList,
    accuracy: list.optional(), no_topics: list.optional(), sensitive: text.optional(), privacy: list.optional(), ai_policy: list.optional(), legal: text.optional(),
  }),
  examples: z.strictObject({
    inspiration: list.optional(),
    good: z.array(pair('text', 'why')).max(10).optional(),
    bad: z.array(pair('text', 'why', 'better')).max(10).optional(),
  }),
  visual: z.strictObject({
    /** File name of the logo inside the brand folder (`logo.png`, `logo.jpg`, …). */
    logo: req,
    colors: z.array(BrandColor).min(2).max(14),
    persian_font: BrandFont,
    latin_font: BrandFont,
    outro_tagline: text.optional(),
    look: text.optional(), video: text.optional(), logo_rules: text.optional(),
  }),
});
export type BrandAnswers = z.infer<typeof BrandAnswers>;

/** The 12 required answers (dot paths), in the order the wizard asks them. */
export const REQUIRED_PATHS = [
  'identity.name', 'identity.oneliner', 'audience.who', 'audience.pains', 'position.different', 'message.core',
  'voice.is', 'voice.address', 'language.avoid', 'guardrails.claims', 'visual.logo', 'visual.colors',
] as const;

/** `brand/<slug>/build.json`: what the last build produced, so the next save knows which sections changed and which docs the owner edited by hand. */
export const BrandBuild = z.strictObject({
  built_at: isoDateTime,
  /** SHA-256 of every section of the answers at the last build. */
  sections: z.record(z.string(), z.string()),
  /** SHA-256 of each generated doc as the app wrote it; a different hash on disk later means a hand edit. */
  docs: z.record(z.string(), z.strictObject({ sha256: z.string(), built_at: isoDateTime })),
  /** Hash of what the outro was rendered from (logo file, tagline, colours, Persian font); a different hash means it is re-rendered. */
  outro_input: z.string().optional(),
});
export type BrandBuild = z.infer<typeof BrandBuild>;

/** `brand/<slug>/versions/<time>/meta.json`. */
export const VersionMeta = z.strictObject({
  id: z.string(),
  at: isoDateTime,
  /** Sections that changed in this save (empty for a restore or a hand edit). */
  sections: z.array(z.string()),
  docs: z.array(z.string()),
  kind: z.enum(['create', 'save', 'hand_edit', 'restore']),
  restored_from: z.string().nullable(),
});
export type VersionMeta = z.infer<typeof VersionMeta>;
