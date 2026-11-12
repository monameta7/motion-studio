// Responsibility: decide the next stage for a job, run it, record state before and after each stage, and resume after a stop (docs/03).
import fs from 'node:fs';
import path from 'node:path';
import type { LoadedConfig } from '../config.js';
import type { Db } from '../db/db.js';
import { jobsRepo, lockRepo, stageRunsRepo } from '../db/repositories.js';
import { HoldRequest, readJson, writeJson, type JobState, type StageName, type StageState } from '../contracts/index.js';
import { pidAlive } from '../proc.js';
import { jobDir, listJobSlugs, readRequest, readState, writeState } from './jobFolder.js';
import { ScriptEditError, applyScriptEdits, type EditOutcome } from './scriptEdit.js';
import { StageError, type Registry } from './stages.js';
import { STAGE_ORDER, assertTransition, canTransition, nextStage } from './state.js';

export interface Orchestrator {
  config: LoadedConfig;
  db: Db;
  registry: Registry;
  now?: () => Date;
  onStage?: (slug: string, stage: StageName, event: 'start' | 'done' | 'stop', state: JobState) => void;
  /** Tests shorten these (hold flag polling, wait for a stage that ignores the abort). */
  holdPollMs?: number;
  holdSettleMs?: number;
}

const approvedFile = (dir: string) => path.join(dir, 'plan', 'approved.json');
export const holdFile = (dir: string) => path.join(dir, 'control', 'hold.json');

/** How long a held stage that ignores the abort signal is waited for before the job is marked held anyway. */
const HOLD_SETTLE_MS = 30000;
class HoldStop extends Error {}

/** The script exists only after content, so a hold applies to the stages after it (D45). */
const holdable = (stage: StageName) => STAGE_ORDER.indexOf(stage) > STAGE_ORDER.indexOf('content');

function holdInfo(dir: string, stage: StageName, nowIso: string): NonNullable<JobState['hold']> {
  let at = nowIso;
  try { at = readJson(holdFile(dir), HoldRequest).requested_at; } catch { /* a hand-written flag without a time still holds */ }
  return { requested_at: at, stage, reason: 'script_review' };
}
/** The marker of a pause by the owner (D53): status `interrupted` with this message; «ادامه» runs the stage again. */
export const PAUSED_DETAIL = 'paused by the owner';
const pausedError = (stage: StageName) => ({ stage, message_fa: 'با «توقف» مکث شد؛ برای ادامه «ادامه» را بزن.', detail: PAUSED_DETAIL });
const iso = (o: Orchestrator) => (o.now ? o.now() : new Date()).toISOString();

function save(o: Orchestrator, dir: string, slug: string, state: JobState): JobState {
  const saved = writeState(dir, state, iso(o));
  if (jobsRepo.bySlug(o.db, slug)) jobsRepo.setStatus(o.db, slug, saved.status, saved.stage);
  return saved;
}

/** One line per stage run in logs/stage-runs.jsonl and SQLite, so minutes stay right when a stage runs more than once (docs/03 Metrics). */
function recordRun(o: Orchestrator, dir: string, slug: string, stage: StageName, attempt: number, status: string, started: string, ended: string): void {
  const run = { job_slug: slug, stage, attempt, status, started_at: started, ended_at: ended, minutes: Math.max(0, (Date.parse(ended) - Date.parse(started)) / 60000) };
  fs.mkdirSync(path.join(dir, 'logs'), { recursive: true });
  fs.appendFileSync(path.join(dir, 'logs', 'stage-runs.jsonl'), `${JSON.stringify(run)}\n`, 'utf8');
  stageRunsRepo.insert(o.db, run);
}

function setStatus(state: JobState, to: JobState['status']): JobState {
  assertTransition(state.status, to);
  return { ...state, status: to };
}

/** Moves to `to`, passing through `running` when the machine has no direct edge (for example queued → done). */
function goTo(state: JobState, to: JobState['status']): JobState {
  if (state.status === to) return state;
  return setStatus(canTransition(state.status, to) ? state : setStatus(state, 'running'), to);
}

/**
 * Runs the job from its next unfinished stage until it is done, needs the owner, or stops. Finished stages are never
 * re-run (idempotent), and state.json is written before and after every stage, so a crash loses at most the running stage.
 */
