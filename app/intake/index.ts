// Responsibility: turn a CLI/UI request or a calendar entry into a validated JobRequest with a unique slug, checking the input's [ ] directions and the owner images (docs/03 S0).
import { APP_TIMEZONE } from '../calendar/zone.js';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { JobRequest, parseOrThrow, type Attachment, type JobRequest as JobRequestT } from '../contracts/index.js';

/** An input the owner must fix; nothing is created. */
export class IntakeError extends Error {
  constructor(public readonly message_fa: string, detail = '') { super(`${message_fa}${detail ? ` (${detail})` : ''}`); this.name = 'IntakeError'; }
}

/** Throws when a `[` is never closed or a `]` has no `[` (D41). Nesting is allowed as long as every bracket is closed. */
export function checkBrackets(text: string): void {
  let depth = 0;
  for (const [i, ch] of [...text].entries()) {
    if (ch === '[') depth++;
    else if (ch === ']' && --depth < 0) throw new IntakeError('در متن یک «]» بدون «[» هست؛ متن داخل کروشه توضیح ساخت است و باید بسته شود.', `position ${i}`);
  }
  if (depth > 0) throw new IntakeError('در متن یک «[» باز مانده؛ متن داخل کروشه توضیح ساخت است و باید با «]» بسته شود.', `${depth} unclosed`);
}

/** The input without its build directions: every `[…]` removed (nested ones too), spaces normalised. With the hook switch off this is the voice-over (D41). */
export function stripDirections(text: string): string {
  let out = '';
  let depth = 0;
  for (const ch of text) {
    if (ch === '[') { depth++; out += ' '; continue; }
    if (ch === ']') { depth = Math.max(0, depth - 1); continue; }
    if (depth === 0) out += ch;
  }
  return out.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').replace(/ ([.,،؛:!?؟])/g, '$1').trim();
}

export interface IntakeLimits { max_brief_chars: number; max_images: number; max_image_mb: number }

