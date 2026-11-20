// Responsibility: the stage registry, which code runs for each pipeline stage (Phase 1: preflight is real, the other stages are stubs).
import fs from 'node:fs';
import path from 'node:path';
import type { LoadedConfig } from '../config.js';
import type { Db } from '../db/db.js';
import type { AnyStageName, JobRequest, JobState } from '../contracts/index.js';
import { runPreflight, type PreflightDeps } from '../preflight/index.js';

export type StageFailure = 'blocked' | 'failed' | 'paused_quota';

export class StageError extends Error {
  constructor(public readonly kind: StageFailure, public readonly message_fa: string, public readonly detail = '', public readonly resumeAt: string | null = null) {
    super(`${kind}: ${message_fa}${detail ? ` (${detail})` : ''}`);
    this.name = 'StageError';
  }
}

export interface StageContext {
  config: LoadedConfig;
  db: Db;
  req: JobRequest;
  dir: string;
  state: JobState;
  attempt: number;
  /** Aborted when the owner holds the job (D45); Claude stages pass it to the runner, which kills the CLI. */
  signal?: AbortSignal;
}

export interface StageOutput {
  outputs: string[];
  tokens?: { in: number; out: number };
  cost_usd_est?: number;
}

export interface Stage {
  name: AnyStageName;
  run(ctx: StageContext): Promise<StageOutput>;
}

/** One stage per name of both workspaces (D88); each job runs only the names of its own order. */
export type Registry = Record<AnyStageName, Stage>;

/** Placeholder for a stage built in a later phase: records each start and end in logs/stub-runs.jsonl so resume can be tested. */
export function stubStage(name: AnyStageName, delayMs: () => number = () => Number(process.env.MMS_STUB_DELAY_MS ?? 0)): Stage {
  return {
    name,
    async run(ctx) {
      const runs = path.join(ctx.dir, 'logs', 'stub-runs.jsonl');
      fs.appendFileSync(runs, JSON.stringify({ stage: name, event: 'start', attempt: ctx.attempt, pid: process.pid, at: new Date().toISOString() }) + '\n');
      const ms = delayMs();
      if (ms > 0) await new Promise((r) => setTimeout(r, ms));
      const out = path.join('logs', `stub-${name}.json`);
      fs.writeFileSync(path.join(ctx.dir, out), JSON.stringify({ stage: name, stub: true, at: new Date().toISOString() }) + '\n');
      fs.appendFileSync(runs, JSON.stringify({ stage: name, event: 'end', attempt: ctx.attempt, pid: process.pid, at: new Date().toISOString() }) + '\n');
      return { outputs: [out] };
    },
  };
}

/** Persian names of the video stages not built yet, for the message of `notBuiltStage`. */
const NOT_BUILT_FA: Partial<Record<AnyStageName, string>> = { prompts: 'پرامپت کلیپ‌ها', clips: 'ساخت کلیپ‌ها', assemble: 'سرهم کردن ویدیو' };

/** A stage that is not built yet: stops the job as `blocked` with a clear message, so a run ends after the last built stage instead of pretending to finish. `phase` is shown as written (Persian digits). */
export function notBuiltStage(name: AnyStageName, phase: string): Stage {
  const label = NOT_BUILT_FA[name];
  return {
    name,
    async run() {
      throw new StageError('blocked', `${label ? `مرحله‌ی «${label}»` : 'این مرحله'} هنوز ساخته نشده (فاز ${phase}). کار تا مرحله‌ی قبلی کامل انجام شده و ذخیره است.`, `stage ${name} is built in phase ${phase}`);
    },
  };
}

export function preflightStage(deps: (ctx: StageContext) => PreflightDeps): Stage {
  return {
    name: 'preflight',
    async run(ctx) {
      const r = await runPreflight(ctx.req, deps(ctx));
      const out = path.join('logs', 'preflight.json');
      fs.writeFileSync(path.join(ctx.dir, out), JSON.stringify(r, null, 2) + '\n', 'utf8');
      if (!r.ok) throw new StageError('blocked', r.reasons_fa.join(' '), r.results.filter((x) => !x.ok).map((x) => `${x.id}: ${x.detail ?? ''}`).join('; '));
      return { outputs: [out] };
    },
  };
}

export function buildRegistry(preflight: Stage, overrides: Partial<Registry> = {}): Registry {
  return {
    preflight,
    content: stubStage('content'),
    voice: stubStage('voice'),
    reference: stubStage('reference'),
    plan: stubStage('plan'),
    build: stubStage('build'),
    package: stubStage('package'),
    // Video workspace (D88): built in 11.4, 11.6 and 11.7; until then a video job stops here, after content and voice.
    prompts: notBuiltStage('prompts', '۱۱.۴'),
    clips: notBuiltStage('clips', '۱۱.۶'),
    assemble: notBuiltStage('assemble', '۱۱.۷'),
    ...overrides,
  };
}
