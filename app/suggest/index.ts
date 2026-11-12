// Responsibility: suggest three reference motions for a topic, only from decoded library references (D44): one fast Claude call, keyword rules as the fallback, and the filter that drops any slug Claude invents (docs/07 «Style suggestion»).
import fs from 'node:fs';
import { z } from 'zod';
import type { RunOptions, RunResult } from '../ai/claudeRunner.js';
import { renderPrompt } from '../ai/prompts/index.js';
import { ReferenceMeta, ReferenceReading, readJson } from '../contracts/index.js';
import { refPaths } from '../stages/reference/index.js';

export const MIN_TOPIC_CHARS = 8;
const DAY_MS = 86400000;

export const Fit = z.enum(['best', 'good', 'alt']);
export type Fit = z.infer<typeof Fit>;
export interface Suggestion { ref_slug: string; fit: Fit; reason_fa: string }
/** What Claude must answer; the app checks every slug against the library before showing it. */
export const SuggestAnswer = z.object({
  suggestions: z.array(z.object({ ref_slug: z.string(), fit: Fit, reason_fa: z.string() })).min(1).max(3),
});

export interface Candidate {
  slug: string; name_fa: string; use_fa: string; tags: string[]; group: ReferenceMeta['group'];
  last_used_at: string | null;
  /** The first part of the reading's visual-language paragraph. */
  look: string;
}

/** The decoded library: saved references (not one-time uploads) whose reading belongs to their current video. */
export function decodedCandidates(refsDir: string): Candidate[] {
  let dirs: string[];
  try { dirs = fs.readdirSync(refsDir, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('_')).map((d) => d.name).sort(); } catch { return []; }
  const out: Candidate[] = [];
  for (const slug of dirs) {
    const p = refPaths(refsDir, slug);
    try {
      const meta = readJson(p.meta, ReferenceMeta);
      const reading = readJson(p.reading, ReferenceReading) as Record<string, unknown>;
      if (meta.source !== 'library' || (reading.sha256 ?? (reading.key as { sha256?: string } | undefined)?.sha256) !== meta.sha256) continue;
      const look = typeof reading.visual_language === 'string' ? reading.visual_language : '';
      out.push({ slug, name_fa: meta.name_fa, use_fa: meta.use_fa, tags: meta.tags, group: meta.group, last_used_at: meta.last_used_at, look: look.replace(/\s+/g, ' ').slice(0, 320) });
    } catch { /* not decoded: no suggestion */ }
  }
  return out;
}

/** The owner's [ ] build directions are not the topic. */
export const topicOnly = (text: string): string => text.replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();

type Group = ReferenceMeta['group'];
// docs/07 keyword rules; the most specific kind of content is checked first.
const RULES: [Group, RegExp][] = [
  ['term', /\b(code|api|n8n|json|python|github)\b|کد نویسی|کدنویسی|ترمینال/i],
  ['data', /[%٪]|[\d۰-۹]+\s*(?:تا|کار|روش|نکته|راه|مورد|برابر|درصد|میلیون|هزار)|آمار|مقایسه|فهرست|نمودار/],
  ['char', /داستان|مشتری|روزی که|ماجرا|تجربه/],
  ['ui', /ابزار|اپ\b|اپلیکیشن|اتوماسیون|ایجنت|داشبورد|نرم.?افزار/],
  ['abs', /هوش مصنوعی|آینده|ایده|فلسفه/],
];
export const groupForTopic = (topic: string): Group => RULES.find(([, re]) => re.test(topic))?.[0] ?? 'type';

const lastUsed = (c: Candidate): number => (c.last_used_at ? Date.parse(c.last_used_at) : Number.NEGATIVE_INFINITY);

