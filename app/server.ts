// Responsibility: build the local Fastify server on 127.0.0.1 (API, live events, built UI) and, as the entry point, start it after recovering jobs a closed app left running.
import fs from 'node:fs';
import path from 'node:path';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { checkSubscriptionAuth, claudeLogin, claudeLogout, claudeVersion, clearAuthCache, runClaude, type RunOptions, type RunResult } from './ai/claudeRunner.js';
import { makeOrchestrator } from './cli.js';
import { ConfigError, loadConfig, type LoadedConfig } from './config.js';
import { openDb, type Db } from './db/db.js';
import { recoverInterrupted, resumeJob, type Orchestrator } from './orchestrator/index.js';
import { reviseJob } from './orchestrator/revision.js';
import { RefReader, type RefReaderDeps } from './library/refReader.js';
import { Notifier, type ToastFn } from './notify/index.js';
import { openRoute, windowsToast } from './notify/windows.js';
import { runTool } from './proc.js';
import type { Tool } from './stages/reference/index.js';
import { restartForKeyChange, stopStartedAvaFarsi } from './stages/voice/avaClient.js';
import { accountRoutes } from './api/accountRoutes.js';
import { onboardingRoutes } from './api/onboardingRoutes.js';
import { guideRoutes } from './api/guideRoutes.js';
import { brandRoutes } from './api/brandRoutes.js';
import { brandCoreRoutes } from './api/brandCoreRoutes.js';
import { BrandBuilder, SKILL_NAME } from './brandcore/build.js';
import { defaultExists, systemCheck } from './onboarding/index.js';
import { describeError, type ApiContext } from './api/context.js';
import { calendarRoutes } from './api/calendarRoutes.js';
import { autostartRoutes } from './api/autostartRoutes.js';
import { checkWarnings, warningRoutes } from './api/warningRoutes.js';
import { checkQuota, notifyRoutes } from './api/notifyRoutes.js';
import { jobRoutes } from './api/jobRoutes.js';
import { scheduleRoutes } from './api/scheduleRoutes.js';
import { libraryRoutes } from './api/libraryRoutes.js';
import { suggestRoutes } from './api/suggestRoutes.js';
import { systemRoutes } from './api/systemRoutes.js';
import { JobRunner } from './api/runner.js';
import { Scheduler } from './scheduler/index.js';
import { KeepAwake } from './scheduler/keepAwake.js';
import { suggestStyles } from './suggest/index.js';
import { usageRepo } from './db/repositories.js';
import { brandDir } from './brands/index.js';
import { preferPythonForThisProcess } from './pythonPath.js';

export interface ServerOptions {
  config: LoadedConfig;
  db: Db;
  /** Defaults to the real pipeline (cli.ts makeOrchestrator); tests pass stub stages. */
  o?: Orchestrator;
  uploadsDir?: string;
  /** Folder with the built UI (Vite `dist`); not served when missing. */
  uiDir?: string;
  overrides?: Partial<Pick<ApiContext, 'auth' | 'voiceHealth' | 'openFolder' | 'revise' | 'restartVoice' | 'claudeAccount' | 'systemCheck'>>;
  /** ffmpeg/ffprobe and the Claude read used by library uploads; tests and the stub server replace them. */
  library?: { tool?: Tool; run?: RefReaderDeps['run']; pollMs?: number };
  /** The style suggestion's Claude call; tests and the stub server replace it. */
  suggestRun?: ApiContext['suggestRun'];
  /** The «برند من» build's Claude call (stage brand-build); tests replace it with a fake that writes the docs. */
  brandRun?: (o: RunOptions) => Promise<RunResult>;
  /** Is the brand-build skill installed? Default: its SKILL.md in runtime/; the stub server says yes (its Claude is fake). */
  brandSkillReady?: () => boolean;
  /** PowerShell and schtasks for the autostart switch. Only the real server passes one; without it nothing on the machine is touched (tests). */
  systemTool?: Tool;
  /** Windows toasts and the click-through; absent in tests, so they never pop a real toast. The bell works without them. */
  toast?: { show: ToastFn | null; open: (route: string) => void };
  /** The scheduler's clock and keep-awake helper; tests pass a fake clock. Without `keepAwake` nothing is started on the machine. */
  scheduler?: { now?: () => Date; keepAwake?: KeepAwake; suggest?: (topic: string) => Promise<string[]> };
}

