// Responsibility: the «برند من» endpoints (Phase 9): the questionnaire, creating a brand, uploading its logo and fonts, the save preview and the background rebuild, hand-editing a doc, and the versions with their diffs and restore.
import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { BrandAnswers, BrandFile, REQUIRED_PATHS, type VersionMeta } from '../contracts/index.js';
import { brandDir, listBrands, readBrand, type Brand } from '../brands/index.js';
import { ensureFiles, normalizeFonts } from '../brandcore/assets.js';
import { planRebuild } from '../brandcore/build.js';
import { suggestPalette } from '../brandcore/colors.js';
import { CLAUDE_DOCS, DOC_FILES, DOC_TITLES, SECTIONS, SECTION_DOCS, SECTION_TITLES, type ClaudeDoc } from '../brandcore/questions.js';
import { docPath, handEditedDocs, listVersions, readAnswers, readBuild, restoreFiles, saveVersion, sha, versionDiff, writeBuild } from '../brandcore/store.js';
import { writeJson } from '../contracts/index.js';
import { imageKind } from '../intake/index.js';
import { safeName } from './uploads.js';
import { fail, sendError, type ApiContext } from './context.js';

const LOGO_MAX = 8 * 1024 * 1024;
const FONT_MAX = 12 * 1024 * 1024;
const READ_ONLY_FA = 'این برند فقط خواندنی است (فایل‌های دست‌ساز مالک است و تغییر نمی‌کند). برای برند خودت یک «برند تازه» بساز.';
const CreateBody = z.strictObject({ name: z.string().trim().min(1).max(60), name_en: z.string().trim().max(60).optional() });
const AnswersBody = z.strictObject({ answers: z.unknown(), include_edited: z.array(z.enum(CLAUDE_DOCS)).optional(), kind: z.enum(['create', 'save']).optional() });
const DocBody = z.strictObject({ text: z.string().max(400_000) });
const DOC = z.enum(CLAUDE_DOCS.filter((d) => d !== 'tokens') as ['brand-guide', 'design-system', 'cover-system']);

/** The plain-Persian name of an answer path like `audience.pains`. */
export function answerLabel(p: PropertyKey[]): string {
  const [sec, field] = p.map(String);
  const s = SECTIONS.find((x) => x.id === sec);
  if (!s) return String(sec);
  const q = s.questions.find((x) => x.id === field);
  const special: Record<string, string> = { logo: 'لوگو', colors: 'رنگ‌ها', persian_font: 'فونت فارسی', latin_font: 'فونت لاتین', outro_tagline: 'شعار لوگوموشن' };
  return `${s.title} ← ${q?.label ?? special[field ?? ''] ?? field ?? ''}`;
}

/** What an invalid set of answers lacks, in Persian (one line per field). */
export function missingAnswers(err: z.ZodError): string[] {
  const out = new Set<string>();
  for (const i of err.issues) out.add(answerLabel(i.path));
  return [...out];
}

const slugFrom = (name: string, taken: Set<string>): string => {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
  let slug = base && /^[a-z0-9]/.test(base) ? base : 'brand';
  if (!taken.has(slug)) return slug;
  for (let n = 2; ; n++) { const s = `${slug}-${n}`; if (!taken.has(s)) { slug = s; break; } }
  return slug;
};

const fontKind = (b: Buffer): boolean => {
  const h = b.subarray(0, 4).toString('latin1');
  return h === 'wOF2' || h === 'wOFF' || h === 'OTTO' || h === 'true' || (b[0] === 0 && b[1] === 1 && b[2] === 0 && b[3] === 0);
};

