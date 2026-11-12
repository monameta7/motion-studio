// Responsibility: turn the owner's table rows or pasted list into new calendar entries, one per free day, and say in Persian which rows were left out and why (docs/08 «Add topics three ways»).
import type { CalendarEntry } from '../contracts/index.js';
import { faNum } from '../fa.js';
import { addDays, latinDigits, parseDate, toJalali, weekdayIndex, ymdOf } from './jalali.js';

export type NewEntry = Pick<CalendarEntry, 'date' | 'topic' | 'note' | 'style_override' | 'format'>;
export interface Problem { row: number; message_fa: string }
export interface Plan { entries: NewEntry[]; problems: Problem[] }

export interface PlanContext {
  /** Today's date in the schedule's time zone; earlier days are left out. */
  today: string;
  /** Days that already have a topic. */
  occupied: ReadonlySet<string>;
  /** Library references the style column may name (slug and Persian name). */
  library: { slug: string; name_fa: string }[];
  maxTopicChars: number;
}

/** «۱۲ آبان ۱۴۰۵» for messages; the owner sees Jalali dates only. */
export function jalaliText(iso: string): string {
  const j = toJalali(ymdOf(iso));
  return faNum(`${j.y}/${String(j.m).padStart(2, '0')}/${String(j.d).padStart(2, '0')}`);
}

const HEADERS: Record<'date' | 'topic' | 'note' | 'style' | 'format', string[]> = {
  date: ['date', 'تاریخ', 'روز'],
  topic: ['topic', 'موضوع'],
  note: ['note', 'notes', 'یادداشت', 'توضیح', 'توضیحات'],
  style: ['style', 'سبک', 'مرجع'],
  format: ['format', 'قالب', 'فرمت'],
};
const FORMATS: [RegExp, '9x16' | '16x9'][] = [[/^(9\s*[x:×]\s*16|عمودی|vertical|reel|ریلز)$/i, '9x16'], [/^(16\s*[x:×]\s*9|افقی|horizontal|youtube|یوتیوب)$/i, '16x9']];

/** An Excel date is a serial number of days since 1899-12-30. */
function excelSerial(text: string): string | null {
  const n = Number(latinDigits(text));
  if (!Number.isFinite(n) || n < 20000 || n > 80000) return null;
  return addDays('1899-12-30', Math.floor(n));
}

/** Rows (with or without a header line) to entries. Row numbers in the problems count the header as row 1. */
export function planFromRows(rows: string[][], c: PlanContext): Plan {
  const out: Plan = { entries: [], problems: [] };
  // Blank rows at the top stay counted, so «ردیف N» is the row number the owner sees in the file.
  const lead = rows.findIndex((r) => r.some((c) => c.trim() !== ''));
  if (lead < 0) { out.problems.push({ row: 0, message_fa: 'فایل خالی است.' }); return out; }
  rows = rows.slice(lead);
  const norm = (s: string) => s.trim().toLowerCase();
  const head = rows[0]!.map(norm);
  const named = (Object.keys(HEADERS) as (keyof typeof HEADERS)[]).map((k) => [k, head.findIndex((h) => HEADERS[k].includes(h))] as const);
  const hasHeader = named.some(([, i]) => i >= 0);
  const col = Object.fromEntries(hasHeader ? named : (['date', 'topic', 'note', 'style', 'format'] as const).map((k, i) => [k, i])) as Record<keyof typeof HEADERS, number>;
  if (hasHeader && (col.date < 0 || col.topic < 0)) {
    out.problems.push({ row: lead + 1, message_fa: 'ستون‌های «تاریخ» و «موضوع» لازم‌اند.' });
    return out;
  }
  const taken = new Set(c.occupied);
  rows.slice(hasHeader ? 1 : 0).forEach((r, i) => {
    const row = i + (hasHeader ? 2 : 1) + lead;
    const cell = (k: keyof typeof HEADERS) => (col[k] >= 0 ? (r[col[k]] ?? '').trim() : '');
    const topic = cell('topic');
    const dateText = cell('date');
    if (!topic && !dateText) return;
    const date = parseDate(dateText) ?? excelSerial(dateText);
    if (!date) { out.problems.push({ row, message_fa: `ردیف ${faNum(row)}: تاریخ «${dateText}» را نمی‌فهمم.` }); return; }
    if (!topic) { out.problems.push({ row, message_fa: `ردیف ${faNum(row)}: موضوع خالی است.` }); return; }
    if (topic.length > c.maxTopicChars) { out.problems.push({ row, message_fa: `ردیف ${faNum(row)}: موضوع خیلی بلند است.` }); return; }
    if (date < c.today) { out.problems.push({ row, message_fa: `ردیف ${faNum(row)}: روز ${jalaliText(date)} گذشته است.` }); return; }
    if (taken.has(date)) { out.problems.push({ row, message_fa: `ردیف ${faNum(row)}: روز ${jalaliText(date)} از قبل موضوع دارد.` }); return; }
    let style: string | null = null;
    const styleText = cell('style');
    if (styleText) {
      const hit = c.library.find((l) => l.slug === styleText.toLowerCase() || l.name_fa === styleText);
      if (hit) style = hit.slug; else out.problems.push({ row, message_fa: `ردیف ${faNum(row)}: سبک «${styleText}» در کتابخانه نیست؛ بدون سبک اضافه شد.` });
    }
    let format: NewEntry['format'] = null;
    const formatText = cell('format');
    if (formatText) {
      format = FORMATS.find(([re]) => re.test(formatText))?.[1] ?? null;
      if (!format) out.problems.push({ row, message_fa: `ردیف ${faNum(row)}: قالب «${formatText}» را نمی‌فهمم؛ قالب پیش‌فرض می‌ماند.` });
    }
    taken.add(date);
    out.entries.push({ date, topic, note: cell('note') || null, style_override: style, format });
  });
  return out;
}

/** The topics of a pasted list: one per line, a leading number or bullet removed. */
export const topicLines = (text: string): string[] => text.split(/\r?\n/).map((l) => l.replace(/^\s*(?:[-*•–]|[\d۰-۹]+\s*[.)\-–])\s*/, '').trim()).filter(Boolean);

const HORIZON_DAYS = 800;

/** Pasted topics fill the free run-days from the start date on, in order. */
export function planFromList(text: string, start: string, runDays: readonly boolean[], c: PlanContext): Plan {
  const out: Plan = { entries: [], problems: [] };
  const topics = topicLines(text);
  if (topics.length === 0) { out.problems.push({ row: 0, message_fa: 'لیست موضوع خالی است.' }); return out; }
  if (!runDays.some(Boolean)) { out.problems.push({ row: 0, message_fa: 'هیچ روزی برای اجرا انتخاب نشده؛ روزهای هفته را در تنظیمات بگذار.' }); return out; }
  const taken = new Set(c.occupied);
  let day = start < c.today ? c.today : start;
  let used = 0;
  for (let n = 0; n < HORIZON_DAYS && used < topics.length; n++, day = addDays(day, 1)) {
    if (!runDays[weekdayIndex(day)] || taken.has(day)) continue;
    const topic = topics[used]!;
    used++;
    if (topic.length > c.maxTopicChars) { out.problems.push({ row: used, message_fa: `موضوع ${faNum(used)} خیلی بلند است.` }); continue; }
    taken.add(day);
    out.entries.push({ date: day, topic, note: null, style_override: null, format: null });
  }
  if (used < topics.length) out.problems.push({ row: used + 1, message_fa: `جای کافی نبود؛ ${faNum(topics.length - used)} موضوع آخر اضافه نشد.` });
  return out;
}
