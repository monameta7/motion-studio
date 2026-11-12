// Responsibility: when a scheduled film must start: exactly at the set time (start_at), or early enough to be ready by it (ready_by = the time minus the measured average build time of the last films, docs/08).
import type { Schedule } from '../contracts/index.js';
import { addDays } from './jalali.js';

/** Used before any film has finished on this machine (docs/08). It stands for the whole lead time, average and margin together. */
export const FALLBACK_LEAD_MINUTES = 75;
/** Added to a measured average so a slow day still finishes in time (docs/08). */
export const MARGIN_MINUTES = 15;

/** How long before the set time a ready_by film starts; null for start_at. `avgMinutes` is the average of the last five finished films. */
export function leadMinutes(schedule: Pick<Schedule, 'timing_mode'>, avgMinutes: number | null): number | null {
  if (schedule.timing_mode === 'start_at') return null;
  return avgMinutes === null ? FALLBACK_LEAD_MINUTES : Math.ceil(avgMinutes + MARGIN_MINUTES);
}

const toMinutes = (hhmm: string): number => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const pad = (n: number): string => String(n).padStart(2, '0');

/** Milliseconds of a wall-clock moment (`yyyy-mm-dd`, `HH:MM`) in `timeZone` (the app's zone, the computer's clock, D63; any zone works, daylight saving included). */
export function zonedMs(date: string, time: string, timeZone: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const wall = Date.UTC(y, m - 1, d, Number(time.slice(0, 2)), Number(time.slice(3, 5)));
  const offsetAt = (ms: number): number => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
    return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second)) - ms;
  };
  // Two rounds settle a moment near an offset change.
  let ms = wall - offsetAt(wall);
  ms = wall - offsetAt(ms);
  return ms;
}

/** The day and the clock time the film starts for a calendar day (a ready_by time early in the morning starts on the evening before). */
export function startMoment(date: string, schedule: Pick<Schedule, 'time' | 'timing_mode'>, avgMinutes: number | null): { date: string; time: string } {
  const lead = leadMinutes(schedule, avgMinutes) ?? 0;
  const total = toMinutes(schedule.time) - lead;
  const days = Math.floor(total / 1440);
  const inDay = total - days * 1440;
  return { date: addDays(date, days), time: `${pad(Math.floor(inDay / 60))}:${pad(inDay % 60)}` };
}
