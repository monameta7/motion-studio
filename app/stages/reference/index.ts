// Responsibility: for each reference of a job, check the video's SHA-256, make its thumbnail and preview, and read it once through motion-plan §3 unless a valid cached reading exists (docs/03 S4, docs/07).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { runClaude, type RunOptions, type RunResult } from '../../ai/claudeRunner.js';
import { renderPrompt } from '../../ai/prompts/index.js';
import { brandDir } from '../../brands/index.js';
import type { LoadedConfig } from '../../config.js';
import { ReferenceMeta, ReferenceReading, readJson, writeJson } from '../../contracts/index.js';
import { jobsRepo, usageRepo } from '../../db/repositories.js';
import { StageError, type Stage, type StageContext, type StageOutput } from '../../orchestrator/stages.js';
import { runTool, type RunResult as ToolResult } from '../../proc.js';

export type RunFn = (o: RunOptions, c: LoadedConfig) => Promise<RunResult>;
export type Tool = (cmd: string, args: string[], opts?: { cwd?: string; timeoutMs?: number }) => Promise<ToolResult>;

export const LOW_BUILDABLE_PCT = 60;
export const LOW_BUILDABLE_FA = 'این مرجع بیشتر فیلم یا عکس واقعی است؛ خروجی شبیه آن نمی‌شود.';

export interface RefPaths { dir: string; video: string; meta: string; reading: string; thumb: string; preview: string }
export const refPaths = (refsDir: string, slug: string): RefPaths => {
  const dir = path.join(refsDir, slug);
  return { dir, video: path.join(dir, 'video.mp4'), meta: path.join(dir, 'meta.json'), reading: path.join(dir, 'reading.json'), thumb: path.join(dir, 'thumb.webp'), preview: path.join(dir, 'preview.mp4') };
};

export async function sha256File(file: string): Promise<string> {
  const h = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) h.update(chunk as Buffer);
  return h.digest('hex');
}

/** The hash a reading was made from. */
export const readingHash = (r: ReferenceReading): string | undefined => r.sha256 ?? r.key?.sha256;

interface Shot { span?: unknown; built?: unknown }

// D55/Q21: the build makes real 3D in three.js, so a shot the reading marks as a 3D render counts as buildable; live footage,
// real photos or faces and painted illustration do not, even inside a 3D shot.
const NOT_CODE = /footage|live[- ]?action|filmed|camera shot|photo|real (face|person|people|human)|painted|hand[- ]?drawn|illustrat/i;
export const shotBuildable = (built: string): boolean => /^code\b/i.test(built) || (/3d/i.test(built) && !NOT_CODE.test(built));

/** Share of the read shot time that can be built in code (code, or 3D per D55); null when the table has no usable shots. */
export function codeBuildablePct(reading: Record<string, unknown>): number | null {
  const shots = Array.isArray(reading.shots) ? (reading.shots as Shot[]) : [];
  let total = 0;
  let code = 0;
  for (const s of shots) {
    if (!Array.isArray(s.span) || s.span.length !== 2) continue;
    const len = Number(s.span[1]) - Number(s.span[0]);
    if (!(len > 0)) continue;
    total += len;
    if (typeof s.built === 'string' && shotBuildable(s.built.trim())) code += len;
  }
  return total > 0 ? Math.round((code / total) * 1000) / 10 : null;
}

const validReading = (file: string, sha: string): ReferenceReading | null => {
  if (!fs.existsSync(file)) return null;
  try {
    const r = readJson(file, ReferenceReading);
    return readingHash(r) === sha ? r : null;
  } catch { return null; }
};

/** D79: true when the reference can be used without its video: its reading is the one made from the video that meta.json names. */
export function usableWithoutVideo(refsDir: string, slug: string): boolean {
  const p = refPaths(refsDir, slug);
  try { return validReading(p.reading, readJson(p.meta, ReferenceMeta).sha256) !== null; } catch { return false; }
}

/** How the plan prompt names one reference; a reference whose video is not on this machine is named by its reading alone (D79). */
export function referenceForPrompt(refsDir: string, slug: string): string {
  const p = refPaths(refsDir, slug);
  if (fs.existsSync(p.video) || !usableWithoutVideo(refsDir, slug)) return `${p.video} (reading: ${p.reading})`;
  return `reference ${slug}: its video file is not on this machine; use its cached reading as it is (reading: ${p.reading})`;
}

