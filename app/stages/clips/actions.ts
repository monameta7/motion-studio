// Responsibility: what the job page shows and does with a video job's clips (Phase 11.6 tasks 5, 6): the progress view with the money used, and the owner's paid choices («دوباره بساز» one clip, stale clips made again or kept), each only with the price shown first.
import fs from 'node:fs';
import { ClipPlan, readJson, type ClipEntry, type ClipsFile, type VideoConfig } from '../../contracts/index.js';
import { faNum } from '../../fa.js';
import { clipPriceUsd, clipsPaths, filmSpentUsd, readClips, writeClips } from './index.js';

export class ClipActionError extends Error {
  constructor(public readonly message_fa: string) { super(message_fa); this.name = 'ClipActionError'; }
}

export interface ClipView {
  index: number;
  status: ClipEntry['status'];
  /** The chosen attempt's clip (job-relative path) for the preview; null until one is finished. */
  file: string | null;
  flags: string[];
  attempts: number;
  seam_ssim: number | null;
  speech_s: number | null;
  /** What «دوباره بساز» of this clip would cost now (estimate). */
  price_usd: number;
}

export interface ClipsView {
  count: number;
  finished: number;
  /** The clip being made now or next (1-based); null when all are finished. */
  current: number | null;
  spent_usd: number;
  cap_usd: number;
  resolution: string;
  clips: ClipView[];
  /** What the owner must choose before anything more is bought; with its price. */
  choice: { kind: 'unknown' | 'stale' | 'failed'; clips: number[]; price_usd: number } | null;
}

const finishedOf = (c: ClipEntry) => c.status === 'done' || c.status === 'flagged';
const r2 = (x: number) => Math.round(x * 100) / 100;

export function clipsView(dir: string, cfg: VideoConfig): ClipsView | null {
  const f = readClips(dir);
  let count = f?.clips.length ?? 0;
  if (!f) {
    if (!fs.existsSync(clipsPaths(dir).plan)) return null;
    try { count = readJson(clipsPaths(dir).plan, ClipPlan).clips.length; } catch { return null; }
  }
  const clips: ClipView[] = (f?.clips ?? []).map((c) => {
    const chosen = c.attempts.find((a) => a.n === c.chosen_attempt) ?? null;
    return {
      index: c.index, status: c.status, file: chosen?.file ?? null, flags: chosen?.flags ?? c.attempts.at(-1)?.flags ?? [], attempts: c.attempts.length,
      seam_ssim: chosen?.measurements?.seam_ssim ?? null, speech_s: chosen?.measurements?.speech_s ?? null, price_usd: r2(clipPriceUsd(cfg, f!, c)),
    };
  });
  const finished = clips.filter((c) => c.status === 'done' || c.status === 'flagged').length;
  const waiting = f?.clips.filter((c) => c.status === 'unknown' || c.status === 'stale' || c.status === 'failed') ?? [];
  const kind = waiting.find((c) => c.status === 'unknown') ? 'unknown' : waiting.find((c) => c.status === 'stale') ? 'stale' : waiting.length ? 'failed' : null;
  const ofKind = kind ? waiting.filter((c) => c.status === kind) : [];
  const next = f?.clips.find((c) => !finishedOf(c));
  return {
    count, finished, current: f ? (next?.index ?? null) : 1, spent_usd: r2(filmSpentUsd(f)), cap_usd: cfg.max_usd_per_film, resolution: f?.resolution ?? cfg.resolution, clips,
    choice: kind ? { kind, clips: ofKind.map((c) => c.index), price_usd: r2(ofKind.reduce((n, c) => n + clipPriceUsd(cfg, f!, c), 0)) } : null,
  };
}

function load(dir: string): ClipsFile {
  const f = readClips(dir);
  if (!f) throw new ClipActionError('هنوز کلیپی برای این کار ساخته نشده است.');
  if (f.clips.some((c) => c.status === 'sending')) throw new ClipActionError('یک کلیپ همین الان در راه است؛ صبر کن تا جوابش برسد.');
  return f;
}

/** The owner's «دوباره بساز» for one clip (paid; the page shows the price first). The clips after it become stale once it is made (V20). */
export function rebuildClip(dir: string, cfg: VideoConfig, index: number): { price_usd: number } {
  const f = load(dir);
  const c = f.clips[index - 1];
  if (!c) throw new ClipActionError(`کلیپ ${faNum(index)} در این کار نیست.`);
  if (c.status === 'pending') throw new ClipActionError(`کلیپ ${faNum(index)} هنوز ساخته نشده؛ با «ادامه» ساخته می‌شود.`);
  const price = clipPriceUsd(cfg, f, c);
  writeClips(dir, { ...f, clips: f.clips.map((x) => (x.index === index ? { ...x, status: 'pending' as const, chosen_attempt: null } : x)) });
  return { price_usd: r2(price) };
}

/** Stale clips (made from a frame that is gone, or before a script edit): made again (paid) or kept as they are. */
export function decideStale(dir: string, cfg: VideoConfig, choice: 'rebuild' | 'keep'): { clips: number[]; price_usd: number } {
  const f = load(dir);
  const stale = f.clips.filter((c) => c.status === 'stale');
  if (!stale.length) throw new ClipActionError('کلیپ کهنه‌ای در این کار نیست.');
  const price = stale.reduce((n, c) => n + clipPriceUsd(cfg, f, c), 0);
  writeClips(dir, {
    ...f,
    clips: f.clips.map((c) => {
      if (c.status !== 'stale') return c;
      if (choice === 'rebuild') return { ...c, status: 'pending' as const, chosen_attempt: null };
      const chosen = c.attempts.find((a) => a.n === c.chosen_attempt);
      return { ...c, status: chosen?.flags.length ? ('flagged' as const) : ('done' as const) };
    }),
  });
  return { clips: stale.map((c) => c.index), price_usd: r2(choice === 'rebuild' ? price : 0) };
}
