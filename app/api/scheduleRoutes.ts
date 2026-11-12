// Responsibility: the schedule and style-rule endpoints of the Automation screen (docs/08 «Schedule», «Style rule»): read one brand's schedule with the measured start time and the other brands' films that start too close to it, and change it with checks that give a Persian reason.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getSchedule, listSchedules, saveSchedule } from '../calendar/schedule.js';
import { nearbySchedules } from '../calendar/overlap.js';
import { leadMinutes, startMoment } from '../calendar/timing.js';
import { slug, type Schedule } from '../contracts/index.js';
import { stageRunsRepo } from '../db/repositories.js';
import { activeBrandSlug, readBrand } from '../brands/index.js';
import { fail, sendError, type ApiContext } from './context.js';
import { listReferences } from './libraryRoutes.js';

const weekdayKey = z.enum(['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri']);
/** What the screen changes; the missed-run policy, the topic mode and the automation level keep their defaults (D60). */
const Patch = z.strictObject({
  enabled: z.boolean(),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'ساعت را مثل ۰۸:۳۰ بنویس.'),
  weekdays: z.array(z.boolean()).length(7, 'روزهای هفته نامعتبر است.'),
  timing_mode: z.enum(['start_at', 'ready_by']),
  style_rule: z.strictObject({
    type: z.enum(['suggest', 'weekday', 'rotate', 'fixed']),
    weekday_map: z.partialRecord(weekdayKey, slug),
    rotation: z.array(slug).max(40),
    fixed: slug.nullable(),
  }),
  /** Which brand's schedule this change is for (Phase 8: each brand has its own); the screen sends the brand it shows, else the active brand. */
  brand: slug,
}).partial();
const BrandQuery = z.object({ brand: z.string().optional() });

export function scheduleRoutes(app: FastifyInstance, ctx: ApiContext): void {
  const nameOf = (brand: string) => { try { return readBrand(ctx.config.paths, brand).name; } catch { return brand; } };
  const view = (schedule: Schedule) => {
    const avg = stageRunsRepo.avgJobMinutes(ctx.db, 5);
    const start = startMoment('2030-06-15', schedule, avg);
    return {
      schedule, brand_name: nameOf(schedule.brand),
      avg_minutes: avg === null ? null : Math.round(avg), lead_minutes: leadMinutes(schedule, avg), start_time: start.time, start_previous_day: start.date !== '2030-06-15',
      /** Other brands' films that start less than 5 hours from this one: they may share one quota window (a warning, not a refusal). */
      nearby: nearbySchedules(schedule, listSchedules(ctx.db), avg).map((n) => ({ ...n, brand_name: nameOf(n.brand) })),
    };
  };
  /** The brand a request names (it must exist: BrandError, 400), else the active brand. */
  const brandOf = (named: string | undefined) => (named ? readBrand(ctx.config.paths, named).slug : activeBrandSlug(ctx.db, ctx.config));

  app.get('/api/schedule', async (request, reply) => {
    try { return view(getSchedule(ctx.db, brandOf(BrandQuery.parse(request.query).brand))); } catch (e) { return sendError(reply, e); }
  });

  app.put('/api/schedule', async (request, reply) => {
    const body = Patch.safeParse(request.body);
    if (!body.success) return fail(reply, 400, body.error.issues[0]?.message ?? 'تنظیمات نامعتبر است.');
    let brand: string;
    try { brand = brandOf(body.data.brand); } catch (e) { return sendError(reply, e); }
    const next: Schedule = { ...getSchedule(ctx.db, brand), ...body.data, brand };
    const library = new Set(listReferences(ctx.config.paths.refs).filter((r) => r.source === 'library').map((r) => r.slug));
    const rule = next.style_rule;
    if (next.enabled && !next.weekdays.some(Boolean)) return fail(reply, 400, 'حداقل یک روز برای اجرا انتخاب کن.');
    const named = [...Object.values(rule.weekday_map), ...rule.rotation, ...(rule.fixed ? [rule.fixed] : [])];
    if (named.some((s) => !library.has(s))) return fail(reply, 400, 'یکی از سبک‌های انتخاب‌شده در کتابخانه نیست.');
    // A rule that is not complete yet (a rotation without styles, «fixed» without one) is saved as it is, so the owner can pick them next;
    // until it is complete the day gets the suggestion (resolveStyle).
    const saved = view(saveSchedule(ctx.db, next));
    // The Windows entry opens the app 30 minutes before each brand's film starts: keep it in step.
    void ctx.refreshAutostart().catch(() => undefined);
    return saved;
  });
}
