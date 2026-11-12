// Responsibility: add an owner-given video to the reference library or as a one-time upload (docs/07): validate it, reuse an entry with the same SHA-256, store it in refs/<slug>/ with its meta.json, thumb and preview, then decode it once.
import fs from 'node:fs';
import path from 'node:path';
import type { LoadedConfig } from '../config.js';
import { ReferenceMeta, readJson, writeJson } from '../contracts/index.js';
import { referencesRepo, usageRepo } from '../db/repositories.js';
import { activeBrandDir, activeBrandSlug } from '../brands/index.js';
import { faNum } from '../fa.js';
import type { Db } from '../db/db.js';
import { decodeReference, makeThumbs, refPaths, sha256File, type ReferenceResult, type RunFn, type Tool } from '../stages/reference/index.js';

export const MAX_BYTES = 200 * 1024 * 1024;
export const MAX_DURATION_S = 90;
export const VIDEO_EXT = ['.mp4', '.mov', '.webm'];

/** A problem with the owner's file that the screen can show as it is (Persian). */
export class UploadError extends Error {}

export interface Probe { duration: number; width: number; height: number }

export async function probeVideo(file: string, tool: Tool): Promise<Probe> {
  const r = await tool('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', file], { timeoutMs: 60000 });
  if (r.code !== 0) throw new Error(`ffprobe failed: ${(r.stderr || r.error || '').slice(-400)}`);
  const j = JSON.parse(r.stdout) as { streams?: { width?: number; height?: number }[]; format?: { duration?: string } };
  const s = j.streams?.[0];
  const duration = Number(j.format?.duration);
  if (!s?.width || !s.height || !(duration > 0)) throw new Error('no video stream or duration');
  return { duration, width: s.width, height: s.height };
}

/** Portrait (taller than wide) is 9x16; landscape and square are 16x9 (docs/04 has only the two formats). */
export const formatOf = (p: Probe): ReferenceMeta['format'] => (p.height > p.width ? '9x16' : '16x9');

/** Problems that stop an add, in Persian for the owner; empty when the file is acceptable. */
export function validateVideo(file: string, bytes: number, p: Probe, maxDurationS: number = MAX_DURATION_S): string[] {
  const out: string[] = [];
  if (!VIDEO_EXT.includes(path.extname(file).toLowerCase())) out.push('فقط فایل MP4، MOV یا WebM پذیرفته می‌شود.');
  if (bytes > MAX_BYTES) out.push('حجم ویدیو بیشتر از ۲۰۰ مگابایت است.');
  if (p.duration > maxDurationS) out.push(`ویدیو بیشتر از ${faNum(maxDurationS)} ثانیه است.`);
  return out;
}

/** The slug whose meta.json records this hash (library and one-time uploads; not _trash), or null. */
export function findBySha(refsDir: string, sha: string): string | null {
  let dirs: string[];
  try { dirs = fs.readdirSync(refsDir, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('_')).map((d) => d.name); } catch { return null; }
  for (const slug of dirs) {
    try { if (readJson(refPaths(refsDir, slug).meta, ReferenceMeta).sha256 === sha) return slug; } catch { /* folder without a valid meta.json */ }
  }
  return null;
}

export interface AddInput {
  file: string;
  /** The folder name; a function gets the video's SHA-256 (known only after a .mov or .webm is re-encoded). */
  slug: string | ((sha256: string) => string);
  name_fa: string;
  use_fa: string;
  tags: string[];
  group: ReferenceMeta['group'];
  rights_note: string;
  /** 'library' = saved in the library; 'upload' = used once, hidden from the library (docs/07 step 5). */
  source?: ReferenceMeta['source'];
}

export interface AddOptions {
  config: LoadedConfig;
  db: Db;
  runFn: RunFn;
  tool: Tool;
  maxDurationS?: number;
  signal?: AbortSignal;
}

/** `existed`: the video was already stored before this call; `promoted`: a one-time upload that this call saved to the library. */
export type StoreResult = { kind: 'duplicate'; slug: string; of: string } | { kind: 'stored'; slug: string; duration: number; existed: boolean; promoted: boolean };

/** A .mov or .webm is re-encoded to MP4 next to the source, so every library video is video.mp4 with its own hash. */
async function asMp4(file: string, tool: Tool): Promise<{ file: string; temp: boolean }> {
  if (path.extname(file).toLowerCase() === '.mp4') return { file, temp: false };
  const out = `${file}.converted.mp4`;
  const r = await tool('ffmpeg', ['-y', '-loglevel', 'error', '-i', file, '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', out], { timeoutMs: 600000 });
  if (r.code !== 0 || !fs.existsSync(out)) throw new UploadError('ویدیو خوانده نشد؛ فایل خراب است یا فرمتش پشتیبانی نمی‌شود.');
  return { file: out, temp: true };
}

/**
 * Validates and stores one video (copy, meta.json, thumb, preview) without reading it. A video already in the library or among
 * the one-time uploads is reused; saving it to the library then promotes that entry. Re-running on the same file does nothing.
 */
