// Responsibility: the video workspace's clips stage (Phase 11.6, D90–D92): app code, no Claude, buys each clip once through the Vertex door, from the exact last frame of the clip before, records every attempt in video/clips.json before it leaves, measures it, and stops for the owner where money may be at stake.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  CLIP_SECONDS, ClipPlan, ClipsFile, MAX_CLIPS_PER_FILM, clipPromptFile, estimateClipUsd, readJson, writeJson,
  type ClipAttempt, type ClipEntry, type JobRequest, type VideoConfig,
} from '../../contracts/index.js';
import { jobsRepo, usageRepo } from '../../db/repositories.js';
import { faNum } from '../../fa.js';
import { StageError, type Stage, type StageContext, type StageOutput } from '../../orchestrator/stages.js';
import { lastFrame, measureClip, type Tool } from '../../video/measure.js';
import { isUnattended, unattendedSpentTodayUsd } from '../../video/unattended.js';
import {
  VertexError, bodyText, clipBody, countTokens, createClip, defaultVertexDeps, deleteInteraction, isCloudSession, openSession, waitClip,
  type Interaction, type VertexDeps, type VertexSession,
} from '../../video/vertexClient.js';

/** Documented input limit of Omni 1.2 Flash (docs/13 V12); 11.1 measured ≈ 6.7–8 k tokens for a 32 k-character prompt. */
export const MAX_INPUT_TOKENS = 131072;
/** Input tokens assumed for a price shown before countTokens is known (11.1 and 11.4: 6.5–8 k with the start image). */
export const TYPICAL_INPUT_TOKENS = 8000;
/** Input tokens of a start image (11.1: 1,100 at 360p); added to the film estimate for every clip after the first. */
export const START_IMAGE_TOKENS = 1100;

export const clipsPaths = (dir: string) => ({
  file: path.join(dir, 'video', 'clips.json'),
  plan: path.join(dir, 'video', 'clip-plan.json'),
  clips: path.join(dir, 'video', 'clips'),
  frames: path.join(dir, 'video', 'frames'),
  log: path.join(dir, 'logs', 'vertex.jsonl'),
});
const nn = (k: number) => String(k).padStart(2, '0');
export const attemptFile = (k: number, n: number) => `video/clips/clip-${nn(k)}-a${n}.mp4`;
export const startFrameFile = (k: number) => `video/frames/clip-${nn(k)}-start.png`;
const abs = (dir: string, rel: string) => path.join(dir, ...rel.split('/'));
const sha = (b: Buffer | string) => crypto.createHash('sha256').update(b).digest('hex');
export const aspectOf = (req: Pick<JobRequest, 'format'>): '9:16' | '16:9' => (req.format === '16x9' ? '16:9' : '9:16');
/** Money inside a Persian sentence: «۰٫۷۱ دلار» (a «$0.71» inside right-to-left text is drawn with the sign on the wrong side). */
export const usd = (x: number) => `${faNum(x, 2)} دلار`;

/** Paid requests of this process that have not answered yet (`<job dir>#<clip>`): a second send for the same clip is refused (docs/13 V35). */
const inFlight = new Set<string>();

export interface ClipsDeps {
  vertex?: VertexDeps;
  tool?: Tool;
  now?: () => Date;
}

// ---- clips.json, written atomically through the contract after every change.
export function readClips(dir: string): ClipsFile | null {
  const f = clipsPaths(dir).file;
  return fs.existsSync(f) ? readJson(f, ClipsFile) : null;
}
export function writeClips(dir: string, file: ClipsFile): ClipsFile {
  fs.mkdirSync(path.dirname(clipsPaths(dir).file), { recursive: true });
  return writeJson(clipsPaths(dir).file, ClipsFile, file);
}

