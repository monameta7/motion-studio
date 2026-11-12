// Responsibility: the job endpoints of the UI: create, list, get, stop (pause), resume, hold, script edit, revise, job files and the live SSE stream (Phase 4 task 1).
import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ContentPackage, ScriptEditFile, readJson, writeJson } from '../contracts/index.js';
import { calendarRepo, jobsRepo } from '../db/repositories.js';
import { activeBrandSlug, listBrands, readBrand } from '../brands/index.js';
import { IntakeError, checkInput, copyImages, prepareImages, requestFromManual } from '../intake/index.js';
import { continueHeld, requestHold, resumeJob, runJob } from '../orchestrator/index.js';
import { createJobFolder, jobDir, readState } from '../orchestrator/jobFolder.js';
import { REVISION_TARGETS, reviseScript } from '../orchestrator/revision.js';
import { scriptPaths } from '../orchestrator/scriptEdit.js';
import { isRoundsBlock, readDecision, writeDecision } from '../stages/content/decision.js';
import { loadRounds } from '../stages/content/index.js';
import { fail, sendError, type ApiContext } from './context.js';
import { jobDetail, latestFrame, listJobs } from './jobView.js';
import { CHANGED } from './runner.js';
import { removeUploads, uploadPath } from './uploads.js';

export const NewJobBody = z.strictObject({
  topic: z.string(),
  hook: z.boolean(),
  images: z.array(z.string()).default([]),
  format: z.enum(['9x16', '16x9']),
  references: z.array(z.string()).min(1, 'یک مرجع انتخاب کن.').max(3, 'حداکثر سه مرجع.'),
  // D54: no plan approval; UI jobs always run in full (the field stays for older clients and is ignored).
  review: z.boolean().optional(),
  /** «از تقویم محتوا»: the film is that calendar day's; its topic and note come from the day. */
  calendar_entry_id: z.uuid().optional(),
  /** The brand the page showed (Phase 8); left out: the active brand. A calendar day's film is always that day's brand. */
  brand: z.string().optional(),
});

/** Calendar days a film can still be started for: not made yet, or failed / skipped before. */
const STARTABLE_DAY = new Set(['planned', 'failed', 'skipped']);

const ReviseBody = z.strictObject({ target: z.enum(REVISION_TARGETS), note: z.string() });
/** `unchanged: true` is «ادامه بدون تغییر»; otherwise the edited texts (same shape as content/script-edit.json). */
const ScriptBody = z.union([z.strictObject({ unchanged: z.literal(true) }), ScriptEditFile]);

/** Top folders of a job the UI may read files from: the delivery, the owner images, the voice and the plan (voice play button, storyboard), frames for the preview. */
const READABLE = new Set(['out', 'input', 'voice', 'plan', 'project']);

/** A job-relative path inside one of the readable folders, or null (no `..`, no absolute paths). */
export function safeJobFile(dir: string, rel: string): string | null {
  const parts = rel.split('/').filter(Boolean);
  if (parts.length < 2 || !READABLE.has(parts[0]!) || parts.some((p) => p === '..' || p.includes('\\') || p.includes(':'))) return null;
  const full = path.resolve(dir, ...parts);
  return full.startsWith(path.resolve(dir) + path.sep) && fs.existsSync(full) && fs.statSync(full).isFile() ? full : null;
}

const firstIssue = (e: z.ZodError) => e.issues[0]?.message ?? 'درخواست نامعتبر است.';

