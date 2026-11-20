// Responsibility: start the calendar films at their time (docs/08 «Scheduler mechanics»): a 30 s tick queues, for every schedule that is on (each brand's motion and video schedule, Phase 11.8), one job per calendar day with the style rule's reference or visual style, catches up a missed run once, retries a scheduled job the quota blocked, resumes quota pauses, and keeps the calendar day's status in step with its job.
import fs from 'node:fs';
import path from 'node:path';
import { jalaliText } from '../calendar/import.js';
import { addDays, weekdayIndex } from '../calendar/jalali.js';
import { listSchedules } from '../calendar/schedule.js';
import { brandDir, readBrand } from '../brands/index.js';
import { resolveStyle, resolveVideoStyle, type StyleChoice } from '../calendar/styleRule.js';
import { startMoment, zonedMs } from '../calendar/timing.js';
import type { CalendarEntry, JobStatus, Schedule, Workspace } from '../contracts/index.js';
import type { LoadedConfig } from '../config.js';
import type { Db } from '../db/db.js';
import { calendarRepo, jobsRepo, settingsRepo, stageRunsRepo } from '../db/repositories.js';
import { IntakeError, checkInput, localDate, requestFromSchedule } from '../intake/index.js';
import type { Notifier } from '../notify/index.js';
import { resumeJob, runJob, type Orchestrator } from '../orchestrator/index.js';
import { createJobFolder, jobDir, readRequest, readState } from '../orchestrator/jobFolder.js';
import { readPlanStatus } from '../quota/index.js';
import { defaultStyle, listStyles, markUsed, styleProblem } from '../styles/index.js';
import { colourNamesOf } from '../stages/prompts/checks.js';
import { isRoundsBlock } from '../stages/content/decision.js';
import { isCloudSession } from '../video/vertexClient.js';
import { markUnattended } from '../video/unattended.js';
import { decodedCandidates } from '../suggest/index.js';
import type { RefReader } from '../library/refReader.js';
import { CHANGED, FINISHED, type JobRunner } from '../api/runner.js';
import type { KeepAwake } from './keepAwake.js';

export const TICK_MS = 30000;
/** A day whose start moment passed more than this long ago was missed (the app was closed or the computer slept), not just reached. */
export const ON_TIME_MS = 10 * 60000;
/** Missed runs are looked for in the past 24 hours only (docs/08). */
export const MISSED_WINDOW_MS = 24 * 3600000;
/** A scheduled job the budget guard blocked tries again every 30 minutes for up to 6 hours, then the day is skipped (docs/09). */
export const QUOTA_RETRY_MS = 30 * 60000;
export const QUOTA_GIVE_UP_MS = 6 * 3600000;
/** A quota pause without a known reset time is tried again after this long (docs/09 Layer 2). */
export const PAUSE_RETRY_MS = 30 * 60000;
/** D78: Windows also stays awake while a job waits for a quota reset at most this far away (the 5-hour window, with a margin); a longer wait (the weekly limit) lets it sleep. */
export const QUOTA_AWAKE_MAX_MS = 5.5 * 3600000;

const RETRIES_KEY = 'scheduler_quota_retries';
interface Retry { first_at: string; next_at: string }

export interface SchedulerDeps {
  config: LoadedConfig;
  db: Db;
  o: Orchestrator;
  runner: JobRunner;
  notifier: Notifier;
  refReader: Pick<RefReader, 'reading'>;
  keepAwake: KeepAwake;
  /** The suggestion for a topic of `brand`'s calendar, best first (Claude with the keyword fallback, docs/07); asked only when the rule needs it. */
  suggest: (topic: string, brand: string) => Promise<string[]>;
  /** D89: a video schedule never runs in the cloud session (tests pass a fake; default: this process's platform and environment). */
  cloudSession?: () => boolean;
  now?: () => Date;
  log?: (line: string) => void;
}

/** True when a job's preflight stopped it only because of the quota budget (logs/preflight.json): it is worth trying again later. */
export function quotaOnlyBlock(dir: string): boolean {
  try {
    const r = JSON.parse(fs.readFileSync(path.join(dir, 'logs', 'preflight.json'), 'utf8')) as { ok: boolean; results: { id: string; ok: boolean }[] };
    const bad = r.results.filter((x) => !x.ok);
    return !r.ok && bad.length > 0 && bad.every((x) => x.id === 'quota');
  } catch { return false; }
}