/** What one attempt counts against the money cap: the real cost when known, the estimate while Google may have charged (sending, unknown). */
const attemptUsd = (a: ClipAttempt) => a.cost_usd_est ?? 0;
export const filmSpentUsd = (f: ClipsFile | null) => (f ? f.clips.reduce((n, c) => n + c.attempts.reduce((m, a) => m + attemptUsd(a), 0), 0) : 0);
/** Price of one clip with the last measured input tokens of that clip (or the typical size). */
export function clipPriceUsd(cfg: VideoConfig, f: Pick<ClipsFile, 'resolution'>, c: ClipEntry | undefined): number {
  const last = c?.attempts.findLast((a) => a.tokens)?.tokens?.input;
  return estimateClipUsd(cfg, f.resolution, last ?? TYPICAL_INPUT_TOKENS);
}

const emptyEntry = (k: number, promptSha: string): ClipEntry => ({
  index: k, prompt_file: clipPromptFile(k), prompt_sha256: promptSha, start_image: k === 1 ? null : startFrameFile(k), start_image_sha256: null,
  status: 'pending', chosen_attempt: null, attempts: [],
});

/**
 * Makes clips.json match the job's prompts. A clip already made keeps every attempt; a finished clip whose prompt file changed (a script
 * edit, docs/13 V21) becomes `stale`; a clip not made yet takes the new prompt's hash.
 */
export function syncClips(dir: string, cfg: VideoConfig, req: JobRequest, count: number): ClipsFile {
  const hashes = Array.from({ length: count }, (_, i) => sha(fs.readFileSync(abs(dir, clipPromptFile(i + 1)))));
  const old = readClips(dir);
  const clips = hashes.map((h, i) => {
    const e = old?.clips[i];
    if (!e) return emptyEntry(i + 1, h);
    if (e.prompt_sha256 === h) return e;
    if (e.status === 'done' || e.status === 'flagged') return { ...e, status: 'stale' as const, prompt_sha256: h };
    return { ...e, prompt_sha256: h };
  });
  return writeClips(dir, {
    version: 1, model: cfg.vertex.model, location: cfg.vertex.location, resolution: old?.resolution ?? cfg.resolution, aspect: aspectOf(req), clip_seconds: CLIP_SECONDS, clips,
  });
}

/** D92 f at resume: a `sending` attempt of a run that is gone becomes `unknown`, unless it has an id that a free GET can ask about. */
export function recoverSending(dir: string, f: ClipsFile, nowIso: string): ClipsFile {
  let changed = false;
  const clips = f.clips.map((c) => {
    const a = c.attempts.at(-1);
    if (c.status !== 'sending' || !a || a.status !== 'sending') return c;
    if (inFlight.has(`${dir}#${c.index}`)) throw new StageError('blocked', `کلیپ ${faNum(c.index)} هنوز از Google جواب نگرفته؛ کمی بعد دوباره «ادامه» را بزن.`, `clip ${c.index} is still in flight in this process`);
    if (a.interaction_id) return c;
    changed = true;
    return { ...c, status: 'unknown' as const, attempts: [...c.attempts.slice(0, -1), { ...a, status: 'unknown' as const, ended_at: nowIso, error: 'cut off after sending (app closed or stopped); Google may have charged' }] };
  });
  return changed ? writeClips(dir, { ...f, clips }) : f;
}

function log(dir: string, row: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(clipsPaths(dir).log), { recursive: true });
  fs.appendFileSync(clipsPaths(dir).log, `${JSON.stringify({ at: new Date().toISOString(), ...row })}\n`, 'utf8');
}

