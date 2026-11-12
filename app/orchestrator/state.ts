// Responsibility: the job state machine of docs/03: stage order, allowed status transitions, and the next stage to run.
import { STAGE_NAMES, type JobState, type JobStatus, type StageName } from '../contracts/index.js';

export const STAGE_ORDER: readonly StageName[] = STAGE_NAMES;

const TRANSITIONS: Record<JobStatus, readonly JobStatus[]> = {
  queued: ['running', 'held', 'cancelled'],
  running: ['running', 'awaiting_approval', 'held', 'blocked', 'failed', 'paused_quota', 'interrupted', 'done', 'cancelled'],
  awaiting_approval: ['running', 'held', 'cancelled'],
  // D45: the owner's hold; continue goes back to running.
  held: ['running', 'cancelled'],
  blocked: ['running', 'held', 'cancelled'],
  failed: ['running', 'held', 'cancelled'],
  paused_quota: ['running', 'held', 'cancelled'],
  interrupted: ['running', 'held', 'cancelled'],
  done: [],
  cancelled: [],
};

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: JobStatus, to: JobStatus): void {
  if (!canTransition(from, to)) throw new Error(`invalid job transition ${from} → ${to}`);
}

export function initialState(nowIso: string): JobState {
  return { status: 'queued', stage: null, attempt: 1, started_at: null, updated_at: nowIso, resume_at: null, stages: {}, error: null, hold: null };
}

/** The first stage, in order, that is not finished; null when the job has nothing left to run. */
export function nextStage(state: JobState): StageName | null {
  return STAGE_ORDER.find((s) => !['done', 'skipped'].includes(state.stages[s]?.status ?? 'pending')) ?? null;
}
