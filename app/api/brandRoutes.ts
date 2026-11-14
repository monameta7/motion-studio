// Responsibility: the brand endpoints of the sidebar switcher (Phase 8): the list of brands with the active one, switching the active brand, each brand's logo, and deleting a brand (D85).
import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { activeBrand, listBrands, readBrand, setActiveBrand, trashBrand, type Brand } from '../brands/index.js';
import { getSchedule, saveSchedule } from '../calendar/schedule.js';
import { lockRepo } from '../db/repositories.js';
import { readRequest } from '../orchestrator/jobFolder.js';
import { fail, sendError, type ApiContext } from './context.js';

const ActiveBody = z.strictObject({ slug: z.string().min(1) });
/** A hand-made brand has logo.png; a brand made in «برند من» keeps the file the user uploaded (png, jpg or webp). */
const LOGO_FILES = ['logo.png', 'logo.jpg', 'logo.webp'];
const logoOf = (dir: string) => LOGO_FILES.find((f) => fs.existsSync(path.join(dir, f)));

export function brandRoutes(app: FastifyInstance, ctx: ApiContext): void {
  const card = (b: Brand) => ({ slug: b.slug, name: b.name, logo: logoOf(b.dir) !== undefined });
  const view = () => {
    const { brands } = listBrands(ctx.config.paths);
    let active: string | null = null;
    try { active = activeBrand(ctx.db, ctx.config).slug; } catch { /* no brand yet: the switcher says so */ }
    return { brands: brands.map(card), active };
  };

  app.get('/api/brands', async () => view());

  /** New films, the New video screen and the Automation screen work on the active brand; films already made keep their own. */
  app.put('/api/brands/active', async (request, reply) => {
    const body = ActiveBody.safeParse(request.body);
    if (!body.success) return fail(reply, 400, 'برند انتخاب نشده.');
    try { setActiveBrand(ctx.db, ctx.config, body.data.slug); return view(); } catch (e) { return sendError(reply, e); }
  });

  /** A brand that a film being made, waiting in the queue, or held by `npm run job` belongs to, or that is being built. */
  const brandInUse = (slug: string): boolean => {
    if (ctx.brandBuilder.status(slug)?.state === 'running') return true;
    const lock = lockRepo.holder(ctx.db)?.job_slug;
    return [ctx.runner.running(), ...ctx.runner.queued(), lock].some((job) => {
      if (!job) return false;
      try { return readRequest(path.join(ctx.config.paths.jobs, job)).brand === slug; } catch { return false; }
    });
  };

  /**
   * Delete (D85): the folder goes to brand/_trash; the owner's hand-made brand and the last brand are refused. Its automation is
   * turned off; its calendar days and its films stay (they come back if the folder is put back). When it was active, the app
   * picks the next brand itself.
   */
  app.delete<{ Params: { slug: string } }>('/api/brands/:slug', async (request, reply) => {
    const { slug } = request.params;
    let b: Brand;
    try { b = readBrand(ctx.config.paths, slug); } catch { return fail(reply, 404, 'برند پیدا نشد.'); }
    if (!b.registered) return fail(reply, 409, 'این برند فایل‌های دست‌ساز مالک است و حذف نمی‌شود.');
    if (listBrands(ctx.config.paths).brands.length <= 1) return fail(reply, 409, 'این تنها برند است؛ اول یک برند دیگر بساز، بعد این را حذف کن.');
    if (brandInUse(slug)) return fail(reply, 409, 'با این برند همین الان فیلم یا برند ساخته می‌شود؛ بعد از تمام شدنش حذفش کن.');
    try {
      const wasActive = activeBrand(ctx.db, ctx.config).slug === slug;
      const schedule = getSchedule(ctx.db, slug);
      if (schedule.enabled) saveSchedule(ctx.db, { ...schedule, enabled: false });
      trashBrand(ctx.config.paths, slug);
      // The picked brand is gone: activeBrand falls back (default, then the oldest); that choice is saved.
      if (wasActive) setActiveBrand(ctx.db, ctx.config, activeBrand(ctx.db, ctx.config).slug);
      return view();
    } catch (e) { return sendError(reply, e); }
  });

  app.get<{ Params: { slug: string } }>('/api/brands/:slug/logo.png', async (request, reply) => {
    let b: Brand;
    try { b = readBrand(ctx.config.paths, request.params.slug); } catch { return fail(reply, 404, 'برند پیدا نشد.'); }
    const logo = logoOf(b.dir);
    if (!logo) return fail(reply, 404, 'این برند لوگو ندارد.');
    return reply.header('Cache-Control', 'max-age=60').sendFile(logo, b.dir);
  });
}
