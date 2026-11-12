// Responsibility: small typed read/write functions for each table, so no other module writes SQL.
import type { Db } from './db.js';
import { CalendarEntry, JobRequest, ReferenceMeta, type JobStatus, type StageName } from '../contracts/index.js';
import { pidAlive } from '../proc.js';

const now = () => new Date().toISOString();

export interface JobRow { id: string; slug: string; topic: string; format: string; source: string; status: string; stage: string | null; created_at: string; updated_at: string; request_json: string; brand: string }

export const jobsRepo = {
  insert(db: Db, req: JobRequest, status: JobStatus = 'queued'): void {
    db.prepare(`INSERT INTO jobs (id, slug, topic, format, source, status, stage, created_at, updated_at, request_json, brand)
                VALUES (@id, @slug, @topic, @format, @source, @status, NULL, @created_at, @updated_at, @request_json, @brand)`)
      .run({ id: req.id, slug: req.slug, topic: req.topic, format: req.format, source: req.source, status, created_at: req.created_at, updated_at: now(), request_json: JSON.stringify(req), brand: req.brand });
  },
  setStatus(db: Db, slug: string, status: JobStatus, stage: StageName | null): void {
    db.prepare('UPDATE jobs SET status = ?, stage = ?, updated_at = ? WHERE slug = ?').run(status, stage, now(), slug);
  },
  /** Archive entry (docs/03 S7): the delivered manifest on the job row. */
  setManifest(db: Db, slug: string, manifestJson: string): void {
    db.prepare('UPDATE jobs SET manifest_json = ?, updated_at = ? WHERE slug = ?').run(manifestJson, now(), slug);
  },
  bySlug(db: Db, slug: string): JobRow | undefined {
    return db.prepare('SELECT * FROM jobs WHERE slug = ?').get(slug) as JobRow | undefined;
  },
  slugExists(db: Db, slug: string): boolean {
    return db.prepare('SELECT 1 FROM jobs WHERE slug = ?').get(slug) !== undefined;
  },
  list(db: Db, status?: JobStatus): JobRow[] {
    return (status ? db.prepare('SELECT * FROM jobs WHERE status = ? ORDER BY created_at').all(status) : db.prepare('SELECT * FROM jobs ORDER BY created_at').all()) as JobRow[];
  },
};

/** `brand`: the job's brand, or for a call outside a job (suggestion, library read) the active brand (Phase 8). */
export interface UsageInput { job_id: string | null; brand: string; stage: string; model: string | null; tokens_in: number; tokens_out: number; cache_read: number; cache_write: number; cost_usd_est: number; at?: string }

export interface StageRun { job_slug: string; stage: StageName; attempt: number; status: string; started_at: string; ended_at: string; minutes: number }

export const stageRunsRepo = {
  insert(db: Db, r: StageRun): void {
    db.prepare(`INSERT INTO stage_runs (job_slug, stage, attempt, status, started_at, ended_at, minutes)
                VALUES (@job_slug, @stage, @attempt, @status, @started_at, @ended_at, @minutes)`).run(r);
  },
  /** Average wall minutes of the last `n` finished jobs (sum of their successful stage runs; failed or held runs include sleep/idle time); null before any job finished. Shown as «≈ X دقیقه». */
  avgJobMinutes(db: Db, n = 5): number | null {
    const rows = db.prepare(`SELECT SUM(r.minutes) AS m FROM stage_runs r JOIN jobs j ON j.slug = r.job_slug
                             WHERE j.status = 'done' AND r.status = 'done' GROUP BY r.job_slug ORDER BY MAX(r.ended_at) DESC LIMIT ?`).all(n) as { m: number }[];
    return rows.length ? rows.reduce((s, r) => s + r.m, 0) / rows.length : null;
  },
  /** Average minutes of each stage over its last `n` successful runs; stages never finished on this machine are missing. Used for «حدود X دقیقه مانده». */
  avgStageMinutes(db: Db, n = 5): Partial<Record<StageName, number>> {
    const rows = db.prepare(`SELECT stage, AVG(minutes) AS m FROM (
                               SELECT stage, minutes, ROW_NUMBER() OVER (PARTITION BY stage ORDER BY ended_at DESC) AS k FROM stage_runs WHERE status = 'done'
                             ) WHERE k <= ? GROUP BY stage`).all(n) as { stage: StageName; m: number }[];
    return Object.fromEntries(rows.map((r) => [r.stage, r.m]));
  },
  forJob(db: Db, slug: string): StageRun[] {
    return db.prepare('SELECT job_slug, stage, attempt, status, started_at, ended_at, minutes FROM stage_runs WHERE job_slug = ? ORDER BY id').all(slug) as StageRun[];
  },
};