export function brandCoreRoutes(app: FastifyInstance, ctx: ApiContext): void {
  const paths = ctx.config.paths;
  const editable = (b: Brand) => b.registered;
  const load = (slug: string): Brand => readBrand(paths, slug);
  const docInfo = (dir: string, doc: ClaudeDoc, edited: Set<ClaudeDoc>) => {
    const f = doc === 'tokens' ? path.join(dir, 'tokens.json') : docPath(dir, doc);
    return { doc, title: DOC_TITLES[doc], file: DOC_FILES[doc], exists: fs.existsSync(f), hand_edited: edited.has(doc), editable: doc !== 'tokens' };
  };

  app.get('/api/brand-core/schema', async () => ({
    sections: SECTIONS, docs: CLAUDE_DOCS.map((d) => ({ doc: d, title: DOC_TITLES[d] })), section_docs: SECTION_DOCS, section_titles: SECTION_TITLES, required: REQUIRED_PATHS,
  }));

  /** A new brand: its folder and brand.json only; the answers, logo and fonts follow. */
  app.post('/api/brand-core', async (request, reply) => {
    const body = CreateBody.safeParse(request.body);
    if (!body.success) return fail(reply, 400, 'نام برند را بنویس (تا ۶۰ نویسه).');
    const taken = new Set(listBrands(paths).brands.map((b) => b.slug));
    // Folders that are not a usable brand also block their name.
    if (fs.existsSync(paths.brands)) for (const e of fs.readdirSync(paths.brands)) taken.add(e);
    const slug = slugFrom(body.data.name_en ?? '', taken);
    const dir = brandDir(paths, slug);
    fs.mkdirSync(dir, { recursive: true });
    writeJson(path.join(dir, 'brand.json'), BrandFile, { name: body.data.name, slug, created_at: new Date().toISOString() });
    return reply.code(201).send({ slug });
  });

  app.get<{ Params: { slug: string } }>('/api/brand-core/:slug', async (request, reply) => {
    try {
      const b = load(request.params.slug);
      const build = readBuild(b.dir);
      const edited = new Set(handEditedDocs(b.dir, build));
      return {
        slug: b.slug, name: b.name, editable: editable(b), answers: readAnswers(b.dir), built: build !== null,
        docs: CLAUDE_DOCS.map((d) => docInfo(b.dir, d, edited)), status: ctx.brandBuilder.status(b.slug),
        logo: ['png', 'jpg', 'webp'].some((e) => fs.existsSync(path.join(b.dir, `logo.${e}`))),
        outro: fs.existsSync(path.join(b.dir, 'logo-outro.mp4')),
      };
    } catch (e) { return sendError(reply, e); }
  });

  app.post<{ Params: { slug: string } }>('/api/brand-core/:slug/logo', async (request, reply) => {
    try {
      const b = load(request.params.slug);
      if (!editable(b)) return fail(reply, 403, READ_ONLY_FA);
      if (!request.isMultipart()) return fail(reply, 400, 'فایل لوگو فرستاده نشد.');
      const part = await request.file({ limits: { fileSize: LOGO_MAX + 1, files: 1 } });
      if (!part) return fail(reply, 400, 'فایل لوگو فرستاده نشد.');
      const data = await part.toBuffer();
      if (data.length > LOGO_MAX) return fail(reply, 400, 'لوگو بزرگ‌تر از ۸ مگابایت است.');
      const kind = imageKind(data.subarray(0, 16));
      if (!kind) return fail(reply, 400, 'لوگو باید تصویر پی‌ان‌جی، جی‌پی‌جی یا وب‌پی باشد.');
      for (const e of ['png', 'jpg', 'webp']) fs.rmSync(path.join(b.dir, `logo.${e}`), { force: true });
      const file = `logo.${kind}`;
      fs.writeFileSync(path.join(b.dir, file), data);
      let palette = null;
      try { palette = await suggestPalette(ctx.libraryTool, path.join(b.dir, file)); } catch { /* the user picks colours by hand */ }
      return reply.code(201).send({ file, palette });
    } catch (e) {
      if ((e as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') return fail(reply, 400, 'لوگو بزرگ‌تر از ۸ مگابایت است.');
      return sendError(reply, e);
    }
  });

  app.get<{ Params: { slug: string } }>('/api/brand-core/:slug/palette', async (request, reply) => {
    try {
      const b = load(request.params.slug);
      const logo = ['png', 'jpg', 'webp'].map((e) => path.join(b.dir, `logo.${e}`)).find((f) => fs.existsSync(f));
      if (!logo) return fail(reply, 404, 'اول لوگو را بارگذاری کن.');
      return { palette: await suggestPalette(ctx.libraryTool, logo) };
    } catch (e) { return sendError(reply, e); }
  });

  app.post<{ Params: { slug: string } }>('/api/brand-core/:slug/font', async (request, reply) => {
    try {
      const b = load(request.params.slug);
      if (!editable(b)) return fail(reply, 403, READ_ONLY_FA);
      if (!request.isMultipart()) return fail(reply, 400, 'فایل فونت فرستاده نشد.');
      const part = await request.file({ limits: { fileSize: FONT_MAX + 1, files: 1 } });
      if (!part) return fail(reply, 400, 'فایل فونت فرستاده نشد.');
      const name = safeName(part.filename);
      if (!/\.(woff2?|ttf|otf)$/i.test(name)) return fail(reply, 400, 'این فایل فونت نیست؛ یکی از فرمت‌های رایج فونت را بده.');
      const data = await part.toBuffer();
      if (data.length > FONT_MAX) return fail(reply, 400, 'فونت بزرگ‌تر از ۱۲ مگابایت است.');
      if (!fontKind(data)) return fail(reply, 400, 'این فایل فونت معتبر نیست.');
      fs.mkdirSync(path.join(b.dir, 'fonts'), { recursive: true });
      fs.writeFileSync(path.join(b.dir, 'fonts', name), data);
      return reply.code(201).send({ file: name, family_guess: name.replace(/\.[^.]+$/, '').replace(/[-_ ](regular|bold|medium|light|semibold|black|variable)$/i, '') });
    } catch (e) {
      if ((e as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') return fail(reply, 400, 'فونت بزرگ‌تر از ۱۲ مگابایت است.');
      return sendError(reply, e);
    }
  });

  /** Before «ثبت»: which docs would be rebuilt and what that costs. Nothing is written. */
  app.post<{ Params: { slug: string } }>('/api/brand-core/:slug/preview', async (request, reply) => {
    try {
      const b = load(request.params.slug);
      if (!editable(b)) return fail(reply, 403, READ_ONLY_FA);
      const body = AnswersBody.safeParse(request.body);
      if (!body.success) return fail(reply, 400, 'پاسخ‌ها فرستاده نشد.');
      const parsed = BrandAnswers.safeParse(body.data.answers);
      if (!parsed.success) return reply.code(400).send({ error_fa: 'بعضی پاسخ‌های لازم کامل نیست.', missing: missingAnswers(parsed.error) });
      const a = normalizeFonts(parsed.data);
      ensureFiles(b.dir, a);
      return { plan: planRebuild(b.dir, a, ctx.db), busy: ctx.runner.running() !== null || ctx.runner.queued().length > 0 };
    } catch (e) { return sendError(reply, e); }
  });

  app.post<{ Params: { slug: string } }>('/api/brand-core/:slug/commit', async (request, reply) => {
    try {
      const b = load(request.params.slug);
      if (!editable(b)) return fail(reply, 403, READ_ONLY_FA);
      const body = AnswersBody.safeParse(request.body);
      if (!body.success) return fail(reply, 400, 'پاسخ‌ها فرستاده نشد.');
      const parsed = BrandAnswers.safeParse(body.data.answers);
      if (!parsed.success) return reply.code(400).send({ error_fa: 'بعضی پاسخ‌های لازم کامل نیست.', missing: missingAnswers(parsed.error) });
      const kind = body.data.kind ?? (readBuild(b.dir) ? 'save' : 'create');
      return reply.code(202).send(ctx.brandBuilder.start(b.slug, parsed.data, { includeEdited: body.data.include_edited, kind }));
    } catch (e) { return sendError(reply, e); }
  });

  app.get<{ Params: { slug: string } }>('/api/brand-core/:slug/build', async (request) => ctx.brandBuilder.status(request.params.slug));

  app.get<{ Params: { slug: string; doc: string } }>('/api/brand-core/:slug/docs/:doc', async (request, reply) => {
    try {
      const b = load(request.params.slug);
      const doc = DOC.safeParse(request.params.doc);
      if (!doc.success) return fail(reply, 404, 'این سند پیدا نشد.');
      const f = docPath(b.dir, doc.data);
      if (!fs.existsSync(f)) return fail(reply, 404, 'این سند هنوز ساخته نشده است.');
      return { doc: doc.data, title: DOC_TITLES[doc.data], text: fs.readFileSync(f, 'utf8'), editable: editable(b) };
    } catch (e) { return sendError(reply, e); }
  });

  /** A hand edit is final (like D45): the file is written as it is; a later rebuild asks before it would overwrite it. */
  app.put<{ Params: { slug: string; doc: string } }>('/api/brand-core/:slug/docs/:doc', async (request, reply) => {
    try {
      const b = load(request.params.slug);
      if (!editable(b)) return fail(reply, 403, READ_ONLY_FA);
      const doc = DOC.safeParse(request.params.doc);
      const body = DocBody.safeParse(request.body);
      if (!doc.success || !body.success) return fail(reply, 400, 'متن سند فرستاده نشد.');
      if (ctx.brandBuilder.running()) return fail(reply, 409, 'ساخت برند در حال انجام است؛ بعد از پایانش ویرایش کن.');
      fs.writeFileSync(docPath(b.dir, doc.data), body.data.text, 'utf8');
      const v = saveVersion(b.dir, { sections: [], docs: [doc.data], kind: 'hand_edit', restored_from: null });
      return { version: v.id, hand_edited: handEditedDocs(b.dir, readBuild(b.dir)).includes(doc.data) };
    } catch (e) { return sendError(reply, e); }
  });

  app.get<{ Params: { slug: string } }>('/api/brand-core/:slug/versions', async (request, reply) => {
    try { return { versions: listVersions(load(request.params.slug).dir) }; } catch (e) { return sendError(reply, e); }
  });

  app.get<{ Params: { slug: string; id: string } }>('/api/brand-core/:slug/versions/:id/diff', async (request, reply) => {
    try { return { diffs: versionDiff(load(request.params.slug).dir, request.params.id) }; } catch (e) { return sendError(reply, e); }
  });

  /** «بازگشت به نسخه‌ی قبل»: the version's files come back, and the restore itself is kept as a new version (nothing is ever lost). */
  app.post<{ Params: { slug: string; id: string } }>('/api/brand-core/:slug/versions/:id/restore', async (request, reply) => {
    try {
      const b = load(request.params.slug);
      if (!editable(b)) return fail(reply, 403, READ_ONLY_FA);
      if (ctx.brandBuilder.running()) return fail(reply, 409, 'ساخت برند در حال انجام است؛ بعد از پایانش برگرد.');
      const id = request.params.id;
      if (!listVersions(b.dir).some((v) => v.id === id)) return fail(reply, 404, 'این نسخه پیدا نشد.');
      restoreFiles(b.dir, id);
      const build = readBuild(b.dir);
      // The restored docs are what the version held: record them as the app's own so they do not read as hand edits.
      if (build) {
        for (const d of CLAUDE_DOCS) if (d !== 'tokens' && fs.existsSync(docPath(b.dir, d))) build.docs[d] = { sha256: sha(fs.readFileSync(docPath(b.dir, d))), built_at: build.built_at };
        writeBuild(b.dir, build);
      }
      const meta: Omit<VersionMeta, 'id' | 'at'> = { sections: [], docs: [...CLAUDE_DOCS], kind: 'restore', restored_from: id };
      return { version: saveVersion(b.dir, meta).id, answers: readAnswers(b.dir) };
    } catch (e) { return sendError(reply, e); }
  });
}