/** A scheduled job blocked only by the quota is handled by the scheduler (it retries and tells the owner itself). */
export function scheduledQuotaBlock(dir: string): boolean {
  try { return readRequest(dir).source === 'schedule' && readState(dir).status === 'blocked' && quotaOnlyBlock(dir); } catch { return false; }
}

/** The calendar status that mirrors a job's status. A quota pause or a stop by a closed app comes back by itself, so the day is still «queued». */
export function calendarStatusFor(s: JobStatus): CalendarEntry['status'] {
  switch (s) {
    case 'queued': case 'paused_quota': case 'interrupted': return 'queued';
    case 'running': case 'held': return 'running';
    case 'awaiting_approval': return 'awaiting_approval';
    case 'done': return 'done';
    default: return 'failed';
  }
}

const isRunDay = (s: Schedule, date: string) => s.weekdays[weekdayIndex(date)] === true;

export class Scheduler {
  private timer: NodeJS.Timeout | null = null;
  private busy: Promise<void> | null = null;
  private readonly log: (line: string) => void;

  constructor(private readonly d: SchedulerDeps) {
    this.log = d.log ?? (() => undefined);
    // The day's status follows its job, and Windows stays awake while any film is made.
    d.runner.on(CHANGED, ({ slug }: { slug: string }) => { this.syncDay(slug); this.syncAwake(); });
    d.runner.on(FINISHED, ({ slug }: { slug: string }) => this.afterRun(slug));
  }

  private now(): Date { return this.d.now?.() ?? new Date(); }

  /**
   * The schedules that are on (Phase 8, D74): each brand runs its own automation from its own calendar. A brand whose folder is
   * gone is left out (its films could not be made).
   */
  private enabledSchedules(): Schedule[] {
    const cloud = this.d.cloudSession ? this.d.cloudSession() : isCloudSession({ env: process.env, platform: process.platform });
    return listSchedules(this.d.db).filter((s) => {
      if (!s.enabled) return false;
      // D89: video films are made on the owner's PC only; the screen refuses to switch a video schedule on in the cloud session.
      if (s.workspace === 'video' && cloud) { this.log(`scheduler: the video schedule of ${s.brand} is not run in the cloud session (D89)`); return false; }
      try { readBrand(this.d.config.paths, s.brand); return true; } catch { this.log(`scheduler: brand ${s.brand} has a schedule but no brand folder; skipped`); return false; }
    });
  }

  /** The measured average of the last five finished films of one workspace (Phase 11.3, V25: a video schedule starts from the video films). */
  private avg(ws: Workspace): number | null { return stageRunsRepo.avgJobMinutes(this.d.db, 5, ws); }

  /**
   * Starts the 30 s tick. Every tick applies the missed-run rules, so the first one (on app start) catches up a run the closed app
   * missed, and a tick after the computer slept does the same (docs/08).
   */
  start(): void {
    if (this.timer) return;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.d.keepAwake.release();
  }

  /** One pass; overlapping calls wait for the running one (a style suggestion can take seconds). */
  tick(): Promise<void> {
    if (!this.busy) this.busy = this.pass().catch((e: unknown) => this.log(`scheduler: ${(e as Error).message}`)).finally(() => { this.busy = null; });
    return this.busy;
  }

  private async pass(): Promise<void> {
    const now = this.now().getTime();
    this.syncActiveDays();
    this.resumeQuotaPauses(now);
    this.syncAwake();
    const on = this.enabledSchedules();
    if (on.length === 0) return;
    this.retryQuotaBlocks(now);
    // Each brand's due days are queued; the runner makes the films one after another (one job at a time), never together.
    for (const schedule of on) await this.queueDueDays(schedule, now);
  }

  /** Start moment (ms) of a calendar day's film under the schedule and the measured build time of its workspace. */
  startMs(schedule: Schedule, date: string, avg = this.avg(schedule.workspace)): number {
    const m = startMoment(date, schedule, avg);
    return zonedMs(m.date, m.time, schedule.timezone);
  }