export async function buildServer(opts: ServerOptions): Promise<{ app: FastifyInstance; ctx: ApiContext }> {
  const { config, db } = opts;
  const o = opts.o ?? makeOrchestrator(config, db, (s) => console.log(s));
  const runner = new JobRunner(o, describeError);
  const libraryTool = opts.library?.tool ?? runTool;
  const suggestRun = opts.suggestRun ?? ((ro: RunOptions) => runClaude(ro, { config }));
  const refReader = new RefReader({
    config, db, tool: libraryTool, pollMs: opts.library?.pollMs, nameRun: suggestRun,
    run: opts.library?.run ?? ((ro, limits) => runClaude({ ...ro, maxBudgetUsd: limits.budgetUsd }, { config, timeoutMs: limits.timeoutMs })),
    filmBusy: () => runner.running() !== null || runner.queued().length > 0,
  });
  const brandBuilder = new BrandBuilder({
    config, db, tool: libraryTool,
    run: opts.brandRun ?? ((ro: RunOptions) => runClaude(ro, { config })),
    filmBusy: () => runner.running() !== null || runner.queued().length > 0 || refReader.reading(),
    skillReady: opts.brandSkillReady ?? (() => fs.existsSync(path.join(config.paths.runtime, '.claude', 'skills', SKILL_NAME, 'SKILL.md'))),
  });
  const ctx: ApiContext = {
    config, db, o, runner, refReader, libraryTool, brandBuilder,
    systemTool: opts.systemTool ?? (async () => ({ code: 1, stdout: '', stderr: 'no system tool' })),
    refreshAutostart: async () => undefined,
    notifier: new Notifier({ db, toast: opts.toast?.show ?? null, open: opts.toast?.open }),
    suggestRun,
    uploadsDir: opts.uploadsDir ?? path.join(path.dirname(config.paths.db), 'uploads'),
    auth: () => checkSubscriptionAuth({ config }),
    voiceHealth: async () => {
      try {
        const res = await fetch(new URL('/api/health', config.cfg.tts.base_url), { signal: AbortSignal.timeout(2000) });
        return res.ok ? ((await res.json()) as { hasApiKey?: boolean }) : null;
      } catch { return null; }
    },
    revise: (slug, target, note) => reviseJob({ config, db }, slug, target, note),
    restartVoice: () => restartForKeyChange(config),
    systemCheck: () => systemCheck({ runTool, claudeVersion: () => claudeVersion({ config }), exists: defaultExists, engineDir: config.paths.engine, avaFarsiDir: config.paths.avaFarsi, packaged: fs.existsSync(path.join(config.paths.root, 'starter')) }),
    claudeAccount: {
      status: (force) => { if (force) clearAuthCache(); return checkSubscriptionAuth({ config }, force); },
      login: (email) => claudeLogin({ config }, { email }),
      logout: () => claudeLogout({ config }),
    },
    openFolder: async (dir) => {
      if (process.platform !== 'win32') return false;
      await runTool('explorer.exe', [dir], { timeoutMs: 10000 });
      return true;
    },
    ...opts.overrides,
  } as ApiContext;
  ctx.scheduler = new Scheduler({
    config, db, o, runner, notifier: ctx.notifier, refReader, now: opts.scheduler?.now,
    keepAwake: opts.scheduler?.keepAwake ?? new KeepAwake(null),
    log: (line) => console.log(line),
    // The suggestion for a calendar day is the schedule's brand's (Phase 8).
    suggest: opts.scheduler?.suggest ?? (async (topic, brand) => (await suggestStyles(topic, {
      refsDir: config.paths.refs, brandDir: brandDir(config.paths, brand), run: ctx.suggestRun,
      onUsage: (r) => usageRepo.insert(db, {
        job_id: null, brand, stage: 'suggest', model: r.model, tokens_in: r.usage.input_tokens, tokens_out: r.usage.output_tokens,
        cache_read: r.usage.cache_read_input_tokens, cache_write: r.usage.cache_creation_input_tokens, cost_usd_est: r.costUsdEst,
      }),
    })).suggestions.map((x) => x.ref_slug)),
  });
  fs.mkdirSync(ctx.uploadsDir, { recursive: true });

  const app = Fastify({ logger: false, bodyLimit: 2 * 1024 * 1024 });
  await app.register(fastifyMultipart);
  const uiDir = opts.uiDir ?? path.join(config.paths.root, 'app', 'ui', 'dist');
  const hasUi = fs.existsSync(path.join(uiDir, 'index.html'));
  // One static plugin: the UI when built; job and reference files use reply.sendFile with their own root.
  await app.register(fastifyStatic, { root: hasUi ? uiDir : config.paths.root, serve: hasUi, wildcard: true });
  jobRoutes(app, ctx);
  libraryRoutes(app, ctx);
  suggestRoutes(app, ctx);
  calendarRoutes(app, ctx);
  notifyRoutes(app, ctx);
  autostartRoutes(app, ctx);
  warningRoutes(app, ctx);
  scheduleRoutes(app, ctx);
  systemRoutes(app, ctx);
  accountRoutes(app, ctx);
  onboardingRoutes(app, ctx);
  guideRoutes(app, ctx);
  brandRoutes(app, ctx);
  brandCoreRoutes(app, ctx);
  // Any other GET outside /api is the single-page UI.
  app.setNotFoundHandler((request, reply) => {
    if (hasUi && request.method === 'GET' && !request.url.startsWith('/api/')) return reply.sendFile('index.html', uiDir);
    return reply.code(404).send({ error_fa: 'پیدا نشد.' });
  });
  app.setErrorHandler((e, _request, reply) => {
    const code = (e as { statusCode?: number }).statusCode;
    reply.code(code && code < 500 ? code : 500).send({ error_fa: describeError(e) });
  });
  return { app, ctx };
}