/** Image type from the file's first bytes, not its name (a renamed file is caught). */
export function imageKind(head: Buffer): 'png' | 'jpg' | 'webp' | null {
  if (head.length >= 8 && head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'jpg';
  if (head.length >= 12 && head.toString('latin1', 0, 4) === 'RIFF' && head.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return null;
}

export interface PreparedImage { source: string; attachment: Attachment }

/** Validates the owner images (count, type, size) and names their copies `input/NN.<ext>`; nothing is copied yet. */
export function prepareImages(files: string[], limits: IntakeLimits): PreparedImage[] {
  if (files.length > limits.max_images) throw new IntakeError(`حداکثر ${limits.max_images} تصویر برای هر فیلم.`, `${files.length} given`);
  return files.map((source, i) => {
    if (!fs.existsSync(source) || !fs.statSync(source).isFile()) throw new IntakeError(`تصویر «${path.basename(source)}» پیدا نشد.`, source);
    const data = fs.readFileSync(source);
    const kind = imageKind(data.subarray(0, 16));
    if (!kind) throw new IntakeError(`«${path.basename(source)}» تصویر PNG، JPG یا WebP نیست.`, source);
    if (data.length > limits.max_image_mb * 1024 * 1024) throw new IntakeError(`«${path.basename(source)}» بزرگ‌تر از ${limits.max_image_mb} مگابایت است.`, `${data.length} bytes`);
    return { source, attachment: { file: `input/${String(i + 1).padStart(2, '0')}.${kind}`, original_name: path.basename(source), sha256: createHash('sha256').update(data).digest('hex'), bytes: data.length } };
  });
}

/** Copies the prepared images into the job folder and checks each copy's hash. */
export function copyImages(dir: string, images: PreparedImage[]): void {
  if (images.length === 0) return;
  fs.mkdirSync(path.join(dir, 'input'), { recursive: true });
  for (const im of images) {
    const dest = path.join(dir, ...im.attachment.file.split('/'));
    fs.copyFileSync(im.source, dest);
    if (createHash('sha256').update(fs.readFileSync(dest)).digest('hex') !== im.attachment.sha256) throw new IntakeError(`کپی تصویر «${im.attachment.original_name}» خراب شد.`, dest);
  }
}

/** Checks the input text: not empty, within the length limit, balanced [ ]; with the hook off, something must remain to be voiced. */
export function checkInput(topic: string, hookWritesVoice: boolean, limits: IntakeLimits): void {
  if (!topic.trim()) throw new IntakeError('متن ورودی خالی است.');
  if ([...topic].length > limits.max_brief_chars) throw new IntakeError(`متن ورودی بیشتر از ${limits.max_brief_chars} حرف است.`, `${[...topic].length} chars`);
  checkBrackets(topic);
  if (!hookWritesVoice && !stripDirections(topic)) throw new IntakeError('هوک خاموش است ولی بیرون از کروشه‌ها متنی برای گوینده نمانده.');
}

const FA_TO_LATIN: Record<string, string> = {
  'آ': 'a', 'ا': 'a', 'أ': 'a', 'إ': 'e', 'ب': 'b', 'پ': 'p', 'ت': 't', 'ث': 's', 'ج': 'j', 'چ': 'ch', 'ح': 'h', 'خ': 'kh',
  'د': 'd', 'ذ': 'z', 'ر': 'r', 'ز': 'z', 'ژ': 'zh', 'س': 's', 'ش': 'sh', 'ص': 's', 'ض': 'z', 'ط': 't', 'ظ': 'z', 'ع': '',
  'غ': 'gh', 'ف': 'f', 'ق': 'gh', 'ک': 'k', 'ك': 'k', 'گ': 'g', 'ل': 'l', 'م': 'm', 'ن': 'n', 'و': 'v', 'ه': 'h', 'ة': 'h',
  'ی': 'i', 'ي': 'i', 'ى': 'i', 'ئ': 'i', 'ؤ': 'v', 'ء': '',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
};

/** Latin, lowercase, dash-separated form of a topic (Persian letters transliterated, everything else dropped), at most `max` chars. */
export function slugPart(topic: string, max = 30): string {
  const latin = [...topic.normalize('NFC').replace(/[ً-ْٰ]/g, '')].map((ch) => FA_TO_LATIN[ch] ?? ch).join('');
  const s = latin.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const cut = s.slice(0, max).replace(/-+$/g, '');
  return cut || 'video';
}

/** Gregorian yyyy-mm-dd of `when` in `timeZone` (default: the app's zone, D63). */
export function localDate(when: Date, timeZone = APP_TIMEZONE): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(when);
}

/** `yyyy-mm-dd_<topic-part>`; a taken slug gets `-2`, `-3`, … (docs/03 S0). */
export function makeSlug(topic: string, when: Date, isTaken: (slug: string) => boolean, timeZone?: string): string {
  const base = `${localDate(when, timeZone)}_${slugPart(topic)}`;
  if (!isTaken(base)) return base;
  for (let n = 2; ; n++) if (!isTaken(`${base}-${n}`)) return `${base}-${n}`;
}

export interface ManualInput {
  topic: string;
  topicNote?: string | null;
  references: string[];
  format: '9x16' | '16x9';
  automationLevel: 'full' | 'review';
  hookWritesVoice?: boolean;
  attachments?: Attachment[];
  /** Started from New video's «از تقویم محتوا»: the calendar day this film makes. */
  calendarEntryId?: string | null;
  /** The brand the film is made for (Phase 8): the active brand when New video was filled. */
  brand: string;
}

export interface ScheduledInput {
  topic: string;
  topicNote: string | null;
  reference: string;
  format: '9x16' | '16x9';
  automationLevel: 'full' | 'review';
  calendarEntryId: string;
  styleSource: 'day_override' | 'suggest' | 'weekday' | 'rotate' | 'fixed';
  /** The schedule's brand (Phase 8). */
  brand: string;
}

/** The request of a film the scheduler starts for a calendar day (docs/08): the day's topic with the hook on, no images, the chosen reference. */
export function requestFromSchedule(input: ScheduledInput, isTaken: (slug: string) => boolean, when: Date = new Date()): JobRequestT {
  const topic = input.topic.trim();
  return parseOrThrow(JobRequest, {
    id: randomUUID(),
    slug: makeSlug(topic, when, isTaken),
    created_at: when.toISOString(),
    source: 'schedule',
    topic,
    topic_note: input.topicNote,
    hook_writes_voice: true,
    attachments: [],
    references: [input.reference],
    format: input.format,
    automation_level: input.automationLevel,
    calendar_entry_id: input.calendarEntryId,
    style_source: input.styleSource,
    brand: input.brand,
  }, 'request.json');
}

export function requestFromManual(input: ManualInput, isTaken: (slug: string) => boolean, when: Date = new Date()): JobRequestT {
  const topic = input.topic.trim();
  return parseOrThrow(JobRequest, {
    id: randomUUID(),
    slug: makeSlug(topic, when, isTaken),
    created_at: when.toISOString(),
    source: 'manual',
    topic,
    topic_note: input.topicNote ?? null,
    hook_writes_voice: input.hookWritesVoice ?? true,
    attachments: input.attachments ?? [],
    references: input.references,
    format: input.format,
    automation_level: input.automationLevel,
    calendar_entry_id: input.calendarEntryId ?? null,
    style_source: 'manual',
    brand: input.brand,
  }, 'request.json');
}
