// Responsibility: prove every dependency, asset and the quota budget are ready before any token is spent (docs/03 S1, docs/09), with a Persian reason for each failure.
import fs from 'node:fs';
import path from 'node:path';
import type { LoadedConfig } from '../config.js';
import type { Db } from '../db/db.js';
import { usageRepo } from '../db/repositories.js';
import { ReferenceMeta, type JobRequest, type Workspace } from '../contracts/index.js';
import { faNum } from '../fa.js';
import { budgetGuard, readPlanStatus } from '../quota/index.js';
import { runTool, type RunResult } from '../proc.js';
import { defaultAvaDeps } from '../stages/voice/avaClient.js';
import { checkSubscriptionAuth, claudeVersion, type AuthStatus } from '../ai/claudeRunner.js';
import { BrandError, brandDir, brandDirLabel, brandPrompt } from '../brands/index.js';
import { usableWithoutVideo } from '../stages/reference/index.js';
import { vertexStop } from '../stages/clips/index.js';
import { VertexError, checkVertex, defaultVertexDeps, isCloudSession, type VertexDeps } from '../video/vertexClient.js';
import { isUnattended, oneClipUsd, unattendedSpentTodayUsd } from '../video/unattended.js';
import { jobDir } from '../orchestrator/jobFolder.js';
import { usd } from '../stages/clips/index.js';

export interface CheckResult { id: string; ok: boolean; reason_fa?: string; detail?: string }
export interface PreflightResult { ok: boolean; results: CheckResult[]; reasons_fa: string[] }

export interface PreflightDeps {
  config: LoadedConfig;
  db: Db;
  runTool: (cmd: string, args: string[], opts?: { timeoutMs?: number }) => Promise<RunResult>;
  fetchHealth: (url: string) => Promise<{ hasApiKey?: boolean } | null>;
  claudeVersion: () => Promise<string | null>;
  auth: () => Promise<AuthStatus>;
  startAvaFarsi: () => void;
  diskFreeGb: (dir: string) => number;
  exists: (p: string) => boolean;
  readDir: (p: string) => string[];
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  /** How long to wait for ava-farsi after starting it (docs/10: 60 s). */
  healthWaitMs: number;
  /** Phase 11.6: the Vertex door's machine (gcloud, fetch); left out = the real one. Tests pass a fake. */
  vertex?: VertexDeps;
}

export function defaultDeps(config: LoadedConfig, db: Db): PreflightDeps {
  return {
    config,
    db,
    runTool: (c, a, o) => runTool(c, a, o),
    fetchHealth: async (url) => {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
        return res.ok ? ((await res.json()) as { hasApiKey?: boolean }) : null;
      } catch { return null; }
    },
    claudeVersion: () => claudeVersion({ config }),
    auth: () => checkSubscriptionAuth({ config }),
    // Through the voice client, so the one child it starts is the one the app stops on exit (docs/10).
    startAvaFarsi: () => { defaultAvaDeps(config).start(); },
    diskFreeGb: (dir) => { const s = fs.statfsSync(dir); return (s.bavail * s.bsize) / 1024 ** 3; },
    exists: (p) => fs.existsSync(p),
    readDir: (p) => { try { return fs.readdirSync(p); } catch { return []; } },
    now: () => Date.now(),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    healthWaitMs: 60000,
  };
}

const ok = (id: string, detail?: string): CheckResult => ({ id, ok: true, ...(detail ? { detail } : {}) });
const fail = (id: string, reason_fa: string, detail?: string): CheckResult => ({ id, ok: false, reason_fa, ...(detail ? { detail } : {}) });

