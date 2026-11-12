// Responsibility: read and write the plan's quota percentages (docs/09 Layer 3) and decide whether the budget allows a new job (docs/09 budget guard).
import fs from 'node:fs';
import path from 'node:path';
import type { AppConfig } from '../contracts/index.js';
import { APP_TIMEZONE } from '../calendar/zone.js';
import { faNum } from '../fa.js';

export interface PlanStatus {
  fresh: boolean;
  ageMin: number | null;
  fiveHourPct: number | null;
  sevenDayPct: number | null;
  fiveHourResetsAt: string | null;
}

const NO_STATUS: PlanStatus = { fresh: false, ageMin: null, fiveHourPct: null, sevenDayPct: null, fiveHourResetsAt: null };

/** Reads %USERPROFILE%\.claude\mahdiyar-quota.json written by the status line; any problem means "not fresh", never a crash. */
export function readPlanStatus(file: string, nowMs: number, maxAgeMin: number): PlanStatus {
  let j: { saved_at?: string; five_hour?: { used_percentage?: number; resets_at?: number } | null; seven_day?: { used_percentage?: number } | null };
  try { j = JSON.parse(fs.readFileSync(file, 'utf8')) as typeof j; } catch { return NO_STATUS; }
  const saved = j.saved_at ? Date.parse(j.saved_at) : NaN;
  if (Number.isNaN(saved)) return NO_STATUS;
  const ageMin = (nowMs - saved) / 60000;
  const five = j.five_hour ?? null;
  const resets = typeof five?.resets_at === 'number' ? five.resets_at * 1000 : null;
  // A window that has reset since the file was written is at 0 %, whatever the file says.
  const fiveExpired = resets !== null && resets <= nowMs;
  return {
    fresh: ageMin >= 0 && ageMin < maxAgeMin,
    ageMin,
    fiveHourPct: fiveExpired ? 0 : (typeof five?.used_percentage === 'number' ? five.used_percentage : null),
    sevenDayPct: typeof j.seven_day?.used_percentage === 'number' ? j.seven_day.used_percentage : null,
    fiveHourResetsAt: resets !== null && !fiveExpired ? new Date(resets).toISOString() : null,
  };
}

/** The plan's windows as Claude reports them with every answer (`rate_limit_event.unifiedWindows`): utilization 0–1, reset times in epoch seconds. */
export interface PlanWindows { fiveHour: number | null; fiveHourResetsAt: number | null; sevenDay: number | null; sevenDayResetsAt: number | null }

/**
 * Writes the quota file in the status line's format (D70): every Claude call of the app refreshes it, so it is fresh whenever the app
 * works, also when the owner uses Claude Code only inside VS Code (where no status line runs). Best effort: a write problem is ignored.
 */
export function writePlanStatus(file: string, w: PlanWindows, nowMs = Date.now()): void {
  if (w.fiveHour === null && w.sevenDay === null) return;
  const pct = (u: number | null) => (u === null ? undefined : Math.round(u * 1000) / 10);
  const body = {
    saved_at: new Date(nowMs).toISOString(),
    five_hour: w.fiveHour === null ? null : { used_percentage: pct(w.fiveHour), resets_at: w.fiveHourResetsAt ?? undefined },
    seven_day: w.sevenDay === null ? null : { used_percentage: pct(w.sevenDay), resets_at: w.sevenDayResetsAt ?? undefined },
    source: 'app',
  };
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(body));
    fs.renameSync(tmp, file);
  } catch { /* the next call tries again */ }
}

export interface BudgetInput {
  quota: AppConfig['quota'];
  plan: PlanStatus;
  /** Output tokens of app Claude calls in the last 5 h (Layer 1). */
  appTokens5h: number;
  /** Average output tokens of the last finished jobs; null before any job finished, which turns the token check off. */
  expectedJobTokens: number | null;
}

export function budgetGuard(b: BudgetInput): { ok: boolean; reasons_fa: string[] } {
  const reasons: string[] = [];
  const { quota, plan } = b;
  if (plan.fresh && plan.fiveHourPct !== null && plan.fiveHourPct > quota.max_5h_pct_to_start) {
    // Phase 10 novice walk: a blocked newcomer did not know when to try again; the reset time and the next step are added when known.
    const when = plan.fiveHourResetsAt ? ` سهمیه ساعت ${faNum(new Intl.DateTimeFormat('en-GB', { timeZone: APP_TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(plan.fiveHourResetsAt)))} آزاد می‌شود؛ بعد از آن «ادامه» را بزن.` : '';
    reasons.push(`سهمیه کافی نیست: ${faNum(Math.round(plan.fiveHourPct))}٪ از سهمیه‌ی پنج‌ساعته مصرف شده؛ شروع کار فقط تا ${faNum(quota.max_5h_pct_to_start)}٪ مجاز است.${when}`);
  }
  if (plan.fresh && plan.sevenDayPct !== null && plan.sevenDayPct > quota.max_7d_pct_to_start) {
    reasons.push(`سهمیه کافی نیست: ${faNum(Math.round(plan.sevenDayPct))}٪ از سهمیه‌ی هفتگی مصرف شده؛ شروع کار فقط تا ${faNum(quota.max_7d_pct_to_start)}٪ مجاز است.`);
  }
  if (quota.app_tokens_5h_budget !== null && b.expectedJobTokens !== null && b.appTokens5h + b.expectedJobTokens > quota.app_tokens_5h_budget) {
    reasons.push(`سهمیه کافی نیست: مصرف اپ در پنج ساعت گذشته (${faNum(b.appTokens5h)} توکن) به‌اضافه‌ی یک فیلم (${faNum(Math.round(b.expectedJobTokens))}) از بودجه‌ی ${faNum(quota.app_tokens_5h_budget)} توکن بیشتر می‌شود.`);
  }
  return { ok: reasons.length === 0, reasons_fa: reasons };
}