/** Persian messages for a Vertex failure (D91 e); the detail keeps Google's reason, never a token. Also used by the job preflight. */
export function vertexStop(e: VertexError, k: number | null): StageError {
  const at = k ? ` (کلیپ ${faNum(k)})` : '';
  switch (e.kind) {
    case 'no_sdk': return new StageError('blocked', 'Google Cloud CLI پیدا نشد. آن را از https://cloud.google.com/sdk/docs/install نصب کن، وارد شو و بعد «ادامه» را بزن.', e.message);
    case 'signin': return new StageError('blocked', 'ورود به Google Cloud تمام شده؛ دوباره وارد شوید: در ترمینال بزن gcloud auth login و بعد «ادامه» را بزن. کلیپ‌های ساخته‌شده سر جایشان می‌مانند.', e.message);
    case 'unauthorized': return new StageError('blocked', `Google ورود را نپذیرفت (۴۰۱)${at}؛ با gcloud auth login دوباره وارد شو و «ادامه» را بزن. پولی خرج نشد.`, e.message);
    case 'denied': return new StageError('blocked', `Google اجازه نداد${at}: API خاموش است، دسترسی نیست، صورت‌حساب بسته است یا مدل در این منطقه نیست. پولی خرج نشد.`, e.message);
    case 'exhausted': return new StageError('blocked', `اعتبار یا سهمیه‌ی Google Cloud تمام شده${at}. کلیپ‌های ساخته‌شده نگه داشته شد؛ بعد از شارژ «ادامه» از همین کلیپ ادامه می‌دهد.`, e.message);
    case 'refused': return new StageError('blocked', `مدل ویدیو پرامپت${at} را نپذیرفت. فرستادن دوباره‌ی همان پرامپت همان جواب را می‌گیرد، پس خودش دوباره نمی‌فرستد.`, e.message);
    case 'bad_request': return new StageError('failed', `Google درخواست${at} را رد کرد (پولی خرج نشد).`, e.message);
    case 'unknown': return new StageError('blocked', `ارتباط با Google${at} وسط کار قطع شد؛ ممکن است هزینه‌ی این کلیپ گرفته شده باشد. خودش دوباره نمی‌فرستد: «دوباره بساز» یا رها کن.`, e.message);
  }
}

/** A clip that needs the owner before anything is bought: unknown, stale, failed. */
function ownerStop(cfg: VideoConfig, f: ClipsFile, c: ClipEntry): StageError {
  const price = usd(clipPriceUsd(cfg, f, c));
  const k = faNum(c.index);
  if (c.status === 'unknown') return new StageError('blocked', `ممکن است هزینه‌ی کلیپ ${k} گرفته شده باشد (ارتباط وسط ساخت قطع شد). خودش دوباره نمی‌فرستد: «دوباره بساز» (حدود ${price}) یا رها کن.`, `clip ${c.index} unknown`);
  if (c.status === 'stale') {
    const stale = f.clips.filter((x) => x.status === 'stale');
    const total = usd(stale.reduce((n, x) => n + clipPriceUsd(cfg, f, x), 0));
    return new StageError('blocked', `کلیپ ${stale.map((x) => faNum(x.index)).join('، ')} از تصویری ساخته شده که دیگر نیست (یا پرامپتش عوض شده). انتخاب کن: دوباره ساختن (حدود ${total}) یا نگه داشتن همین‌ها.`, `stale clips ${stale.map((x) => x.index).join(',')}`);
  }
  const why = c.attempts.at(-1)?.error ?? '';
  return new StageError('blocked', `کلیپ ${k} ساخته نشد${c.attempts.at(-1)?.flags.includes('refused') ? ' (مدل پرامپت را نپذیرفت)' : ''}. می‌توانی «دوباره بساز» (حدود ${price}) را بزنی.`, `clip ${c.index} failed: ${why}`.slice(0, 600));
}

/** Why the next attempt of a pending clip is bought: the first purchase, an automatic retry of a badly broken clip, or the owner's «دوباره بساز». */
function nextReason(c: ClipEntry): ClipAttempt['reason'] {
  const last = c.attempts.at(-1);
  if (!last) return 'first';
  // A request Google refused before any work (4xx, no charge) is simply sent again for the same reason.
  if (last.status === 'failed' && last.cost_usd_est === 0) return last.reason;
  // D101: a clip that came back with no video is never retried automatically, so the next purchase is the owner's «دوباره بساز».
  if (last.status === 'done' && last.verdict === 'broken' && !last.flags.includes('no_video')) return 'broken_retry';
  return 'owner_rebuild';
}

