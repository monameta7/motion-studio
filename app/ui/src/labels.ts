// Responsibility: the Persian words the screens use for job statuses and the six stages the owner sees (docs/11 §2).
import type { ClaudeEffort, ClaudeModel, ClaudeStage, JobDetail, JobStatus, RefGroup, StageName, Workspace } from './api';

/** The two sides of the workspace switch and each job's label (owner, 2026-11-16: «موشن | ویدیو»). */
export const WORKSPACE_FA: Record<Workspace, string> = { motion: 'موشن', video: 'ویدیو' };

/** The library groups of docs/07 in Persian. */
export const GROUP_FA: Record<RefGroup, string> = {
  type: 'تایپوگرافی', ui: 'رابط کاربری', char: 'شخصیت و اکسپلینر', data: 'داده و نمودار', abs: 'انتزاعی', edit: 'مجله‌ای', term: 'ترمینال و کد', other: 'دیگر',
};

export const STATUS_FA: Record<JobStatus, string> = {
  queued: 'در صف', running: 'در حال ساخت', awaiting_approval: 'منتظر تأیید نقشه', held: 'نگه داشته شده برای اصلاح سناریو',
  blocked: 'متوقف شد؛ کار تو لازم است', failed: 'خطا', paused_quota: 'سهمیه پر شد؛ بعداً ادامه می‌دهد', interrupted: 'نیمه‌کاره',
  done: 'آماده', cancelled: 'لغو شد',
};

/** «توقف» pauses a job (D53): it waits as `interrupted` with this detail. */
export const isPaused = (j: JobDetail) => j.status === 'interrupted' && j.state.error?.detail === 'paused by the owner';
export const statusText = (j: JobDetail) => (isPaused(j) ? 'مکث (با «توقف»)' : STATUS_FA[j.status]);

export type RowState = 'done' | 'running' | 'waiting' | 'stopped';

export type Row = { key: string; label: string; stages: StageName[] };

/** The six rows of the In-progress list, each made of one or more pipeline stages. */
export const ROWS: Row[] = [
  { key: 'content', label: 'سناریو و پکیج محتوا', stages: ['preflight', 'content'] },
  { key: 'truth', label: 'کنترل کیفیت', stages: ['content'] },
  { key: 'voice', label: 'صدای گوینده', stages: ['voice'] },
  { key: 'plan', label: 'نقشه‌ی صحنه‌ها', stages: ['reference', 'plan'] },
  { key: 'build', label: 'ساخت موشن', stages: ['build'] },
  { key: 'package', label: 'بسته‌ی خروجی', stages: ['package'] },
];

/** The rows of a video job (D88): the same content and voice, then the video stages (built in 11.4, 11.6, 11.7). */
export const VIDEO_ROWS: Row[] = [
  { key: 'content', label: 'سناریو و پکیج محتوا', stages: ['preflight', 'content'] },
  { key: 'truth', label: 'کنترل کیفیت', stages: ['content'] },
  { key: 'voice', label: 'صدای گوینده', stages: ['voice'] },
  { key: 'prompts', label: 'پرامپت کلیپ‌ها', stages: ['prompts'] },
  { key: 'clips', label: 'ساخت کلیپ‌ها', stages: ['clips'] },
  { key: 'assemble', label: 'سرهم کردن و بسته‌ی خروجی', stages: ['assemble', 'package'] },
];

/** The rows of the job's own workspace. */
export const rowsFor = (ws: Workspace): Row[] => (ws === 'video' ? VIDEO_ROWS : ROWS);

/** The stage order of each workspace, as on the server (STAGE_ORDERS). */
export const STAGE_ORDER_OF: Record<Workspace, StageName[]> = {
  motion: ['preflight', 'content', 'voice', 'reference', 'plan', 'build', 'package'],
  video: ['preflight', 'content', 'voice', 'prompts', 'clips', 'assemble', 'package'],
};

export const BUILD_STEPS = ['ساخت صحنه‌ها', 'رندر پیش‌نویس و کنترل خطا', 'رندر نهایی', 'موسیقی و افکت و لوگوموشن پایانی', 'کاور'];

export function rowState(j: JobDetail, stages: StageName[]): RowState {
  const st = stages.map((s) => j.state.stages[s]?.status ?? 'pending');
  if (st.every((s) => s === 'done' || s === 'skipped')) return 'done';
  const live = j.status === 'running' && j.state.stage !== null && stages.includes(j.state.stage);
  if (live) return 'running';
  if (j.state.stage !== null && stages.includes(j.state.stage) && j.status !== 'queued' && j.status !== 'awaiting_approval') return 'stopped';
  return 'waiting';
}

