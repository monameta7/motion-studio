// Responsibility: the style-suggestion endpoint of New video (docs/07): three library references for the topic the owner has typed, remembered for a while so the same text never costs a second call.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { activeBrandDir, activeBrandSlug } from '../brands/index.js';
import { usageRepo } from '../db/repositories.js';
import { decodedCandidates, suggestStyles, topicOnly, type SuggestResult } from '../suggest/index.js';
import { fail, type ApiContext } from './context.js';

const Body = z.strictObject({ topic: z.string().max(20000) });
const KEEP_MS = 30 * 60000;

export function suggestRoutes(app: FastifyInstance, ctx: ApiContext): void {
  const seen = new Map<string, { at: number; result: SuggestResult }>();

  app.post('/api/suggest', async (request, reply) => {
    const body = Body.safeParse(request.body);
    if (!body.success) return fail(reply, 400, 'متن موضوع نامعتبر است.');
    const key = topicOnly(body.data.topic);
    // The same text and the same library give the same answer; a new, edited or deleted reference starts afresh.
    const library = decodedCandidates(ctx.config.paths.refs).map((c) => `${c.slug}:${c.name_fa}:${c.use_fa}`).join('|');
    const hit = seen.get(`${library}\n${key}`);
    if (hit && Date.now() - hit.at < KEEP_MS && hit.result.source !== 'keywords') return hit.result;
    const brand = activeBrandSlug(ctx.db, ctx.config);
    const result = await suggestStyles(body.data.topic, {
      refsDir: ctx.config.paths.refs, brandDir: activeBrandDir(ctx.db, ctx.config), run: ctx.suggestRun,
      onUsage: (r) => usageRepo.insert(ctx.db, {
        job_id: null, brand, stage: 'suggest', model: r.model, tokens_in: r.usage.input_tokens, tokens_out: r.usage.output_tokens,
        cache_read: r.usage.cache_read_input_tokens, cache_write: r.usage.cache_creation_input_tokens, cost_usd_est: r.costUsdEst,
      }),
    });
    if (result.source === 'claude') seen.set(`${library}\n${key}`, { at: Date.now(), result });
    return result;
  });
}