/** The best attempt to keep after the retries ran out (D92 b): a readable clip with the highest seam SSIM (clip 1: the first readable one). */
function bestAttempt(c: ClipEntry): ClipAttempt | null {
  const usable = c.attempts.filter((a) => a.status === 'done' && a.file && a.measurements);
  if (!usable.length) return null;
  return usable.reduce((b, a) => ((a.measurements!.seam_ssim ?? 1) > (b.measurements!.seam_ssim ?? 1) ? a : b));
}

const setEntry = (f: ClipsFile, c: ClipEntry): ClipsFile => ({ ...f, clips: f.clips.map((x) => (x.index === c.index ? c : x)) });
const setLast = (c: ClipEntry, a: ClipAttempt, status: ClipEntry['status']): ClipEntry => ({ ...c, status, attempts: [...c.attempts.slice(0, -1), a] });

/** After a clip is made again, every finished clip after it started from a frame that no longer exists (docs/13 V20). */
function markLaterStale(f: ClipsFile, k: number): ClipsFile {
  return { ...f, clips: f.clips.map((x) => (x.index > k && (x.status === 'done' || x.status === 'flagged') ? { ...x, status: 'stale' as const } : x)) };
}

interface Loop { ctx: StageContext; cfg: VideoConfig; s: VertexSession; deps: ClipsDeps; nowIso: () => string; jobId: string | null }

/**
 * Phase 11.8 (D108, docs/13 V27): for a scheduled film nobody has touched, the dollars still free under the day's cap for unattended films
 * (all brands; this film's own spending is added by the caller, so it counts whole); null for every other film (only the per-film cap).
 */
function dailyLeftUsd(l: Pick<Loop, 'ctx' | 'cfg' | 'nowIso'>): number | null {
  const { ctx, cfg } = l;
  if (ctx.req.source !== 'schedule' || !isUnattended(ctx.dir)) return null;
  return cfg.max_usd_per_day_unattended - unattendedSpentTodayUsd(ctx.db, ctx.config.paths.jobs, Date.parse(l.nowIso()), ctx.req.slug);
}

function dailyStop(cfg: VideoConfig, left: number, spent: number, cost: number, what: string): StageError {
  const today = cfg.max_usd_per_day_unattended - left;
  return new StageError('blocked', `سقف پول روزانه‌ی فیلم‌های خودکار ویدیو ${usd(cfg.max_usd_per_day_unattended)} است؛ امروز حدود ${usd(today + spent)} خرج شده و ${what} حدود ${usd(cost)} می‌شود. چیزی خریده نشد؛ اگر بخواهی خودت «ادامه» را بزن.`, `daily cap: ${(today + spent).toFixed(3)} + ${cost.toFixed(3)} > ${cfg.max_usd_per_day_unattended}`);
}

