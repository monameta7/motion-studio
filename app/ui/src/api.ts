// Responsibility: the UI's only door to the local server: typed fetch helpers for /api and the shapes they return (mirrors app/api).
export type JobStatus = 'queued' | 'running' | 'awaiting_approval' | 'held' | 'blocked' | 'failed' | 'paused_quota' | 'interrupted' | 'done' | 'cancelled';
export type StageName = 'preflight' | 'content' | 'voice' | 'reference' | 'plan' | 'build' | 'package';

export interface JobSummary {
  slug: string; topic: string; title: string; format: '9x16' | '16x9'; references: string[]; status: JobStatus; stage: StageName | null;
  created_at: string; updated_at: string; duration: number | null; truth_score: number | null; active?: boolean;
  /** The job's brand (Phase 8): its slug and the name the cards show. */
  brand: string; brand_name: string;
  /** Who started it (Phase 10): the owner or the schedule. */
  source: 'manual' | 'schedule';
}

export interface Status {
  quota: { fresh: boolean; ageMin: number | null; fiveHourPct: number | null; sevenDayPct: number | null; fiveHourResetsAt: string | null; app_tokens_5h: number; max_5h_pct_to_start: number; max_7d_pct_to_start: number };
  claude: { login_ok: boolean; auth_method: string | null; build: StageSetting; content: StageSetting };
  /** `key_set`: a Gemini key is known to the app (D65); without it the voice is locked. */
  voice: { up: boolean; has_key: boolean; key_set: boolean; voice: string };
  estimate_min: number | null;
  stage_avg_min: Partial<Record<StageName, number>>;
  running: string | null;
  queued: string[];
  /** The next film the schedule starts: its calendar day and start moment. */
  next_run: { date: string; at: string; brand: string; brand_name: string } | null;
}

export class ApiError extends Error {
  constructor(public readonly status: number, message_fa: string, public readonly body?: unknown) { super(message_fa); }
}

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, headers: body === undefined || body instanceof FormData ? {} : { 'content-type': 'application/json' } };
  if (body !== undefined) init.body = body instanceof FormData ? body : JSON.stringify(body);
  let res: Response;
  try { res = await fetch(url, init); } catch { throw new ApiError(0, 'سرور استودیو در دسترس نیست؛ آیا npm start اجرا شده؟'); }
  const data = (await res.json().catch(() => ({}))) as T & { error_fa?: string };
  if (!res.ok) throw new ApiError(res.status, data.error_fa ?? `خطای سرور (${res.status})`, data);
  return data;
}

export const api = {
  get: <T>(url: string) => call<T>('GET', url),
  post: <T>(url: string, body: unknown = {}) => call<T>('POST', url, body),
  put: <T>(url: string, body: unknown) => call<T>('PUT', url, body),
  del: <T>(url: string) => call<T>('DELETE', url),
};

export interface RefCard {
  slug: string; name_fa: string; use_fa: string; group: 'type' | 'ui' | 'char' | 'data' | 'abs' | 'edit' | 'term' | 'other'; tags: string[];
  duration: number; format: '9x16' | '16x9'; analysed: boolean; thumb: boolean; preview: boolean;
  source: 'library' | 'upload'; code_buildable_pct: number | null; warning_fa: string | null;
  read: { state: 'queued' | 'reading' | 'failed'; error_fa: string | null } | null;
}

export type RefGroup = RefCard['group'];

export type CalendarStatus = 'planned' | 'queued' | 'running' | 'awaiting_approval' | 'done' | 'failed' | 'skipped' | 'empty';
export interface CalendarEntry {
  id: string; date: string; topic: string; note: string | null; style_override: string | null; format: '9x16' | '16x9' | null; status: CalendarStatus; job_id: string | null;
  /** Each brand has its own calendar (Phase 8). */
  brand: string;
  /** A film made in the last 30 days that this topic is too like (docs/08); null when none. */
  similar?: { topic: string; date: string } | null;
}

/** The banner data: automation off with planned days, and topics running low (only while automation is on). */
export interface Warnings { automation_off: { planned: number } | null; topics_low: { remaining: number; last_date: string | null } | null }
/** A month of the calendar; `run_days` is Saturday … Friday, `today` is the server's date in the schedule's zone. */
/** `brand`: whose calendar this is; `run_days` and `enabled` come from that brand's own schedule (Phase 8). */
export interface CalendarRange { entries: CalendarEntry[]; today: string; run_days: boolean[]; enabled: boolean; brand: string }

