// Responsibility: the JobRequest and JobState contracts of docs/04 (request.json and state.json in every job folder).
import { z } from 'zod';
import { automationLevel, format, isoDateTime, sha256, slug, stageName, styleSource } from './common.js';
import { LEGACY_BRAND } from './brand.js';

/** An owner image (D42), copied by intake to `input/NN.<ext>`; `file` is relative to the job folder. */
export const Attachment = z.strictObject({
  file: z.string().regex(/^input\/\d{2}\.(png|jpg|webp)$/),
  original_name: z.string().min(1),
  sha256,
  bytes: z.number().int().positive(),
});
export type Attachment = z.infer<typeof Attachment>;

export const JobRequest = z.strictObject({
  id: z.uuid(),
  slug,
  created_at: isoDateTime,
  source: z.enum(['manual', 'schedule']),
  topic: z.string().trim().min(1),
  topic_note: z.string().nullable(),
  // D41, D42 (2026-10-27): older request files without them read as true / [] (docs/04).
  hook_writes_voice: z.boolean().default(true),
  attachments: z.array(Attachment).default([]),
  references: z.array(slug),
  format,
  automation_level: automationLevel,
  calendar_entry_id: z.uuid().nullable(),
  style_source: styleSource,
  // Phase 8: the brand the film is made for (`brand/<slug>/`), fixed when the job is created; older request files read as the v1 brand.
  brand: slug.default(LEGACY_BRAND),
});
export type JobRequest = z.infer<typeof JobRequest>;

export const JOB_STATUSES = ['queued', 'running', 'awaiting_approval', 'held', 'blocked', 'failed', 'paused_quota', 'interrupted', 'done', 'cancelled'] as const;
export const jobStatus = z.enum(JOB_STATUSES);
export type JobStatus = z.infer<typeof jobStatus>;

export const StageState = z.strictObject({
  status: z.enum(['pending', 'running', 'done', 'failed', 'skipped']),
  started_at: isoDateTime.nullable(),
  ended_at: isoDateTime.nullable(),
  outputs: z.array(z.string()),
  tokens: z.strictObject({ in: z.number().int().nonnegative(), out: z.number().int().nonnegative() }),
  cost_usd_est: z.number().nonnegative(),
});
export type StageState = z.infer<typeof StageState>;

export const JobError = z.strictObject({
  stage: z.string(),
  message_fa: z.string().min(1),
  detail: z.string(),
});

export const JobState = z.strictObject({
  status: jobStatus,
  stage: stageName.nullable(),
  attempt: z.number().int().min(1),
  started_at: isoDateTime.nullable(),
  updated_at: isoDateTime,
  resume_at: isoDateTime.nullable(),
  stages: z.partialRecord(stageName, StageState),
  error: JobError.nullable(),
  // D45: set only while `status` is `held`; older state files have no field and read as null.
  hold: z.strictObject({ requested_at: isoDateTime, stage: stageName, reason: z.literal('script_review') }).nullable().default(null),
});
export type JobState = z.infer<typeof JobState>;

/** The request flag `control/hold.json`, written by the UI or `npm run job -- --hold` and removed on continue (docs/04). */
export const HoldRequest = z.strictObject({ requested_at: isoDateTime, by: z.enum(['ui', 'cli']) });
export type HoldRequest = z.infer<typeof HoldRequest>;

/** `content/edits.json`: every owner edit of the script, in order (D45). */
export const ScriptEdits = z.strictObject({
  edits: z.array(z.strictObject({ at: isoDateTime, field: z.string().regex(/^(voice_lines|on_screen_texts)\[\d+\]\.text$/), old: z.string(), new: z.string().min(1) })),
});
export type ScriptEdits = z.infer<typeof ScriptEdits>;

/** `content/owner-decision.json`: the owner's answer to a script blocked below the truth gate (D77): accept it as it is, or allow more rounds. */
export const ContentDecision = z.strictObject({
  extra_rounds: z.number().int().min(0),
  accepted: z.strictObject({ at: isoDateTime, round: z.number().int().min(1), score: z.number() }).nullable(),
});
export type ContentDecision = z.infer<typeof ContentDecision>;

/** `content/script-edit.json`: the editable copy the owner fills in the CLI (docs/04). */
export const ScriptEditFile = z.strictObject({
  voice_lines: z.array(z.strictObject({ id: z.number().int().min(1), text: z.string().trim().min(1) })),
  on_screen_texts: z.array(z.strictObject({ index: z.number().int().min(0), text: z.string().trim().min(1) })),
});
export type ScriptEditFile = z.infer<typeof ScriptEditFile>;