export async function main(argv: string[]): Promise<number> {
  let config: LoadedConfig;
  try { config = loadConfig(); } catch (e) {
    if (e instanceof ConfigError) { console.error(`خطای تنظیمات: ${e.message_fa}\n${e.message}`); return 78; }
    throw e;
  }
  const db = openDb(config.paths.db);
  const { app, ctx } = await buildServer({ config, db, systemTool: runTool, toast: { show: windowsToast, open: (route) => openRoute(config.cfg.server.port, route) }, scheduler: { keepAwake: new KeepAwake() } });
  // docs/03: a job the closed app left running is `interrupted` and resumes on start (`--no-resume` keeps it waiting, for example while testing).
  for (const slug of recoverInterrupted(ctx.o)) {
    if (argv.includes('--no-resume')) console.log(`کار «${slug}» نیمه‌کاره مانده بود؛ از صفحه‌ی آن ادامه بده.`);
    else ctx.runner.enqueue(slug, 'resume', (pause) => resumeJob(ctx.o, slug, false, pause));
  }
  const { host, port } = config.cfg.server;
  await app.listen({ host, port });
  console.log(`استودیو آماده است: http://localhost:${port}`);
  // The quota file is refreshed whenever the owner uses Claude Code; look at it once a minute (docs/09).
  const quotaTimer = setInterval(() => { checkQuota(ctx); checkWarnings(ctx); }, 60000);
  quotaTimer.unref();
  // Films on the calendar start at their time; the first tick also catches up a run the closed app missed (docs/08).
  ctx.scheduler.start();
  const stop = async () => {
    clearInterval(quotaTimer);
    ctx.scheduler.stop();
    ctx.refReader.stop();
    await app.close();
    await stopStartedAvaFarsi();
    db.close();
    process.exit(0);
  };
  process.once('SIGINT', () => void stop());
  process.once('SIGTERM', () => void stop());
  return 0;
}

const isEntry = process.argv[1] && /server\.(ts|js)$/.test(process.argv[1]);
if (isEntry) {
  // Before anything starts python (alignment, sound, Claude's Bash): see app/pythonPath.ts.
  preferPythonForThisProcess().catch(() => undefined).then(() => main(process.argv.slice(2))).then((code) => { if (code) process.exitCode = code; }, (e: unknown) => { console.error(e); process.exitCode = 1; });
}
