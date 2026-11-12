// Responsibility: the first-run wizard's API (/welcome, Phase 7): whether onboarding is done, marking it done, and the system check.
import type { FastifyInstance } from 'fastify';
import { onboardingDone, setOnboardingDone } from '../onboarding/index.js';
import type { ApiContext } from './context.js';

export function onboardingRoutes(app: FastifyInstance, ctx: ApiContext): void {
  /** A fresh profile has no `onboarding_done` row: the UI then opens /welcome. */
  app.get('/api/onboarding', async () => ({ done: onboardingDone(ctx.db) }));

  app.post('/api/onboarding/done', async () => {
    setOnboardingDone(ctx.db, true);
    return { done: true };
  });

  app.get('/api/system-check', async () => ctx.systemCheck());
}