export function checkTopicAndRefs(req: JobRequest, d: PreflightDeps): CheckResult[] {
  const out: CheckResult[] = [req.topic.trim() ? ok('topic') : fail('topic', 'موضوع ویدیو خالی است.')];
  for (const slug of req.references) {
    const meta = path.join(d.config.paths.refs, slug, 'meta.json');
    if (!d.exists(meta)) { out.push(fail('references', `مرجع «${slug}» در کتابخانه پیدا نشد.`, meta)); continue; }
    try { ReferenceMeta.parse(JSON.parse(fs.readFileSync(meta, 'utf8'))); } catch (e) { out.push(fail('references', `اطلاعات مرجع «${slug}» خراب است.`, (e as Error).message.slice(0, 300))); continue; }
    if (!d.exists(path.join(d.config.paths.refs, slug, 'video.mp4'))) {
      // D79: a reference without its video on this machine is fine when its reading is the one made from that video.
      out.push(usableWithoutVideo(d.config.paths.refs, slug) ? ok('references', `${slug}: cached reading, video not on this machine`) : fail('references', `فایل ویدیوی مرجع «${slug}» پیدا نشد و تحلیل آماده هم ندارد.`));
      continue;
    }
    // A missing reading.json is allowed: the reference stage reads it once (docs/03 S1.1).
    out.push(ok('references', d.exists(path.join(d.config.paths.refs, slug, 'reading.json')) ? `${slug}: cached reading` : `${slug}: reading will be made`));
  }
  return out;
}

export async function checkClaude(d: PreflightDeps): Promise<CheckResult[]> {
  const v = await d.claudeVersion();
  if (!v) return [fail('claude_cli', 'Claude Code روی این سیستم پیدا نشد (دستور claude اجرا نشد).')];
  const a = await d.auth();
  return [ok('claude_cli', v), a.ok ? ok('claude_auth', a.detail) : fail('claude_auth', 'Claude Code با اشتراک Claude وارد نشده است (ورود با کلید API مجاز نیست). در ترمینال بزن: claude auth login', a.detail)];
}

/** Only what the tool checks need, so the first-run wizard (app/onboarding) can run them too. */
export type ToolCheckDeps = Pick<PreflightDeps, 'runTool' | 'exists'> & { config: { paths: Pick<LoadedConfig['paths'], 'engine'> } };

export async function checkTools(d: ToolCheckDeps): Promise<CheckResult[]> {
  const out: CheckResult[] = [];
  const ff = await d.runTool('ffmpeg', ['-version'], { timeoutMs: 15000 });
  const first = ff.stdout.split(/\r?\n/)[0] ?? '';
  const major = Number(first.match(/ffmpeg version n?(\d+)\./i)?.[1] ?? NaN);
  const nightly = /ffmpeg version N-/.test(first);
  out.push(ff.code === 0 && (major >= 6 || nightly) ? ok('ffmpeg', first) : fail('ffmpeg', 'ffmpeg نسخه‌ی ۶ یا بالاتر روی این سیستم پیدا نشد.', first || ff.error));
  const fp = await d.runTool('ffprobe', ['-version'], { timeoutMs: 15000 });
  out.push(fp.code === 0 ? ok('ffprobe') : fail('ffprobe', 'ffprobe روی این سیستم پیدا نشد.', fp.error));
  const py = await d.runTool('python', ['-c', 'import numpy, scipy, faster_whisper; print(1)'], { timeoutMs: 60000 });
  out.push(py.code === 0 && py.stdout.trim() === '1' ? ok('python') : fail('python', 'بسته‌های پایتون (numpy، scipy، faster-whisper) نصب نیستند.', (py.stderr || py.error || '').slice(-300)));
  out.push(d.exists(path.join(d.config.paths.engine, 'node_modules', 'playwright')) ? ok('playwright') : fail('playwright', 'موتور رندر نصب نیست (engine/node_modules/playwright). در پوشه‌ی engine بزن: npm install'));
  return out;
}

/** docs/10: health check; if down and autostart is on, start `npm run dev` in ava-farsi and poll every second. */
export async function checkVoiceApp(d: PreflightDeps): Promise<CheckResult> {
  const url = new URL('/api/health', d.config.cfg.tts.base_url).toString();
  let h = await d.fetchHealth(url);
  if (!h && d.config.cfg.tts.autostart) {
    d.startAvaFarsi();
    const until = d.now() + d.healthWaitMs;
    while (!h && d.now() < until) { await d.sleep(1000); h = await d.fetchHealth(url); }
  }
  if (!h) return fail('ava_farsi', 'اپ صدا اجرا نشد', url);
  if (h.hasApiKey !== true) return fail('ava_farsi', 'کلید Gemini تنظیم نشده؛ در تنظیمات ← «حساب و کلیدها» واردش کن', url);
  return ok('ava_farsi');
}

