// Responsibility: the only place that spawns the claude CLI; it enforces per-stage model and effort, local-only flags, subscription auth, runtime isolation, stream-json parsing, logging, usage capture, rate-limit handling and timeouts (docs/05).
import { spawn as nodeSpawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { Readable } from 'node:stream';
import type { LoadedConfig } from '../config.js';
import type { ClaudeEffort, ClaudeModel, ClaudeStage } from '../contracts/index.js';
import { killTree } from '../proc.js';
import { writePlanStatus, type PlanWindows } from '../quota/index.js';

export const FORBIDDEN_FLAGS = ['--cloud', '--remote', '--remote-control', '--teleport', '--bg', '--background', '--dangerously-skip-permissions', '--bare'] as const;

export const ALLOWED_TOOLS = [
  'Read', 'Write', 'Edit', 'Glob', 'Grep', 'WebSearch', 'WebFetch',
  'Bash(ffmpeg *)', 'Bash(ffprobe *)', 'Bash(node *)', 'Bash(npm *)', 'Bash(npx *)', 'Bash(python *)', 'Bash(py *)',
  // Local file chores a build run needs between those tools (a first live build was stopped by three denials of `cd … && python`, `ls` and `cp`).
  'Bash(cd *)', 'Bash(ls *)', 'Bash(cp *)', 'Bash(mkdir *)', 'Bash(cat *)',
  // Linux cloud session (D48): the first cloud plan run was stopped by denials of `python3`, `jq` and read-only chores inside compound commands.
  'Bash(python3 *)', 'Bash(jq *)', 'Bash(echo *)', 'Bash(grep *)', 'Bash(head *)', 'Bash(tail *)', 'Bash(wc *)', 'Bash(sort *)', 'Bash(sed *)',
] as const;

/** Environment variables that would switch the CLI from the subscription to paid API billing or another provider. */
const BILLING_ENV = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY'];

type Family = keyof LoadedConfig['cfg']['claude']['timeouts_min'];
const FAMILY: Record<ClaudeStage, Family> = {
  'content-hook': 'content', 'content-hook-revise': 'content', 'content-truth': 'content',
  reference: 'reference', suggest: 'suggest', plan: 'plan', build: 'build', revise: 'revise', 'brand-build': 'brand',
};
export const stageFamily = (s: ClaudeStage): Family => FAMILY[s];

const RATE_LIMIT_PAUSE_MS = 5 * 60 * 1000;
// Denials of one tool IN A ROW (no successful tool call between) that stop the run. Scattered denials do not count up:
// Claude works around them, and counting them in total stopped four live runs that were still progressing (D48).
const PERMISSION_DENIAL_LIMIT = 3;

export interface Usage { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number }
export interface RateLimitInfo { status: string; type: string | null; resetsAt: string | null; fiveHourUtilization: number | null; windows: PlanWindows }

export type StreamEvent =
  | { kind: 'init'; model: string; cwd: string; skills: string[] }
  | { kind: 'progress'; text: string }
  | { kind: 'tool'; name: string }
  | { kind: 'rate_limit'; info: RateLimitInfo }
  | { kind: 'retry'; error: string; delayMs: number }
  | { kind: 'permission_denied'; tool: string }
  | { kind: 'result'; isError: boolean };

export interface RunOptions {
  stage: ClaudeStage;
  jobDir?: string;
  prompt: string;
  jsonSchema?: object;
  model?: ClaudeModel;
  effort?: ClaudeEffort;
  /**
   * Phase 8: the brand folder this call may read, always stated: a job's call gives its job's brand (request.json `brand`), a call
   * outside a job the active brand; null adds none. Never a global brand folder.
   */
  brandDir: string | null;
  addDirs?: string[];
  maxBudgetUsd?: number;
  attempt?: number;
  onEvent?: (e: StreamEvent) => void;
  /** Aborting kills the CLI process tree (`taskkill /T`, then `/T /F`). */
  signal?: AbortSignal;
}

export const STOPPED_BY_OWNER = 'stopped by the owner (hold)';

export interface RunResult {
  ok: boolean;
  structured?: unknown;
  text?: string;
  usage: Usage;
  costUsdEst: number;
  rateLimited: boolean;
  resumeAt: string | null;
  rateLimit: RateLimitInfo | null;
  sessionId: string;
  model: string | null;
  error?: string;
  timedOut: boolean;
  /** The CLI sent nothing for `claude.idle_timeout_min` (a frozen or sleeping machine, a lost connection) and was killed. */
  idle: boolean;
  logFile: string;
  /** A plain Persian notice for the owner (for example: the thinking level was refused and the call was repeated at high). */
  notice_fa?: string;
}

export interface ChildLike {
  pid?: number | undefined;
  stdout: Readable | null;
  stderr: Readable | null;
  on(event: 'close', cb: (code: number | null) => void): unknown;
  on(event: 'error', cb: (err: Error) => void): unknown;
}
export type SpawnFn = (cmd: string, args: string[], opts: { cwd: string; env: NodeJS.ProcessEnv }) => ChildLike;

export interface AuthStatus {
  ok: boolean;
  authMethod: string | null;
  detail: string;
  /** From `claude auth status` (shown only to the user on this machine, never logged). */
  loggedIn?: boolean;
  email?: string | null;
  /** `subscriptionType`: pro, max, … */
  plan?: string | null;
}

export interface RunnerDeps {
  config: LoadedConfig;
  spawn?: SpawnFn;
  kill?: (pid: number, graceMs: number) => Promise<void>;
  now?: () => number;
  authCheck?: () => Promise<AuthStatus>;
  /** Overrides the stage timeout (tests). */
  timeoutMs?: number;
  /** Overrides the idle limit (tests). */
  idleMs?: number;
}

// stdin closed: with an open pipe the CLI waits 3 s for piped input before every run (seen in the Phase 1 smoke test).
const defaultSpawn: SpawnFn = (cmd, args, opts) => nodeSpawn(cmd, args, { cwd: opts.cwd, env: opts.env, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });

/** The CLI rejects a `$schema` key ("no schema with key or ref …draft/2020-12"), which zod's toJSONSchema adds; the schema itself is kept. */
export function cliJsonSchema(schema: object): object {
  const { $schema: _drop, ...rest } = schema as Record<string, unknown>;
  return rest;
}

/** Finds the real claude executable: config `claude.bin`, else `claude.exe` on PATH, else the exe the npm `claude.cmd` shim points to. Never a .cmd (that would need a shell). */
export function resolveClaudeBin(loaded: LoadedConfig, env: NodeJS.ProcessEnv = process.env, exists: (p: string) => boolean = fs.existsSync, read: (p: string) => string = (p) => fs.readFileSync(p, 'utf8')): string {
  const cfgBin = loaded.cfg.claude.bin;
  if (cfgBin) return path.isAbsolute(cfgBin) ? cfgBin : path.join(loaded.paths.root, cfgBin);
  if (process.platform !== 'win32') return 'claude';
  const dirs = (env.PATH ?? env.Path ?? '').split(';').filter(Boolean);
  for (const d of dirs) if (exists(path.join(d, 'claude.exe'))) return path.join(d, 'claude.exe');
  for (const d of dirs) {
    const shim = path.join(d, 'claude.cmd');
    if (!exists(shim)) continue;
    const m = read(shim).match(/"%dp0%\\([^"]+?claude\.exe)"/i);
    if (m?.[1] && exists(path.join(d, m[1]))) return path.join(d, m[1]);
  }
  throw new Error('claude.exe not found on PATH (set claude.bin in config/app.config.json)');
}

