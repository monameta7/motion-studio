// Responsibility: read and write the owner's decision on a script blocked below the truth gate (D77): «قبول همین متن» or «یک دور دیگر».
import fs from 'node:fs';
import path from 'node:path';
import { ContentDecision, readJson, writeJson, type JobState } from '../../contracts/index.js';

/** The start of the content stage's `error.detail` when the rounds ran out below the gate (see the stage's last throw). */
export const ROUNDS_BLOCK_DETAIL = 'rounds=';

export const decisionFile = (dir: string) => path.join(dir, 'content', 'owner-decision.json');

const NONE: ContentDecision = { extra_rounds: 0, accepted: null };

/** The decision on disk, or "no decision" when the file is missing. An invalid file fails loudly (rule 9). */
export function readDecision(dir: string): ContentDecision {
  const f = decisionFile(dir);
  return fs.existsSync(f) ? readJson(f, ContentDecision) : { ...NONE };
}

export function writeDecision(dir: string, d: ContentDecision): ContentDecision {
  return writeJson(decisionFile(dir), ContentDecision, d);
}

/** True when the job stopped because the truth rounds ran out below the gate and its last package is on disk. */
export function isRoundsBlock(dir: string, state: JobState): boolean {
  return state.status === 'blocked' && state.error?.stage === 'content' && state.error.detail.startsWith(ROUNDS_BLOCK_DETAIL)
    && fs.existsSync(path.join(dir, 'content', 'package.json'));
}
