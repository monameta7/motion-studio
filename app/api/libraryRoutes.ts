// Responsibility: the non-job endpoints of the UI: the reference library (list, media, upload, edit, delete, re-read), brand fonts and logo, owner image uploads, settings, and the sidebar status (quota card, Claude, voice app).
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ReferenceMeta, ReferenceReading, readJson, writeJson } from '../contracts/index.js';
import { brandDir, readBrand } from '../brands/index.js';
import { DEFAULTS_DIR } from '../brandcore/assets.js';
import { stageRunsRepo, usageRepo } from '../db/repositories.js';
import { MAX_BYTES, UploadError, VIDEO_EXT, storeReference } from '../library/ingest.js';
import type { ReadStatus } from '../library/refReader.js';
import { readRequest } from '../orchestrator/jobFolder.js';
import { readPlanStatus } from '../quota/index.js';
import { LOW_BUILDABLE_FA, LOW_BUILDABLE_PCT, refPaths } from '../stages/reference/index.js';
import { fail, sendError, type ApiContext } from './context.js';
import { keyView } from '../secrets/index.js';
import { APPLIES_FROM_NEXT_FA, SettingsUpdate, settingsView, updateSettings } from './settings.js';
import { saveUpload } from './uploads.js';

const REF_MEDIA = new Set(['thumb.webp', 'preview.mp4', 'video.mp4']);

export interface RefCard {
  slug: string; name_fa: string; use_fa: string; group: ReferenceMeta['group']; tags: string[]; duration: number; format: ReferenceMeta['format'];
  /** «✓ تحلیل‌شده»: reading.json exists and was made from this exact video (docs/07). */
  analysed: boolean;
  thumb: boolean; preview: boolean;
  /** 'library' = saved by the owner; 'upload' = a one-time upload, not shown in the library screen. */
  source: ReferenceMeta['source'];
  code_buildable_pct: number | null;
  /** The buildability warning of docs/07 step 4; null when the reference is fine or not read yet. */
  warning_fa: string | null;
  /** The background read: waiting, running, or failed (with a Persian reason); null when none is pending. */
  read: ReadStatus | null;
}

/** Every folder in refs/ with a valid meta.json, except `_`-folders (trash, logs); one-time uploads are marked by `source` (docs/07). */
export function listReferences(refsRoot: string, readStatus: (slug: string) => ReadStatus | null = () => null): RefCard[] {
  let dirs: string[];
  try { dirs = fs.readdirSync(refsRoot, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('_')).map((d) => d.name); } catch { return []; }
  const out: RefCard[] = [];
  for (const slug of dirs.sort()) {
    const dir = path.join(refsRoot, slug);
    let meta: ReferenceMeta;
    try { meta = readJson(path.join(dir, 'meta.json'), ReferenceMeta); } catch { continue; }
    let analysed = false;
    try {
      const r = readJson(path.join(dir, 'reading.json'), ReferenceReading);
      analysed = (r.sha256 ?? r.key?.sha256) === meta.sha256;
    } catch { /* not read yet */ }
    out.push({
      slug: meta.slug, name_fa: meta.name_fa, use_fa: meta.use_fa, group: meta.group, tags: meta.tags, duration: meta.duration, format: meta.format, analysed,
      thumb: fs.existsSync(path.join(dir, 'thumb.webp')), preview: fs.existsSync(path.join(dir, 'preview.mp4')),
      source: meta.source, code_buildable_pct: meta.code_buildable_pct,
      warning_fa: analysed && meta.code_buildable_pct !== null && meta.code_buildable_pct < LOW_BUILDABLE_PCT ? LOW_BUILDABLE_FA : null,
      read: readStatus(slug),
    });
  }
  return out;
}

const SLUG = /^[a-z0-9][a-z0-9._-]*$/;
const GROUPS = ReferenceMeta.shape.group.options;
const EditBody = z.strictObject({
  name_fa: z.string().trim().min(1, 'نام مرجع را بنویس.').max(80, 'نام مرجع بلندتر از ۸۰ حرف است.'),
  use_fa: z.string().trim().max(300, 'توضیح کاربرد بلندتر از ۳۰۰ حرف است.'),
  group: z.enum(GROUPS),
});

