// Responsibility: create a job's folder layout and read and write its request.json and state.json, always through the contracts.
import fs from 'node:fs';
import path from 'node:path';
import { JobRequest, JobState, readJson, writeJson, type JobRequest as JobRequestT, type JobState as JobStateT } from '../contracts/index.js';
import { initialState } from './state.js';

export const JOB_SUBDIRS = ['content', 'voice', 'plan', 'project', 'out', 'logs'] as const;

export const jobDir = (jobsRoot: string, slug: string): string => path.join(jobsRoot, slug);
export const requestFile = (dir: string): string => path.join(dir, 'request.json');
export const stateFile = (dir: string): string => path.join(dir, 'state.json');

export function createJobFolder(jobsRoot: string, req: JobRequestT, nowIso: string = new Date().toISOString()): string {
  const dir = jobDir(jobsRoot, req.slug);
  if (fs.existsSync(dir)) throw new Error(`job folder already exists: ${dir}`);
  for (const sub of JOB_SUBDIRS) fs.mkdirSync(path.join(dir, sub), { recursive: true });
  writeJson(requestFile(dir), JobRequest, req);
  writeJson(stateFile(dir), JobState, initialState(nowIso));
  return dir;
}

export const readRequest = (dir: string): JobRequestT => readJson(requestFile(dir), JobRequest);
export const readState = (dir: string): JobStateT => readJson(stateFile(dir), JobState);

export function writeState(dir: string, state: JobStateT, nowIso: string = new Date().toISOString()): JobStateT {
  return writeJson(stateFile(dir), JobState, { ...state, updated_at: nowIso });
}

/** Slugs of every folder under jobs/ that has a state.json. */
export function listJobSlugs(jobsRoot: string): string[] {
  if (!fs.existsSync(jobsRoot)) return [];
  return fs.readdirSync(jobsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(stateFile(path.join(jobsRoot, d.name))))
    .map((d) => d.name);
}
