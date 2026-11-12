// Responsibility: the «برند من» form's answer helpers: the shapes the schema endpoint sends, reading/writing one answer by path, and cleaning a draft into what the server accepts (empty text, lists and group cards dropped; a half-set tone filled with the middle).
export type QType = 'text' | 'para' | 'list' | 'group' | 'scales';
export interface QItem { id: string; label: string; type: 'text' | 'para'; ph?: string }
export interface Question {
  id: string; type: QType; label: string; q: string; level: 1 | 2 | 3; help?: string; ph?: string; chips?: string[]; add?: string; item?: QItem[];
  scales?: { id: string; a: string; b: string }[];
}
export interface SectionDef { id: string; title: string; why: string; questions: Question[] }
export interface BrandSchema {
  sections: SectionDef[]; docs: { doc: string; title: string }[]; section_docs: Record<string, string[]>; section_titles: Record<string, string>; required: string[];
}

export type Draft = Record<string, Record<string, unknown>>;

export const isRequired = (schema: BrandSchema, section: string, id: string) => schema.required.includes(`${section}.${id}`);

export function getAnswer(d: Draft, section: string, id: string): unknown { return d[section]?.[id]; }

export function setAnswer(d: Draft, section: string, id: string, v: unknown): Draft {
  return { ...d, [section]: { ...(d[section] ?? {}), [id]: v } };
}

const filledStr = (v: unknown) => typeof v === 'string' && v.trim() !== '';

/** True when an answer has content (a text, a list with an item, a group with a filled card, a tone with a slider). */
export function isFilled(v: unknown): boolean {
  if (filledStr(v)) return true;
  if (Array.isArray(v)) return v.some((x) => (typeof x === 'string' ? filledStr(x) : isFilled(x)));
  if (v && typeof v === 'object') return Object.values(v).some((x) => (typeof x === 'number' ? true : isFilled(x)));
  return false;
}

function clean(v: unknown): unknown {
  if (typeof v === 'string') return v.trim();
  if (Array.isArray(v)) {
    const items = v.map(clean).filter((x) => x !== '' && x !== undefined);
    return items.length ? items : undefined;
  }
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) { const c = clean(x); if (c !== undefined && c !== '') out[k] = c; }
    return Object.keys(out).length ? out : undefined;
  }
  return v;
}

const TONE_KEYS = ['formal', 'funny', 'respect', 'energy'] as const;

/** The draft as the server wants it: empty things removed, `version` set; the server adds the time. Required `visual` fields stay as the form made them. */
export function cleanAnswers(d: Draft): Record<string, unknown> {
  const out: Record<string, unknown> = { version: 1, updated_at: new Date().toISOString() };
  for (const [s, block] of Object.entries(d)) {
    const c = (clean(block) ?? {}) as Record<string, unknown>;
    if (s === 'voice' && c.tone && typeof c.tone === 'object') {
      const t = c.tone as Record<string, number>;
      c.tone = Object.fromEntries(TONE_KEYS.map((k) => [k, typeof t[k] === 'number' ? t[k] : 50]));
    }
    out[s] = c;
  }
  for (const s of ['identity', 'position', 'audience', 'offers', 'message', 'voice', 'language', 'strategy', 'guardrails', 'examples', 'visual']) if (!(s in out)) out[s] = {};
  return out;
}

/** How many of the required answers are filled (for the creator's progress line). */
export function requiredProgress(schema: BrandSchema, d: Draft): { done: number; total: number } {
  const done = schema.required.filter((p) => { const [s, f] = p.split('.') as [string, string]; return isFilled(getAnswer(d, s, f)); }).length;
  return { done, total: schema.required.length };
}

export const ROLE_FA: Record<string, string> = {
  background: 'پس‌زمینه', surface: 'سطح', text: 'متن', accent: 'رنگ اصلی', highlight: 'تأکید', success: 'موفقیت', other: 'دیگر',
};

/** Draft keys of a saved answers object (the server's `answers` or null). */
export const toDraft = (a: unknown): Draft => ((a && typeof a === 'object' ? structuredClone(a) : {}) as Draft);
