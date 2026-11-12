// Responsibility: the content-calendar endpoints of the Automation screen: a date range, add, edit or move, delete, import a CSV/XLSX file and paste a list of topics (docs/08 «Calendar»); one topic per day in each brand's own calendar (Phase 8).
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { isoDate, type CalendarEntry } from '../contracts/index.js';
import { getSchedule } from '../calendar/schedule.js';
import { jalaliText, planFromList, planFromRows, type NewEntry, type PlanContext } from '../calendar/import.js';
import { similarSince, similarTo } from '../calendar/warnings.js';
import { TableError, readTable } from '../calendar/tabular.js';
import { calendarRepo } from '../db/repositories.js';
import { activeBrandSlug, readBrand } from '../brands/index.js';
import { localDate } from '../intake/index.js';
import { fail, sendError, type ApiContext } from './context.js';
import { listReferences } from './libraryRoutes.js';

/** `brand`: which brand's calendar (Phase 8); the page sends the brand it shows, a request without one means the active brand. */
const Range = z.object({ from: isoDate, to: isoDate, brand: z.string().optional() });
const BrandQuery = z.object({ brand: z.string().optional() });
const Topic = z.string().trim().min(1, 'موضوع را بنویس.');
const Fields = z.strictObject({
  date: isoDate,
  topic: Topic,
  note: z.string().trim().nullable().optional(),
  style_override: z.string().nullable().optional(),
  format: z.enum(['9x16', '16x9']).nullable().optional(),
  brand: z.string().optional(),
});
// A day never moves to another brand's calendar.
const Edit = Fields.omit({ brand: true }).partial();
const Paste = z.strictObject({ text: z.string().max(200000), start_date: isoDate.optional(), brand: z.string().optional() });
const MAX_FILE = 2 * 1024 * 1024;
/** A day's entry can be changed until its film starts. */
const EDITABLE = new Set<CalendarEntry['status']>(['planned', 'failed', 'skipped', 'empty']);