  /** The next film any schedule will start (`brand` given: only that brand's): its calendar day, start moment and brand, or null. */
  nextRun(brand?: string): { date: string; at: string; brand: string } | null {
    const now = this.now().getTime();
    let best: { date: string; at: string; brand: string } | null = null;
    for (const schedule of this.enabledSchedules()) {
      if (brand && schedule.brand !== brand) continue;
      const avg = this.avg(schedule.workspace);
      const today = localDate(new Date(now), schedule.timezone);
      for (const e of calendarRepo.range(this.d.db, addDays(today, -1), addDays(today, 400), schedule.brand, schedule.workspace)) {
        if (e.status !== 'planned' || !isRunDay(schedule, e.date)) continue;
        const at = this.startMs(schedule, e.date, avg);
        if (at <= now) continue;
        if (!best || at < Date.parse(best.at)) best = { date: e.date, at: new Date(at).toISOString(), brand: schedule.brand };
        break;
      }
    }
    return best;
  }

  /**
   * The planned run-days whose start moment has come in the past 24 h. On time → queued. Missed (the app was closed or asleep):
   * `run_once` queues only the most recent and skips the older ones; `skip` marks them skipped (docs/08).
   */
  private async queueDueDays(schedule: Schedule, now: number): Promise<void> {
    // A film cannot start while a reference is being read (the read holds the job lock); the next tick tries again.
    if (this.d.refReader.reading()) return;
    const today = localDate(new Date(now), schedule.timezone);
    const avg = this.avg(schedule.workspace);
    const due = calendarRepo.range(this.d.db, addDays(today, -2), addDays(today, 2), schedule.brand, schedule.workspace)
      .filter((e) => e.status === 'planned' && e.topic.trim() !== '' && isRunDay(schedule, e.date))
      .map((e) => ({ e, at: this.startMs(schedule, e.date, avg) }))
      .filter((x) => x.at <= now && x.at > now - MISSED_WINDOW_MS)
      .sort((a, b) => b.at - a.at);
    if (due.length === 0) return;
    const missed = due.filter((x) => x.at < now - ON_TIME_MS);
    const onTime = due.filter((x) => x.at >= now - ON_TIME_MS);
    const run = [...onTime];
    if (schedule.missed_run === 'run_once' && onTime.length === 0) run.push(missed.shift()!);
    for (const x of missed) {
      calendarRepo.upsert(this.d.db, { ...x.e, status: 'skipped' });
      this.log(`scheduler: missed run of ${x.e.date} skipped`);
    }
    for (const x of run.reverse()) await this.queueDay(x.e, schedule, x.at < now - ON_TIME_MS);
  }

