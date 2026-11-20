// Responsibility: choose the style of a scheduled day by the precedence of docs/08: the day's own style first, then the schedule's rule; a motion day gets a reference (suggest, weekday, rotate, fixed; a rule that cannot answer falls back to the suggestion), a video day a visual style (manual, last, rotate, fixed; Phase 11.8 task 3).
import type { CalendarEntry, Schedule } from '../contracts/index.js';
import type { Candidate } from '../suggest/index.js';
import { weekdayIndex } from './jalali.js';

export type StyleSource = 'day_override' | 'suggest' | 'weekday' | 'rotate' | 'fixed' | 'last';
export interface StyleChoice { slug: string; source: StyleSource }

export interface StyleContext {
  /** Decoded library references (only these can be chosen, D44). */
  library: Candidate[];
  now: number;
  /** The reference of the latest scheduled film; a rotation never repeats it straight away. */
  lastStyle: string | null;
  /** The suggestion for the day's topic, best first (Claude or the keyword rules); empty when none was asked. */
  suggested: string[];
}

const DAY_MS = 86400000;
const KEYS = ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'] as const;
export const weekdayKey = (iso: string): (typeof KEYS)[number] => KEYS[weekdayIndex(iso)]!;

/** «Excluding references used in the last 2 days» (docs/08). */
const usedLately = (c: Candidate, now: number): boolean => c.last_used_at !== null && now - Date.parse(c.last_used_at) < 2 * DAY_MS;

function bySuggestion(c: StyleContext): StyleChoice | null {
  const known = new Map(c.library.map((x) => [x.slug, x]));
  const fresh = (s: string) => known.has(s) && !usedLately(known.get(s)!, c.now);
  const hit = c.suggested.find(fresh);
  if (hit) return { slug: hit, source: 'suggest' };
  // Nothing suggested, or every suggestion was used lately: the library's least recently used reference.
  const rest = [...c.library].sort((a, b) => (a.last_used_at ? Date.parse(a.last_used_at) : -Infinity) - (b.last_used_at ? Date.parse(b.last_used_at) : -Infinity));
  const pick = rest.find((x) => !usedLately(x, c.now)) ?? rest[0];
  return pick ? { slug: pick.slug, source: 'suggest' } : null;
}

/** The next reference of a rotation after the last used one, never the same twice in a row unless it is the only one. */
export function nextInRotation(rotation: string[], last: string | null): string | null {
  if (rotation.length === 0) return null;
  const at = last === null ? -1 : rotation.lastIndexOf(last);
  for (let i = 1; i <= rotation.length; i++) {
    const s = rotation[(at + i) % rotation.length]!;
    if (s !== last) return s;
  }
  return rotation[0]!;
}

export function resolveStyle(entry: Pick<CalendarEntry, 'date' | 'style_override'>, schedule: Pick<Schedule, 'style_rule'>, c: StyleContext): StyleChoice | null {
  const known = new Set(c.library.map((x) => x.slug));
  if (entry.style_override && known.has(entry.style_override)) return { slug: entry.style_override, source: 'day_override' };
  const rule = schedule.style_rule;
  if (rule.type === 'weekday') {
    const s = rule.weekday_map[weekdayKey(entry.date)];
    if (s && known.has(s)) return { slug: s, source: 'weekday' };
  } else if (rule.type === 'rotate') {
    const s = nextInRotation(rule.rotation.filter((x) => known.has(x)), c.lastStyle);
    if (s) return { slug: s, source: 'rotate' };
  } else if (rule.type === 'fixed') {
    if (rule.fixed && known.has(rule.fixed)) return { slug: rule.fixed, source: 'fixed' };
  }
  return bySuggestion(c);
}

export interface VideoStyleContext {
  /** Visual styles that can start a job (in styles/ with their text, and none of the brand's colour names: app/styles styleProblem). */
  usable: string[];
  /** The style of the brand's latest video film, made by hand or by the schedule («last»). */
  lastUsed: string | null;
  /** The style of the brand's latest scheduled video film; a rotation never repeats it straight away. */
  lastScheduled: string | null;
  /** The library's style used last (any brand), else its first (styles defaultStyle): «last» before the brand has made a video film. */
  libraryDefault: string | null;
}

/**
 * A video day's visual style (Phase 11.8 task 3, like the reference rule): the day's own style; then `manual` = only the day's own (none:
 * null, the day is not made); `last` = the brand's last used style; `rotate` and `fixed` as for motion. A rotation or a fixed style that is
 * not complete yet (or names a style that cannot be used any more) falls back to `last`, as a motion rule falls back to the suggestion (D60 f).
 */
export function resolveVideoStyle(entry: Pick<CalendarEntry, 'style_override'>, schedule: Pick<Schedule, 'style_rule'>, c: VideoStyleContext): StyleChoice | null {
  const ok = new Set(c.usable);
  if (entry.style_override && ok.has(entry.style_override)) return { slug: entry.style_override, source: 'day_override' };
  const rule = schedule.style_rule;
  if (rule.type === 'manual') return null;
  if (rule.type === 'rotate') {
    const s = nextInRotation(rule.rotation.filter((x) => ok.has(x)), c.lastScheduled);
    if (s) return { slug: s, source: 'rotate' };
  } else if (rule.type === 'fixed') {
    if (rule.fixed && ok.has(rule.fixed)) return { slug: rule.fixed, source: 'fixed' };
  }
  const last = [c.lastUsed, c.libraryDefault].find((s): s is string => s !== null && ok.has(s)) ?? c.usable[0];
  return last ? { slug: last, source: 'last' } : null;
}