/** A brand of the sidebar switcher (Phase 8). */
export interface BrandCard { slug: string; name: string; logo: boolean }
export interface BrandsView { brands: BrandCard[]; active: string | null }
export interface ImportSummary { added: number; problems: string[] }

export type ClaudeStage = 'content-hook' | 'content-hook-revise' | 'content-truth' | 'reference' | 'suggest' | 'plan' | 'build' | 'revise' | 'brand-build';
export type ClaudeModel = 'claude-opus-5-5' | 'claude-sonnet-5-5' | 'claude-haiku-5-5';
export type ClaudeEffort = 'high' | 'xhigh' | 'max';
export interface StageSetting { model: ClaudeModel; effort: ClaudeEffort }

/** The Claude account card (app/api/accountRoutes.ts). */
export interface ClaudeAccount { logged_in: boolean; ok: boolean; email: string | null; plan: string | null; message_fa: string | null; error_fa?: string }
/** The Gemini key, masked; the key itself never comes to the UI. */
export interface KeyView { set: boolean; masked: string | null; source: 'env' | 'secrets' | 'legacy_env' | null; source_fa: string | null; env_locked: boolean; outcome?: string; message_fa?: string }
export interface SystemItem { id: string; label_fa: string; ok: boolean; fix_fa: string | null; command: string | null }

export interface Upload { id: string; name: string; bytes: number; kind: string }

export interface Settings {
  voice: string; voices: string[]; tone: string; tones: string[];
  quota: { max_5h_pct_to_start: number; max_7d_pct_to_start: number; app_tokens_5h_budget: number | null };
  claude_stages: Record<ClaudeStage, StageSetting>;
  claude_recommended: Record<ClaudeStage, StageSetting>;
  claude_models: ClaudeModel[];
  claude_efforts: ClaudeEffort[];
  paths: Record<string, string>;
  /** Set after a model/level change: «از کار بعدی». */
  applies_fa?: string;
  intake: { max_brief_chars: number; max_images: number; max_image_mb: number };
}

export interface StageState { status: 'pending' | 'running' | 'done' | 'failed' | 'skipped'; started_at: string | null; ended_at: string | null }
export interface ScriptLine { id: number; text: string; changed: boolean; on_screen: { index: number; text: string; role: string; changed: boolean }[] }
export interface ScriptView { lines: ScriptLine[]; voice_made: boolean; edits: number }
export interface PlanView { total_duration: number; reference: string; rows: { id: number; start: number; end: number; beat: string; component: string; picture: string; texts: string[] }[]; risks: string[] }
export interface Manifest {
  slug: string; topic: string; format: string; duration: number; total_duration: number; references: string[]; truth_score: number; truth_rounds: number;
  qa: { passed: boolean; flaws: string[] }; metrics: { wall_minutes: number; tokens_in: number; tokens_out: number; cost_usd_est: number }; created_at: string;
}

export interface JobDetail extends JobSummary {
  request: { topic: string; hook_writes_voice: boolean; attachments: { file: string; original_name: string }[]; references: string[]; format: string; automation_level: 'full' | 'review'; created_at: string };
  state: { status: JobStatus; stage: StageName | null; started_at: string | null; updated_at: string; resume_at: string | null; stages: Partial<Record<StageName, StageState>>; error: { stage: string; message_fa: string; detail: string } | null; hold: { stage: StageName } | null };
  rounds: { round: number; score: number; passed: boolean; caps: string[] }[];
  pass_score: number;
  script: ScriptView | null;
  /** D77: the truth rounds ran out below the gate; the last script is shown with two choices. */
  script_blocked: boolean;
  script_accepted: boolean;
  plan: PlanView | null;
  manifest: Manifest | null;
  qa_md: string | null;
  caption: string | null;
  voice_file: string | null;
  voice: { voice: string; tone: string; tone_source: string; reasons: { tone: string; points: number; why: string }[] } | null;
  verify: { measure: { duration: number; lufs: number | null; true_peak_dbtp: number | null; w: number | null; h: number | null; fps: number | null } | null; voice_lost: [number, number][] | null; problems: string[] } | null;
  revisions: { at: string; target: string; note?: string; backup: string; unexpected?: string[] }[];
  /** A revision that was cut off (app closed or restarted mid-way); null otherwise. */
  revision_pending: { at: string; target: string; note: string; backup: string } | null;
  active: boolean;
  queued: boolean;
  last_error: string | null;
}

export const fileUrl = (slug: string, rel: string) => `/api/jobs/${slug}/files/${rel.split('/').map(encodeURIComponent).join('/')}`;
