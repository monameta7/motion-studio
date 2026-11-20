// Responsibility: the calendar warnings for the screens and the bell (docs/08 «Warnings»), per brand (Phase 8) and per workspace (Phase 11.8): the banner data of one brand's calendar (automation off, topics running low) and the once-a-day «topics low» notification for every automation that is on.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { jalaliText } from '../calendar/import.js';
import { addDays } from '../calendar/jalali.js';
import { getSchedule, listSchedules } from '../calendar/schedule.js';
import { automationOff, topicsLow } from '../calendar/warnings.js';
import { calendarRepo } from '../db/repositories.js';
import { activeBrandSlug, readBrand } from '../brands/index.js';
import { localDate } from '../intake/index.js';
import { workspace as workspaceName, type Workspace } from '../contracts/index.js';
import { sendError, type ApiContext } from './context.js';

/** Every planned day from today on (a calendar is never planned further than this). */
const HORIZON_DAYS = 800;
const BrandQuery = z.object({ brand: z.string().optional(), workspace: workspaceName.optional() });

/** One brand's warnings in one workspace (default: the active brand, motion): that automation and its own calendar. */
export function warningState(ctx: ApiContext, brand: string = activeBrandSlug(ctx.db, ctx.config), ws: Workspace = 'motion') {
  const schedule = getSchedule(ctx.db, brand, ws);
  const today = localDate(new Date(), schedule.timezone);
  const ahead = calendarRepo.range(ctx.db, today, addDays(today, HORIZON_DAYS), brand, ws);
  return {
    today,
    schedule,
    automation_off: automationOff(schedule.enabled, ahead, today),
    // Running low only matters while automation is on: it is what feeds the schedule.
    topics_low: schedule.enabled ? topicsLow(ahead, today, schedule.topics_low_warning_days) : null,
  };
}

/** Tells the owner once a day, per brand whose automation is on, when its topics are running low (docs/09 «topics low»). */
export function checkWarnings(ctx: ApiContext): void {
  for (const s of listSchedules(ctx.db).filter((x) => x.enabled)) {
    const { today, topics_low: low } = warningState(ctx, s.brand, s.workspace);
    if (!low) continue;
    let name = s.brand;
    try { name = readBrand(ctx.config.paths, s.brand).name; } catch { /* shown by slug */ }
    // The motion texts and keys are the ones of Phase 8; the video calendar says so in its own.
    const video = s.workspace === 'video';
    const cal = video ? `تقویم ویدیوی «${name}»` : `تقویم «${name}»`;
    ctx.notifier.notify({
      kind: 'topics_low', route: '/automation', dedupe: `low:${s.brand}${video ? ':video' : ''}:${low.last_date ?? 'none'}:${today}`,
      text: low.last_date ? `موضوعات ${cal} تا ${jalaliText(low.last_date)} تمام می‌شود` : `موضوعی در ${cal} نمانده؛ موضوع تازه اضافه کن.`,
    });
  }
}

export function warningRoutes(app: FastifyInstance, ctx: ApiContext): void {
  app.get('/api/warnings', async (request, reply) => {
    try {
      const q = BrandQuery.parse(request.query);
      const { automation_off, topics_low } = warningState(ctx, q.brand ? readBrand(ctx.config.paths, q.brand).slug : undefined, q.workspace ?? 'motion');
      return { automation_off, topics_low };
    } catch (e) { return sendError(reply, e); }
  });
}
