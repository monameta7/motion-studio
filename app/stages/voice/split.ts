// Responsibility: cut the one-request voice-over (D32) into one clip per script line at the pauses between sentences, checked against the line count.
import { FRAME_S, envelopeDb, type Pcm } from './wav.js';

export class SplitError extends Error {}

export interface Gap { start: number; end: number; dur: number; center: number }

export interface Segment {
  index: number;
  /** Seconds in the original take, after trimming the edges. */
  start: number;
  end: number;
  pcm: Pcm;
}

export interface SplitResult {
  segments: Segment[];
  /** Pauses chosen as line boundaries (N−1 of them). */
  cuts: Gap[];
  /** How many pauses of the attempt that worked were candidates; more than N−1 means the choice used the text-length estimate. */
  candidates: number;
  thresholdDb: number;
  minGapS: number;
}

const PAD_S = 0.04;
/** Silence = this far below the speech level; relaxed step by step when the take has fewer clear pauses than lines. */
const SILENCE_BELOW_DB = [30, 25, 20];
const MIN_GAP_S = [0.18, 0.12, 0.08, 0.05];

function percentile(sorted: number[], q: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
}

/** Runs of quiet frames strictly inside the speech (not the leading or trailing silence). */
export function findGaps(env: number[], thresholdDb: number, minGapS: number): { gaps: Gap[]; first: number; last: number } {
  const loud = env.map((v) => v >= thresholdDb);
  const first = loud.indexOf(true);
  const last = loud.lastIndexOf(true);
  if (first < 0) return { gaps: [], first: -1, last: -1 };
  const gaps: Gap[] = [];
  let i = first;
  while (i <= last) {
    if (loud[i]) { i++; continue; }
    let j = i;
    while (j <= last && !loud[j]) j++;
    const dur = (j - i) * FRAME_S;
    if (dur >= minGapS) gaps.push({ start: i * FRAME_S, end: j * FRAME_S, dur, center: ((i + j) / 2) * FRAME_S });
    i = j;
  }
  return { gaps, first, last };
}

/**
 * Picks `need` increasing pauses so that every clip has about the length its text predicts (relative error, so a clip that is a quarter of the
 * expected length costs as much as one four times too long), with a small bonus for long pauses. The text-length model is the same for all lines,
 * so it needs no tuning per voice or tone. (A first version scored only the boundary positions and a long pause after a colon beat the true boundary.)
 */
export function chooseCuts(gaps: Gap[], need: number, weights: number[], speechStart: number, speechEnd: number): Gap[] {
  if (gaps.length === need) return gaps;
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const span = Math.max(speechEnd - speechStart, FRAME_S);
  const seg = (from: number, to: number, k: number) => Math.min(3, Math.abs(Math.log(Math.max(to - from, FRAME_S) / Math.max((weights[k]! / total) * span, FRAME_S))));
  const bonus = (g: Gap) => 0.5 * Math.min(g.dur, 0.8);
  const INF = Number.POSITIVE_INFINITY;
  // best[k][g]: cheapest placement of boundaries 0..k with boundary k on gap g, counting the clips before it.
  const best: number[][] = Array.from({ length: need }, () => new Array<number>(gaps.length).fill(INF));
  const from: number[][] = Array.from({ length: need }, () => new Array<number>(gaps.length).fill(-1));
  for (let g = 0; g < gaps.length; g++) best[0]![g] = seg(speechStart, gaps[g]!.center, 0) - bonus(gaps[g]!);
  for (let k = 1; k < need; k++) {
    for (let g = 0; g < gaps.length; g++) {
      for (let h = 0; h < g; h++) {
        const c = best[k - 1]![h]! + seg(gaps[h]!.center, gaps[g]!.center, k) - bonus(gaps[g]!);
        if (c < best[k]![g]!) { best[k]![g] = c; from[k]![g] = h; }
      }
    }
  }
  let g = 0;
  let bestTotal = INF;
  for (let i = 0; i < gaps.length; i++) {
    const c = best[need - 1]![i]! + seg(gaps[i]!.center, speechEnd, need);
    if (c < bestTotal) { bestTotal = c; g = i; }
  }
  const picked: Gap[] = [];
  for (let k = need - 1; k >= 0; k--) { picked.unshift(gaps[g]!); g = from[k]![g]!; }
  return picked;
}

