// Responsibility: whether a scheduled video film is still running with nobody touching it (its `control/unattended.json`, D108) and how much the app's ledger has spent today on such films, for the daily money cap of unattended films.
import fs from 'node:fs';
import path from 'node:path';
import { UnattendedMark, estimateClipUsd, type VideoConfig } from '../contracts/index.js';
import { readJson, writeJson } from '../contracts/io.js';
import type { Db } from '../db/db.js';
import { usageRepo } from '../db/repositories.js';
import { APP_TIMEZONE } from '../calendar/zone.js';
import { zonedMs } from '../calendar/timing.js';

export const unattendedFile = (dir: string): string => path.join(dir, 'control', 'unattended.json');

function read(dir: string): UnattendedMark | null {
  try { return readJson(unattendedFile(dir), UnattendedMark); } catch { return null; }
}

/** Written by the scheduler when it queues a calendar day's video film (never for a motion film or a film the owner starts). */
export function markUnattended(dir: string, now: Date): void {
  writeJson(unattendedFile(dir), UnattendedMark, { started_at: now.toISOString(), attended_at: null });
}

/** The owner acted on the job (continue, a script choice, a rebuild, keep): from now on it is the owner's film; the first time counts. */
export function markAttended(dir: string, now: Date): void {
  const m = read(dir);
  if (m && m.attended_at === null) writeJson(unattendedFile(dir), UnattendedMark, { ...m, attended_at: now.toISOString() });
}

export function isUnattended(dir: string): boolean {
  const m = read(dir);
  return m !== null && m.attended_at === null;
}

/** The app's day starts at midnight on the computer's clock (D63), as the calendar's «today» does. */
export function dayStartIso(nowMs: number): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(nowMs));
  return new Date(zonedMs(today, '00:00', APP_TIMEZONE)).toISOString();
}

/**
 * The ledger's dollars spent since today's midnight on clips of scheduled films while nobody had touched them (a request before the
 * owner's first action counts; one after it does not). `exceptSlug` leaves one film out (the film that asks counts its own spend itself).
 * Not counted: an attempt of another film that may have been charged but has no ledger row (`unknown`); such a film stops and asks the owner.
 */
export function unattendedSpentTodayUsd(db: Db, jobsRoot: string, nowMs: number, exceptSlug?: string): number {
  let sum = 0;
  const marks = new Map<string, UnattendedMark | null>();
  for (const r of usageRepo.scheduledClipRowsSince(db, dayStartIso(nowMs))) {
    if (r.slug === exceptSlug) continue;
    if (!marks.has(r.slug)) marks.set(r.slug, fs.existsSync(path.join(jobsRoot, r.slug)) ? read(path.join(jobsRoot, r.slug)) : null);
    const m = marks.get(r.slug);
    if (m && (m.attended_at === null || r.at < m.attended_at)) sum += r.cost_usd_est;
  }
  return sum;
}

/** The smallest paid step of a film: one clip at the configured resolution (the input tokens add about a cent). */
export const oneClipUsd = (cfg: VideoConfig): number => estimateClipUsd(cfg, cfg.resolution, 0);