/** Saves a finished answer as the attempt's result; returns the clips file and whether this clip is finished. */
async function settle(l: Loop, f: ClipsFile, k: number, got: Interaction, seconds: number): Promise<{ f: ClipsFile; finished: boolean }> {
  const { ctx, cfg } = l;
  let c = f.clips[k - 1]!;
  const a = c.attempts.at(-1)!;
  const p = cfg.price;
  const cost = got.tokens ? (got.tokens.input * p.input_usd_per_mtok + got.tokens.output * p.video_output_usd_per_mtok) / 1e6 : a.cost_usd_est;
  if (got.tokens) {
    usageRepo.insert(ctx.db, { job_id: l.jobId, brand: ctx.req.brand, stage: 'clips', model: cfg.vertex.model, tokens_in: got.tokens.input, tokens_out: got.tokens.output, cache_read: 0, cache_write: 0, cost_usd_est: cost ?? 0, at: l.nowIso() });
  }
  log(ctx.dir, { clip: k, attempt: a.n, call: 'interactions', status: got.status, seconds, tokens: got.tokens, cost_usd_est: cost, interaction_id: got.id });
  if (got.id && cfg.vertex.mode === 'background') {
    try { await deleteInteraction(l.s, got.id); } catch (e) { log(ctx.dir, { clip: k, attempt: a.n, call: 'delete', error: (e as Error).message.slice(0, 200) }); }
  }
  if (!got.video && got.note && /safety|policy|blocked|prohibit|cannot|unable/i.test(got.note)) {
    c = setLast(c, { ...a, status: 'failed', ended_at: l.nowIso(), tokens: got.tokens, cost_usd_est: cost, error: got.note, flags: ['refused'], verdict: null }, 'failed');
    writeClips(ctx.dir, setEntry(f, c));
    throw vertexStop(new VertexError('refused', got.note), k);
  }
  let file: string | null = null;
  let fileSha: string | null = null;
  if (got.video) {
    file = attemptFile(k, a.n);
    fs.mkdirSync(clipsPaths(ctx.dir).clips, { recursive: true });
    fs.writeFileSync(abs(ctx.dir, file), got.video);
    fileSha = sha(got.video);
  }
  const prev = k > 1 ? f.clips[k - 2]! : null;
  const prevFile = prev?.attempts.find((x) => x.n === prev.chosen_attempt)?.file ?? null;
  const m = await measureClip({
    clip: file ? abs(ctx.dir, file) : null, startPng: c.start_image ? abs(ctx.dir, c.start_image) : null, prevClip: prevFile ? abs(ctx.dir, prevFile) : null,
    cfg, aspect: f.aspect, resolution: f.resolution, engineDir: ctx.config.paths.engine, tool: l.deps.tool,
  });
  const done: ClipAttempt = { ...a, status: 'done', ended_at: l.nowIso(), tokens: got.tokens, cost_usd_est: cost, file, file_sha256: fileSha, measurements: m.measurements, verdict: m.verdict, flags: m.flags, error: null };
  if (m.flags.includes('no_video')) {
    // D101 (owner, 2026-11-18): an answer without a video may be a refusal in words the app does not recognise (none recorded yet),
    // and a refusal is never bought again (D92 b). So no automatic retry: the clip stops as failed and the owner chooses, with the price.
    writeClips(ctx.dir, setEntry(f, setLast(c, { ...done, error: got.note ?? `no video in the answer (status ${got.status})` }, 'failed')));
    throw new StageError('blocked', `کلیپ ${faNum(k)} بدون ویدیو برگشت؛ شاید مدل پرامپت را نپذیرفته باشد. خودش دوباره نمی‌خرد: «دوباره بساز» (حدود ${usd(clipPriceUsd(cfg, f, c))}) یا رها کن.`, `clip ${k}: no video (status ${got.status}); note: ${got.note ?? 'none'}`.slice(0, 600));
  }
  if (m.verdict !== 'broken') {
    c = { ...setLast(c, done, m.flags.length ? 'flagged' : 'done'), chosen_attempt: done.n };
    f = setEntry(f, c);
    if (a.reason === 'owner_rebuild') f = markLaterStale(f, k);
    return { f: writeClips(ctx.dir, f), finished: true };
  }
  c = setLast(c, done, 'pending');
  const retries = c.attempts.filter((x) => x.reason === 'broken_retry').length;
  if (retries < cfg.max_retries_per_clip) return { f: writeClips(ctx.dir, setEntry(f, c)), finished: false };
  // D92 b: no third purchase. Keep the best readable attempt with its flags, or stop when none can be used.
  const best = bestAttempt(c);
  if (!best) {
    writeClips(ctx.dir, setEntry(f, { ...c, status: 'failed' }));
    throw new StageError('blocked', `کلیپ ${faNum(k)} بعد از ${faNum(retries + 1)} بار ساختن هم قابل استفاده نشد (${done.flags.join(', ')}). دوباره نمی‌خرد؛ «دوباره بساز» یا رها کن.`, `clip ${k}: no usable attempt`);
  }
  c = { ...c, status: 'flagged', chosen_attempt: best.n };
  f = setEntry(f, c);
  if (c.attempts.some((x) => x.reason === 'owner_rebuild')) f = markLaterStale(f, k);
  return { f: writeClips(ctx.dir, f), finished: true };
}

