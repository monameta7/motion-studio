// Responsibility: the schedule and style-rule endpoints of the Automation screen (docs/08 «Schedule», «Style rule»): read one brand's schedule in one workspace with the measured start time and the other films (other brands, or the brand's other workspace) that start too close to it, and change it with checks that give a Persian reason.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getSchedule, listSchedules, saveSchedule } from '../calendar/schedule.js';
import { nearbySchedules } from '../calendar/overlap.js';
import { leadMinutes, startMoment } from '../calendar/timing.js';
import { MOTION_STYLE_RULES, VIDEO_STYLE_RULES, slug, workspace, type Schedule, type Workspace } from '../contracts/index.js';
import { stageRunsRepo } from '../db/repositories.js';
import { activeBrandSlug, readBrand } from '../brands/index.js';
import { listStyles } from '../styles/index.js';
import { isCloudSession } from '../video/vertexClient.js';
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
    type: z.enum([...MOTION_STYLE_RULES, ...VIDEO_STYLE_RULES.filter((r) => r === 'manual' || r === 'last')]),
    weekday_map: z.partialRecord(weekdayKey, slug),
    rotation: z.array(slug).max(40),
    fixed: slug.nullable(),
  }),
  /** Which brand's schedule this change is for (Phase 8: each brand has its own); the screen sends the brand it shows, else the active brand. */
  brand: slug,
  /** Which of the brand's two schedules (Phase 11.8, Q38 b); left out = the motion one, as before. */
  workspace,
}).partial();
const Query = z.object({ brand: z.string().optional(), workspace: workspace.optional() });

/** D89: video films are made on the owner's PC only; the cloud session has no Google Cloud CLI. */
export const CLOUD_VIDEO_FA = 'ویدیو فقط روی کامپیوتر خودت ساخته می‌شود (در نشست ابری Google Cloud CLI نیست، D89)؛ اتوماسیون ویدیو را روی کامپیوتر خودت روشن کن.';

export function scheduleRoutes(app: FastifyInstance, ctx: ApiContext): void {
  const nameOf = (brand: string) => { try { return readBrand(ctx.config.paths, brand).name; } catch { return brand; } };
  /** Each workspace's own average (Phase 11.3, V25): a video schedule's start comes from the video films. */
  const avgOf = (ws: Workspace) => stageRunsRepo.avgJobMinutes(ctx.db, 5, ws);
  const view = (schedule: Schedule) => {
    const avg = avgOf(schedule.workspace);
    const start = startMoment('2030-06-15', schedule, avg);
    return {
      schedule, brand_name: nameOf(schedule.brand),
      avg_minutes: avg === null ? null : Math.round(avg), lead_minutes: leadMinutes(schedule, avg), start_time: start.time, start_previous_day: start.date !== '2030-06-15',
      /** Other films (other brands, or this brand's other workspace) that start less than 5 hours from this one: they may share one quota window (a warning, not a refusal). */
      nearby: nearbySchedules(schedule, listSchedules(ctx.db), avgOf).map((n) => ({ ...n, brand_name: nameOf(n.brand) })),
      // Phase 11.8 (D92 c, D108): the money caps a video schedule runs under.
      ...(schedule.workspace === 'video' ? { video: { max_usd_per_film: ctx.config.cfg.video.max_usd_per_film, max_usd_per_day_unattended: ctx.config.cfg.video.max_usd_per_day_unattended } } : {}),
    };
  };
  /** The brand a request names (it must exist: BrandError, 400), else the active brand. */
  const brandOf = (named: string | undefined) => (named ? readBrand(ctx.config.paths, named).slug : activeBrandSlug(ctx.db, ctx.config));

  app.get('/api/schedule', async (request, reply) => {
    try {
      const q = Query.parse(request.query);
      return view(getSchedule(ctx.db, brandOf(q.brand), q.workspace ?? 'motion'));
    } catch (e) { return sendError(reply, e); }
  });

  app.put('/api/schedule', async (request, reply) => {
    const body = Patch.safeParse(request.body);
    if (!body.success) return fail(reply, 400, body.error.issues[0]?.message ?? 'تنظیمات نامعتبر است.');
    let brand: string;
    try { brand = brandOf(body.data.brand); } catch (e) { return sendError(reply, e); }
    const ws = body.data.workspace ?? 'motion';
    const next: Schedule = { ...getSchedule(ctx.db, brand, ws), ...body.data, brand, workspace: ws };
    const rule = next.style_rule;
    if (!(ws === 'video' ? VIDEO_STYLE_RULES : MOTION_STYLE_RULES).some((r) => r === rule.type)) return fail(reply, 400, 'این قانون سبک برای این تقویم نیست.');
    if (next.enabled && !next.weekdays.some(Boolean)) return fail(reply, 400, 'حداقل یک روز برای اجرا انتخاب کن.');
    if (ws === 'video' && next.enabled && isCloudSession({ env: process.env, platform: process.platform })) return fail(reply, 400, CLOUD_VIDEO_FA);
    // A motion rule names library references; a video rule names visual styles that have their text (Phase 11.5).
    const library = new Set(ws === 'video'
      ? listStyles(ctx.config.paths.styles).filter((s) => s.text !== null).map((s) => s.slug)
      : listReferences(ctx.config.paths.refs).filter((r) => r.source === 'library').map((r) => r.slug));
    const named = [...(ws === 'video' ? [] : Object.values(rule.weekday_map)), ...rule.rotation, ...(rule.fixed ? [rule.fixed] : [])];
    if (named.some((s) => !library.has(s))) return fail(reply, 400, 'یکی از سبک‌های انتخاب‌شده در کتابخانه نیست.');
    // A rule that is not complete yet (a rotation without styles, «fixed» without one) is saved as it is, so the owner can pick them next;
    // until it is complete the day gets the suggestion (motion) or the last used style (video) (resolveStyle, resolveVideoStyle).
    const saved = view(saveSchedule(ctx.db, next));
    // The Windows entry opens the app 30 minutes before each film starts: keep it in step.
    void ctx.refreshAutostart().catch(() => undefined);
    return saved;
  });
}