/** Characters per second of every clip must stay near the film's median; a wrong cut shows up as one clip far too short and its neighbour too long. */
export function assertPlausible(segments: Segment[], weights: number[]): void {
  if (segments.length < 3) return;
  const rates = segments.map((s, i) => weights[i]! / Math.max(s.end - s.start, FRAME_S));
  const median = [...rates].sort((a, b) => a - b)[Math.floor(rates.length / 2)]!;
  const off = rates.map((r, i) => ({ r, i })).filter(({ r }) => r < median * 0.45 || r > median * 2.2);
  if (off.length) throw new SplitError(`implausible split: line ${off.map(({ i }) => i + 1).join(', ')} speak(s) at ${off.map(({ r }) => r.toFixed(1)).join(', ')} chars/s against a median of ${median.toFixed(1)}; a cut is probably on the wrong pause`);
}

/**
 * Splits `pcm` into `weights.length` clips. `weights` are the text lengths of the lines (they only decide between several candidate pauses).
 * Throws when the take has fewer pauses than lines even with the relaxed settings; the caller must not guess.
 */
export function splitTake(pcm: Pcm, weights: number[]): SplitResult {
  const lines = weights.length;
  const env = envelopeDb(pcm);
  const speech = env.filter((v) => v > -70).sort((a, b) => a - b);
  if (!speech.length) throw new SplitError('the take is silent');
  const level = percentile(speech, 0.9);

  let found: { gaps: Gap[]; first: number; last: number; thresholdDb: number; minGapS: number } | null = null;
  if (lines === 1) {
    const thresholdDb = level - SILENCE_BELOW_DB[0]!;
    const r = findGaps(env, thresholdDb, 99);
    found = { ...r, thresholdDb, minGapS: 99 };
  } else {
    outer: for (const below of SILENCE_BELOW_DB) {
      for (const minGapS of MIN_GAP_S) {
        const thresholdDb = level - below;
        const r = findGaps(env, thresholdDb, minGapS);
        if (r.gaps.length >= lines - 1) { found = { ...r, thresholdDb, minGapS }; break outer; }
      }
    }
  }
  if (!found || found.first < 0) throw new SplitError(`found fewer than ${lines - 1} pauses for ${lines} lines`);

  const speechStart = found.first * FRAME_S;
  const speechEnd = (found.last + 1) * FRAME_S;
  const cuts = lines === 1 ? [] : chooseCuts(found.gaps, lines - 1, weights, speechStart, speechEnd);

  const bounds = [0, ...cuts.map((c) => Math.round(c.center * pcm.sampleRate)), pcm.samples.length];
  const frameOf = (sec: number) => Math.floor(sec / FRAME_S);
  const segments: Segment[] = [];
  for (let k = 0; k < lines; k++) {
    const a = bounds[k]!;
    const b = bounds[k + 1]!;
    // Trim to the loud part plus a small pad, so the only silence left between lines is the gap motion-plan adds.
    const fa = frameOf(a / pcm.sampleRate);
    const fb = Math.min(env.length - 1, frameOf(b / pcm.sampleRate));
    let lo = -1;
    let hi = -1;
    for (let f = fa; f <= fb; f++) if (env[f]! >= found.thresholdDb) { if (lo < 0) lo = f; hi = f; }
    if (lo < 0) throw new SplitError(`line ${k + 1} has no speech`);
    const s = Math.max(a, Math.round((lo * FRAME_S - PAD_S) * pcm.sampleRate));
    const e = Math.min(b, Math.round(((hi + 1) * FRAME_S + PAD_S) * pcm.sampleRate));
    segments.push({ index: k, start: s / pcm.sampleRate, end: e / pcm.sampleRate, pcm: { sampleRate: pcm.sampleRate, samples: pcm.samples.slice(s, e) } });
  }
  assertPlausible(segments, weights);
  return { segments, cuts, candidates: found.gaps.length, thresholdDb: found.thresholdDb, minGapS: found.minGapS };
}