export function calendarRoutes(app: FastifyInstance, ctx: ApiContext): void {
  const { db } = ctx;
  /** A brand's own schedule (Phase 8: each brand has one). */
  const schedule = (brand: string) => getSchedule(db, brand);
  // Every schedule reads in the app's zone (D63), so «today» is the same for all brands.
  const today = () => localDate(new Date(), schedule(activeBrandSlug(db, ctx.config)).timezone);
  /** The brand a request names (it must exist, else BrandError → 400), or the active brand. */
  const brandOf = (named: string | undefined) => (named ? readBrand(ctx.config.paths, named).slug : activeBrandSlug(db, ctx.config));
  const library = () => listReferences(ctx.config.paths.refs).filter((r) => r.source === 'library').map((r) => ({ slug: r.slug, name_fa: r.name_fa }));
  const planContext = (brand: string): PlanContext => ({ today: today(), occupied: calendarRepo.occupiedDates(db, brand), library: library(), maxTopicChars: ctx.config.cfg.intake.max_brief_chars });
  const styleOk = (slug: string | null | undefined) => !slug || library().some((l) => l.slug === slug);
  const save = (entries: NewEntry[], brand: string) => db.transaction(() => {
    for (const e of entries) calendarRepo.upsert(db, { id: randomUUID(), status: 'planned', job_id: null, ...e, brand });
  })();
  const summary = (entries: NewEntry[], problems: { row: number; message_fa: string }[]) => ({ added: entries.length, problems: problems.map((p) => p.message_fa) });

  app.get('/api/calendar', async (request, reply) => {
    const q = Range.safeParse(request.query);
    if (!q.success) return fail(reply, 400, 'بازه‌ی تاریخ نامعتبر است.');
    try {
      const brand = brandOf(q.data.brand);
      const s = schedule(brand);
      const now = today();
      // A planned day whose topic is too like a film of the same brand made in the last 30 days (docs/08); the film is still made unless the owner removes it.
      const past = calendarRepo.doneTopicsSince(db, similarSince(now), brand);
      const entries = calendarRepo.range(db, q.data.from, q.data.to, brand).map((e) => ({ ...e, similar: e.status === 'planned' ? similarTo(e.topic, past) : null }));
      // This brand's own automation: its run days and whether it is on.
      return { entries, today: now, brand, run_days: s.weekdays, enabled: s.enabled };
    } catch (e) { return sendError(reply, e); }
  });

  app.post('/api/calendar', async (request, reply) => {
    const b = Fields.safeParse(request.body);
    if (!b.success) return fail(reply, 400, b.error.issues[0]?.message ?? 'اطلاعات روز نامعتبر است.');
    if (b.data.date < today()) return fail(reply, 400, 'این روز گذشته است.');
    if (b.data.topic.length > ctx.config.cfg.intake.max_brief_chars) return fail(reply, 400, 'موضوع خیلی بلند است.');
    if (!styleOk(b.data.style_override)) return fail(reply, 400, 'این سبک در کتابخانه نیست.');
    try {
      const brand = brandOf(b.data.brand);
      if (calendarRepo.occupiedDates(db, brand).has(b.data.date)) return fail(reply, 409, `روز ${jalaliText(b.data.date)} از قبل موضوع دارد.`);
      const e: CalendarEntry = { id: randomUUID(), date: b.data.date, topic: b.data.topic, note: b.data.note || null, style_override: b.data.style_override ?? null, format: b.data.format ?? null, status: 'planned', job_id: null, brand };
      calendarRepo.upsert(db, e);
      return reply.code(201).send(e);
    } catch (e) { return sendError(reply, e); }
  });

  app.put<{ Params: { id: string } }>('/api/calendar/:id', async (request, reply) => {
    const cur = calendarRepo.get(db, request.params.id);
    if (!cur) return fail(reply, 404, 'این روز پیدا نشد.');
    const b = Edit.safeParse(request.body);
    if (!b.success) return fail(reply, 400, b.error.issues[0]?.message ?? 'اطلاعات روز نامعتبر است.');
    if (!EDITABLE.has(cur.status)) return fail(reply, 409, 'ساخت این روز شروع شده یا تمام شده و دیگر قابل تغییر نیست.');
    const next = { ...cur, ...Object.fromEntries(Object.entries(b.data).filter(([, v]) => v !== undefined)) } as CalendarEntry;
    next.note = next.note || null;
    if (next.date !== cur.date) {
      if (next.date < today()) return fail(reply, 400, 'این روز گذشته است.');
      if (calendarRepo.occupiedDates(db, cur.brand).has(next.date)) return fail(reply, 409, `روز ${jalaliText(next.date)} از قبل موضوع دارد.`);
      // A moved topic is planned again.
      next.status = 'planned';
    }
    if (next.topic.length > ctx.config.cfg.intake.max_brief_chars) return fail(reply, 400, 'موضوع خیلی بلند است.');
    if (!styleOk(next.style_override)) return fail(reply, 400, 'این سبک در کتابخانه نیست.');
    try { calendarRepo.upsert(db, next); return next; } catch (e) { return sendError(reply, e); }
  });

  app.delete<{ Params: { id: string } }>('/api/calendar/:id', async (request, reply) => {
    const cur = calendarRepo.get(db, request.params.id);
    if (!cur) return fail(reply, 404, 'این روز پیدا نشد.');
    if (cur.status === 'running' || cur.status === 'queued') return fail(reply, 409, 'ساخت این روز در جریان است.');
    calendarRepo.delete(db, cur.id);
    return { ok: true };
  });

  /** A CSV or XLSX file with the columns date, topic, note, style, format (docs/08). Rows that cannot be added are listed, not fatal. */
  app.post('/api/calendar/import', async (request, reply) => {
    if (!request.isMultipart()) return fail(reply, 400, 'فایلی فرستاده نشد.');
    try {
      const brand = brandOf(BrandQuery.parse(request.query).brand);
      const part = await request.file({ limits: { fileSize: MAX_FILE + 1 } });
      if (!part) return fail(reply, 400, 'فایلی فرستاده نشد.');
      const buf = await part.toBuffer();
      if (part.file.truncated || buf.length > MAX_FILE) return fail(reply, 400, 'فایل بزرگ‌تر از ۲ مگابایت است.');
      const plan = planFromRows(readTable(path.basename(part.filename), buf), planContext(brand));
      save(plan.entries, brand);
      return summary(plan.entries, plan.problems);
    } catch (e) {
      if (e instanceof TableError) return fail(reply, 400, e.message);
      return sendError(reply, e);
    }
  });

  /** One topic per line fills the free run-days from the start date (default today). */
  app.post('/api/calendar/paste', async (request, reply) => {
    const b = Paste.safeParse(request.body);
    if (!b.success) return fail(reply, 400, 'لیست موضوع نامعتبر است.');
    try {
      const brand = brandOf(b.data.brand);
      const c = planContext(brand);
      const plan = planFromList(b.data.text, b.data.start_date ?? c.today, schedule(brand).weekdays, c);
      save(plan.entries, brand);
      return summary(plan.entries, plan.problems);
    } catch (e) { return sendError(reply, e); }
  });
}