export function childEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env = { ...base };
  for (const k of BILLING_ENV) delete env[k];
  return env;
}

export function assertNoForbiddenFlags(args: readonly string[]): void {
  for (const a of args) {
    const bad = FORBIDDEN_FLAGS.find((f) => a === f || a.startsWith(`${f}=`));
    if (bad) throw new Error(`forbidden flag ${bad}: runs must stay local and keep permissions (CLAUDE.md rule 2)`);
  }
}

/** The runtime sees only runtime/CLAUDE.md, the project's skills and settings, and no MCP servers (docs/14 Q13, D38). */
export function isolationArgs(loaded: LoadedConfig): string[] {
  const rootClaudeMd = path.join(loaded.paths.root, 'CLAUDE.md').replace(/\\/g, '/');
  return ['--strict-mcp-config', '--setting-sources', 'project,local', '--settings', JSON.stringify({ claudeMdExcludes: [rootClaudeMd] })];
}

export function buildArgs(opts: RunOptions, loaded: LoadedConfig): string[] {
  const { cfg, paths } = loaded;
  const stageCfg = cfg.claude.stages[opts.stage];
  const fam = FAMILY[opts.stage];
  // engine/ holds capture.mjs and sound.py; a cloud build was denied plain `ls`/`cd` there because it was outside the allowed folders (D48).
  // The brand folder is the call's own (the job's brand, Phase 8), first as before.
  const addDirs = opts.addDirs ?? [...(opts.brandDir ? [opts.brandDir] : []), paths.refs, paths.motionCache, paths.engine, ...(opts.jobDir ? [opts.jobDir] : [])];
  const args = [
    '-p', opts.prompt,
    '--model', opts.model ?? stageCfg.model,
    '--effort', opts.effort ?? stageCfg.effort,
    '--output-format', 'stream-json', '--verbose',
    '--permission-mode', 'acceptEdits',
    '--permission-prompts', 'none',
    ...isolationArgs(loaded),
    '--max-budget-usd', String(opts.maxBudgetUsd ?? cfg.claude.max_budget_usd_per_call[fam]),
    ...(cfg.claude.fallback_model ? ['--fallback-model', cfg.claude.fallback_model] : []),
    ...(opts.jsonSchema ? ['--json-schema', JSON.stringify(cliJsonSchema(opts.jsonSchema))] : []),
    // Variadic options last, so they cannot swallow other arguments.
    '--allowedTools', ...ALLOWED_TOOLS,
    '--add-dir', ...addDirs,
  ];
  assertNoForbiddenFlags(args);
  return args;
}