export async function storeReference(input: AddInput, o: AddOptions): Promise<StoreResult> {
  const refs = o.config.paths.refs;
  const source = input.source ?? 'library';
  const probe = await probeVideo(input.file, o.tool).catch(() => { throw new UploadError('ویدیو خوانده نشد؛ فایل خراب است یا فرمتش پشتیبانی نمی‌شود.'); });
  const problems = validateVideo(input.file, fs.statSync(input.file).size, probe, o.maxDurationS);
  const mp4 = await asMp4(input.file, o.tool);
  try {
    const sha = await sha256File(mp4.file);
    const slug = typeof input.slug === 'function' ? input.slug(sha) : input.slug;
    const existing = findBySha(refs, sha);
    if (existing) {
      const ep = refPaths(refs, existing);
      const meta = readJson(ep.meta, ReferenceMeta);
      const promote = meta.source === 'upload' && source === 'library';
      if (promote) writeJson(ep.meta, ReferenceMeta, { ...meta, source: 'library', name_fa: input.name_fa, use_fa: input.use_fa, tags: input.tags, group: input.group });
      return existing === slug || promote ? { kind: 'stored', slug: existing, duration: meta.duration, existed: true, promoted: promote } : { kind: 'duplicate', slug, of: existing };
    }
    if (problems.length > 0) throw new UploadError(problems.join(' '));
    const p = refPaths(refs, slug);
    if (fs.existsSync(p.dir)) throw new Error(`refs/${slug} already exists with another video`);
    fs.mkdirSync(p.dir, { recursive: true });
    fs.copyFileSync(mp4.file, p.video);
    const duration = Math.round(probe.duration * 100) / 100;
    writeJson(p.meta, ReferenceMeta, {
      slug, name_fa: input.name_fa, use_fa: input.use_fa, tags: input.tags, group: input.group,
      duration, format: formatOf(probe), sha256: sha, code_buildable_pct: null,
      source, rights_note: input.rights_note, added_at: new Date().toISOString(), last_used_at: null,
    });
    await makeThumbs(p, duration, o.tool);
    return { kind: 'stored', slug, duration, existed: false, promoted: false };
  } finally {
    if (mp4.temp) fs.rmSync(mp4.file, { force: true });
  }
}

/** Reads a stored reference once (cached when its reading is valid) and records the Claude cost. */
export async function decodeStored(slug: string, o: AddOptions): Promise<{ result: ReferenceResult; cost_usd_est: number }> {
  const refs = o.config.paths.refs;
  const { result, usage } = await decodeReference({
    // A library read belongs to no film: the active brand's folder and usage label (Phase 8).
    config: o.config, slug, logRoot: path.join(refs, '_ingest', slug), brandDir: activeBrandDir(o.db, o.config), runFn: o.runFn, tool: o.tool, signal: o.signal, markUsed: false,
    onUsage: (r) => usageRepo.insert(o.db, {
      job_id: null, brand: activeBrandSlug(o.db, o.config), stage: 'reference', model: r.model, tokens_in: r.usage.input_tokens, tokens_out: r.usage.output_tokens,
      cache_read: r.usage.cache_read_input_tokens, cache_write: r.usage.cache_creation_input_tokens, cost_usd_est: r.costUsdEst,
    }),
  });
  referencesRepo.upsert(o.db, readJson(refPaths(refs, slug).meta, ReferenceMeta), result.sha256);
  return { result, cost_usd_est: usage.cost };
}

export type AddResult =
  | { kind: 'duplicate'; slug: string; of: string }
  | { kind: 'added'; slug: string; duration: number; result: ReferenceResult; cost_usd_est: number };

/** Adds one video and reads it (the owner's list add, `npm run lib:add`). */
export async function addToLibrary(input: AddInput, o: AddOptions): Promise<AddResult> {
  const stored = await storeReference(input, o);
  if (stored.kind === 'duplicate') return stored;
  const { result, cost_usd_est } = await decodeStored(stored.slug, o);
  return { kind: 'added', slug: stored.slug, duration: stored.duration, result, cost_usd_est };
}

// Calibrated on the measured library reads ($0.77 to $2.21 for 9 to 124 s videos, 3 to 8 minutes): a long video gets twice the
// measured rate as its time and budget limit, never less than the config value, so a 2-minute reference is not killed mid-read.
const MIN_PER_VIDEO_S = 3.6 / 22.85;
const USD_PER_VIDEO_S = 0.77 / 22.85;
export function readLimits(config: LoadedConfig, durationS: number): { timeoutMs: number; budgetUsd: number } {
  const { timeouts_min, max_budget_usd_per_call } = config.cfg.claude;
  return {
    timeoutMs: Math.max(timeouts_min.reference, Math.ceil(durationS * MIN_PER_VIDEO_S * 2)) * 60000,
    budgetUsd: Math.max(max_budget_usd_per_call.reference, Math.ceil(durationS * USD_PER_VIDEO_S * 2)),
  };
}