/** Keyword rules, instant and free: the group's references (least recently used first), then the default group, then any. */
export function keywordPick(topic: string, cands: Candidate[], want = 3): Suggestion[] {
  const group = groupForTopic(topic);
  const byUse = (xs: Candidate[]) => [...xs].sort((a, b) => lastUsed(a) - lastUsed(b));
  const order = [...byUse(cands.filter((c) => c.group === group)), ...byUse(cands.filter((c) => c.group === 'type' && group !== 'type')), ...byUse(cands)];
  const seen = new Set<string>();
  const picked: Candidate[] = [];
  for (const c of order) if (!seen.has(c.slug)) { seen.add(c.slug); picked.push(c); if (picked.length === want) break; }
  const fits: Fit[] = ['best', 'good', 'alt'];
  return picked.map((c, i) => ({ ref_slug: c.slug, fit: fits[i]!, reason_fa: c.use_fa || c.name_fa }));
}

/** Claude's answer with every unknown or repeated slug dropped, filled up from the keyword rules to three. */
export function finalise(answer: Suggestion[], topic: string, cands: Candidate[]): Suggestion[] {
  const known = new Set(cands.map((c) => c.slug));
  const out: Suggestion[] = [];
  for (const s of answer) if (known.has(s.ref_slug) && !out.some((o) => o.ref_slug === s.ref_slug) && out.length < 3) out.push({ ...s, reason_fa: s.reason_fa.trim() });
  const fits: Fit[] = ['best', 'good', 'alt'];
  for (const k of keywordPick(topic, cands, 6)) {
    if (out.length >= 3) break;
    if (!out.some((o) => o.ref_slug === k.ref_slug)) out.push({ ...k, fit: fits[out.length]! });
  }
  // The order is the ranking; the label follows the place, so two "best" can never appear.
  return out.map((s, i) => ({ ...s, fit: fits[i]! }));
}

export type SuggestSource = 'claude' | 'keywords' | 'none';
export interface SuggestResult { suggestions: Suggestion[]; source: SuggestSource }

export interface SuggestDeps {
  refsDir: string;
  /** The folder of the brand the film is for (the active brand, or the schedule's), passed to the runner (Phase 8). */
  brandDir: string | null;
  run: (o: RunOptions) => Promise<RunResult>;
  now?: () => number;
  onUsage?: (r: RunResult) => void;
}

/**
 * The panel's answer. No decoded reference or a too-short topic: nothing is asked. Otherwise one Claude call (sonnet, low, 30 s);
 * a failure, a timeout or a full quota gives the keyword rules instead, so the owner always gets three references.
 */
export async function suggestStyles(rawTopic: string, d: SuggestDeps): Promise<SuggestResult> {
  const topic = topicOnly(rawTopic);
  const cands = decodedCandidates(d.refsDir);
  if (cands.length === 0 || topic.length < MIN_TOPIC_CHARS) return { suggestions: [], source: 'none' };
  const now = (d.now ?? Date.now)();
  const recent = cands.filter((c) => c.last_used_at && now - Date.parse(c.last_used_at) < 7 * DAY_MS)
    .map((c) => `${c.slug} (${Math.floor((now - Date.parse(c.last_used_at!)) / DAY_MS)})`).join(', ') || 'none';
  const lines = cands.map((c) => `${c.slug} | ${c.name_fa} | ${c.use_fa} | ${c.tags.join(', ')} | ${c.look}`).join('\n');
  try {
    const r = await d.run({ stage: 'suggest', brandDir: d.brandDir, prompt: renderPrompt('suggest', { topic, candidates: lines, recent }), jsonSchema: z.toJSONSchema(SuggestAnswer, { io: 'input' }) });
    d.onUsage?.(r);
    if (r.ok) {
      const parsed = SuggestAnswer.safeParse(r.structured);
      if (parsed.success) return { suggestions: finalise(parsed.data.suggestions, topic, cands), source: 'claude' };
    }
  } catch { /* the keyword rules answer */ }
  return { suggestions: keywordPick(topic, cands), source: 'keywords' };
}