export function libraryRoutes(app: FastifyInstance, ctx: ApiContext): void {
  const refsDir = ctx.config.paths.refs;
  const card = (slug: string) => listReferences(refsDir, (s) => ctx.refReader.status(s)).find((r) => r.slug === slug);
  /** A film that runs or waits uses its references; they must stay as they are. */
  const usedByFilm = (slug: string): boolean => [ctx.runner.running(), ...ctx.runner.queued()].some((job) => {
    if (!job) return false;
    try { return readRequest(path.join(ctx.config.paths.jobs, job)).references.includes(slug); } catch { return false; }
  });

  app.get('/api/references', async () => ({ references: listReferences(refsDir, (s) => ctx.refReader.status(s)) }));

  /**
   * The owner's video (docs/07 «Adding a reference»): validated, de-duplicated by hash, stored with thumb and preview, then read in the
   * background. Every upload, from the Library or from New video, is saved to the library (owner, 2026-11-07, D71); without a name from
   * the owner the app names it after the read. The old `mode` field is ignored. Uploads default to ADAPT.
   */
  app.post('/api/references/upload', async (request, reply) => {
    if (!request.isMultipart()) return fail(reply, 400, 'فایل ویدیو فرستاده نشد.');
    const fields: Record<string, string> = {};
    let file: { path: string; name: string } | null = null;
    try {
      for await (const part of request.parts({ limits: { fileSize: MAX_BYTES + 1, files: 1 } })) {
        if (part.type === 'field') { fields[part.fieldname] = String(part.value); continue; }
        const ext = path.extname(part.filename).toLowerCase();
        if (!VIDEO_EXT.includes(ext)) { part.file.resume(); throw new UploadError('فقط فایل MP4، MOV یا WebM پذیرفته می‌شود.'); }
        const staged = path.join(ctx.uploadsDir, `ref-${randomBytes(6).toString('hex')}${ext}`);
        file = { path: staged, name: path.basename(part.filename, ext) };
        await pipeline(part.file, fs.createWriteStream(staged));
        if (part.file.truncated) throw new UploadError('حجم ویدیو بیشتر از ۲۰۰ مگابایت است.');
      }
      if (!file) throw new UploadError('فایل ویدیو فرستاده نشد.');
      const group = GROUPS.includes(fields.group as ReferenceMeta['group']) ? (fields.group as ReferenceMeta['group']) : 'other';
      const name = (fields.name_fa ?? '').trim();
      // A video without a name from the owner is named by the app after its read (name, use, group, tags).
      const autoName = !name;
      const stored = await storeReference({
        file: file.path,
        slug: (sha) => `${fields.group ? group : 'ref'}-${sha.slice(0, 8)}`,
        name_fa: (name || file.name).slice(0, 80) || 'موشن آپلودی',
        use_fa: (fields.use_fa ?? '').trim().slice(0, 300),
        tags: [group], group, source: 'library',
        rights_note: `uploaded by the owner in the app on ${new Date().toISOString().slice(0, 10)}; origin not stated → plan mode ADAPT, never RECREATE`,
      }, { config: ctx.config, db: ctx.db, tool: ctx.libraryTool, runFn: () => Promise.reject(new Error('not used')) });
      // The same video again (under another name or the same): nothing is stored or read twice. An old one-time upload saved now is not a repeat.
      if (stored.kind === 'duplicate' || !stored.promoted && stored.existed) return reply.send({ duplicate: true, slug: stored.kind === 'duplicate' ? stored.of : stored.slug, message_fa: 'این ویدیو از قبل در کتابخانه هست.' });
      const found = card(stored.slug);
      // A promoted or repeated upload that was already named is not named again.
      const nameIt = autoName && (found?.use_fa ?? '') === '';
      if (!found?.analysed || nameIt) ctx.refReader.enqueue(stored.slug, { autoName: nameIt });
      return reply.code(201).send({ duplicate: false, slug: stored.slug });
    } catch (e) {
      if (e instanceof UploadError) return fail(reply, 400, e.message);
      return sendError(reply, e);
    } finally {
      if (file) fs.rmSync(file.path, { force: true });
    }
  });

  app.put<{ Params: { slug: string } }>('/api/references/:slug', async (request, reply) => {
    const { slug } = request.params;
    const p = refPaths(refsDir, slug);
    if (!SLUG.test(slug) || !fs.existsSync(p.meta)) return fail(reply, 404, 'این مرجع پیدا نشد.');
    const body = EditBody.safeParse(request.body);
    if (!body.success) return fail(reply, 400, body.error.issues[0]?.message ?? 'مقدار نامعتبر است.');
    try {
      writeJson(p.meta, ReferenceMeta, { ...readJson(p.meta, ReferenceMeta), ...body.data });
      return card(slug);
    } catch (e) { return sendError(reply, e); }
  });

  /** Delete = move to refs/_trash (the owner empties it himself, docs/07). */
  app.delete<{ Params: { slug: string } }>('/api/references/:slug', async (request, reply) => {
    const { slug } = request.params;
    const p = refPaths(refsDir, slug);
    if (!SLUG.test(slug) || !fs.existsSync(p.meta)) return fail(reply, 404, 'این مرجع پیدا نشد.');
    if (usedByFilm(slug) || ctx.refReader.status(slug)?.state === 'reading') return fail(reply, 409, 'این مرجع همین الان در یک کار یا تحلیل استفاده می‌شود؛ بعد از تمام شدنش پاکش کن.');
    try {
      const trash = path.join(refsDir, '_trash');
      fs.mkdirSync(trash, { recursive: true });
      fs.renameSync(p.dir, path.join(trash, `${slug}-${Date.now()}`));
      return { ok: true };
    } catch (e) { return sendError(reply, e); }
  });

  /** Reads the reference again (or for the first time). The earlier reading is kept in refs/_ingest. */
  app.post<{ Params: { slug: string } }>('/api/references/:slug/reread', async (request, reply) => {
    const { slug } = request.params;
    const p = refPaths(refsDir, slug);
    if (!SLUG.test(slug) || !fs.existsSync(p.meta)) return fail(reply, 404, 'این مرجع پیدا نشد.');
    const pending = ctx.refReader.status(slug)?.state;
    if (pending === 'reading' || pending === 'queued') return fail(reply, 409, 'این مرجع همین الان در صف تحلیل یا در حال تحلیل است.');
    if (usedByFilm(slug)) return fail(reply, 409, 'این مرجع همین الان در یک کار استفاده می‌شود.');
    // D79: without the video there is nothing to read again, and the reading it has must not be put aside.
    if (!fs.existsSync(p.video)) return fail(reply, 409, 'ویدیوی این مرجع روی این کامپیوتر نیست؛ برای همین دوباره تحلیل نمی‌شود. تحلیل آماده‌اش استفاده می‌شود.');
    try {
      if (fs.existsSync(p.reading)) {
        const keep = path.join(refsDir, '_ingest', slug);
        fs.mkdirSync(keep, { recursive: true });
        fs.renameSync(p.reading, path.join(keep, `reading-before-${Date.now()}.json`));
      }
      ctx.refReader.enqueue(slug);
      return card(slug);
    } catch (e) { return sendError(reply, e); }
  });

  app.get<{ Params: { slug: string; file: string } }>('/api/references/:slug/:file', async (request, reply) => {
    const { slug, file } = request.params;
    if (!/^[a-z0-9][a-z0-9._-]*$/.test(slug) || !REF_MEDIA.has(file) || !fs.existsSync(path.join(ctx.config.paths.refs, slug, file))) return fail(reply, 404, 'فایل پیدا نشد.');
    return reply.header('Cache-Control', 'max-age=3600').sendFile(`${slug}/${file}`, ctx.config.paths.refs);
  });

  /**
   * Files the app UI itself uses: the Persian fonts (D22) and the app mark, from the default brand's folder (`brand.default`): the
   * app's own look (rule 13), which does not change with the active brand. Never Brand Acessts/. Brand logos: /api/brands/:slug/logo.png.
   * A font that folder does not have comes from the app's own free copies (Vazirmatn, Inter): an install without the Mahdiyar brand (Phase 11, Q22).
   */
  app.get<{ Params: { file: string } }>('/api/brand/:file', async (request, reply) => {
    const { file } = request.params;
    const rel = /^[A-Za-z]+(-[A-Za-z]+)?(\[wght\])?\.woff2$/.test(file) ? path.join('fonts', file) : file === 'logo.png' ? 'logo.png' : null;
    const root = brandDir(ctx.config.paths, ctx.config.cfg.brand.default);
    if (rel && !fs.existsSync(path.join(root, rel)) && rel !== 'logo.png' && fs.existsSync(path.join(DEFAULTS_DIR, file))) return reply.header('Cache-Control', 'max-age=86400').sendFile(file, DEFAULTS_DIR);
    if (!rel || !fs.existsSync(path.join(root, rel))) return fail(reply, 404, 'فایل پیدا نشد.');
    return reply.header('Cache-Control', 'max-age=86400').sendFile(rel.split(path.sep).join('/'), root);
  });

  /** Owner images added with «+» (D42): one or more files per request, each checked like intake; limits from config.intake. */
  app.post('/api/uploads', async (request, reply) => {
    if (!request.isMultipart()) return fail(reply, 400, 'فایل تصویر فرستاده نشد.');
    const saved = [];
    try {
      for await (const part of request.files({ limits: { fileSize: ctx.config.cfg.intake.max_image_mb * 1024 * 1024 + 1, files: ctx.config.cfg.intake.max_images } })) {
        const data = await part.toBuffer();
        // @fastify/multipart reads header parameters as UTF-8, so Persian file names arrive intact (tested).
        saved.push(saveUpload(ctx.uploadsDir, part.filename, data, ctx.config.cfg.intake));
      }
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === 'FST_REQ_FILE_TOO_LARGE') return fail(reply, 400, `تصویر بزرگ‌تر از ${ctx.config.cfg.intake.max_image_mb} مگابایت است.`);
      if (code === 'FST_FILES_LIMIT') return fail(reply, 400, `حداکثر ${ctx.config.cfg.intake.max_images} تصویر برای هر فیلم.`);
      return sendError(reply, e);
    }
    return reply.code(201).send({ uploads: saved });
  });

  app.get('/api/settings', async () => settingsView(ctx.config));

  app.put('/api/settings', async (request, reply) => {
    const body = SettingsUpdate.safeParse(request.body);
    if (!body.success) return fail(reply, 400, 'مقدار تنظیمات نامعتبر است.');
    try {
      // The orchestrator and every stage read this same object, so the next stage uses the new values.
      ctx.config.cfg = updateSettings(ctx.config.paths.config, body.data);
      return { ...settingsView(ctx.config), ...(body.data.claude_stages ? { applies_fa: APPLIES_FROM_NEXT_FA } : {}) };
    } catch (e) { return sendError(reply, e); }
  });

  /** Sidebar: quota card (docs/09 Layer 3 file + Layer 1 app tokens), Claude model/effort and login, voice app, running job. */
  app.get('/api/status', async () => {
    const now = Date.now();
    const plan = readPlanStatus(ctx.config.paths.quotaStatus, now, ctx.config.cfg.quota.status_max_age_min);
    const [auth, voice] = await Promise.all([ctx.auth().catch(() => null), ctx.voiceHealth().catch(() => null)]);
    const stages = ctx.config.cfg.claude.stages;
    return {
      quota: { ...plan, app_tokens_5h: usageRepo.outputTokensSince(ctx.db, new Date(now - 5 * 3600000).toISOString()), max_5h_pct_to_start: ctx.config.cfg.quota.max_5h_pct_to_start, max_7d_pct_to_start: ctx.config.cfg.quota.max_7d_pct_to_start },
      claude: { login_ok: auth?.ok ?? false, auth_method: auth?.authMethod ?? null, build: stages.build, content: stages['content-hook'] },
      voice: { up: voice !== null, has_key: voice?.hasApiKey === true, key_set: keyIsSet(ctx), voice: ctx.config.cfg.tts.voice },
      /** Measured average of finished jobs (docs/03 Time budget); null until one finished on this machine. */
      estimate_min: stageRunsRepo.avgJobMinutes(ctx.db),
      stage_avg_min: stageRunsRepo.avgStageMinutes(ctx.db),
      running: ctx.runner.running(),
      queued: ctx.runner.queued(),
      /** The next film any brand's schedule starts (its calendar day, start moment and brand), or null. */
      next_run: (() => {
        const n = ctx.scheduler.nextRun();
        if (!n) return null;
        let brand_name = n.brand;
        try { brand_name = readBrand(ctx.config.paths, n.brand).name; } catch { /* shown by slug */ }
        return { ...n, brand_name };
      })(),
    };
  });
}

/** A broken secrets file counts as «no key» on the sidebar; the Settings card shows the reason. */
function keyIsSet(ctx: ApiContext): boolean {
  try { return keyView(ctx.config).set; } catch { return false; }
}