export async function runJob(o: Orchestrator, slug: string, pause?: AbortSignal): Promise<JobState> {
  const dir = jobDir(o.config.paths.jobs, slug);
  const req = readRequest(dir);
  let state = readState(dir);
  if (state.status === 'done' || state.status === 'cancelled') return state;
  if (state.status === 'awaiting_approval' && !fs.existsSync(approvedFile(dir))) return state;

  lockRepo.acquire(o.db, slug);
  try {
    for (;;) {
      const stage = nextStage(state);
      if (!stage) return save(o, dir, slug, { ...goTo(state, 'done'), stage: null, error: null });
      // Approval gate (docs/03 S5b): in review mode the build waits until the owner approves the plan.
      if (stage === 'build' && req.automation_level === 'review' && !fs.existsSync(approvedFile(dir))) {
        state = save(o, dir, slug, { ...goTo(state, 'awaiting_approval'), stage: 'build' });
        o.onStage?.(slug, stage, 'stop', state);
        return state;
      }

      // The owner's «توقف» (UI, D53): a pause; the job waits before this stage until the owner presses «ادامه».
      if (pause?.aborted) {
        state = save(o, dir, slug, { ...goTo(state, 'interrupted'), stage, error: pausedError(stage), hold: null });
        o.onStage?.(slug, stage, 'stop', state);
        return state;
      }

      // The owner's hold (D45), checked before every stage after content.
      if (holdable(stage) && fs.existsSync(holdFile(dir))) {
        state = save(o, dir, slug, { ...goTo(state, 'held'), stage, hold: holdInfo(dir, stage, iso(o)) });
        o.onStage?.(slug, stage, 'stop', state);
        return state;
      }

      const prev = state.stages[stage];
      const attempt = prev && (prev.status === 'failed' || prev.status === 'running') ? state.stage === stage ? state.attempt + 1 : 2 : 1;
      const started: StageState = { status: 'running', started_at: iso(o), ended_at: null, outputs: [], tokens: { in: 0, out: 0 }, cost_usd_est: 0 };
      state = save(o, dir, slug, {
        ...(state.status === 'running' ? state : setStatus(state, 'running')),
        stage, attempt, started_at: state.started_at ?? iso(o), resume_at: null, error: null,
        stages: { ...state.stages, [stage]: started },
      });
      o.onStage?.(slug, stage, 'start', state);

      // While a stage after content runs, a hold request stops it at once (the runner kills the CLI tree).
      const abort = new AbortController();
      const poll = holdable(stage) ? setInterval(() => { if (fs.existsSync(holdFile(dir))) abort.abort(); }, o.holdPollMs ?? 1000) : undefined;
      const onPause = () => abort.abort();
      pause?.addEventListener('abort', onPause, { once: true });
      try {
        const running = o.registry[stage].run({ config: o.config, db: o.db, req, dir, state, attempt, signal: abort.signal });
        // A stage that does not watch the signal is not waited for after a hold (at most HOLD_SETTLE_MS).
        const out = await Promise.race([running, new Promise<never>((_, reject) => {
          abort.signal.addEventListener('abort', () => { setTimeout(() => reject(new HoldStop()), o.holdSettleMs ?? HOLD_SETTLE_MS); }, { once: true });
        })]);
        if (abort.signal.aborted) throw new HoldStop();
        const done: StageState = { ...started, status: 'done', ended_at: iso(o), outputs: out.outputs, tokens: out.tokens ?? { in: 0, out: 0 }, cost_usd_est: out.cost_usd_est ?? 0 };
        state = save(o, dir, slug, { ...state, stages: { ...state.stages, [stage]: done } });
        recordRun(o, dir, slug, stage, attempt, 'done', started.started_at!, done.ended_at!);
        o.onStage?.(slug, stage, 'done', state);
      } catch (e) {
        if (abort.signal.aborted && pause?.aborted) {
          // Paused by the owner (UI «توقف», D53): the running stage is killed through the same path as a hold and runs again on «ادامه».
          const { [stage]: _stopped, ...rest } = state.stages;
          state = save(o, dir, slug, { ...setStatus(state, 'interrupted'), stage, error: pausedError(stage), stages: rest, hold: null });
          recordRun(o, dir, slug, stage, attempt, 'paused', started.started_at!, iso(o));
          o.onStage?.(slug, stage, 'stop', state);
          return state;
        }
        if (abort.signal.aborted) {
          // Held: the stopped stage goes back to pending and runs again on continue (docs/03 Hold and script edit).
          const { [stage]: _stopped, ...rest } = state.stages;
          state = save(o, dir, slug, { ...setStatus(state, 'held'), stage, error: null, stages: rest, hold: holdInfo(dir, stage, iso(o)) });
          recordRun(o, dir, slug, stage, attempt, 'held', started.started_at!, iso(o));
          o.onStage?.(slug, stage, 'stop', state);
          return state;
        }
        const se = e instanceof StageError ? e : new StageError('failed', `خطا در مرحله‌ی ${stage}`, (e as Error).stack ?? String(e));
        const failed: StageState = { ...started, status: 'failed', ended_at: iso(o) };
        state = save(o, dir, slug, {
          ...setStatus(state, se.kind),
          resume_at: se.resumeAt,
          error: { stage, message_fa: se.message_fa, detail: se.detail.slice(0, 4000) },
          stages: { ...state.stages, [stage]: failed },
        });
        recordRun(o, dir, slug, stage, attempt, se.kind, started.started_at!, failed.ended_at!);
        o.onStage?.(slug, stage, 'stop', state);
        return state;
      } finally {
        if (poll) clearInterval(poll);
        pause?.removeEventListener('abort', onPause);
      }
    }
  } finally {
    lockRepo.release(o.db);
  }
}