export function modelMatches(configured: string, actual: string): boolean {
  return actual === configured || actual.startsWith(`${configured}[`) || actual.startsWith(`${configured}-`);
}

interface Collected { code: number | null; stdout: string; stderr: string; error?: string }

function collect(spawn: SpawnFn, bin: string, args: string[], cwd: string, timeoutMs = 30000, onTimeout?: (pid: number) => void): Promise<Collected> {
  return new Promise((resolve) => {
    let out = '';
    let err = '';
    let done = false;
    const finish = (r: Collected) => { if (!done) { done = true; resolve(r); } };
    let child: ChildLike;
    try { child = spawn(bin, args, { cwd, env: childEnv() }); } catch (e) { finish({ code: null, stdout: '', stderr: '', error: (e as Error).message }); return; }
    const t = setTimeout(() => { if (child.pid !== undefined) onTimeout?.(child.pid); finish({ code: null, stdout: out, stderr: err, error: 'timeout' }); }, timeoutMs);
    child.stdout?.on('data', (d: Buffer) => { out += d.toString('utf8'); });
    child.stderr?.on('data', (d: Buffer) => { err += d.toString('utf8'); });
    child.on('error', (e) => { clearTimeout(t); finish({ code: null, stdout: out, stderr: err, error: e.message }); });
    child.on('close', (code) => { clearTimeout(t); finish({ code, stdout: out, stderr: err }); });
  });
}

export interface AuthActionResult { ok: boolean; code: number | null; output: string; error?: string; status: AuthStatus }

/** How long a sign-in may wait for the user to finish in the browser. */
export const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

async function authAction(deps: RunnerDeps, args: string[], timeoutMs: number): Promise<AuthActionResult> {
  let bin: string;
  try { bin = resolveClaudeBin(deps.config); } catch (e) {
    return { ok: false, code: null, output: '', error: (e as Error).message, status: { ok: false, authMethod: null, detail: (e as Error).message } };
  }
  const kill = deps.kill ?? ((pid: number, g: number) => killTree(pid, g));
  const r = await collect(deps.spawn ?? defaultSpawn, bin, args, deps.config.paths.runtime, timeoutMs, (pid) => { void kill(pid, 2000); });
  clearAuthCache();
  const status = await checkSubscriptionAuth(deps, true);
  return { ok: r.code === 0 && !r.error, code: r.code, output: `${r.stdout}\n${r.stderr}`.trim().slice(0, 4000), ...(r.error ? { error: r.error } : {}), status };
}

