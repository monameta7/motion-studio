// Responsibility: the notification endpoints of the UI (docs/09): the bell list with its unread count, marking read, the sound setting, and a test notification; plus the listeners that turn a finished job and a nearly full quota into notifications.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { readRequest, readState, jobDir } from '../orchestrator/jobFolder.js';
import { outcomeNotice, quotaNotice, type Notifier } from '../notify/index.js';
import { readPlanStatus } from '../quota/index.js';
import { scheduledQuotaBlock } from '../scheduler/index.js';
import { fail, type ApiContext } from './context.js';
import { shortTitle } from './jobView.js';
import { FINISHED } from './runner.js';

const ReadBody = z.strictObject({ ids: z.array(z.number().int()).max(200).optional() });
const SoundBody = z.strictObject({ sound: z.boolean() });

/** The notification for a job whose work just ended, from its state file; nothing for a stop the owner asked for or an end that is not one. */
export function notifyJobOutcome(ctx: ApiContext, slug: string): void {
  try {
    const dir = jobDir(ctx.config.paths.jobs, slug);
    // A scheduled job the quota blocked is retried by the scheduler, which tells the owner itself (once, not every 30 minutes).
    if (scheduledQuotaBlock(dir)) return;
    const state = readState(dir);
    const n = outcomeNotice({
      slug, title: shortTitle(readRequest(dir).topic), status: state.status, stage: state.stage, updated_at: state.updated_at,
      reason_fa: state.error?.message_fa ?? null, resume_at: state.resume_at,
    });
    if (n) ctx.notifier.notify(n);
  } catch { /* a job folder that cannot be read has nothing to tell */ }
}

/** Looks at the plan's quota file and tells the owner once per window when the five-hour share is high. */
export function checkQuota(ctx: ApiContext, now = Date.now()): void {
  const plan = readPlanStatus(ctx.config.paths.quotaStatus, now, ctx.config.cfg.quota.status_max_age_min);
  const n = quotaNotice(plan.fiveHourPct, plan.fiveHourResetsAt, plan.fresh);
  if (n) ctx.notifier.notify(n);
}

export function notifyRoutes(app: FastifyInstance, ctx: ApiContext): void {
  const n: Notifier = ctx.notifier;
  ctx.runner.on(FINISHED, ({ slug, kind }: { slug: string; kind: string }) => { if (kind !== 'revise') notifyJobOutcome(ctx, slug); });

  app.get('/api/notifications', async () => ({ ...n.list(30), sound: n.soundOn() }));

  app.post('/api/notifications/read', async (request, reply) => {
    const b = ReadBody.safeParse(request.body ?? {});
    if (!b.success) return fail(reply, 400, 'درخواست نامعتبر است.');
    n.markRead(b.data.ids);
    return n.list(30);
  });

  app.put('/api/notifications/settings', async (request, reply) => {
    const b = SoundBody.safeParse(request.body);
    if (!b.success) return fail(reply, 400, 'مقدار نامعتبر است.');
    n.setSound(b.data.sound);
    return { sound: n.soundOn() };
  });

  /** A test notification, so the owner can see that toasts reach the screen. */
  app.post('/api/notifications/test', async () => {
    n.notify({ kind: 'test', text: 'این یک اعلان آزمایشی است.', route: '/settings', dedupe: `test:${Date.now()}` });
    return n.list(30);
  });
}
