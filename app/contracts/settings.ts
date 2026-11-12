// Responsibility: contracts for the files the owner tunes by hand (app.config.json, lexicon.json, tone-rules.json).
import { z } from 'zod';
import { TONES, format, tone, voice } from './common.js';

export const CLAUDE_STAGES = ['content-hook', 'content-hook-revise', 'content-truth', 'reference', 'suggest', 'plan', 'build', 'revise', 'brand-build'] as const;
export const claudeStage = z.enum(CLAUDE_STAGES);
export type ClaudeStage = z.infer<typeof claudeStage>;

/** Timeout and budget families: one per long-running kind of call (docs/05). */
export const CLAUDE_FAMILIES = ['content', 'reference', 'plan', 'build', 'suggest', 'revise', 'brand'] as const;
const family = <T extends z.ZodType>(v: T) => z.strictObject(Object.fromEntries(CLAUDE_FAMILIES.map((f) => [f, v])) as Record<(typeof CLAUDE_FAMILIES)[number], T>);

/** The only models and thinking levels a stage may use (D64); no aliases, no low/medium. */
export const CLAUDE_MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'] as const;
export const CLAUDE_EFFORTS = ['high', 'xhigh', 'max'] as const;
export const claudeModel = z.enum(CLAUDE_MODELS);
export const claudeEffort = z.enum(CLAUDE_EFFORTS);
export type ClaudeModel = z.infer<typeof claudeModel>;
export type ClaudeEffort = z.infer<typeof claudeEffort>;

export const stageSetting = z.strictObject({ model: claudeModel, effort: claudeEffort });
export type StageSetting = z.infer<typeof stageSetting>;
/** Model and thinking level for every Claude stage. */
export const ClaudeStages = z.strictObject(Object.fromEntries(CLAUDE_STAGES.map((s) => [s, stageSetting])) as Record<ClaudeStage, typeof stageSetting>);
export type ClaudeStages = z.infer<typeof ClaudeStages>;

/** The D64 recommendation (all at high): Opus for the stages that write or judge the film, Sonnet for the small follow-up calls. */
export const RECOMMENDED_STAGES: ClaudeStages = {
  'content-hook': { model: 'claude-opus-5-5', effort: 'high' },
  'content-hook-revise': { model: 'claude-sonnet-5-5', effort: 'high' },
  'content-truth': { model: 'claude-opus-5-5', effort: 'high' },
  reference: { model: 'claude-opus-5-5', effort: 'high' },
  suggest: { model: 'claude-sonnet-5-5', effort: 'high' },
  plan: { model: 'claude-opus-5-5', effort: 'high' },
  build: { model: 'claude-opus-5-5', effort: 'high' },
  revise: { model: 'claude-sonnet-5-5', effort: 'high' },
  'brand-build': { model: 'claude-opus-5-5', effort: 'high' },
};

const relPath = z.string().min(1).refine((p) => !/^[A-Za-z]:|^[\\/]/.test(p), 'path must be relative to the project root');