/** Makes one clip: start frame, the prompt's bytes, free countTokens, the money cap, the `sending` record, the paid request, the answer. */
async function makeClip(l: Loop, f: ClipsFile, k: number): Promise<ClipsFile> {
  const { ctx, cfg } = l;
  for (;;) {
    let c = f.clips[k - 1]!;
    if (c.status === 'sending') {
      // Background mode after a resume: the id is known, so a free GET fetches the clip instead of buying it again.
      const a = c.attempts.at(-1)!;
      const t0 = Date.now();
      let got: Interaction;
      try { got = await waitClip(l.s, a.interaction_id!); } catch (e) {
        if (!(e instanceof VertexError)) throw e;
        f = writeClips(ctx.dir, setEntry(f, setLast(c, { ...a, status: 'unknown', ended_at: l.nowIso(), error: e.message.slice(0, 600) }, 'unknown')));
        throw ownerStop(cfg, f, f.clips[k - 1]!);
      }
      const r = await settle(l, f, k, got, (Date.now() - t0) / 1000);
      f = r.f;
      if (r.finished) return f;
      continue;
    }
    if (ctx.signal?.aborted) throw new Error('stopped by the owner before the next clip');

    // The start image is the exact last frame of the chosen attempt of the clip before (none for clip 1).
    let startImage: Buffer | null = null;
    if (k > 1) {
      const prev = f.clips[k - 2]!;
      const prevFile = prev.attempts.find((x) => x.n === prev.chosen_attempt)?.file;
      if (!prevFile) throw new StageError('failed', `کلیپ ${faNum(k - 1)} فایل ندارد، پس کلیپ ${faNum(k)} نقطه‌ی شروع ندارد.`, `clip ${k - 1} has no chosen file`);
      await lastFrame(abs(ctx.dir, prevFile), abs(ctx.dir, startFrameFile(k)), l.deps.tool);
      startImage = fs.readFileSync(abs(ctx.dir, startFrameFile(k)));
      c = { ...c, start_image: startFrameFile(k), start_image_sha256: sha(startImage) };
    }

    // docs/13 V11: the text that goes out is the prompt file's bytes, word for word.
    const bytes = fs.readFileSync(abs(ctx.dir, c.prompt_file));
    const text = bytes.toString('utf8');
    const body = clipBody(cfg, { text, startImage, aspect: f.aspect, resolution: f.resolution, seconds: CLIP_SECONDS });
    const promptSha = sha(bytes);
    if (sha(Buffer.from(bodyText(body), 'utf8')) !== promptSha || promptSha !== c.prompt_sha256) {
      throw new StageError('failed', `متن درخواست کلیپ ${faNum(k)} با فایل پرامپت یکی نیست؛ چیزی فرستاده نشد.`, `clip ${k}: body text hash differs from ${c.prompt_file}`);
    }

    // Free: the input size (V12) and the price of this request; then the money cap (V37), before any spend.
    let tokens: number;
    try { tokens = await countTokens(l.s, { text, startImage }); } catch (e) { if (e instanceof VertexError) throw vertexStop(e, k); throw e; }
    log(ctx.dir, { clip: k, call: 'countTokens', tokens });
    if (tokens > MAX_INPUT_TOKENS) throw new StageError('failed', `پرامپت کلیپ ${faNum(k)} برای مدل بلند است (${faNum(tokens)} توکن؛ بیشترین ${faNum(MAX_INPUT_TOKENS)}). چیزی خرج نشد.`, `clip ${k}: ${tokens} input tokens > ${MAX_INPUT_TOKENS}`);
    const estimate = estimateClipUsd(cfg, f.resolution, tokens);
    const spent = filmSpentUsd(f);
    if (spent + estimate > cfg.max_usd_per_film + 1e-9) {
      throw new StageError('blocked', `سقف هزینه‌ی این فیلم ${usd(cfg.max_usd_per_film)} است؛ تا اینجا حدود ${usd(spent)} خرج شده و کلیپ ${faNum(k)} حدود ${usd(estimate)} می‌شود. چیزی خریده نشد.`, `money cap: ${spent.toFixed(3)} + ${estimate.toFixed(3)} > ${cfg.max_usd_per_film}`);
    }
    const left = dailyLeftUsd(l);
    if (left !== null && spent + estimate > left + 1e-9) throw dailyStop(cfg, left, spent, estimate, `کلیپ ${faNum(k)}`);

    const key = `${ctx.dir}#${k}`;
    if (inFlight.has(key)) throw new StageError('blocked', `برای کلیپ ${faNum(k)} یک درخواست در راه است؛ دومی فرستاده نمی‌شود.`, `clip ${k}: second send refused`);
    const reason = nextReason(c);
    const attempt: ClipAttempt = {
      n: c.attempts.length + 1, reason, status: 'sending', sent_at: l.nowIso(), ended_at: null, prompt_sha256: promptSha, start_image_sha256: c.start_image_sha256,
      interaction_id: null, http_status: null, error: null, tokens: null, cost_usd_est: estimate, file: null, file_sha256: null, measurements: null, verdict: null, flags: [],
    };
    inFlight.add(key);
    const t0 = Date.now();
    let got: Interaction;
    try {
      got = await createClip(l.s, body, {
        // D92 f: written before the bytes leave; a crash from here on leaves `sending`, which a resume turns into `unknown`.
        beforeSend: () => { f = writeClips(ctx.dir, setEntry(f, { ...c, status: 'sending', chosen_attempt: null, attempts: [...c.attempts, attempt] })); },
        onId: (id) => { const cur = f.clips[k - 1]!; f = writeClips(ctx.dir, setEntry(f, setLast(cur, { ...cur.attempts.at(-1)!, interaction_id: id }, 'sending'))); },
      });
    } catch (e) {
      if (!(e instanceof VertexError)) throw e;
      const cur = f.clips[k - 1]!;
      const sentNow = cur.attempts.length > c.attempts.length;
      if (sentNow) {
        const charged = e.kind === 'unknown';
        const status = charged ? 'unknown' : 'failed';
        const entryStatus: ClipEntry['status'] = charged ? 'unknown' : e.kind === 'refused' ? 'failed' : 'pending';
        const last = cur.attempts.at(-1)!;
        f = writeClips(ctx.dir, setEntry(f, setLast(cur, {
          ...last, status, ended_at: l.nowIso(), http_status: e.httpStatus, error: e.message.slice(0, 600), cost_usd_est: charged ? estimate : 0, flags: e.kind === 'refused' ? ['refused'] : [],
        }, entryStatus)));
        log(ctx.dir, { clip: k, attempt: last.n, call: 'interactions', error_kind: e.kind, http: e.httpStatus, seconds: (Date.now() - t0) / 1000 });
      }
      throw vertexStop(e, k);
    } finally { inFlight.delete(key); }
    const r = await settle(l, f, k, got, (Date.now() - t0) / 1000);
    f = r.f;
    if (r.finished) return f;
  }
}

