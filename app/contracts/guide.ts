// Responsibility: the contract of the guide progress (Phase 10, docs/04): which screen tours were finished or skipped and which first-time tips were shown, kept in settings key `guide`.
import { z } from 'zod';

/** One tour per screen (D76 c): the six of the phase file plus a short one for each other screen. */
export const TOUR_IDS = ['new', 'progress', 'result', 'automation', 'library', 'settings', 'archive', 'jobs', 'brand', 'brand-new'] as const;
export const tourId = z.enum(TOUR_IDS);
export type TourId = z.infer<typeof tourId>;

/** First-time tips for events the app causes (D76 b: all three kinds of stopped job). */
export const TIP_IDS = ['quota_warning', 'scheduled_run', 'paused_quota', 'paused_owner', 'held'] as const;
export const tipId = z.enum(TIP_IDS);
export type TipId = z.infer<typeof tipId>;

export const GuideProgress = z.strictObject({
  tours: z.partialRecord(tourId, z.enum(['done', 'skipped'])),
  tips: z.partialRecord(tipId, z.literal(true)),
});
export type GuideProgress = z.infer<typeof GuideProgress>;
