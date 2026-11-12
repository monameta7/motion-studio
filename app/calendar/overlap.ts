// Responsibility: find other brands' schedules whose films start too close to one brand's film to share one Claude 5-hour quota window (Phase 8: each brand has its own automation).
import type { Schedule } from '../contracts/index.js';
import { startMoment } from './timing.js';

/**
 * Claude's plan window is 5 hours, and one film used ≈ 70 % of a Pro 5-hour window (Phase 0, docs/14 R2): two films that start
 * less than this apart on the same day may make the second one wait for the quota (it retries every 30 minutes, docs/09).
 */
export const QUOTA_GAP_MIN = 5 * 60;

const minutes = (hhmm: string): number => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** The clock time (HH:MM) a schedule's film starts, with the measured build time for «ready by» (same rule as the scheduler). */
export const startClock = (s: Schedule, avgMinutes: number | null): string => startMoment('2030-06-15', s, avgMinutes).time;

/**
 * The other brands' schedules that are on, share a run weekday with `target`, and start less than QUOTA_GAP_MIN before or after it
 * (clock times, across midnight too). Empty while `target` itself is off.
 */
export function nearbySchedules(target: Schedule, all: Schedule[], avgMinutes: number | null): { brand: string; start_time: string; gap_minutes: number }[] {
  if (!target.enabled) return [];
  const mine = minutes(startClock(target, avgMinutes));
  const out: { brand: string; start_time: string; gap_minutes: number }[] = [];
  for (const s of all) {
    if (s.brand === target.brand || !s.enabled || !s.weekdays.some((on, i) => on && target.weekdays[i])) continue;
    const clock = startClock(s, avgMinutes);
    const d = Math.abs(minutes(clock) - mine);
    const gap = Math.min(d, 1440 - d);
    if (gap < QUOTA_GAP_MIN) out.push({ brand: s.brand, start_time: clock, gap_minutes: gap });
  }
  return out.sort((a, b) => a.gap_minutes - b.gap_minutes);
}