/**
 * Sign-in with the Claude subscription (`--claudeai`; never `--console`, which bills the API). Started without a terminal:
 * the CLI opens the browser itself and waits for the answer (Phase 7 task 1). The status after it is checked fresh.
 */
export function claudeLogin(deps: RunnerDeps, opts: { email?: string; timeoutMs?: number } = {}): Promise<AuthActionResult> {
  const email = opts.email?.trim();
  if (email && !/^[^\s@]+@[^\s@]+$/.test(email)) throw new Error('claudeLogin: not an email address');
  return authAction(deps, ['auth', 'login', '--claudeai', ...(email ? ['--email', email] : [])], opts.timeoutMs ?? LOGIN_TIMEOUT_MS);
}

/** Sign-out of the Claude account on this machine. */
export function claudeLogout(deps: RunnerDeps): Promise<AuthActionResult> {
  return authAction(deps, ['auth', 'logout'], 30000);
}

export async function claudeVersion(deps: RunnerDeps): Promise<string | null> {
  let bin: string;
  try { bin = resolveClaudeBin(deps.config); } catch { return null; }
  const r = await collect(deps.spawn ?? defaultSpawn, bin, ['--version'], deps.config.paths.runtime);
  return r.code === 0 && r.stdout.trim() ? r.stdout.trim() : null;
}

let authCache: { at: number; status: AuthStatus } | null = null;
export function clearAuthCache(): void { authCache = null; }

/** Subscription logins: `claude.ai` on the owner's PC, `oauth_token` inside the owner's cloud session (D48). Never an API key. */
const SUBSCRIPTION_AUTH_METHODS: readonly string[] = ['claude.ai', 'oauth_token'];

/** `claude auth status` must report a subscription login (see `SUBSCRIPTION_AUTH_METHODS`); cached for `claude.auth_cache_min`. */
export async function checkSubscriptionAuth(deps: RunnerDeps, force = false): Promise<AuthStatus> {
  const now = (deps.now ?? Date.now)();
  if (!force && authCache && now - authCache.at < deps.config.cfg.claude.auth_cache_min * 60000) return authCache.status;
  let bin: string;
  try { bin = resolveClaudeBin(deps.config); } catch (e) { return { ok: false, authMethod: null, detail: (e as Error).message }; }
  const r = await collect(deps.spawn ?? defaultSpawn, bin, ['auth', 'status'], deps.config.paths.runtime);
  let status: AuthStatus;
  try {
    const j = JSON.parse(r.stdout) as { loggedIn?: boolean; authMethod?: string; email?: string; subscriptionType?: string };
    status = {
      ok: j.loggedIn === true && SUBSCRIPTION_AUTH_METHODS.includes(j.authMethod ?? ''), authMethod: j.authMethod ?? null, detail: `loggedIn=${String(j.loggedIn)} authMethod=${String(j.authMethod)}`,
      loggedIn: j.loggedIn === true, email: typeof j.email === 'string' ? j.email : null, plan: typeof j.subscriptionType === 'string' ? j.subscriptionType : null,
    };
  } catch {
    status = { ok: false, authMethod: null, detail: r.error ?? `unreadable auth status (exit ${String(r.code)})` };
  }
  // A failed check (cold start, timeout) is not cached: the next call asks again instead of showing «not logged in» for minutes.
  authCache = status.ok ? { at: now, status } : null;
  return status;
}

const zeroUsage = (): Usage => ({ input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 });

function readUsage(u: unknown): Usage {
  const o = (u ?? {}) as Record<string, unknown>;
  const n = (k: string) => (typeof o[k] === 'number' ? (o[k] as number) : 0);
  return { input_tokens: n('input_tokens'), output_tokens: n('output_tokens'), cache_read_input_tokens: n('cache_read_input_tokens'), cache_creation_input_tokens: n('cache_creation_input_tokens') };
}

