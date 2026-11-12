// Responsibility: tell the owner what happened (docs/09): store every event for the bell list, show a Windows toast while the app runs (clicking it opens the related screen), and write the Persian texts of the events.
import { APP_TIMEZONE } from '../calendar/zone.js';
import type { Db } from '../db/db.js';
import { settingsRepo } from '../db/repositories.js';
import { faNum } from '../fa.js';

export type NotifyKind = 'job_done' | 'blocked' | 'failed' | 'paused_quota' | 'quota_warning' | 'topics_low' | 'missed_run' | 'skipped' | 'test';
export const APP_ID = 'Mahdiyar.MotionStudio';
export const TOAST_TITLE = 'استودیو محتوا';

export interface NotifyInput {
  kind: NotifyKind;
  text: string;
  /** The screen it opens, as a hash route: `/jobs/<slug>`, `/automation`, `/new`. */
  route: string;
  /** One row per key: the same event is never told twice (a restart, a repeated check). */
  dedupe?: string;
}
export interface NotificationRow { id: number; at: string; kind: NotifyKind; text: string; route: string; read: boolean }

/** How a toast ended: `activate` is a click. Null where toasts are not available. */
export type ToastResult = 'activate' | 'dismissed' | 'timedout' | 'hidden' | 'failed' | null;
export type ToastFn = (t: { title: string; message: string; sound: boolean }) => Promise<ToastResult>;

export interface NotifierDeps {
  db: Db;
  /** Absent in tests and on other systems: the bell still works. */
  toast?: ToastFn | null;
  /** Opens a route of the app in the browser (a toast click). */
  open?: (route: string) => void;
  now?: () => Date;
}

type Raw = { id: number; at: string; kind: string; text: string; route: string; read: number };
const rowOf = (r: Raw): NotificationRow => ({ ...r, kind: r.kind as NotifyKind, read: r.read === 1 });

export class Notifier {
  constructor(private readonly d: NotifierDeps) {}

  soundOn(): boolean { return settingsRepo.get<{ sound?: boolean }>(this.d.db, 'notifications')?.sound === true; }
  setSound(on: boolean): void { settingsRepo.set(this.d.db, 'notifications', { sound: on }); }

  /** Stores the event and shows its toast. Returns null when the same event was told before. */
  notify(n: NotifyInput): NotificationRow | null {
    const at = (this.d.now?.() ?? new Date()).toISOString();
    const res = this.d.db.prepare('INSERT OR IGNORE INTO notifications (at, kind, text, route, dedupe) VALUES (?, ?, ?, ?, ?)').run(at, n.kind, n.text, n.route, n.dedupe ?? null);
    if (res.changes === 0) return null;
    const row: NotificationRow = { id: Number(res.lastInsertRowid), at, kind: n.kind, text: n.text, route: n.route, read: false };
    void this.d.toast?.({ title: TOAST_TITLE, message: n.text, sound: this.soundOn() })
      // A click on the toast opens the screen; the owner has seen it, so it is read in the bell too.
      .then((r) => { if (r === 'activate') { this.markRead([row.id]); this.d.open?.(n.route); } })
      .catch(() => undefined);
    return row;
  }

  list(limit = 30): { items: NotificationRow[]; unread: number } {
    const items = (this.d.db.prepare('SELECT id, at, kind, text, route, read FROM notifications ORDER BY id DESC LIMIT ?').all(limit) as Raw[]).map(rowOf);
    const unread = (this.d.db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE read = 0').get() as { n: number }).n;
    return { items, unread };
  }

  /** Marks the given rows read, or all of them. */
  markRead(ids?: number[]): void {
    if (!ids) { this.d.db.prepare('UPDATE notifications SET read = 1 WHERE read = 0').run(); return; }
    const st = this.d.db.prepare('UPDATE notifications SET read = 1 WHERE id = ?');
    this.d.db.transaction(() => { for (const id of ids) st.run(id); })();
  }
}

const STAGE_FA: Record<string, string> = {
  preflight: 'بررسی اولیه', content: 'سناریو', voice: 'صدای گوینده', reference: 'خواندن مرجع', plan: 'نقشه‌ی صحنه‌ها', build: 'ساخت موشن', package: 'بسته‌ی خروجی',
};
export const stageFa = (s: string | null): string => (s ? STAGE_FA[s] ?? s : 'نامشخص');

/** Clock time in the app's zone (D63), Persian digits («۱۷:۳۰»). */
export const clockFa = (iso: string): string => faNum(new Intl.DateTimeFormat('en-GB', { timeZone: APP_TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)));

export interface JobOutcome { slug: string; title: string; status: string; stage: string | null; updated_at: string; reason_fa: string | null; resume_at: string | null }

/** The notification for how a job's run ended; null for states the owner caused or that are not an end (paused, held, queued). */
export function outcomeNotice(j: JobOutcome): NotifyInput | null {
  const route = `/jobs/${j.slug}`;
  const dedupe = `job:${j.slug}:${j.status}:${j.updated_at}`;
  if (j.status === 'done') return { kind: 'job_done', text: `ویدیو آماده است: ${j.title}`, route, dedupe };
  if (j.status === 'blocked') return { kind: 'blocked', text: `کار متوقف شد: ${j.reason_fa ?? 'کار تو لازم است'}`, route, dedupe };
  if (j.status === 'failed') return { kind: 'failed', text: `خطا در مرحله‌ی ${stageFa(j.stage)}`, route, dedupe };
  if (j.status === 'paused_quota') return { kind: 'paused_quota', text: `سهمیه پر شد؛ ادامه از ${j.resume_at ? clockFa(j.resume_at) : 'بعد'}`, route, dedupe };
  return null;
}

/** The five-hour quota warning, once per window (docs/09 «quota warning»). */
export const QUOTA_WARN_PCT = 80;
export function quotaNotice(fiveHourPct: number | null, resetsAt: string | null, fresh: boolean): NotifyInput | null {
  if (!fresh || fiveHourPct === null || fiveHourPct < QUOTA_WARN_PCT) return null;
  return { kind: 'quota_warning', text: `سهمیه‌ی پنج‌ساعته به ${faNum(Math.round(fiveHourPct))}٪ رسید`, route: '/new', dedupe: `quota5h:${resetsAt ?? 'window'}` };
}