  /** Makes the day's job and puts it in the queue. A topic that cannot be made marks the day failed with a notification. */
  private async queueDay(entry: CalendarEntry, schedule: Schedule, missed: boolean): Promise<void> {
    const { config, db } = this.d;
    try {
      checkInput(entry.topic, true, config.cfg.intake);
    } catch (e) {
      this.failDay(entry, e instanceof IntakeError ? e.message_fa : 'موضوع این روز قابل ساخت نیست.');
      return;
    }
    const video = schedule.workspace === 'video';
    let style: StyleChoice | null;
    if (video) {
      // Phase 11.8 task 3: a visual style, never a reference; and never one the job route would refuse (styles/ with its text, no brand colour name).
      style = resolveVideoStyle(entry, schedule, this.videoStyleContext(entry.brand));
      if (!style) { this.failDay(entry, schedule.style_rule.type === 'manual' ? 'برای این روز سبک تصویری انتخاب نشده؛ در تقویم ویدیو یک سبک برایش بگذار.' : 'هیچ سبک تصویری قابل استفاده‌ای در کتابخانه‌ی سبک‌ها نیست.'); return; }
    } else {
      const library = decodedCandidates(config.paths.refs);
      const ctx = { library, now: this.now().getTime(), lastStyle: this.lastScheduledStyle(entry.brand), suggested: [] as string[] };
      style = resolveStyle(entry, schedule, ctx);
      // Only the suggestion rule (or a rule that cannot answer) costs a call.
      if (style?.source === 'suggest') {
        const suggested = await this.d.suggest(entry.topic, entry.brand).catch(() => []);
        style = resolveStyle(entry, schedule, { ...ctx, suggested });
      }
      if (!style) { this.failDay(entry, 'هیچ مرجع تحلیل‌شده‌ای در کتابخانه نیست؛ یک مرجع اضافه کن.'); return; }
    }
    // Between the suggestion and here the owner may have changed or removed the day: queue it only if it is still planned.
    const fresh = calendarRepo.get(db, entry.id);
    if (!fresh || fresh.status !== 'planned' || fresh.date !== entry.date) return;
    // The film belongs to the day's brand (the schedule's, Phase 8).
    const req = requestFromSchedule({
      topic: fresh.topic, topicNote: fresh.note, reference: style.slug, format: fresh.format ?? config.cfg.render.format_default,
      automationLevel: schedule.automation_level, calendarEntryId: fresh.id, styleSource: style.source, brand: fresh.brand,
      ...(video ? { workspace: 'video' as const } : {}),
    }, (s) => jobsRepo.slugExists(db, s) || fs.existsSync(jobDir(config.paths.jobs, s)), this.now());
    const dir = createJobFolder(config.paths.jobs, req);
    // D108: nobody has touched this film yet; its clips count against the daily cap for unattended films until the owner acts on it.
    if (video) { markUnattended(dir, this.now()); markUsed(config.paths.styles, style.slug, this.now()); }
    db.transaction(() => {
      jobsRepo.insert(db, req);
      calendarRepo.upsert(db, { ...fresh, status: 'queued', job_id: req.id });
    })();
    this.log(`scheduler: ${missed ? 'missed run' : 'run'} of ${fresh.date} queued as ${req.slug} (style ${style.slug}, ${style.source})`);
    if (missed) this.d.notifier.notify({ kind: 'missed_run', text: `اجرای جامانده‌ی ${jalaliText(fresh.date)} شروع شد`, route: `/jobs/${req.slug}`, dedupe: `missed:${fresh.id}:${req.slug}` });
    this.d.runner.enqueue(req.slug, 'run', (pause) => runJob(this.d.o, req.slug, pause));
  }

  private failDay(entry: CalendarEntry, reason: string): void {
    calendarRepo.upsert(this.d.db, { ...entry, status: 'failed' });
    this.d.notifier.notify({ kind: 'failed', text: `فیلم روز ${jalaliText(entry.date)} ساخته نشد: ${reason}`, route: '/automation', dedupe: `dayfail:${entry.id}:${entry.date}` });
  }

  /** The reference of the brand's latest scheduled motion film (a rotation never repeats it straight away; a video film has none, Phase 11.8). */
  private lastScheduledStyle(brand: string): string | null {
    const row = this.d.db.prepare("SELECT request_json FROM jobs WHERE source = 'schedule' AND brand = ? AND workspace = 'motion' ORDER BY created_at DESC LIMIT 1").get(brand) as { request_json: string } | undefined;
    if (!row) return null;
    try { return (JSON.parse(row.request_json) as { references: string[] }).references[0] ?? null; } catch { return null; }
  }

  /** The visual style of the brand's latest video film (`scheduled`: only the scheduler's own), or null. */
  private lastVideoStyle(brand: string, scheduled: boolean): string | null {
    const row = this.d.db.prepare(`SELECT request_json FROM jobs WHERE workspace = 'video' AND brand = ?${scheduled ? " AND source = 'schedule'" : ''} ORDER BY created_at DESC LIMIT 1`).get(brand) as { request_json: string } | undefined;
    if (!row) return null;
    try { return (JSON.parse(row.request_json) as { style: string | null }).style ?? null; } catch { return null; }
  }