export interface ReferenceResult { slug: string; sha256: string; cached: boolean; code_buildable_pct: number | null; warnings_fa: string[] }

/** thumb.webp: frame at 30 % of the duration, 480 px wide; preview.mp4: 3 s from 20 %, 360 px wide, no audio, CRF 30 (docs/07). */
export async function makeThumbs(p: RefPaths, duration: number, run: Tool): Promise<void> {
  const fail = (what: string, r: ToolResult) => new StageError('failed', `ساخت ${what} مرجع با ffmpeg خطا داد.`, (r.stderr || r.error || '').slice(-800));
  const r1 = await run('ffmpeg', ['-y', '-loglevel', 'error', '-ss', (duration * 0.3).toFixed(3), '-i', p.video, '-frames:v', '1', '-vf', 'scale=480:-2', p.thumb], { timeoutMs: 120000 });
  if (r1.code !== 0 || !fs.existsSync(p.thumb)) throw fail('تصویر بندانگشتی', r1);
  const r2 = await run('ffmpeg', ['-y', '-loglevel', 'error', '-ss', (duration * 0.2).toFixed(3), '-t', '3', '-i', p.video, '-an', '-vf', 'scale=360:-2', '-c:v', 'libx264', '-crf', '30', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', p.preview], { timeoutMs: 120000 });
  if (r2.code !== 0 || !fs.existsSync(p.preview)) throw fail('پیش‌نمایش', r2);
}

export interface DecodeOptions {
  config: LoadedConfig;
  slug: string;
  /** Folder whose `logs/` gets the Claude stream log (the job folder, or `refs/_ingest/<slug>` for the library). */
  logRoot: string;
  /** The brand folder the reading call may read (Phase 8): the job's brand, or the active brand for a library read. */
  brandDir: string | null;
  runFn: RunFn;
  tool: Tool;
  signal?: AbortSignal;
  onUsage?: (r: RunResult) => void;
  /** false for a library add (the reference is not used by a film yet). */
  markUsed?: boolean;
}

/** Thumb, preview and reading of one reference: reuses a reading valid for the video's hash, otherwise reads it once through motion-plan §3. */
export async function decodeReference(o: DecodeOptions): Promise<{ result: ReferenceResult; usage: { in: number; out: number; cost: number } }> {
  const { slug } = o;
  const p = refPaths(o.config.paths.refs, slug);
  const usage = { in: 0, out: 0, cost: 0 };
  // D79: a starter-library reference comes without its video; its reading (made from the video meta.json names) is enough.
  const hasVideo = fs.existsSync(p.video);
  if (!fs.existsSync(p.meta) || (!hasVideo && !fs.existsSync(p.reading))) throw new StageError('blocked', `مرجع «${slug}» پیدا نشد (video.mp4 یا meta.json).`, p.dir);
  let meta: ReferenceMeta;
  try { meta = readJson(p.meta, ReferenceMeta); } catch (e) { throw new StageError('blocked', `اطلاعات مرجع «${slug}» خراب است.`, (e as Error).message); }
  if (!hasVideo && !validReading(p.reading, meta.sha256)) throw new StageError('blocked', `ویدیوی مرجع «${slug}» روی این کامپیوتر نیست و تحلیل آماده‌اش هم معتبر نیست.`, p.reading);
  const sha = hasVideo ? await sha256File(p.video) : meta.sha256;

  if (hasVideo && (sha !== meta.sha256 || !fs.existsSync(p.thumb) || !fs.existsSync(p.preview))) await makeThumbs(p, meta.duration, o.tool);

  let reading = validReading(p.reading, sha);
  const cached = reading !== null;
  if (!reading) {
    const logs = path.join(o.logRoot, 'logs');
    const workDir = path.join(o.logRoot, 'reference-work', slug);
    fs.mkdirSync(logs, { recursive: true });
    fs.mkdirSync(workDir, { recursive: true });
    const prompt = renderPrompt('reference', { videoFile: p.video, readingFile: p.reading, name: meta.name_fa, rightsNote: meta.rights_note, sha256: sha, workDir });
    const attempt = fs.readdirSync(logs).filter((f) => f.startsWith('reference-')).length + 1;
    const r = await o.runFn({ stage: 'reference', jobDir: o.logRoot, brandDir: o.brandDir, attempt, prompt, signal: o.signal }, o.config);
    usage.in += r.usage.input_tokens; usage.out += r.usage.output_tokens; usage.cost += r.costUsdEst;
    o.onUsage?.(r);
    if (r.rateLimited && !r.ok) throw new StageError('paused_quota', 'سهمیه‌ی Claude پر شد؛ بعد از آزاد شدن خودش ادامه می‌دهد.', r.error ?? 'rate limit', r.resumeAt);
    if (!r.ok) throw new StageError('failed', `خواندن مرجع «${slug}» با Claude خطا داد.`, r.error ?? '');
    if (!fs.existsSync(p.reading)) throw new StageError('failed', `Claude فایل reading.json مرجع «${slug}» را ننوشت.`, p.reading);
    // The skill may write the hash as key.sha256; the app adds the top-level one from the real file (docs/04).
    let raw: Record<string, unknown>;
    try { raw = JSON.parse(fs.readFileSync(p.reading, 'utf8').replace(new RegExp('^' + String.fromCharCode(0xfeff)), '')) as Record<string, unknown>; } catch (e) {
      throw new StageError('failed', `reading.json مرجع «${slug}» JSON درست نیست.`, (e as Error).message);
    }
    const claimed = (raw.key as { sha256?: unknown } | undefined)?.sha256 ?? raw.sha256;
    if (claimed !== undefined && claimed !== sha) throw new StageError('failed', `reading.json مرجع «${slug}» برای فیلم دیگری ساخته شده.`, `${String(claimed)} != ${sha}`);
    raw.sha256 = sha;
    fs.writeFileSync(p.reading, `${JSON.stringify(raw, null, 2)}\n`, 'utf8');
    reading = validReading(p.reading, sha);
    if (!reading) throw new StageError('failed', `reading.json مرجع «${slug}» معتبر نیست.`, p.reading);
    // The contact sheets are only needed during the read (the 28 library reads left 672 MB).
    fs.rmSync(workDir, { recursive: true, force: true });
  }

  const pct = codeBuildablePct(reading);
  const lastUsed = o.markUsed === false ? meta.last_used_at : new Date().toISOString();
  writeJson(p.meta, ReferenceMeta, { ...meta, sha256: sha, code_buildable_pct: pct, last_used_at: lastUsed });
  const warnings_fa = pct !== null && pct < LOW_BUILDABLE_PCT ? [LOW_BUILDABLE_FA] : [];
  return { result: { slug, sha256: sha, cached, code_buildable_pct: pct, warnings_fa }, usage };
}

export function referenceStage(runFn: RunFn = (o, c) => runClaude(o, { config: c }), tool: Tool = runTool): Stage {
  return {
    name: 'reference',
    async run(ctx: StageContext): Promise<StageOutput> {
      if (ctx.req.references.length === 0) throw new StageError('blocked', 'برای این کار هیچ مرجعی انتخاب نشده.', 'JobRequest.references is empty');
      const totals = { in: 0, out: 0, cost: 0 };
      const results: ReferenceResult[] = [];
      const jobId = jobsRepo.bySlug(ctx.db, ctx.req.slug)?.id ?? null;
      fs.mkdirSync(path.join(ctx.dir, 'logs'), { recursive: true });

      for (const slug of ctx.req.references) {
        const { result, usage } = await decodeReference({
          config: ctx.config, slug, logRoot: ctx.dir, brandDir: brandDir(ctx.config.paths, ctx.req.brand), runFn, tool, signal: ctx.signal,
          onUsage: (r) => usageRepo.insert(ctx.db, {
            job_id: jobId, brand: ctx.req.brand, stage: 'reference', model: r.model, tokens_in: r.usage.input_tokens, tokens_out: r.usage.output_tokens,
            cache_read: r.usage.cache_read_input_tokens, cache_write: r.usage.cache_creation_input_tokens, cost_usd_est: r.costUsdEst,
          }),
        });
        totals.in += usage.in; totals.out += usage.out; totals.cost += usage.cost;
        results.push(result);
      }

      const out = 'logs/reference.json';
      fs.writeFileSync(path.join(ctx.dir, out), `${JSON.stringify({ references: results }, null, 2)}\n`, 'utf8');
      return { outputs: [out], tokens: { in: totals.in, out: totals.out }, cost_usd_est: totals.cost };
    },
  };
}
