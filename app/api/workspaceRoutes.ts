// Responsibility: the endpoints of the sidebar workspace switch (D88, Phase 11.3): read the active workspace (with the video clip price, Phase 11.6, and whether the video workspace is still locked, Phase 11.9) and switch it.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { activeWorkspace, setActiveWorkspace } from '../workspace.js';
import { estimateClipUsd } from '../contracts/index.js';
import { TYPICAL_INPUT_TOKENS } from '../stages/clips/index.js';
import { isVideoUnlocked, openVideo } from '../video/unlock.js';
import { fail, type ApiContext } from './context.js';

const ActiveBody = z.strictObject({ workspace: z.enum(['motion', 'video']) });

export function workspaceRoutes(app: FastifyInstance, ctx: ApiContext): void {
  /** Phase 11.6: with the price of a video clip from config (D92), so New video says what a video job will spend before «شروع ساخت»; the daily cap of unattended films (D108) for the guide and `locked` (D91) for the switch (Phase 11.9). */
  app.get('/api/workspace', async () => {
    const v = ctx.config.cfg.video;
    return {
      active: activeWorkspace(ctx.db),
      video: { resolution: v.resolution, clip_usd: Math.round(estimateClipUsd(v, v.resolution, TYPICAL_INPUT_TOKENS) * 100) / 100, max_usd_per_film: v.max_usd_per_film, max_usd_per_day_unattended: v.max_usd_per_day_unattended, max_clips: v.max_clips_per_film, locked: !isVideoUnlocked(ctx.db) },
    };
  });

  /**
   * New video, Automation and the library item follow the switch; jobs already made keep their own workspace.
   * Phase 11.9 (D91): the video workspace opens only after the free Google Cloud check passes once on this install; until then the switch stays on motion and the answer names the missing step.
   */
  app.put('/api/workspace/active', async (request, reply) => {
    const body = ActiveBody.safeParse(request.body);
    if (!body.success) return fail(reply, 400, 'فضای کار انتخاب نشده (موشن یا ویدیو).');
    if (body.data.workspace === 'video') {
      const r = await openVideo(ctx.db, ctx.videoCheck);
      if (!r.ok) return reply.code(409).send({ error_fa: r.message_fa, lock: { step: r.step } });
    }
    return { active: setActiveWorkspace(ctx.db, body.data.workspace) };
  });
}