/** How many clips this job has: the plan's count, every prompt file present, at most the cap (D92 a, docs/13 V36). */
function clipCount(dir: string, cfg: VideoConfig): number {
  const plan = readJson(clipsPaths(dir).plan, ClipPlan);
  const n = plan.clips.length;
  const cap = Math.min(cfg.max_clips_per_film, MAX_CLIPS_PER_FILM);
  if (n > cap) throw new StageError('blocked', `این ویدیو ${faNum(n)} کلیپ لازم دارد؛ بیشترین تعداد ${faNum(cap)} است. چیزی خریده نشد.`, `clips ${n} > ${cap}`);
  for (let k = 1; k <= n; k++) if (!fs.existsSync(abs(dir, clipPromptFile(k)))) throw new StageError('failed', `پرامپت کلیپ ${faNum(k)} پیدا نشد.`, clipPromptFile(k));
  return n;
}

export function clipsStage(deps: ClipsDeps = {}): Stage {
  return {
    name: 'clips',
    async run(ctx: StageContext): Promise<StageOutput> {
      if (ctx.req.workspace !== 'video') throw new StageError('failed', 'مرحله‌ی کلیپ‌ها فقط برای کار ویدیو است.', `workspace ${ctx.req.workspace}`);
      const vd = deps.vertex ?? defaultVertexDeps();
      if (isCloudSession(vd)) throw new StageError('blocked', 'ویدیو فقط روی کامپیوتر خودت ساخته می‌شود (در نشست ابری Google Cloud CLI نیست).', 'D89: video jobs run on the owner PC only');
      const cfg = ctx.config.cfg.video;
      const nowIso = () => (deps.now ? deps.now() : new Date()).toISOString();
      const count = clipCount(ctx.dir, cfg);
      let f = syncClips(ctx.dir, cfg, ctx.req, count);
      f = recoverSending(ctx.dir, f, nowIso());

      // Anything that needs the owner stops here before any Google call (unknown, stale, failed).
      const waiting = f.clips.find((c) => c.status === 'unknown' || c.status === 'stale' || c.status === 'failed');
      if (waiting) throw ownerStop(cfg, f, waiting);

      let s: VertexSession;
      try { s = await openSession(cfg, vd); } catch (e) { if (e instanceof VertexError) throw vertexStop(e, null); throw e; }
      const l: Loop = { ctx, cfg, s, deps, nowIso, jobId: jobsRepo.bySlug(ctx.db, ctx.req.slug)?.id ?? null };
      // Free film preflight (D91 e, task 7): countTokens on the first clip still to make prices every clip still to make; over the cap = stop before any spend.
      const todo = f.clips.filter((c) => c.status === 'pending');
      if (todo.length) {
        const first = todo[0]!;
        let tokens: number;
        try { tokens = await countTokens(s, { text: fs.readFileSync(abs(ctx.dir, first.prompt_file)).toString('utf8'), startImage: null }); } catch (e) { if (e instanceof VertexError) throw vertexStop(e, first.index); throw e; }
        const spent = filmSpentUsd(f);
        const film = todo.reduce((n, c) => n + estimateClipUsd(cfg, f.resolution, tokens + (c.index > 1 ? START_IMAGE_TOKENS : 0)), 0);
        log(ctx.dir, { call: 'countTokens', purpose: 'film estimate', clip: first.index, tokens, clips_to_make: todo.length, estimate_usd: film, spent_usd: spent });
        if (spent + film > cfg.max_usd_per_film + 1e-9) {
          throw new StageError('blocked', `برآورد ساخت ${faNum(todo.length)} کلیپ حدود ${usd(film)} است${spent ? ` (و تا اینجا ${usd(spent)} خرج شده)` : ''}؛ سقف هزینه‌ی هر فیلم ${usd(cfg.max_usd_per_film)} است. چیزی خریده نشد.`, `film estimate ${(spent + film).toFixed(3)} > cap ${cfg.max_usd_per_film}`);
        }
        // D108: a film that does not fit in what is left of the day's cap for unattended films buys nothing at all (no half film).
        const left = dailyLeftUsd(l);
        if (left !== null && spent + film > left + 1e-9) throw dailyStop(cfg, left, spent, film, `ساخت ${faNum(todo.length)} کلیپ این فیلم`);
      }
      for (let k = 1; k <= count; k++) {
        const c = f.clips[k - 1]!;
        if (c.status === 'done' || c.status === 'flagged') continue;
        // A clip made again marks the finished ones after it stale (V20): nothing more is bought before the owner chooses.
        if (c.status === 'unknown' || c.status === 'stale' || c.status === 'failed') throw ownerStop(cfg, f, c);
        f = await makeClip(l, f, k);
      }
      const chosen = f.clips.map((c) => c.attempts.find((a) => a.n === c.chosen_attempt)!.file!);
      return { outputs: ['video/clips.json', ...chosen], tokens: { in: 0, out: 0 }, cost_usd_est: filmSpentUsd(f) };
    },
  };
}