function readRateLimit(info: Record<string, unknown>): RateLimitInfo {
  const resets = typeof info.resetsAt === 'number' ? new Date(info.resetsAt * 1000).toISOString() : null;
  const uw = (info.unifiedWindows ?? {}) as Record<string, Record<string, unknown> | undefined>;
  const fh = uw.five_hour ?? {};
  const sd = uw.seven_day ?? {};
  const num = (v: unknown) => (typeof v === 'number' ? v : null);
  return {
    status: String(info.status ?? 'unknown'), type: typeof info.rateLimitType === 'string' ? info.rateLimitType : null, resetsAt: resets, fiveHourUtilization: num(fh.utilization),
    windows: { fiveHour: num(fh.utilization), fiveHourResetsAt: num(fh.resetsAt), sevenDay: num(sd.utilization), sevenDayResetsAt: num(sd.resetsAt) },
  };
}

export function logFileFor(loaded: LoadedConfig, opts: RunOptions, now: number): string {
  if (opts.jobDir) return path.join(opts.jobDir, 'logs', `${opts.stage}-${opts.attempt ?? 1}.jsonl`);
  return path.join(loaded.paths.root, 'data', 'logs', 'claude', `${opts.stage}-${new Date(now).toISOString().replace(/[:.]/g, '-')}.jsonl`);
}

/**
 * One CLI run; when it was killed for silence (idle), the same call is made once more: the files it wrote stay, so a repeat
 * continues instead of starting over, and a second silence is reported as the failure. Usage of both runs is added up.
 */
export async function runClaude(opts: RunOptions, deps: RunnerDeps): Promise<RunResult> {
  const effort = opts.effort ?? deps.config.cfg.claude.stages[opts.stage].effort;
  const first = await runWithIdleRetry(opts, deps);
  if (effort === 'high' || !effortRefused(first) || opts.signal?.aborted) return first;
  // D64: a level the CLI refuses for this model is not tested in advance; the call is made once more at high, with a plain notice.
  const model = opts.model ?? deps.config.cfg.claude.stages[opts.stage].model;
  const notice = `سطح فکر «${EFFORT_FA[effort]}» برای مدل ${MODEL_FA[model]} پذیرفته نشد؛ همین کار یک بار با سطح «بالا» انجام شد.`;
  fs.mkdirSync(path.dirname(first.logFile), { recursive: true });
  fs.appendFileSync(first.logFile, `${JSON.stringify({ type: 'runner_notice', text_fa: notice, refused: first.error?.slice(0, 300) })}\n`, 'utf8');
  console.log(notice);
  opts.onEvent?.({ kind: 'progress', text: notice });
  const second = await runWithIdleRetry({ ...opts, effort: 'high', attempt: (opts.attempt ?? 1) + 1 }, deps);
  return { ...second, notice_fa: notice };
}

/** Persian names for the UI and notices; no English label reaches the owner (D64). */
export const MODEL_FA: Record<ClaudeModel, string> = { 'claude-opus-5-5': 'Opus 5.5', 'claude-sonnet-5-5': 'Sonnet 5.5', 'claude-haiku-5-5': 'Haiku 5.5' };
export const EFFORT_FA: Record<ClaudeEffort, string> = { high: 'بالا', xhigh: 'خیلی بالا', max: 'حداکثر' };

/** The CLI stopped before any work because of the thinking level: no session started, nothing written, and the error names the level. */
export function effortRefused(r: RunResult): boolean {
  return !r.ok && !r.rateLimited && !r.timedOut && !r.idle && r.usage.output_tokens === 0 && /effort|thinking/i.test(r.error ?? '');
}

async function runWithIdleRetry(opts: RunOptions, deps: RunnerDeps): Promise<RunResult> {
  const first = await runClaudeOnce(opts, deps);
  if (!first.idle || opts.signal?.aborted) return first;
  const second = await runClaudeOnce({ ...opts, attempt: (opts.attempt ?? 1) + 1 }, deps);
  const add = (a: Usage, b: Usage): Usage => ({
    input_tokens: a.input_tokens + b.input_tokens, output_tokens: a.output_tokens + b.output_tokens,
    cache_read_input_tokens: a.cache_read_input_tokens + b.cache_read_input_tokens, cache_creation_input_tokens: a.cache_creation_input_tokens + b.cache_creation_input_tokens,
  });
  return { ...second, usage: add(first.usage, second.usage), costUsdEst: first.costUsdEst + second.costUsdEst };
}