/** On start: jobs left `running` by a process that is gone become `interrupted`; their running stage will run again. */
export function recoverInterrupted(o: Orchestrator, isAlive: (pid: number) => boolean = pidAlive): string[] {
  const holder = lockRepo.holder(o.db);
  const recovered: string[] = [];
  for (const slug of listJobSlugs(o.config.paths.jobs)) {
    const dir = jobDir(o.config.paths.jobs, slug);
    let state: JobState;
    try { state = readState(dir); } catch { continue; }
    if (state.status !== 'running') continue;
    if (holder && holder.job_slug === slug && holder.pid !== process.pid && isAlive(holder.pid)) continue;
    const stage = state.stage;
    const stages = { ...state.stages };
    if (stage && stages[stage]?.status === 'running') stages[stage] = { ...stages[stage]!, status: 'failed', ended_at: iso(o) };
    save(o, dir, slug, { ...setStatus(state, 'interrupted'), stages, error: stage ? { stage, message_fa: 'کار نیمه‌کاره ماند (برنامه بسته شد)', detail: 'recovered on start' } : null });
    recovered.push(slug);
  }
  return recovered;
}

export class ResumeRefused extends Error {
  constructor(public readonly message_fa: string) { super(message_fa); this.name = 'ResumeRefused'; }
}

/** Continues a stopped job from its last finished stage. A quota pause waits for its resume time unless forced. */
export async function resumeJob(o: Orchestrator, slug: string, force = false, pause?: AbortSignal): Promise<JobState> {
  const state = readState(jobDir(o.config.paths.jobs, slug));
  if (state.status === 'done') throw new ResumeRefused('این کار قبلاً تمام شده است.');
  if (state.status === 'cancelled') throw new ResumeRefused('این کار لغو شده است.');
  if (state.status === 'running') throw new ResumeRefused('این کار همین الان در حال اجراست.');
  if (state.status === 'paused_quota' && state.resume_at && Date.parse(state.resume_at) > (o.now ? o.now() : new Date()).getTime() && !force) {
    throw new ResumeRefused(`سهمیه هنوز آزاد نشده؛ ادامه از ${state.resume_at}`);
  }
  if (state.status === 'held') continueHeld(o, slug);
  return runJob(o, slug, pause);
}

/**
 * The owner's «توقف و اصلاح سناریو» (D45): writes control/hold.json. A running job (another process) sees it and stops its stage;
 * a job that is not running is marked held at once, at the stage it would run next.
 */
export function requestHold(o: Orchestrator, slug: string, by: 'ui' | 'cli', isAlive: (pid: number) => boolean = pidAlive): JobState {
  const dir = jobDir(o.config.paths.jobs, slug);
  const state = readState(dir);
  if (state.status === 'done' || state.status === 'cancelled') throw new ResumeRefused('این کار تمام یا لغو شده؛ برای تغییر متن از بازبینی استفاده کن.');
  if (state.stages.content?.status !== 'done') throw new ResumeRefused('سناریو هنوز نوشته نشده؛ بعد از مرحله‌ی محتوا دوباره امتحان کن.');
  fs.mkdirSync(path.dirname(holdFile(dir)), { recursive: true });
  writeJson(holdFile(dir), HoldRequest, { requested_at: iso(o), by });
  const holder = lockRepo.holder(o.db);
  // Running in another process (CLI) or in this one (the UI server): the running stage sees the flag and stops itself.
  const runningNow = state.status === 'running' && holder?.job_slug === slug && (holder.pid === process.pid || isAlive(holder.pid));
  if (runningNow || state.status === 'held') return state;
  const stage = nextStage(state) ?? 'package';
  const stages = { ...state.stages };
  if (stages[stage]?.status === 'running') delete stages[stage];
  return save(o, dir, slug, { ...goTo(state, 'held'), stage, stages, error: null, hold: holdInfo(dir, stage, iso(o)) });
}

