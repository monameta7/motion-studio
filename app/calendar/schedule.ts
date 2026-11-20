// Responsibility: each brand's schedule setting per workspace (docs/08 defaults, Phase 8, Phase 11.8): read it from the settings table (motion key `schedule:<brand>`, video key `schedule:<brand>:video`), or give the defaults when the owner has not set one yet; list the saved ones. Automation stays off until the owner turns it on.
import { APP_TIMEZONE } from './zone.js';
import { LEGACY_BRAND, Schedule, type Workspace } from '../contracts/index.js';
import type { Db } from '../db/db.js';
import { settingsRepo } from '../db/repositories.js';

/**
 * Settings key of one brand's schedule in one workspace. The motion key is the one saved since Phase 8 (`schedule:<brand>`), so no saved
 * motion schedule moves or changes (D107); the video one is `schedule:<brand>:video` (Phase 11.8).
 */
export const scheduleKey = (brand: string, ws: Workspace = 'motion'): string => (ws === 'motion' ? `schedule:${brand}` : `schedule:${brand}:${ws}`);
/** The one schedule of v1 (before Phase 8); the 004 migration moves it to `schedule:mahdiyar`, this is only read as a fallback. */
const LEGACY_KEY = 'schedule';

/** The docs/08 defaults for `brand`'s schedule. A video schedule is off too, and takes the brand's last used visual style (Phase 11.8). */
export const defaultSchedule = (brand: string, ws: Workspace = 'motion'): Schedule => ({
  enabled: false,
  time: '17:00',
  timezone: APP_TIMEZONE,
  // Saturday … Friday: every day but Friday.
  weekdays: [true, true, true, true, true, true, false],
  timing_mode: 'ready_by',
  topic_mode: 'by_date',
  automation_level: 'full',
  missed_run: 'run_once',
  style_rule: { type: ws === 'video' ? 'last' : 'suggest', weekday_map: {}, rotation: [], fixed: null },
  topics_low_warning_days: 3,
  brand,
  workspace: ws,
});

/** A saved value read as `brand`'s schedule in `ws` (the key decides both), or null when it is not a valid schedule. */
function parse(saved: unknown, brand: string, ws: Workspace): Schedule | null {
  if (saved === null || typeof saved !== 'object') return null;
  const r = Schedule.safeParse({ ...saved, brand, workspace: ws });
  // The zone is the app's (D63): a schedule saved with another zone (Tehran, before 2026-11-07) reads in the app's zone.
  return r.success ? { ...r.data, timezone: APP_TIMEZONE } : null;
}

/** `brand`'s schedule in `ws`: its own saved one, else (only for the v1 brand's motion schedule) the pre-Phase 8 one, else the defaults (off). */
export function getSchedule(db: Db, brand: string, ws: Workspace = 'motion'): Schedule {
  const own = settingsRepo.get<unknown>(db, scheduleKey(brand, ws));
  if (own !== undefined) return parse(own, brand, ws) ?? defaultSchedule(brand, ws);
  const legacy = brand === LEGACY_BRAND && ws === 'motion' ? settingsRepo.get<unknown>(db, LEGACY_KEY) : undefined;
  return (legacy !== undefined ? parse(legacy, brand, ws) : null) ?? defaultSchedule(brand, ws);
}

export function saveSchedule(db: Db, schedule: Schedule): Schedule {
  const v = Schedule.parse(schedule);
  // A motion schedule is stored exactly as before Phase 11.8 (the key says the workspace); a video one keeps its field.
  const { workspace: ws, ...motion } = v;
  settingsRepo.set(db, scheduleKey(v.brand, ws), ws === 'motion' ? motion : v);
  return v;
}

/** Every brand's saved schedules, motion and video (each runs its own automation; the scheduler looks at all of them), by brand, motion first. */
export function listSchedules(db: Db): Schedule[] {
  const out = new Map<string, Schedule>();
  for (const { key, value } of settingsRepo.withPrefix(db, 'schedule:')) {
    const rest = key.slice('schedule:'.length);
    const [brand, ws] = rest.endsWith(':video') ? [rest.slice(0, -':video'.length), 'video' as const] : [rest, 'motion' as const];
    const s = parse(value, brand, ws);
    if (s) out.set(scheduleKey(brand, ws), s);
  }
  if (!out.has(scheduleKey(LEGACY_BRAND))) {
    const legacy = settingsRepo.get<unknown>(db, LEGACY_KEY);
    const s = legacy !== undefined ? parse(legacy, LEGACY_BRAND, 'motion') : null;
    if (s) out.set(scheduleKey(LEGACY_BRAND), s);
  }
  return [...out.values()].sort((a, b) => a.brand.localeCompare(b.brand) || a.workspace.localeCompare(b.workspace));
}