/** The job's own brand folder (request.json `brand`, Phase 8): it exists, holds the files the film needs, and its tokens name the brand and its Persian font. */
export function checkBrand(d: PreflightDeps, brand: string): CheckResult[] {
  let b: string;
  let label: string;
  try {
    b = brandDir(d.config.paths, brand);
    label = brandDirLabel(d.config.paths, brand);
  } catch (e) { return [fail('brand', e instanceof BrandError ? e.message_fa : `نام برند «${brand}» معتبر نیست.`)]; }
  if (!d.exists(b)) return [fail('brand', `پوشه‌ی برند این کار (${label}) پیدا نشد.`, b)];
  const out: CheckResult[] = [];
  for (const f of ['tokens.json', 'logo-outro.mp4']) {
    out.push(d.exists(path.join(b, f)) ? ok('brand', f) : fail('brand', `فایل برند «${f}» در ${label} پیدا نشد.`));
  }
  if (d.exists(path.join(b, 'tokens.json'))) {
    try { const p = brandPrompt(d.config.paths, brand); out.push(ok('brand', `${p.brandName}; ${p.brandFont}`)); } catch (e) {
      out.push(fail('brand', e instanceof BrandError ? e.message_fa : `اطلاعات برند ${label} خوانده نشد.`, (e as Error).message.slice(0, 300)));
    }
  }
  // Any font file: a brand made in «برند من» brings its own (or the free Vazirmatn), whatever its name (Phase 9).
  const fonts = d.readDir(path.join(b, 'fonts')).filter((f) => /\.(woff2?|ttf|otf)$/i.test(f));
  out.push(fonts.length ? ok('brand', fonts.join(', ')) : fail('brand', `هیچ فایل فونتی در ${label}/fonts پیدا نشد.`));
  // A brand made in «برند من» (it has answers.json) needs its docs built first; Mahdiyar's hand-made folder has no such file.
  if (d.exists(path.join(b, 'answers.json'))) {
    const missing = ['brand-guide.md', 'design-system.md', 'cover-system.md'].filter((f) => !d.exists(path.join(b, f)));
    out.push(missing.length ? fail('brand', `سندهای برند هنوز ساخته نشده‌اند (${missing.join('، ')}). در «برند من» دکمه‌ی «ثبت» را بزن.`) : ok('brand', 'brand docs'));
  }
  return out;
}

export function checkDisk(d: PreflightDeps): CheckResult {
  const min = d.config.cfg.disk.min_free_gb;
  let free: number;
  try { free = d.diskFreeGb(d.config.paths.root); } catch (e) { return fail('disk', 'فضای خالی دیسک خوانده نشد.', (e as Error).message); }
  return free >= min ? ok('disk', `${free.toFixed(1)} GB`) : fail('disk', `فضای خالی دیسک ${faNum(free, 1)} گیگابایت است؛ دست‌کم ${faNum(min)} گیگابایت لازم است.`);
}

/**
 * The Claude budget guard (docs/09). Phase 11.8 (D108): a video film starts up to its own 5-hour threshold (`quota.video_max_5h_pct_to_start`,
 * 40: the heaviest measured content, 57 window points, + the prompts call, 4); the weekly threshold and the motion one are unchanged.
 */