/** Stage results a script edit makes stale, with the files that would otherwise let the stage skip itself. */
export function resetFrom(dir: string, stages: JobState['stages'], first: 'voice' | 'plan'): JobState['stages'] {
  const order: StageName[] = first === 'voice' ? ['voice', 'plan', 'build', 'package'] : ['plan', 'build', 'package'];
  const out = { ...stages };
  for (const s of order) delete out[s];
  // plan and build keep a finished, valid result on re-run; after an edit it must be made again (and approved again).
  for (const f of ['plan/scene-plan.json', 'plan/approved.json', 'out/final.mp4', 'logs/build-verify.json']) fs.rmSync(path.join(dir, f), { force: true });
  return out;
}

/**
 * Continue after a hold: apply the owner's script edit, then restart where docs/03 says — no change: the stopped stage;
 * on-screen texts only: plan; any voice line: voice (one new TTS request, D32). Owner edits are final (no truth re-run).
 */
export function continueHeld(o: Orchestrator, slug: string): EditOutcome {
  const dir = jobDir(o.config.paths.jobs, slug);
  const state = readState(dir);
  if (state.status !== 'held') throw new ResumeRefused('این کار نگه داشته نشده است.');
  let outcome: EditOutcome;
  try { outcome = applyScriptEdits(dir, iso(o)); } catch (e) {
    if (e instanceof ScriptEditError) throw new ResumeRefused(e.message_fa);
    throw e;
  }
  const stages = outcome.voiceChanged ? resetFrom(dir, state.stages, 'voice') : outcome.screenChanged ? resetFrom(dir, state.stages, 'plan') : state.stages;
  fs.rmSync(holdFile(dir), { force: true });
  save(o, dir, slug, { ...setStatus(state, 'running'), stages, hold: null, error: null });
  return outcome;
}

/** The owner's «توقف» for a job waiting in the UI queue (not started yet): it is marked paused before its next stage (D53). */
export function pauseWaiting(o: Orchestrator, slug: string): JobState {
  const dir = jobDir(o.config.paths.jobs, slug);
  const state = readState(dir);
  const stage = nextStage(state) ?? 'package';
  return save(o, dir, slug, { ...goTo(state, 'interrupted'), stage, error: pausedError(stage), hold: null });
}

export async function approvePlan(o: Orchestrator, slug: string, note: string | null = null, pause?: AbortSignal): Promise<JobState> {
  const dir = jobDir(o.config.paths.jobs, slug);
  const state = readState(dir);
  if (state.status !== 'awaiting_approval') throw new ResumeRefused('این کار منتظر تأیید نقشه نیست.');
  fs.mkdirSync(path.join(dir, 'plan'), { recursive: true });
  fs.writeFileSync(approvedFile(dir), JSON.stringify({ approved_at: iso(o), note }, null, 2) + '\n', 'utf8');
  return runJob(o, slug, pause);
}

/** The owner rejected the plan at the gate: keep the note, throw the plan stage's result away and run it again (docs/03 S5b). Reaches the gate again afterwards. */
export async function rejectPlan(o: Orchestrator, slug: string, note: string, pause?: AbortSignal): Promise<JobState> {
  const dir = jobDir(o.config.paths.jobs, slug);
  const state = readState(dir);
  if (state.status !== 'awaiting_approval') throw new ResumeRefused('این کار منتظر تأیید نقشه نیست.');
  if (!note.trim()) throw new ResumeRefused('برای رد کردن نقشه یک توضیح بنویس.');
  fs.mkdirSync(path.join(dir, 'plan'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'plan', 'reject-note.json'), `${JSON.stringify({ note: note.trim(), at: iso(o) }, null, 2)}\n`, 'utf8');
  fs.rmSync(approvedFile(dir), { force: true });
  const { plan: _dropped, ...stages } = state.stages;
  save(o, dir, slug, { ...setStatus(state, 'running'), stage: 'plan', stages });
  return runJob(o, slug, pause);
}
