// Responsibility: the guide's API (Phase 10): read the tour and tip progress, mark a tour finished or skipped, mark a tip shown, and reset the tours.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { tipId, tourId } from '../contracts/guide.js';
import { markTip, markTour, readGuide, resetTours } from '../guide/index.js';
import type { ApiContext } from './context.js';

const TourBody = z.strictObject({ id: tourId, state: z.enum(['done', 'skipped']) });
const TipBody = z.strictObject({ id: tipId });

export function guideRoutes(app: FastifyInstance, ctx: ApiContext): void {
  app.get('/api/guide', async () => readGuide(ctx.db));

  app.post('/api/guide/tour', async (req, reply) => {
    const b = TourBody.safeParse(req.body);
    if (!b.success) return reply.code(400).send({ error_fa: 'درخواست راهنما درست نیست.' });
    return markTour(ctx.db, b.data.id, b.data.state);
  });

  app.post('/api/guide/tip', async (req, reply) => {
    const b = TipBody.safeParse(req.body);
    if (!b.success) return reply.code(400).send({ error_fa: 'درخواست راهنما درست نیست.' });
    return markTip(ctx.db, b.data.id);
  });

  app.post('/api/guide/reset', async () => resetTours(ctx.db));
}
