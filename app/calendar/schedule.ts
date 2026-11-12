// Responsibility: each brand's schedule setting (docs/08 defaults, Phase 8): read it from the settings table (key `schedule:<brand>`), or give the defaults when the owner has not set one yet; list the saved ones. Automation stays off until the owner turns it on.
import { APP_TIMEZONE } from './zone.js';
import { LEGACY_BRAND, Schedule } from '../contracts/index.js';
import type { Db } from '../db/db.js';
import { settingsRepo } from '../db/repositories.js';

/** Settings key of one brand's schedule. */
export const scheduleKey = (brand: string): string => `schedule:${brand}`;
/** The one schedule of v1 (before Phase 8); the 004 migration moves it to `schedule:mahdiyar`, this is only read as a fallback. */
const LEGACY_KEY = 'schedule';

/** The docs/08 defaults for `brand`'s schedule. */
export const defaultSchedule = (brand: string): Schedule => ({
  enabled: false,
  time: '17:00',
  timezone: APP_TIMEZONE,
  // Saturday … Friday: every day but Friday.
  weekdays: [true, true, true, true, true, true, false],
  timing_mode: 'ready_by',
  topic_mode: 'by_date',
  automation_level: 'full',
  missed_run: 'run_once',
  style_rule: { type: 'suggest', weekday_map: {}, rotation: [], fixed: null },
  topics_low_warning_days: 3,
  brand,
});

/** A saved value read as `brand`'s schedule (the key decides the brand), or null when it is not a valid schedule. */
function parse(saved: unknown, brand: string): Schedule | null {
  if (saved === null || typeof saved !== 'object') return null;
  const r = Schedule.safeParse({ ...saved, brand });
  // The zone is the app's (D63): a schedule saved with another zone (Tehran, before 2026-11-07) reads in the app's zone.
  return r.success ? { ...r.data, timezone: APP_TIMEZONE } : null;
}

/** `brand`'s schedule: its own saved one, else (only for the v1 brand) the pre-Phase 8 one, else the defaults (off). */
export function getSchedule(db: Db, brand: string): Schedule {
  const own = settingsRepo.get<unknown>(db, scheduleKey(brand));
  if (own !== undefined) return parse(own, brand) ?? defaultSchedule(brand);
  const legacy = brand === LEGACY_BRAND ? settingsRepo.get<unknown>(db, LEGACY_KEY) : undefined;
  return (legacy !== undefined ? parse(legacy, brand) : null) ?? defaultSchedule(brand);
}

export function saveSchedule(db: Db, schedule: Schedule): Schedule {
  const v = Schedule.parse(schedule);
  settingsRepo.set(db, scheduleKey(v.brand), v);
  return v;
}

/** Every brand's saved schedule (each brand runs its own automation; the scheduler looks at all of them). */
export function listSchedules(db: Db): Schedule[] {
  const out = new Map<string, Schedule>();
  for (const { key, value } of settingsRepo.withPrefix(db, 'schedule:')) {
    const brand = key.slice('schedule:'.length);
    const s = parse(value, brand);
    if (s) out.set(brand, s);
  }
  if (!out.has(LEGACY_BRAND)) {
    const legacy = settingsRepo.get<unknown>(db, LEGACY_KEY);
    const s = legacy !== undefined ? parse(legacy, LEGACY_BRAND) : null;
    if (s) out.set(LEGACY_BRAND, s);
  }
  return [...out.values()].sort((a, b) => a.brand.localeCompare(b.brand));
}
