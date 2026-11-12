// Responsibility: load config/app.config.json (rewriting an older file to the current contract first), validate it, and resolve every configured path to an absolute path under the project root.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppConfig, CLAUDE_STAGES, RECOMMENDED_STAGES, formatIssues, writeJson } from './contracts/index.js';

const MODEL_ALIASES: Record<string, string> = { sonnet: 'claude-sonnet-5-5', opus: 'claude-opus-5-5', haiku: 'claude-haiku-5-5' };
const OLD_EFFORTS = new Set(['low', 'medium']);

/**
 * Phase 8: the one global brand folder `paths.brand` ("brand/<slug>") becomes the registry folder `paths.brands` ("brand") and
 * `brand.default` ("<slug>"), keeping the key order of the file. Changes `next` in place.
 */
function migrateBrandPaths(next: Record<string, unknown>, changes: string[]): void {
  const paths = next.paths as Record<string, unknown> | undefined;
  if (!paths || typeof paths !== 'object' || typeof paths.brand !== 'string' || 'brands' in paths || 'brand' in next) return;
  const parts = paths.brand.replace(/\\/g, '/').replace(/\/+$/, '').split('/');
  const slug = parts.pop() ?? '';
  const ordered: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(paths)) ordered[k === 'brand' ? 'brands' : k] = k === 'brand' ? (parts.join('/') || '.') : v;
  const top: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(next)) { top[k] = k === 'paths' ? ordered : v; if (k === 'paths') top.brand = { default: slug }; }
  for (const k of Object.keys(next)) delete next[k];
  Object.assign(next, top);
  changes.push(`paths.brand ${String(paths.brand)} → paths.brands ${String(ordered.brands)} + brand.default ${slug} (Phase 8)`);
}

/**
 * Migration of a raw config object, once: model aliases become full ids, low/medium levels become high, and a missing
 * `claude.recommended` gets the D64 table (D64); the one brand folder becomes the brand registry (Phase 8). Returns the changes
 * in plain words (empty: nothing to do). Unknown values are left alone, so the schema still refuses them loudly.
 */
export function migrateConfig(raw: unknown): { raw: unknown; changes: string[] } {
  const changes: string[] = [];
  if (typeof raw !== 'object' || raw === null) return { raw, changes };
  const next = structuredClone(raw) as Record<string, unknown>;
  migrateBrandPaths(next, changes);
  const claude = next.claude as Record<string, unknown> | undefined;
  if (!claude || typeof claude !== 'object') return { raw: changes.length ? next : raw, changes };
  const stages = claude.stages as Record<string, Record<string, unknown>> | undefined;
  if (stages && typeof stages === 'object') {
    for (const s of CLAUDE_STAGES) {
      const st = stages[s];
      if (!st || typeof st !== 'object') continue;
      const alias = typeof st.model === 'string' ? MODEL_ALIASES[st.model] : undefined;
      if (alias) { changes.push(`${s}: model ${String(st.model)} → ${alias}`); st.model = alias; }
      if (typeof st.effort === 'string' && OLD_EFFORTS.has(st.effort)) { changes.push(`${s}: effort ${st.effort} → high`); st.effort = 'high'; }
    }
  }
  if (typeof claude.fallback_model === 'string' && MODEL_ALIASES[claude.fallback_model]) {
    changes.push(`fallback_model ${claude.fallback_model} → ${MODEL_ALIASES[claude.fallback_model]}`);
    claude.fallback_model = MODEL_ALIASES[claude.fallback_model];
  }
  // Phase 9: the brand-build stage and its timeout and budget family (an older file has neither).
  if (stages && typeof stages === 'object' && stages['brand-build'] === undefined) { stages['brand-build'] = structuredClone(RECOMMENDED_STAGES['brand-build']); changes.push('claude.stages.brand-build added (Phase 9)'); }
  const rec = claude.recommended as Record<string, unknown> | undefined;
  if (rec && typeof rec === 'object' && rec['brand-build'] === undefined) { rec['brand-build'] = structuredClone(RECOMMENDED_STAGES['brand-build']); changes.push('claude.recommended.brand-build added (Phase 9)'); }
  for (const [key, value] of [['timeouts_min', 40], ['max_budget_usd_per_call', 25]] as const) {
    const fam = claude[key] as Record<string, unknown> | undefined;
    if (fam && typeof fam === 'object' && fam.brand === undefined) { fam.brand = value; changes.push(`claude.${key}.brand added (Phase 9)`); }
  }
  if (claude.recommended === undefined) {
    // Keep the key order of the file readable: `recommended` right after `stages`.
    const ordered: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(claude)) { ordered[k] = v; if (k === 'stages') ordered.recommended = structuredClone(RECOMMENDED_STAGES); }
    if (!('recommended' in ordered)) ordered.recommended = structuredClone(RECOMMENDED_STAGES);
    next.claude = ordered;
    changes.push('claude.recommended added (D64)');
  }
  return { raw: changes.length ? next : raw, changes };
}

