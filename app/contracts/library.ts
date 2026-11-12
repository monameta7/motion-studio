// Responsibility: the reference-library and automation contracts of docs/04 (ReferenceMeta, reading.json, CalendarEntry, Schedule).
import { z } from 'zod';
import { automationLevel, format, isoDate, isoDateTime, sha256, slug } from './common.js';

export const ReferenceMeta = z.strictObject({
  slug,
  name_fa: z.string().min(1),
  use_fa: z.string(),
  tags: z.array(z.string()),
  group: z.enum(['type', 'ui', 'char', 'data', 'abs', 'edit', 'term', 'other']),
  duration: z.number().positive(),
  format,
  sha256,
  code_buildable_pct: z.number().min(0).max(100).nullable(),
  source: z.enum(['library', 'upload']),
  rights_note: z.string(),
  added_at: isoDateTime,
  last_used_at: isoDateTime.nullable(),
});
export type ReferenceMeta = z.infer<typeof ReferenceMeta>;

/**
 * motion-plan §3 owns the reading's body. The app requires the hash it was made from: the top-level `sha256` of docs/04, or
 * the skill's own `key.sha256` (the reading of `refs/mahdiyar-reel-01` uses that form); the reference stage writes the top-level one.
 */
export const ReferenceReading = z.looseObject({ sha256: sha256.optional(), key: z.looseObject({ sha256 }).optional() })
  .refine((r) => r.sha256 !== undefined || r.key !== undefined, { path: ['sha256'], message: 'sha256 is required (top level, or key.sha256)' });
export type ReferenceReading = z.infer<typeof ReferenceReading>;

export const CalendarEntry = z.strictObject({
  id: z.uuid(),
  date: isoDate,
  topic: z.string(),
  note: z.string().nullable(),
  style_override: slug.nullable(),
  format: format.nullable(),
  status: z.enum(['planned', 'queued', 'running', 'awaiting_approval', 'done', 'failed', 'skipped', 'empty']),
  job_id: z.uuid().nullable(),
  /** Phase 8: each brand has its own calendar; the 004 migration labels older days with the v1 brand. */
  brand: slug,
});
export type CalendarEntry = z.infer<typeof CalendarEntry>;

const weekdayKey = z.enum(['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri']);

export const Schedule = z.strictObject({
  enabled: z.boolean(),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  timezone: z.string().min(1),
  weekdays: z.array(z.boolean()).length(7),
  timing_mode: z.enum(['start_at', 'ready_by']),
  topic_mode: z.enum(['by_date', 'queue']),
  automation_level: automationLevel,
  missed_run: z.enum(['run_once', 'skip']),
  style_rule: z.strictObject({
    type: z.enum(['suggest', 'weekday', 'rotate', 'fixed']),
    weekday_map: z.partialRecord(weekdayKey, slug),
    rotation: z.array(slug),
    fixed: slug.nullable(),
  }),
  topics_low_warning_days: z.number().int().nonnegative(),
  /** Phase 8 (D74): the one schedule makes films for this brand, from this brand's calendar; set from the active brand when saved. */
  brand: slug,
});
export type Schedule = z.infer<typeof Schedule>;