export const usageRepo = {
  insert(db: Db, u: UsageInput): void {
    db.prepare(`INSERT INTO usage (job_id, brand, stage, at, model, tokens_in, tokens_out, cache_read, cache_write, cost_usd_est)
                VALUES (@job_id, @brand, @stage, @at, @model, @tokens_in, @tokens_out, @cache_read, @cache_write, @cost_usd_est)`).run({ ...u, at: u.at ?? now() });
  },
  /** Output tokens of every app Claude call since `sinceIso` (docs/09 Layer 1). */
  /** Tokens and cost of one job per Claude stage (every run, resumed ones included). */
  byJob(db: Db, jobId: string): { stage: string; tokens_in: number; tokens_out: number; cost_usd_est: number }[] {
    return db.prepare(`SELECT stage, SUM(tokens_in) AS tokens_in, SUM(tokens_out) AS tokens_out, SUM(cost_usd_est) AS cost_usd_est
                       FROM usage WHERE job_id = ? GROUP BY stage`).all(jobId) as { stage: string; tokens_in: number; tokens_out: number; cost_usd_est: number }[];
  },
  outputTokensSince(db: Db, sinceIso: string): number {
    return (db.prepare('SELECT COALESCE(SUM(tokens_out), 0) AS n FROM usage WHERE at >= ?').get(sinceIso) as { n: number }).n;
  },
  /** Average output tokens per finished job over the last `n` finished jobs; null before any job finished (budget check off). */
  avgOutputTokensPerJob(db: Db, n = 5): number | null {
    const rows = db.prepare(`SELECT SUM(u.tokens_out) AS t FROM usage u JOIN jobs j ON j.id = u.job_id
                             WHERE j.status = 'done' GROUP BY u.job_id ORDER BY MAX(u.at) DESC LIMIT ?`).all(n) as { t: number }[];
    return rows.length ? rows.reduce((s, r) => s + r.t, 0) / rows.length : null;
  },
};

export const settingsRepo = {
  get<T>(db: Db, key: string): T | undefined {
    const r = db.prepare('SELECT value_json FROM settings WHERE key = ?').get(key) as { value_json: string } | undefined;
    return r ? (JSON.parse(r.value_json) as T) : undefined;
  },
  /** Every setting whose key starts with `prefix` (for example each brand's `schedule:<brand>`). */
  withPrefix(db: Db, prefix: string): { key: string; value: unknown }[] {
    const rows = db.prepare('SELECT key, value_json FROM settings WHERE substr(key, 1, ?) = ? ORDER BY key').all(prefix.length, prefix) as { key: string; value_json: string }[];
    return rows.map((r) => ({ key: r.key, value: JSON.parse(r.value_json) as unknown }));
  },
  set(db: Db, key: string, value: unknown): void {
    db.prepare(`INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`).run(key, JSON.stringify(value), now());
  },
};

export const calendarRepo = {
  upsert(db: Db, e: CalendarEntry): void {
    const v = CalendarEntry.parse(e);
    // A day never moves to another brand: `brand` is written on insert only.
    db.prepare(`INSERT INTO calendar (id, date, topic, note, style_override, format, status, job_id, brand)
                VALUES (@id, @date, @topic, @note, @style_override, @format, @status, @job_id, @brand)
                ON CONFLICT(id) DO UPDATE SET date = excluded.date, topic = excluded.topic, note = excluded.note, style_override = excluded.style_override,
                  format = excluded.format, status = excluded.status, job_id = excluded.job_id`).run(v);
  },
  /** The days of one brand on `date`. */
  byDate(db: Db, date: string, brand: string): CalendarEntry[] {
    return (db.prepare('SELECT * FROM calendar WHERE date = ? AND brand = ?').all(date, brand) as unknown[]).map((r) => CalendarEntry.parse(r));
  },
  get(db: Db, id: string): CalendarEntry | undefined {
    const r = db.prepare('SELECT * FROM calendar WHERE id = ?').get(id);
    return r ? CalendarEntry.parse(r) : undefined;
  },
  /** One brand's entries from `from` to `to` (both included), by date. */
  range(db: Db, from: string, to: string, brand: string): CalendarEntry[] {
    return (db.prepare('SELECT * FROM calendar WHERE date >= ? AND date <= ? AND brand = ? ORDER BY date').all(from, to, brand) as unknown[]).map((r) => CalendarEntry.parse(r));
  },
  /** Days of one brand that already hold a topic that has not been skipped (each brand has its own calendar). */
  occupiedDates(db: Db, brand: string): Set<string> {
    return new Set((db.prepare("SELECT date FROM calendar WHERE status != 'skipped' AND brand = ?").all(brand) as { date: string }[]).map((r) => r.date));
  },
  delete(db: Db, id: string): void {
    db.prepare('DELETE FROM calendar WHERE id = ?').run(id);
  },
  /** Topics of one brand's films finished since `sinceDate` (a Gregorian day): its calendar's done days and its finished jobs, for the «too like» check. */
  doneTopicsSince(db: Db, sinceDate: string, brand: string): { topic: string; date: string }[] {
    const days = db.prepare("SELECT topic, date FROM calendar WHERE status = 'done' AND date >= ? AND brand = ?").all(sinceDate, brand) as { topic: string; date: string }[];
    const jobs = (db.prepare("SELECT topic, created_at FROM jobs WHERE status = 'done' AND created_at >= ? AND brand = ?").all(`${sinceDate}T00:00:00`, brand) as { topic: string; created_at: string }[]).map((r) => ({ topic: r.topic, date: r.created_at.slice(0, 10) }));
    return [...days, ...jobs];
  },
};