/** Phase 12: one plain sentence under the running stage, saying what is happening right now (motion and video rows). */
export const NOW_FA: Record<string, string> = {
  content: 'سناریو، متن روی صفحه، کاور و کپشن نوشته می‌شود.',
  truth: 'هر ادعای متن با منبع سنجیده می‌شود و اگر لازم باشد متن یک دور دیگر بهتر می‌شود.',
  voice: 'گوینده متن را می‌خواند و هر کلمه روی زمان صدا علامت می‌خورد.',
  plan: 'مرجع خوانده می‌شود و صحنه‌ها روی زمان صدا چیده می‌شوند.',
  build: 'صحنه‌ها ساخته، رندر و یکی‌یکی کنترل می‌شوند.',
  package: 'فیلم نهایی، کاور و کپشن کنار هم گذاشته می‌شوند.',
  prompts: 'برای هر کلیپ ده‌ثانیه‌ای یک پرامپت نوشته می‌شود.',
  clips: 'کلیپ‌ها یکی‌یکی ساخته می‌شوند؛ هر کلیپ از آخرین فریم کلیپ قبلی شروع می‌شود.',
  assemble: 'کلیپ‌ها، صدا و لوگوی پایانی کنار هم گذاشته می‌شوند.',
};

export const ROW_STATE_FA: Record<RowState, string> = { done: 'انجام شد', running: 'در حال انجام', waiting: 'در انتظار', stopped: 'متوقف' };

/** Model and thinking-level names in the UI (D64): never the English ids. */
export const MODEL_FA: Record<ClaudeModel, string> = { 'claude-opus-5-5': 'Opus 5.5', 'claude-sonnet-5-5': 'Sonnet 5.5', 'claude-haiku-5-5': 'Haiku 5.5' };
export const MODEL_LINE: Record<ClaudeModel, string> = {
  'claude-opus-5-5': 'دقیق‌ترین، سهمیه را زودتر تمام می‌کند',
  'claude-sonnet-5-5': 'متعادل و سریع',
  'claude-haiku-5-5': 'سریع‌ترین و ارزان‌ترین، برای کارهای ساده',
};
export const EFFORT_FA: Record<ClaudeEffort, string> = { high: 'بالا', xhigh: 'خیلی بالا', max: 'حداکثر' };
export const EFFORT_LINE: Record<ClaudeEffort, string> = {
  high: 'برای بیشتر کارها کافی است',
  xhigh: 'بیشتر فکر می‌کند؛ کندتر است و سهمیه را زودتر تمام می‌کند',
  max: 'بیشترین فکر؛ کندترین است و سهمیه را خیلی زودتر تمام می‌کند',
};

/** Each Claude stage in plain words: a name and one line of what it does. */
export const STAGE_INFO: Record<ClaudeStage, { name: string; line: string }> = {
  'content-hook': { name: 'نوشتن متن ویدیو', line: 'هوک، متن گوینده، متن روی صفحه، کاور و کپشن را می‌نویسد.' },
  'content-truth': { name: 'بازبینی و راستی‌آزمایی', line: 'به متن نمره می‌دهد و هر ادعا را با منبع بررسی می‌کند.' },
  'content-hook-revise': { name: 'اصلاح متن ویدیو', line: 'ایرادهایی را که بازبینی پیدا کرده در متن درست می‌کند.' },
  reference: { name: 'خواندن ویدیوی مرجع', line: 'سبک حرکت و ظاهر هر مرجع تازه را یک بار می‌خواند و نگه می‌دارد.' },
  plan: { name: 'نقشه‌ی صحنه‌ها', line: 'صحنه‌ها، زمان‌بندی و حرکت‌ها را روی صدای گوینده می‌چیند.' },
  build: { name: 'ساخت موشن', line: 'کد صحنه‌ها را می‌نویسد، رندر می‌گیرد و فیلم نهایی را می‌سازد.' },
  revise: { name: 'اصلاح فیلم', line: 'اصلاحی را که بعد از ساخت خواستی روی فیلم اعمال می‌کند.' },
  'brand-build': { name: 'ساخت سندهای برند', line: 'از پاسخ‌های «برند من» راهنمای برند، سیستم طراحی و سیستم کاور را می‌نویسد.' },
  prompts: { name: 'پرامپت کلیپ‌ها (ویدیو)', line: 'در کار ویدیو برای هر کلیپ ۱۰ ثانیه‌ای یک پرامپت انگلیسی می‌نویسد؛ برای برند تازه یک بار برگه‌ی برند را هم می‌نویسد.' },
  suggest: { name: 'پیشنهاد سبک', line: 'برای هر موضوع سه مرجع از کتابخانه پیشنهاد می‌دهد و برای مرجع تازه اسم می‌گذارد.' },
};
/** Order of the rows in the «مدل‌ها» card: the film's stages in the order they run, then the small calls. */
export const STAGE_ORDER: ClaudeStage[] = ['content-hook', 'content-truth', 'content-hook-revise', 'reference', 'plan', 'build', 'revise', 'prompts', 'brand-build', 'suggest'];
/** Stages where Haiku is too weak (D64: the picker warns). */
export const HAIKU_WEAK: ClaudeStage[] = ['plan', 'build'];