  /** What a video day may take (Phase 11.8 task 3): the styles the job route would accept for this brand, and the brand's last ones. */
  private videoStyleContext(brand: string) {
    const root = this.d.config.paths.styles;
    let colours: string[] = [];
    try {
      const tokens = path.join(brandDir(this.d.config.paths, brand), 'tokens.json');
      if (fs.existsSync(tokens)) colours = colourNamesOf(JSON.parse(fs.readFileSync(tokens, 'utf8')));
    } catch { /* no colour names: the style text is checked without them */ }
    const styles = listStyles(root);
    const usable = styles.filter((s) => styleProblem(root, s.slug, colours) === null).map((s) => s.slug);
    return { usable, lastUsed: this.lastVideoStyle(brand, false), lastScheduled: this.lastVideoStyle(brand, true), libraryDefault: defaultStyle(styles) };
  }

  /** The calendar day of a scheduled job follows the job's status. */
  private syncDay(slug: string): void {
    try {
      const dir = jobDir(this.d.config.paths.jobs, slug);
      const req = readRequest(dir);
      if (!req.calendar_entry_id) return;
      const entry = calendarRepo.get(this.d.db, req.calendar_entry_id);
      if (!entry || entry.job_id !== req.id) return;
      const state = readState(dir);
      // A video film whose script waits for «قبول متن» or «یک دور دیگر» (D77) shows «منتظر شما» (Phase 11.8); the motion mapping is unchanged.
      const status = scheduledQuotaBlock(dir) && this.retries()[slug] ? 'queued' : req.workspace === 'video' && isRoundsBlock(dir, state) ? 'awaiting_approval' : calendarStatusFor(state.status);
      if (entry.status !== status && entry.status !== 'skipped') calendarRepo.upsert(this.d.db, { ...entry, status });
    } catch { /* a job folder that cannot be read leaves its day as it is */ }
  }

  /**
   * The queue tells only when a film starts and ends; the job turns «running» (and awaits approval, or holds) inside its run.
   * Each tick refreshes the days whose film is still on its way.
   */
  private syncActiveDays(): void {
    const rows = this.d.db.prepare(`SELECT j.slug FROM calendar c JOIN jobs j ON j.id = c.job_id
                                    WHERE c.status IN ('queued', 'running', 'awaiting_approval')`).all() as { slug: string }[];
    for (const r of rows) this.syncDay(r.slug);
  }

  /** Windows stays awake while a film is being made or waits in the queue, and while one waits for a quota reset that is near (D78). */
  private syncAwake(): void {
    const r = this.d.runner;
    if (r.running() !== null || r.queued().length > 0 || this.quotaResetNear(this.now().getTime())) this.d.keepAwake.hold();
    else this.d.keepAwake.release();
  }

  /**
   * True when a quota-paused job has a known reset time at most QUOTA_AWAKE_MAX_MS ahead (D78): asleep, the computer would not continue
   * it at that time. A reset time that passed more than two ticks ago does not count: by then the job is running or was left for the owner.
   */
  private quotaResetNear(now: number): boolean {
    for (const row of jobsRepo.list(this.d.db, 'paused_quota')) {
      try {
        const s = readState(jobDir(this.d.config.paths.jobs, row.slug));
        if (s.status !== 'paused_quota' || !s.resume_at) continue;
        const wait = Date.parse(s.resume_at) - now;
        if (wait <= QUOTA_AWAKE_MAX_MS && wait > -2 * TICK_MS) return true;
      } catch { /* unreadable job: left for the owner */ }
    }
    return false;
  }

  private retries(): Record<string, Retry> { return settingsRepo.get<Record<string, Retry>>(this.d.db, RETRIES_KEY) ?? {}; }
  private saveRetries(r: Record<string, Retry>): void { settingsRepo.set(this.d.db, RETRIES_KEY, r); }

  /** After a scheduled job's run: a quota block waits 30 minutes and tries again (up to 6 h); anything else ends its retries. */
  private afterRun(slug: string): void {
    const dir = jobDir(this.d.config.paths.jobs, slug);
    const all = this.retries();
    if (!scheduledQuotaBlock(dir)) {
      if (all[slug]) { delete all[slug]; this.saveRetries(all); }
      this.syncDay(slug);
      return;
    }
    const now = this.now().getTime();
    const first = all[slug]?.first_at ?? new Date(now).toISOString();
    if (now - Date.parse(first) >= QUOTA_GIVE_UP_MS) { this.giveUp(slug, all); return; }
    const isFirst = !all[slug];
    all[slug] = { first_at: first, next_at: new Date(now + QUOTA_RETRY_MS).toISOString() };
    this.saveRetries(all);
    this.syncDay(slug);
    if (isFirst) {
      const date = this.dayOf(slug);
      this.d.notifier.notify({ kind: 'paused_quota', text: `سهمیه کافی نیست؛ ساخت فیلم ${date ? `روز ${jalaliText(date)} ` : ''}هر ۳۰ دقیقه دوباره امتحان می‌شود`, route: `/jobs/${slug}`, dedupe: `qretry:${slug}:${first}` });
    }
  }