export const referencesRepo = {
  upsert(db: Db, meta: ReferenceMeta, readingSha256: string | null): void {
    const v = ReferenceMeta.parse(meta);
    db.prepare(`INSERT INTO "references" (slug, meta_json, reading_sha256, updated_at) VALUES (?, ?, ?, ?)
                ON CONFLICT(slug) DO UPDATE SET meta_json = excluded.meta_json, reading_sha256 = excluded.reading_sha256, updated_at = excluded.updated_at`)
      .run(v.slug, JSON.stringify(v), readingSha256, now());
  },
  get(db: Db, slug: string): { meta: ReferenceMeta; reading_sha256: string | null } | undefined {
    const r = db.prepare('SELECT meta_json, reading_sha256 FROM "references" WHERE slug = ?').get(slug) as { meta_json: string; reading_sha256: string | null } | undefined;
    return r ? { meta: ReferenceMeta.parse(JSON.parse(r.meta_json)), reading_sha256: r.reading_sha256 } : undefined;
  },
};

export type RatingItem = 'hook' | 'visual' | 'brand' | 'sync' | 'sound' | 'voice' | 'cover';

export const ratingsRepo = {
  insert(db: Db, jobId: string, item: RatingItem, score: number, note: string | null = null): void {
    db.prepare('INSERT INTO ratings (job_id, item, score, note, at) VALUES (?, ?, ?, ?, ?)').run(jobId, item, score, note, now());
  },
  forJob(db: Db, jobId: string): { item: RatingItem; score: number; note: string | null }[] {
    return db.prepare('SELECT item, score, note FROM ratings WHERE job_id = ? ORDER BY id').all(jobId) as { item: RatingItem; score: number; note: string | null }[];
  },
};

export class LockBusyError extends Error {
  constructor(public readonly holder: string) {
    super(`another job is running: ${holder}`);
    this.name = 'LockBusyError';
  }
}

/** One job at a time (docs/02 §7). A lock whose process is gone (crash, kill) is taken over. */
export const lockRepo = {
  acquire(db: Db, slug: string, pid: number = process.pid, isAlive: (pid: number) => boolean = pidAlive): void {
    db.transaction(() => {
      const cur = db.prepare('SELECT job_slug, pid FROM job_lock WHERE id = 1').get() as { job_slug: string; pid: number } | undefined;
      if (cur && cur.pid !== pid && isAlive(cur.pid)) throw new LockBusyError(cur.job_slug);
      db.prepare(`INSERT INTO job_lock (id, job_slug, pid, acquired_at) VALUES (1, ?, ?, ?)
                  ON CONFLICT(id) DO UPDATE SET job_slug = excluded.job_slug, pid = excluded.pid, acquired_at = excluded.acquired_at`).run(slug, pid, now());
    }).immediate();
  },
  release(db: Db, pid: number = process.pid): void {
    db.prepare('DELETE FROM job_lock WHERE id = 1 AND pid = ?').run(pid);
  },
  holder(db: Db): { job_slug: string; pid: number } | undefined {
    return db.prepare('SELECT job_slug, pid FROM job_lock WHERE id = 1').get() as { job_slug: string; pid: number } | undefined;
  },
};
