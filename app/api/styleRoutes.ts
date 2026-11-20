// Responsibility: the visual styles endpoints of the video workspace (Phase 11.5): list with the New video default and the trash, the card picture, add, edit, delete to styles/_trash and restore.
import path from 'node:path';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { StyleMeta } from '../contracts/index.js';
import { readRequest } from '../orchestrator/jobFolder.js';
import { MAX_CARD_BYTES, StyleError, addStyle, cardFile, defaultStyle, deleteStyle, listStyles, restoreStyle, trashEntries, updateStyle } from '../styles/index.js';
import { fail, sendError, type ApiContext } from './context.js';

export interface StyleCard extends Pick<StyleMeta, 'slug' | 'title' | 'text' | 'image_sha256' | 'source' | 'last_used_at'> {
  /** A film that runs or waits uses this style: it cannot be deleted now. */
  in_use: boolean;
}

/** The form of add and edit: title, text and (for add, required) one picture. */
async function readForm(request: FastifyRequest): Promise<{ title: string; text: string; picture: Buffer | null }> {
  if (!request.isMultipart()) throw new StyleError('فرم سبک فرستاده نشد.');
  const f: Record<string, string> = {};
  let picture: Buffer | null = null;
  try {
    for await (const part of request.parts({ limits: { fileSize: MAX_CARD_BYTES + 1, files: 1 } })) {
      if (part.type === 'field') { f[part.fieldname] = String(part.value); continue; }
      picture = await part.toBuffer();
    }
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === 'FST_REQ_FILE_TOO_LARGE') throw new StyleError('تصویر سبک بزرگ‌تر از ۵ مگابایت است.');
    if (code === 'FST_FILES_LIMIT') throw new StyleError('برای هر سبک یک تصویر.');
    throw e;
  }
  return { title: f.title ?? '', text: f.text ?? '', picture };
}

export function styleRoutes(app: FastifyInstance, ctx: ApiContext): void {
  const root = () => ctx.config.paths.styles;
  /** Styles of the films that run or wait: they must stay as they are. */
  const inUse = (): Set<string> => new Set([ctx.runner.running(), ...ctx.runner.queued()].flatMap((job) => {
    if (!job) return [];
    try { const s = readRequest(path.join(ctx.config.paths.jobs, job)).style; return s ? [s] : []; } catch { return []; }
  }));
  const card = (m: StyleMeta, used: Set<string>): StyleCard => ({ slug: m.slug, title: m.title, text: m.text, image_sha256: m.image_sha256, source: m.source, last_used_at: m.last_used_at, in_use: used.has(m.slug) });
  const refused = (reply: Parameters<typeof fail>[0], e: unknown) => (e instanceof StyleError ? fail(reply, e.status, e.message) : sendError(reply, e));

  app.get('/api/styles', async () => {
    const styles = listStyles(root());
    const used = inUse();
    return { styles: styles.map((m) => card(m, used)), default: defaultStyle(styles), trash: trashEntries(root()) };
  });

  app.get<{ Params: { slug: string } }>('/api/styles/:slug/card', async (request, reply) => {
    const f = cardFile(root(), request.params.slug);
    if (!f) return fail(reply, 404, 'تصویر این سبک پیدا نشد.');
    // The page asks with ?v=<picture hash>, so a changed picture is a new address and the old one may be kept long.
    return reply.header('Cache-Control', 'max-age=86400').sendFile(path.basename(f), path.dirname(f));
  });

  app.post('/api/styles', async (request, reply) => {
    try {
      const f = await readForm(request);
      const m = addStyle(root(), { title: f.title, text: f.text, picture: f.picture ?? Buffer.alloc(0), source: 'user' });
      return reply.code(201).send(card(m, new Set()));
    } catch (e) { return refused(reply, e); }
  });

  app.put<{ Params: { slug: string } }>('/api/styles/:slug', async (request, reply) => {
    try {
      const f = await readForm(request);
      const used = inUse();
      if (used.has(request.params.slug)) throw new StyleError('این سبک همین الان در یک کار استفاده می‌شود؛ بعد از تمام شدنش ویرایشش کن.', 409);
      return card(updateStyle(root(), request.params.slug, { title: f.title, text: f.text, ...(f.picture ? { picture: f.picture } : {}) }), used);
    } catch (e) { return refused(reply, e); }
  });

  /** Delete = move to styles/_trash (the owner empties it himself, like refs/ and D85). */
  app.delete<{ Params: { slug: string } }>('/api/styles/:slug', async (request, reply) => {
    try {
      if (inUse().has(request.params.slug)) throw new StyleError('این سبک همین الان در یک کار استفاده می‌شود؛ بعد از تمام شدنش پاکش کن.', 409);
      return { ok: true, trash: deleteStyle(root(), request.params.slug) };
    } catch (e) { return refused(reply, e); }
  });

  app.post<{ Params: { name: string } }>('/api/styles/trash/:name/restore', async (request, reply) => {
    try { return card(restoreStyle(root(), request.params.name), inUse()); } catch (e) { return refused(reply, e); }
  });
}
