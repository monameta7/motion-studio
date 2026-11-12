// Responsibility: what every API route shares (config, database, orchestrator, job runner, staging folder) and the one mapping from app errors to HTTP answers with a Persian message.
import type { FastifyReply } from 'fastify';
import type { LoadedConfig } from '../config.js';
import { ContractError } from '../contracts/index.js';
import type { Db } from '../db/db.js';
import { LockBusyError } from '../db/repositories.js';
import { IntakeError } from '../intake/index.js';
import { ResumeRefused, type Orchestrator } from '../orchestrator/index.js';
import { ScriptEditError } from '../orchestrator/scriptEdit.js';
import { StageError } from '../orchestrator/stages.js';
import { TtsError } from '../stages/voice/avaClient.js';
import type { AuthActionResult, AuthStatus, RunOptions, RunResult } from '../ai/claudeRunner.js';
import type { RefReader } from '../library/refReader.js';
import type { Notifier } from '../notify/index.js';
import type { Tool } from '../stages/reference/index.js';
import type { JobRunner } from './runner.js';
import { SecretsError } from '../secrets/index.js';
import { BrandError } from '../brands/index.js';
import { AssetError } from '../brandcore/assets.js';
import { BrandBuildError, type BrandBuilder } from '../brandcore/build.js';
import { OutroError } from '../brandcore/outro.js';
import type { KeyChangeOutcome } from '../stages/voice/avaClient.js';
import type { SystemItem } from '../onboarding/index.js';
import type { Scheduler } from '../scheduler/index.js';

export interface ApiContext {
  config: LoadedConfig;
  db: Db;
  o: Orchestrator;
  runner: JobRunner;
  /** Starts the calendar's films (docs/08); its timer runs only in the real server. */
  scheduler: Scheduler;
  /** Runs PowerShell and schtasks for the «start with Windows» switch; tests replace it. */
  systemTool: Tool;
  /** Rewrites the Task Scheduler entry after the schedule changed (set by the autostart routes; does nothing when none is installed). */
  refreshAutostart: () => Promise<void>;
  /** The bell list and Windows toasts (docs/09). */
  notifier: Notifier;
  /** Reads new references in the background, one at a time, never while a film runs. */
  refReader: RefReader;
  /** ffmpeg/ffprobe for library uploads. */
  libraryTool: Tool;
  /** The style suggestion's Claude call (sonnet, low); tests and the stub server replace it. */
  suggestRun: (o: RunOptions) => Promise<RunResult>;
  uploadsDir: string;
  /** Re-checks the Claude subscription login (cached by the runner); tests replace it. */
  auth: () => Promise<{ ok: boolean; authMethod: string | null }>;
  /** ava-farsi health (docs/10); tests replace it. */
  voiceHealth: () => Promise<{ hasApiKey?: boolean } | null>;
  /** Runs a video/cover/sound/caption revision (default: orchestrator/revision.ts reviseJob, which calls Claude); the stub server replaces it. */
  revise: (slug: string, target: 'video' | 'cover' | 'sound' | 'caption', note: string) => Promise<unknown>;
  /** The Claude account on this machine: status (fresh when `force`), sign-in in the browser, sign-out; all through the runner (rule 3). Tests replace it. */
  claudeAccount: { status: (force: boolean) => Promise<AuthStatus>; login: (email?: string) => Promise<AuthActionResult>; logout: () => Promise<AuthActionResult> };
  /** The first-run wizard's tool check (app/onboarding); tests replace it. */
  systemCheck: () => Promise<{ ok: boolean; items: SystemItem[] }>;
  /** After a Gemini key change: restart the ava-farsi this app started, leave a user-started one alone (D65); tests replace it. */
  restartVoice: () => Promise<KeyChangeOutcome>;
  /** Opens a folder in the file manager (Windows Explorer); returns false where there is none (cloud session). */
  openFolder: (dir: string) => Promise<boolean>;
  /** The «برند من» rebuild (Phase 9): Claude only through the runner, the outro and palette by code. Tests replace its runner with a fake. */
  brandBuilder: BrandBuilder;
}

/** Persian text for any error a route or background work can meet; unknown errors keep their English message for the log. */
export function describeError(e: unknown): string {
  if (e instanceof IntakeError || e instanceof ResumeRefused || e instanceof ScriptEditError || e instanceof StageError || e instanceof TtsError || e instanceof SecretsError || e instanceof BrandError || e instanceof BrandBuildError || e instanceof AssetError || e instanceof OutroError) return e.message_fa;
  if (e instanceof LockBusyError) return `کار دیگری («${e.holder}») در حال اجراست؛ هر بار فقط یک کار.`;
  if (e instanceof ContractError) return `داده‌ی نامعتبر: ${e.message}`;
  return `خطای پیش‌بینی‌نشده: ${(e as Error)?.message ?? String(e)}`;
}

export function statusFor(e: unknown): number {
  if (e instanceof IntakeError || e instanceof ScriptEditError || e instanceof ContractError || e instanceof SecretsError || e instanceof BrandError || e instanceof AssetError) return 400;
  if (e instanceof BrandBuildError || e instanceof OutroError) return 409;
  if (e instanceof ResumeRefused || e instanceof LockBusyError || e instanceof StageError) return 409;
  if (e instanceof TtsError) return 502;
  return 500;
}

export function sendError(reply: FastifyReply, e: unknown) {
  return reply.code(statusFor(e)).send({ error_fa: describeError(e) });
}

export const fail = (reply: FastifyReply, code: number, error_fa: string) => reply.code(code).send({ error_fa });