export function checkQuota(d: PreflightDeps, ws: Workspace = 'motion'): CheckResult {
  const { cfg, paths } = d.config;
  const now = d.now();
  const plan = readPlanStatus(paths.quotaStatus, now, cfg.quota.status_max_age_min);
  const since = new Date(now - 5 * 3600 * 1000).toISOString();
  const quota = ws === 'video' ? { ...cfg.quota, max_5h_pct_to_start: cfg.quota.video_max_5h_pct_to_start } : cfg.quota;
  const g = budgetGuard({ quota, plan, appTokens5h: usageRepo.outputTokensSince(d.db, since), expectedJobTokens: usageRepo.avgOutputTokensPerJob(d.db) });
  const detail = `plan status ${plan.fresh ? `fresh (${plan.ageMin?.toFixed(0)} min)` : 'not fresh'}: 5h=${String(plan.fiveHourPct)} 7d=${String(plan.sevenDayPct)}`;
  return g.ok ? ok('quota', detail) : fail('quota', g.reasons_fa.join(' '), detail);
}

/**
 * Phase 11.6 (D89, D91 e, docs/13 V4, V5, V7), free: a video job is refused in the cloud session; on the PC the Google Cloud CLI is found,
 * signed in, gives a token, and countTokens answers for a short text (project, API, permission, model in its location). The film's own
 * estimate against the money cap is checked by the clips stage, once its prompts exist.
 */
export async function checkVideo(req: JobRequest, d: PreflightDeps): Promise<CheckResult[]> {
  if (req.workspace !== 'video') return [];
  const vd = d.vertex ?? defaultVertexDeps();
  if (isCloudSession(vd)) return [fail('video', 'ویدیو فقط روی کامپیوتر خودت ساخته می‌شود (در نشست ابری Google Cloud CLI نیست، D89).', 'cloud session')];
  try {
    const r = await checkVertex(d.config.cfg.video, vd);
    return [ok('video', `Vertex ${d.config.cfg.video.vertex.model} in ${d.config.cfg.video.vertex.location}: countTokens ${r.tokens}`)];
  } catch (e) {
    if (e instanceof VertexError) { const s = vertexStop(e, null); return [fail('video', s.message_fa, s.detail.slice(0, 400))]; }
    return [fail('video', 'بررسی Google Cloud انجام نشد.', (e as Error).message.slice(0, 400))];
  }
}

/**
 * Phase 11.8 (D108, docs/13 V27): a video film the scheduler started that nobody has touched does not start when the day's cap for such
 * films leaves less than one clip; nothing is spent and the day is told. The film's own estimate against what is left is checked again by
 * the clips stage before its first purchase.
 */
export function checkVideoMoney(req: JobRequest, d: PreflightDeps): CheckResult[] {
  if (req.workspace !== 'video' || req.source !== 'schedule' || !isUnattended(jobDir(d.config.paths.jobs, req.slug))) return [];
  const cfg = d.config.cfg.video;
  const spent = unattendedSpentTodayUsd(d.db, d.config.paths.jobs, d.now(), req.slug);
  const detail = `unattended today ${spent.toFixed(3)} + one clip ${oneClipUsd(cfg).toFixed(3)} vs daily cap ${cfg.max_usd_per_day_unattended}`;
  return spent + oneClipUsd(cfg) > cfg.max_usd_per_day_unattended + 1e-9
    ? [fail('video_money', `سقف پول روزانه‌ی فیلم‌های خودکار ویدیو (${usd(cfg.max_usd_per_day_unattended)}) پر شده؛ امروز حدود ${usd(spent)} خرج شده. این فیلم شروع نشد و چیزی خرج نشد؛ اگر بخواهی خودت «ادامه» را بزن.`, detail)]
    : [ok('video_money', detail)];
}

export async function runPreflight(req: JobRequest, d: PreflightDeps): Promise<PreflightResult> {
  const results = [
    ...checkTopicAndRefs(req, d),
    ...(await checkClaude(d)),
    ...(await checkTools(d)),
    await checkVoiceApp(d),
    ...checkBrand(d, req.brand),
    checkDisk(d),
    checkQuota(d, req.workspace),
    ...checkVideoMoney(req, d),
    ...(await checkVideo(req, d)),
  ];
  const reasons_fa = results.filter((r) => !r.ok).map((r) => r.reason_fa!);
  return { ok: reasons_fa.length === 0, results, reasons_fa };
}
