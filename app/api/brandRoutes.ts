// Responsibility: the brand endpoints of the sidebar switcher (Phase 8): the list of brands with the active one, switching the active brand, and each brand's logo.
import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { activeBrand, listBrands, readBrand, setActiveBrand, type Brand } from '../brands/index.js';
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

  app.get<{ Params: { slug: string } }>('/api/brands/:slug/logo.png', async (request, reply) => {
    let b: Brand;
    try { b = readBrand(ctx.config.paths, request.params.slug); } catch { return fail(reply, 404, 'برند پیدا نشد.'); }
    const logo = logoOf(b.dir);
    if (!logo) return fail(reply, 404, 'این برند لوگو ندارد.');
    return reply.header('Cache-Control', 'max-age=60').sendFile(logo, b.dir);
  });
}
