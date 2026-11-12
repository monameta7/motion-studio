// Responsibility: the three calendar warnings of docs/08: the topics are running out, a topic is too like one made in the last 30 days (Jaccard of the Persian word sets ≥ 0.6), and automation is off while days are planned.
import type { CalendarEntry } from '../contracts/index.js';
import { addDays } from './jalali.js';

export const SIMILARITY_LIMIT = 0.6;
export const SIMILAR_WINDOW_DAYS = 30;

// Words that carry no topic: the same sentence with other glue words is still the same topic.
const STOP = new Set(['و', 'را', 'که', 'با', 'از', 'به', 'در', 'این', 'آن', 'برای', 'تا', 'یا', 'هم', 'می', 'یک', 'ها', 'های', 'است', 'شد', 'شود', 'بود', 'هر', 'چه', 'چرا', 'چطور', 'چگونه', 'ما', 'تو']);
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/** A topic as a set of normalised words: build directions in [ ] dropped, Arabic letters and digits made Persian/Latin, no diacritics. */
export function topicWords(topic: string): Set<string> {
  const t = topic
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/ي/g, 'ی').replace(/ك/g, 'ک') // Arabic yeh and kaf to the Persian letters
    .replace(/[ً-ٰٟ]/g, '') // diacritics
    .replace(/[۰-۹]/g, (c) => String(FA_DIGITS.indexOf(c)))
    .replace(/[٠-٩]/g, (c) => String(AR_DIGITS.indexOf(c)))
    .toLowerCase();
  const out = new Set<string>();
  // A zero-width non-joiner (the half-space of «می‌کند») splits words like any space.
  for (const w of t.split(/[^\p{L}\p{N}]+/u)) {
    if (!w || STOP.has(w) || (w.length < 2 && !/\d/.test(w))) continue;
    out.add(w);
  }
  return out;
}

/** |A ∩ B| / |A ∪ B|; 0 when either topic has no words. */
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / (a.size + b.size - inter);
}

export interface PastTopic { topic: string; date: string }

/** The made topic this one is too like, or null. `past` holds the topics of films done in the last 30 days. */
export function similarTo(topic: string, past: PastTopic[]): PastTopic | null {
  const words = topicWords(topic);
  let best: { p: PastTopic; score: number } | null = null;
  for (const p of past) {
    const score = jaccard(words, topicWords(p.topic));
    if (score >= SIMILARITY_LIMIT && (!best || score > best.score)) best = { p, score };
  }
  return best?.p ?? null;
}

export const similarSince = (today: string): string => addDays(today, -SIMILAR_WINDOW_DAYS);

export interface TopicsLow { remaining: number; last_date: string | null }

/**
 * The calendar is running low when `warnDays` or fewer days with a topic are left from today on. `last_date` is the day of the last
 * topic (null when none is left). Only meaningful while automation is on.
 */
export function topicsLow(entries: Pick<CalendarEntry, 'date' | 'status'>[], today: string, warnDays: number): TopicsLow | null {
  const ahead = entries.filter((e) => e.date >= today && (e.status === 'planned' || e.status === 'queued')).map((e) => e.date).sort();
  return ahead.length <= warnDays ? { remaining: ahead.length, last_date: ahead.at(-1) ?? null } : null;
}

/** Automation is off but days are planned: the banner of every screen. */
export function automationOff(enabled: boolean, entries: Pick<CalendarEntry, 'date' | 'status'>[], today: string): { planned: number } | null {
  if (enabled) return null;
  const planned = entries.filter((e) => e.date >= today && e.status === 'planned').length;
  return planned > 0 ? { planned } : null;
}