/** Some editors on Windows save JSON with a byte-order mark; JSON.parse rejects it. */
const BOM = new RegExp('^' + String.fromCharCode(0xfeff));

export const PROJECT_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

export class ConfigError extends Error {
  constructor(public readonly message_fa: string, detail: string) {
    super(`${message_fa} — ${detail}`);
    this.name = 'ConfigError';
  }
}

export interface Paths {
  root: string;
  config: string;
  /** The brand registry folder (Phase 8); one brand is `<brands>/<slug>/`, resolved per job by app/brands. */
  brands: string;
  refs: string;
  jobs: string;
  motionCache: string;
  runtime: string;
  engine: string;
  db: string;
  lexicon: string;
  avaFarsi: string;
  toneRules: string;
  quotaStatus: string;
}

export interface LoadedConfig {
  cfg: AppConfig;
  paths: Paths;
}

/** Expands %VAR% (Windows style) from the environment; unknown variables are an error, not an empty string. */
export function expandEnv(p: string, env: NodeJS.ProcessEnv = process.env): string {
  return p.replace(/%([A-Za-z_][A-Za-z0-9_]*)%/g, (_, name: string) => {
    const v = env[name] ?? env[name.toUpperCase()];
    if (v === undefined) throw new ConfigError('متغیر محیطی در تنظیمات تعریف نشده است', `%${name}%`);
    return v;
  });
}

export function loadConfig(root: string = PROJECT_ROOT, file: string = path.join(root, 'config', 'app.config.json')): LoadedConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8').replace(BOM, ''));
  } catch (e) {
    const missing = (e as NodeJS.ErrnoException).code === 'ENOENT';
    throw new ConfigError(missing ? 'فایل تنظیمات پیدا نشد (config/app.config.json)' : 'فایل تنظیمات JSON درست نیست (config/app.config.json)', (e as Error).message);
  }
  const migrated = migrateConfig(raw);
  const r = AppConfig.safeParse(migrated.raw);
  if (!r.success) throw new ConfigError('تنظیمات برنامه نامعتبر است (config/app.config.json)', formatIssues(r.error).join('; '));
  const cfg = r.data;
  // Only a file that is valid after the migration is rewritten (atomic, through the contract).
  if (migrated.changes.length) {
    writeJson(file, AppConfig, cfg);
    console.log(`config migrated: ${migrated.changes.join('; ')}`);
  }
  const abs = (rel: string) => path.join(root, rel);
  const status = expandEnv(cfg.quota.status_file);
  return {
    cfg,
    paths: {
      root,
      config: file,
      brands: abs(cfg.paths.brands),
      refs: abs(cfg.paths.refs),
      jobs: abs(cfg.paths.jobs),
      motionCache: abs(cfg.paths.motion_cache),
      runtime: abs(cfg.paths.runtime),
      engine: abs(cfg.paths.engine),
      db: abs(cfg.paths.db),
      lexicon: abs(cfg.paths.lexicon),
      avaFarsi: abs(cfg.paths.ava_farsi),
      toneRules: abs(cfg.tts.tone_rules),
      quotaStatus: path.isAbsolute(status) ? path.normalize(status) : abs(status),
    },
  };
}