export const AppConfig = z.strictObject({
  server: z.strictObject({ host: z.literal('127.0.0.1'), port: z.number().int().min(1024).max(65535) }),
  paths: z.strictObject({
    // Phase 8: the brand registry folder (one `<slug>/` folder per brand); a job's own brand folder comes from its request.json.
    brands: relPath, refs: relPath, jobs: relPath, motion_cache: relPath, runtime: relPath, engine: relPath,
    db: relPath, lexicon: relPath, ava_farsi: relPath,
  }),
  /** `default`: the brand used while the owner has picked none (settings `active_brand`); its folder also holds the app UI's own fonts. */
  brand: z.strictObject({ default: z.string().regex(/^[a-z0-9][a-z0-9._-]*$/) }),
  claude: z.strictObject({
    bin: z.string().min(1).nullable(),
    plan: z.enum(['pro', 'max']),
    stages: ClaudeStages,
    /** What the Settings screen marks «پیشنهاد ما» and «برگرداندن همه به پیشنهاد» restores (D64). */
    recommended: ClaudeStages,
    fallback_model: claudeModel.nullable(),
    timeouts_min: family(z.number().positive()),
    kill_grace_s: z.number().nonnegative(),
    auth_cache_min: z.number().nonnegative(),
    // Kill a run that sends nothing for this long (0 = off); measured max normal gap in real logs: 8.8 min (2026-10-28).
    idle_timeout_min: z.number().nonnegative(),
    max_budget_usd_per_call: family(z.number().positive()),
  }),
  content: z.strictObject({ pass_score: z.number().min(0).max(100), max_rounds: z.number().int().min(1), use_story_series: z.boolean(), hook_writes_voice_default: z.boolean() }),
  intake: z.strictObject({ max_brief_chars: z.number().int().positive(), max_images: z.number().int().min(0), max_image_mb: z.number().positive() }),
  tts: z.strictObject({
    base_url: z.url(), voice, tone: z.union([z.literal('auto'), tone]), tone_rules: relPath, tone_fallback: tone,
    gap_s: z.number().nonnegative(), max_retries: z.number().int().min(0), autostart: z.boolean(),
  }),
  align: z.strictObject({ model: z.string().min(1), language: z.string().min(2), device: z.enum(['cpu', 'cuda']), compute_type: z.string().min(1) }),
  render: z.strictObject({ format_default: format, fps: z.number().int().positive(), workers: z.number().int().min(1), outro_audio: z.boolean(), storyboard_stills_gate: z.boolean() }),
  safe_zone: z.strictObject({ top: z.number(), bottom: z.number(), sides: z.number(), right_rail: z.number(), right_rail_from: z.number() }),
  quota: z.strictObject({
    max_5h_pct_to_start: z.number().min(0).max(100),
    max_7d_pct_to_start: z.number().min(0).max(100),
    app_tokens_5h_budget: z.number().int().positive().nullable(),
    status_file: z.string().min(1),
    status_max_age_min: z.number().positive(),
  }),
  disk: z.strictObject({ min_free_gb: z.number().nonnegative(), delete_temp_frames: z.boolean() }),
  notifications: z.strictObject({ sound: z.boolean() }),
  ui: z.strictObject({ language: z.literal('fa'), calendar: z.enum(['jalali', 'gregorian']), week_start: z.enum(['sat', 'sun', 'mon']) }),
});
export type AppConfig = z.infer<typeof AppConfig>;

export const Lexicon = z.strictObject({
  _note: z.string().optional(),
  direction: z.literal('fa_to_latin'),
  entries: z.array(z.strictObject({ match: z.string().min(1), say: z.string().regex(/^[\x20-\x7E]+$/, 'say must be Latin script (D25)') })),
  keep_persian: z.array(z.string().min(1)),
});
export type Lexicon = z.infer<typeof Lexicon>;

const perTone = <T extends z.ZodType>(v: T) => z.partialRecord(tone, v);
const signal = z.strictObject({ thresholds: z.tuple([z.number(), z.number()]), points: perTone(z.tuple([z.number(), z.number()])) });

export const ToneRules = z.strictObject({
  _note: z.string().optional(),
  tones: z.array(tone).length(TONES.length),
  tie_order: z.array(tone).length(TONES.length),
  base: z.strictObject(Object.fromEntries(TONES.map((t) => [t, z.number()])) as Record<(typeof TONES)[number], z.ZodNumber>),
  // Phase 8: one entry per brand slug (`_why` notes allowed at both levels); tone-select applies only the film's brand's entry.
  brand_bias: z.looseObject({ _why: z.string().optional() }).pipe(z.record(z.string(), z.union([
    z.string(),
    z.looseObject({ _why: z.string().optional() }).pipe(z.record(z.string(), z.union([z.string(), z.number()]))),
  ]))),
  framework: z.strictObject({
    ...Object.fromEntries(TONES.map((t) => [t, z.array(z.string().min(1)).optional()])) as Record<(typeof TONES)[number], z.ZodOptional<z.ZodArray<z.ZodString>>>,
    points: z.number(),
  }),
  signals: z.record(z.string(), signal),
  lexicon: z.record(z.string(), z.array(z.string().min(1))),
});
export type ToneRules = z.infer<typeof ToneRules>;
