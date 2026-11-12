// Responsibility: the Settings screen's data: show the owner-tunable values and write the allowed ones (voice, tone, quota thresholds, each Claude stage's model and thinking level) back to config/app.config.json through its contract.
import { z } from 'zod';
import { AppConfig, CLAUDE_EFFORTS, CLAUDE_MODELS, TONES, VOICES, claudeStage, readJson, stageSetting, writeJson } from '../contracts/index.js';
import type { LoadedConfig } from '../config.js';

/** The fields the UI may change; everything else in the config is edited by hand. */
export const SettingsUpdate = z.strictObject({
  voice: z.enum(VOICES).optional(),
  tone: z.union([z.literal('auto'), z.enum(TONES)]).optional(),
  max_5h_pct_to_start: z.number().min(0).max(100).optional(),
  max_7d_pct_to_start: z.number().min(0).max(100).optional(),
  app_tokens_5h_budget: z.number().int().positive().nullable().optional(),
  /** Model and thinking level per stage (D64); only the stages given change. Unknown stages, models or levels are refused. */
  claude_stages: z.partialRecord(claudeStage, stageSetting).optional(),
});
export type SettingsUpdate = z.infer<typeof SettingsUpdate>;

export function settingsView(c: LoadedConfig) {
  const { cfg, paths } = c;
  return {
    voice: cfg.tts.voice, voices: VOICES, tone: cfg.tts.tone, tones: TONES,
    quota: { max_5h_pct_to_start: cfg.quota.max_5h_pct_to_start, max_7d_pct_to_start: cfg.quota.max_7d_pct_to_start, app_tokens_5h_budget: cfg.quota.app_tokens_5h_budget },
    claude_stages: cfg.claude.stages, claude_recommended: cfg.claude.recommended, claude_models: CLAUDE_MODELS, claude_efforts: CLAUDE_EFFORTS,
    paths: { root: paths.root, jobs: paths.jobs, refs: paths.refs, brands: paths.brands, ava_farsi: paths.avaFarsi, db: paths.db },
    intake: cfg.intake,
  };
}

/** Applies an update to the config file (validated on read and write) and returns the new file content. */
export function updateSettings(file: string, update: SettingsUpdate): AppConfig {
  const cur = readJson(file, AppConfig);
  const next: AppConfig = {
    ...cur,
    tts: { ...cur.tts, ...(update.voice ? { voice: update.voice } : {}), ...(update.tone ? { tone: update.tone } : {}) },
    quota: {
      ...cur.quota,
      ...(update.max_5h_pct_to_start !== undefined ? { max_5h_pct_to_start: update.max_5h_pct_to_start } : {}),
      ...(update.max_7d_pct_to_start !== undefined ? { max_7d_pct_to_start: update.max_7d_pct_to_start } : {}),
      ...(update.app_tokens_5h_budget !== undefined ? { app_tokens_5h_budget: update.app_tokens_5h_budget } : {}),
    },
    claude: { ...cur.claude, stages: { ...cur.claude.stages, ...update.claude_stages } },
  };
  return writeJson(file, AppConfig, next);
}

/** What the screen says after a model or level change: a call already running finishes on the old choice. */
export const APPLIES_FROM_NEXT_FA = 'از کار بعدی';