export function jobRoutes(app: FastifyInstance, ctx: ApiContext): void {
  const { o, runner } = ctx;
  const dirOf = (slug: string) => jobDir(ctx.config.paths.jobs, slug);
  const exists = (slug: string) => /^[a-z0-9][a-z0-9._-]*$/.test(slug) && fs.existsSync(path.join(dirOf(slug), 'state.json'));
  /** Brand slug → the name the cards show (Phase 8); a brand that is gone shows its slug. */
  const brandNames = () => new Map(listBrands(ctx.config.paths).brands.map((b) => [b.slug, b.name]));
  const detail = (slug: string) => {
    const d = jobDetail(ctx.config.paths.jobs, slug, ctx.config.cfg.content.pass_score);
    const busy = runner.isBusy(slug);
    return d && {
      ...d, brand_name: brandNames().get(d.brand) ?? d.brand,
      active: runner.running() === slug, queued: runner.queued().includes(slug), last_error: runner.lastError.get(slug) ?? null, revision_pending: busy ? null : d.revision_pending,
    };
  };

  app.get('/api/jobs', async () => {
    const names = brandNames();
    return { jobs: listJobs(ctx.config.paths.jobs).map((j) => ({ ...j, brand_name: names.get(j.brand) ?? j.brand, active: runner.running() === j.slug })) };
  });

  app.post('/api/jobs', async (request, reply) => {
    const body = NewJobBody.safeParse(request.body);
    if (!body.success) return fail(reply, 400, firstIssue(body.error));
    const b = body.data;
    try {
      const day = b.calendar_entry_id ? calendarRepo.get(ctx.db, b.calendar_entry_id) : undefined;
      if (b.calendar_entry_id && !day) throw new IntakeError('این روز دیگر در تقویم نیست؛ روز دیگری انتخاب کن.');
      if (day && !STARTABLE_DAY.has(day.status)) throw new IntakeError('فیلم این روز تقویم ساخته شده یا در حال ساخت است؛ روز دیگری انتخاب کن.');
      // The day's own text is the topic (the page shows it; the server does not trust a copy).
      const topic = day ? day.topic : b.topic;
      const brand = readBrand(ctx.config.paths, day?.brand ?? b.brand ?? activeBrandSlug(ctx.db, ctx.config)).slug;
      if (day && b.brand && b.brand !== day.brand) throw new IntakeError('این روز تقویم مال برند دیگری است؛ صفحه را دوباره باز کن.', `${day.brand} != ${b.brand}`);
      checkInput(topic, b.hook, ctx.config.cfg.intake);
      for (const r of b.references) {
        if (!fs.existsSync(path.join(ctx.config.paths.refs, r, 'meta.json'))) throw new IntakeError(`مرجع «${r}» در کتابخانه نیست.`);
        const pending = ctx.refReader.status(r)?.state;
        if (pending === 'queued' || pending === 'reading') throw new IntakeError('یکی از مرجع‌ها هنوز در حال تحلیل است؛ بعد از تمام شدنش فیلم را شروع کن.');
      }
      if (ctx.refReader.reading()) throw new IntakeError('تحلیل یک مرجع در جریان است؛ بعد از تمام شدنش فیلم را شروع کن.');
      const files = b.images.map((id) => {
        const f = uploadPath(ctx.uploadsDir, id);
        if (!f) throw new IntakeError('یکی از تصویرها دیگر روی سرور نیست؛ دوباره اضافه‌اش کن.', id);
        return f;
      });
      const images = prepareImages(files, ctx.config.cfg.intake);
      const req = requestFromManual(
        { topic, topicNote: day?.note ?? null, references: b.references, format: b.format, automationLevel: 'full', hookWritesVoice: b.hook, attachments: images.map((i) => i.attachment), calendarEntryId: day?.id ?? null, brand },
        (s) => jobsRepo.slugExists(ctx.db, s) || fs.existsSync(dirOf(s)),
      );
      const dir = createJobFolder(ctx.config.paths.jobs, req);
      copyImages(dir, images);
      // The job and its calendar day change together: automation never makes a day that has a film.
      ctx.db.transaction(() => {
        jobsRepo.insert(ctx.db, req);
        if (day) calendarRepo.upsert(ctx.db, { ...day, status: 'queued', job_id: req.id });
      })();
      removeUploads(ctx.uploadsDir, b.images);
      const { position } = runner.enqueue(req.slug, 'run', (pause) => runJob(o, req.slug, pause));
      return reply.code(201).send({ slug: req.slug, position });
    } catch (e) { return sendError(reply, e); }
  });

  app.get<{ Params: { slug: string } }>('/api/jobs/:slug', async (request, reply) => {
    const d = exists(request.params.slug) ? detail(request.params.slug) : null;
    return d ?? fail(reply, 404, 'این کار پیدا نشد.');
  });

  /** Runs `act` for an existing job and answers with its fresh detail; errors become Persian messages. */
  const action = (name: string, act: (slug: string, body: unknown) => unknown | Promise<unknown>) =>
    app.post<{ Params: { slug: string } }>(`/api/jobs/:slug/${name}`, async (request, reply) => {
      const { slug } = request.params;
      if (!exists(slug)) return fail(reply, 404, 'این کار پیدا نشد.');
      try {
        await act(slug, request.body ?? {});
        return detail(slug);
      } catch (e) { return sendError(reply, e); }
    });
  const notBusy = (slug: string) => { if (runner.isBusy(slug)) throw new IntakeError('این کار همین الان در حال اجرا یا در صف است.'); };

  action('stop', (slug) => runner.pause(slug));
  action('resume', (slug) => {
    notBusy(slug);
    const s = readState(dirOf(slug));
    if (s.status === 'held') throw new IntakeError('کار نگه داشته شده؛ سناریو را ذخیره کن یا «ادامه بدون تغییر» را بزن.');
    runner.enqueue(slug, 'resume', (pause) => resumeJob(o, slug, false, pause));
  });
  /** D77: the owner's answer to a script blocked below the truth gate; both continue the job at once. */
  const decide = (slug: string, change: (d: ReturnType<typeof readDecision>, dir: string) => void) => {
    notBusy(slug);
    const dir = dirOf(slug);
    if (!isRoundsBlock(dir, readState(dir))) throw new IntakeError('این دکمه فقط برای سناریویی است که بعد از دورهای بازبینی متوقف شده.');
    const d = readDecision(dir);
    change(d, dir);
    writeDecision(dir, d);
    runner.enqueue(slug, 'resume', (pause) => resumeJob(o, slug, false, pause));
  };
  action('accept-script', (slug) => decide(slug, (d, dir) => {
    const last = loadRounds(dir).at(-1);
    if (!last) throw new IntakeError('هنوز دوری از بازبینی ثبت نشده است.');
    d.accepted = { at: new Date().toISOString(), round: last.round, score: last.score };
  }));
  action('extra-round', (slug) => decide(slug, (d) => { d.extra_rounds += 1; }));
  action('hold', (slug) => { requestHold(o, slug, 'ui'); runner.emit(CHANGED, { slug }); });
  action('revise', (slug, raw) => {
    notBusy(slug);
    const b = ReviseBody.safeParse(raw);
    if (!b.success) throw new IntakeError('هدف اصلاح یا یادداشت درست نیست.');
    if (!b.data.note.trim()) throw new IntakeError('برای اصلاح یک یادداشت بنویس.');
    if (readState(dirOf(slug)).status !== 'done') throw new IntakeError('فقط کار تمام‌شده را می‌شود اصلاح کرد.');
    runner.enqueue(slug, 'revise', () => ctx.revise(slug, b.data.target, b.data.note));
  });
  action('open-folder', async (slug) => {
    const out = path.join(dirOf(slug), 'out');
    if (!(await ctx.openFolder(fs.existsSync(out) ? out : dirOf(slug)))) throw new IntakeError(`باز کردن پوشه اینجا ممکن نیست؛ مسیر: ${out}`);
  });

  app.get<{ Params: { slug: string } }>('/api/jobs/:slug/script', async (request, reply) => {
    const d = exists(request.params.slug) ? detail(request.params.slug) : null;
    if (!d) return fail(reply, 404, 'این کار پیدا نشد.');
    return d.script ? { status: d.status, ...d.script } : fail(reply, 404, 'سناریو هنوز نوشته نشده است.');
  });

  /**
   * Save the owner's script edit (D45). Held job: apply it and continue from the right stage (docs/03 "Hold and script edit").
   * Finished job: the «متن گوینده» revision (backup, apply, re-run from voice or plan).
   */
  app.put<{ Params: { slug: string } }>('/api/jobs/:slug/script', async (request, reply) => {
    const { slug } = request.params;
    if (!exists(slug)) return fail(reply, 404, 'این کار پیدا نشد.');
    const body = ScriptBody.safeParse(request.body);
    if (!body.success) return fail(reply, 400, 'متن‌ها خالی یا نامعتبرند؛ هر جمله باید متنی داشته باشد.');
    const dir = dirOf(slug);
    const p = scriptPaths(dir);
    try {
      notBusy(slug);
      const status = readState(dir).status;
      if (status !== 'held' && status !== 'done') throw new IntakeError('اول «توقف و اصلاح سناریو» را بزن.');
      if ('unchanged' in body.data) {
        if (status === 'done') throw new IntakeError('تغییری برای اعمال نیست.');
        fs.rmSync(p.editFile, { force: true });
      } else {
        const pkg = readJson(p.pkg, ContentPackage);
        if (body.data.voice_lines.length !== pkg.voice_lines.length || body.data.on_screen_texts.length !== pkg.on_screen_texts.length) {
          throw new IntakeError('جمله اضافه یا کم نکن؛ فقط متن‌ها را عوض کن.');
        }
        writeJson(p.editFile, ScriptEditFile, body.data);
      }
      if (status === 'held') {
        const outcome = continueHeld(o, slug);
        runner.enqueue(slug, 'continue', (pause) => runJob(o, slug, pause));
        const from = outcome.voiceChanged ? 'voice' : outcome.screenChanged ? 'plan' : readState(dir).stage;
        return { ...detail(slug), restart_from: from, changes: outcome.changes };
      }
      runner.enqueue(slug, 'revise', () => reviseScript(o, slug));
      return detail(slug);
    } catch (e) {
      fs.rmSync(p.editFile, { force: true });
      return sendError(reply, e);
    }
  });

  app.get<{ Params: { slug: string } }>('/api/jobs/:slug/frame', async (request, reply) => {
    if (!exists(request.params.slug)) return fail(reply, 404, 'این کار پیدا نشد.');
    return { file: latestFrame(dirOf(request.params.slug)) };
  });

  app.get<{ Params: { slug: string; '*': string } }>('/api/jobs/:slug/files/*', async (request, reply) => {
    const { slug } = request.params;
    const file = exists(slug) ? safeJobFile(dirOf(slug), request.params['*']) : null;
    if (!file) return fail(reply, 404, 'فایل پیدا نشد.');
    return reply.header('Cache-Control', 'no-store').sendFile(path.relative(dirOf(slug), file).split(path.sep).join('/'), dirOf(slug));
  });

  /** Live progress (docs/02 §7): the job detail on connect and after every change (state, script, rounds, plan, delivery, runner). */
  app.get<{ Params: { slug: string } }>('/api/jobs/:slug/events', async (request, reply) => {
    const { slug } = request.params;
    if (!exists(slug)) return fail(reply, 404, 'این کار پیدا نشد.');
    const dir = dirOf(slug);
    reply.hijack();
    reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    const watched = ['state.json', 'content/package.json', 'content/edits.json', 'content/rounds', 'plan/scene-plan.json', 'out/manifest.json', 'out/final.mp4', 'out/cover-4x5.png', 'out/caption.txt', 'logs/revisions.jsonl', 'logs/build-verify.json'];
    let last = '';
    const signature = () => [
      ...watched.map((f) => { try { return fs.statSync(path.join(dir, f)).mtimeMs; } catch { return 0; } }),
      runner.running() === slug, runner.queued().includes(slug), runner.lastError.get(slug) ?? '',
    ].join('|');
    const push = (force = false) => {
      const sig = signature();
      if (!force && sig === last) return;
      last = sig;
      const d = detail(slug);
      if (d) reply.raw.write(`event: job\ndata: ${JSON.stringify(d)}\n\n`);
    };
    push(true);
    const onChange = (e: { slug: string }) => { if (e.slug === slug) push(); };
    runner.on(CHANGED, onChange);
    const poll = setInterval(() => push(), 1000);
    const beat = setInterval(() => reply.raw.write(': keep-alive\n\n'), 15000);
    request.raw.on('close', () => { clearInterval(poll); clearInterval(beat); runner.off(CHANGED, onChange); });
  });
}