  /** Scheduled jobs whose retry time has come run their preflight again; after 6 hours the day is skipped. */
  private retryQuotaBlocks(now: number): void {
    const all = this.retries();
    for (const [slug, r] of Object.entries(all)) {
      const dir = jobDir(this.d.config.paths.jobs, slug);
      if (!scheduledQuotaBlock(dir)) { delete all[slug]; this.saveRetries(all); continue; }
      if (now - Date.parse(r.first_at) >= QUOTA_GIVE_UP_MS) { this.giveUp(slug, all); continue; }
      if (Date.parse(r.next_at) > now || this.d.runner.isBusy(slug)) continue;
      this.log(`scheduler: quota retry of ${slug}`);
      this.d.runner.enqueue(slug, 'resume', (pause) => resumeJob(this.d.o, slug, false, pause));
    }
  }

  private giveUp(slug: string, all: Record<string, Retry>): void {
    delete all[slug];
    this.saveRetries(all);
    const date = this.dayOf(slug);
    try {
      const req = readRequest(jobDir(this.d.config.paths.jobs, slug));
      const entry = req.calendar_entry_id ? calendarRepo.get(this.d.db, req.calendar_entry_id) : undefined;
      if (entry && entry.job_id === req.id) calendarRepo.upsert(this.d.db, { ...entry, status: 'skipped' });
    } catch { /* nothing to mark */ }
    this.log(`scheduler: ${slug} skipped after 6 h of quota retries`);
    this.d.notifier.notify({ kind: 'skipped', text: `فیلم ${date ? `روز ${jalaliText(date)} ` : ''}ساخته نشد؛ سهمیه تا شش ساعت کافی نشد`, route: `/jobs/${slug}`, dedupe: `qskip:${slug}` });
  }

  private dayOf(slug: string): string | null {
    try {
      const req = readRequest(jobDir(this.d.config.paths.jobs, slug));
      return req.calendar_entry_id ? calendarRepo.get(this.d.db, req.calendar_entry_id)?.date ?? null : null;
    } catch { return null; }
  }

  /**
   * Jobs the plan's rate limit paused continue at the reset time, or after 30 minutes when it is not known (docs/09 Layer 2).
   * The reset time Claude gave can be wrong (2026-11-16: it said 19:50 UTC, the window was free by 17:30 UTC), so quota data
   * saved after the pause that shows room in the five-hour window continues the job at once.
   */
  private resumeQuotaPauses(now: number): void {
    const plan = readPlanStatus(this.d.config.paths.quotaStatus, now, this.d.config.cfg.quota.status_max_age_min);
    const planSavedAt = plan.fresh && plan.ageMin !== null ? now - plan.ageMin * 60000 : null;
    for (const row of jobsRepo.list(this.d.db, 'paused_quota')) {
      if (this.d.runner.isBusy(row.slug)) continue;
      try {
        const s = readState(jobDir(this.d.config.paths.jobs, row.slug));
        if (s.status !== 'paused_quota') continue;
        const at = s.resume_at ? Date.parse(s.resume_at) : Date.parse(s.updated_at) + PAUSE_RETRY_MS;
        const freedEarly = planSavedAt !== null && planSavedAt > Date.parse(s.updated_at) && plan.fiveHourPct !== null && plan.fiveHourPct < 100;
        if (at > now && !freedEarly) continue;
        this.log(`scheduler: ${row.slug} continues after the quota pause`);
        this.d.runner.enqueue(row.slug, 'resume', (pause) => resumeJob(this.d.o, row.slug, true, pause));
      } catch { /* unreadable job: left for the owner */ }
    }
  }
}