async function runClaudeOnce(opts: RunOptions, deps: RunnerDeps): Promise<RunResult> {
  const loaded = deps.config;
  const now = deps.now ?? Date.now;
  const spawn = deps.spawn ?? defaultSpawn;
  const graceMs = loaded.cfg.claude.kill_grace_s * 1000;
  const kill = deps.kill ?? ((pid: number, g: number) => killTree(pid, g));
  const configuredModel = opts.model ?? loaded.cfg.claude.stages[opts.stage].model;
  const logFile = logFileFor(loaded, opts, now());
  const base: RunResult = { ok: false, usage: zeroUsage(), costUsdEst: 0, rateLimited: false, resumeAt: null, rateLimit: null, sessionId: '', model: null, timedOut: false, idle: false, logFile };

  const auth = await (deps.authCheck ?? (() => checkSubscriptionAuth(deps)))();
  if (!auth.ok) return { ...base, error: `auth: Claude Code is not logged in with the Claude subscription (${auth.detail})` };

  const args = buildArgs(opts, loaded);
  let bin: string;
  try { bin = resolveClaudeBin(loaded); } catch (e) { return { ...base, error: (e as Error).message }; }
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  fs.appendFileSync(logFile, '', 'utf8');
  const log = (line: string) => fs.appendFileSync(logFile, line.endsWith('\n') ? line : `${line}\n`, 'utf8');

  return new Promise<RunResult>((resolve) => {
    const r: RunResult = { ...base };
    let result: Record<string, unknown> | null = null;
    let stopReason: string | null = null;
    let badLines = 0;
    let buf = '';
    let stderr = '';
    const denials = new Map<string, number>();
    let child: ChildLike;
    try {
      child = spawn(bin, args, { cwd: loaded.paths.runtime, env: childEnv() });
    } catch (e) {
      resolve({ ...r, error: `spawn failed: ${(e as Error).message}` });
      return;
    }
    const stop = (reason: string) => {
      if (stopReason) return;
      stopReason = reason;
      if (child.pid !== undefined) void kill(child.pid, graceMs);
    };
    const famTimeout = deps.timeoutMs ?? loaded.cfg.claude.timeouts_min[FAMILY[opts.stage]] * 60000;
    const timer = setTimeout(() => { r.timedOut = true; stop(`timeout after ${Math.round(famTimeout / 1000)} s`); }, famTimeout);
    // Idle watchdog: any output from the CLI restarts it.
    const idleMs = deps.idleMs ?? loaded.cfg.claude.idle_timeout_min * 60000;
    let idleTimer: NodeJS.Timeout | undefined;
    const armIdle = () => {
      if (idleMs <= 0) return;
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => { r.idle = true; stop(`idle: no output from claude for ${Math.round(idleMs / 60000)} min`); }, idleMs);
    };
    armIdle();
    // The owner's hold (D45) stops the call through the same kill path as a timeout.
    if (opts.signal?.aborted) stop(STOPPED_BY_OWNER);
    else opts.signal?.addEventListener('abort', () => stop(STOPPED_BY_OWNER), { once: true });

    const handle = (line: string) => {
      if (!line.trim()) return;
      log(line);
      let e: Record<string, unknown>;
      try { e = JSON.parse(line) as Record<string, unknown>; } catch { badLines++; return; }
      const type = e.type;
      const sub = e.subtype;
      if (type === 'system' && sub === 'init') {
        r.model = String(e.model ?? '');
        r.sessionId = String(e.session_id ?? '');
        opts.onEvent?.({ kind: 'init', model: r.model, cwd: String(e.cwd ?? ''), skills: Array.isArray(e.skills) ? (e.skills as string[]) : [] });
        if (!modelMatches(configuredModel, r.model)) stop(`model mismatch: configured ${configuredModel}, CLI started ${r.model}`);
      } else if (type === 'assistant') {
        const content = ((e.message as { content?: unknown[] } | undefined)?.content ?? []) as Record<string, unknown>[];
        for (const c of content) {
          if (c.type === 'text' && typeof c.text === 'string') opts.onEvent?.({ kind: 'progress', text: c.text.slice(0, 200) });
          if (c.type === 'tool_use' && typeof c.name === 'string') opts.onEvent?.({ kind: 'tool', name: c.name });
        }
      } else if (type === 'rate_limit_event') {
        const info = readRateLimit((e.rate_limit_info ?? {}) as Record<string, unknown>);
        r.rateLimit = info;
        // Every answer carries the plan's percentages: keep the quota file fresh from them (D70).
        writePlanStatus(deps.config.paths.quotaStatus, info.windows, now());
        opts.onEvent?.({ kind: 'rate_limit', info });
        if (info.status === 'rejected') { r.rateLimited = true; r.resumeAt = info.resetsAt; }
      } else if (type === 'system' && sub === 'api_retry') {
        const delay = typeof e.retry_delay_ms === 'number' ? e.retry_delay_ms : 0;
        opts.onEvent?.({ kind: 'retry', error: String(e.error ?? ''), delayMs: delay });
        if (e.error === 'rate_limit') {
          r.rateLimited = true;
          if (delay > RATE_LIMIT_PAUSE_MS) {
            const at = new Date(now() + delay).toISOString();
            if (!r.resumeAt || at > r.resumeAt) r.resumeAt = at;
            stop(`rate limit: retry in ${Math.round(delay / 60000)} min`);
          }
        }
      } else if (type === 'user') {
        // A tool call that worked means Claude found its way around earlier denials: only a run of denials in a row is a stuck run (D48).
        const content = ((e.message as { content?: unknown[] } | undefined)?.content ?? []) as Record<string, unknown>[];
        if (content.some((c) => c.type === 'tool_result' && c.is_error !== true)) denials.clear();
      } else if (type === 'system' && sub === 'permission_denied') {
        const tool = String(e.tool_name ?? 'unknown');
        const n = (denials.get(tool) ?? 0) + 1;
        denials.set(tool, n);
        opts.onEvent?.({ kind: 'permission_denied', tool });
        if (n >= PERMISSION_DENIAL_LIMIT) stop(`permission denied ${n}× for ${tool}: add it to --allowedTools (app/ai/claudeRunner.ts ALLOWED_TOOLS)`);
      } else if (type === 'result') {
        result = e;
        opts.onEvent?.({ kind: 'result', isError: e.is_error === true });
      }
    };

    child.stdout?.on('data', (d: Buffer) => {
      armIdle();
      buf += d.toString('utf8');
      let i: number;
      while ((i = buf.indexOf('\n')) >= 0) { handle(buf.slice(0, i)); buf = buf.slice(i + 1); }
    });
    child.stderr?.on('data', (d: Buffer) => { stderr += d.toString('utf8'); });
    child.on('error', (err) => { stderr += `\n${err.message}`; });
    child.on('close', () => {
      clearTimeout(timer);
      clearTimeout(idleTimer);
      if (buf.trim()) handle(buf);
      // The CLI reports argument errors only on stderr; keep them in the same log.
      if (stderr.trim()) log(JSON.stringify({ type: 'runner_stderr', text: stderr.trim().slice(0, 4000) }));
      const res = result as Record<string, unknown> | null;
      if (res) {
        r.usage = readUsage(res.usage);
        r.costUsdEst = typeof res.total_cost_usd === 'number' ? res.total_cost_usd : 0;
        if (typeof res.session_id === 'string') r.sessionId = res.session_id;
        if (typeof res.result === 'string') r.text = res.result;
        if (res.structured_output !== undefined) r.structured = res.structured_output;
      }
      const resultText = typeof res?.result === 'string' ? res.result : '';
      if (/rate.?limit|usage limit/i.test(`${stderr} ${res?.is_error === true ? resultText : ''}`)) r.rateLimited = true;

      if (stopReason) r.error = stopReason;
      else if (!res) r.error = `stream ended without a result (${badLines} unreadable line(s)); stderr: ${stderr.trim().slice(0, 300)}`;
      else if (res.is_error === true) r.error = `claude returned an error (${String(res.subtype)}): ${resultText.slice(0, 300)}`;
      else if (opts.jsonSchema && r.structured === undefined) r.error = 'structured output missing: a JSON schema was given but the result has no structured_output';
      r.ok = !r.error;
      resolve(r);
    });
  });
}
