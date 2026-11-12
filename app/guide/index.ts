// Responsibility: read and change the guide progress (settings key `guide`, validated with its contract): mark a tour finished or skipped, mark a tip shown, or start the guide again from the beginning.
import type { Db } from '../db/db.js';
import { settingsRepo } from '../db/repositories.js';
import { GuideProgress, type TipId, type TourId } from '../contracts/guide.js';

export const GUIDE_KEY = 'guide';

const EMPTY: GuideProgress = { tours: {}, tips: {} };

/** A missing row is a fresh guide; a row that fails the contract fails loudly (rule 9). */
export function readGuide(db: Db): GuideProgress {
  const raw = settingsRepo.get<unknown>(db, GUIDE_KEY);
  return raw === undefined ? { tours: {}, tips: {} } : GuideProgress.parse(raw);
}

function write(db: Db, next: GuideProgress): GuideProgress {
  const valid = GuideProgress.parse(next);
  settingsRepo.set(db, GUIDE_KEY, valid);
  return valid;
}

export const markTour = (db: Db, id: TourId, state: 'done' | 'skipped'): GuideProgress => {
  const g = readGuide(db);
  return write(db, { ...g, tours: { ...g.tours, [id]: state } });
};

export const markTip = (db: Db, id: TipId): GuideProgress => {
  const g = readGuide(db);
  return write(db, { ...g, tips: { ...g.tips, [id]: true } });
};

/** «دیدن دوباره‌ی راهنما»: every tour opens again on its screen; tips stay shown (they belong to events, not to the guide). */
export const resetTours = (db: Db): GuideProgress => write(db, { ...readGuide(db), tours: { ...EMPTY.tours } });
