// Responsibility: turns a brand's answers into the Persian Markdown the brand-build skill reads (code, deterministic): every answered question under its section, every empty one left out.
import type { BrandAnswers } from '../contracts/index.js';
import { SECTIONS, type Question } from './questions.js';

const isEmpty = (v: unknown): boolean => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

function renderValue(q: Question, v: unknown): string {
  if (q.type === 'text' || q.type === 'para') return String(v);
  if (q.type === 'list') return (v as string[]).map((x) => `- ${x}`).join('\n');
  if (q.type === 'scales') {
    const t = v as Record<string, number>;
    return (q.scales ?? []).filter((s) => typeof t[s.id] === 'number').map((s) => `- ${s.a} ↔ ${s.b}: ${t[s.id]} از ۱۰۰ (۰ یعنی «${s.a}»، ۱۰۰ یعنی «${s.b}»)`).join('\n');
  }
  const items = v as Record<string, string | undefined>[];
  return items.map((it, i) => `${i + 1}. ` + (q.item ?? []).filter((f) => it[f.id]).map((f) => `${f.label}: ${it[f.id]}`).join(' — ')).join('\n');
}

/** The answers as Markdown; `visual` also lists the palette and fonts the code decided (the skill must copy them exactly). */
export function answersToMarkdown(a: BrandAnswers): string {
  const out: string[] = [`# پاسخ‌های برند «${a.identity.name}»`, ''];
  // «ده قانون طلایی» comes first in the text (it is the last tab on the page).
  for (const s of [...SECTIONS.filter((x) => x.id === 'summary'), ...SECTIONS.filter((x) => x.id !== 'summary')]) {
    const block = (a[s.id] ?? {}) as Record<string, unknown>;
    const lines: string[] = [];
    for (const q of s.questions) {
      const v = block[q.id];
      if (isEmpty(v)) continue;
      const body = renderValue(q, v);
      if (body) lines.push(`### ${q.label}`, `(${q.q})`, body, '');
    }
    if (s.id === 'visual') {
      lines.push('### رنگ‌ها (تصمیم کد؛ عیناً کپی شوند)', ...a.visual.colors.map((c) => `- ${c.name}: ${c.hex.toUpperCase()} — نقش: ${c.role}${c.use ? ` — ${c.use}` : ''}`), '');
      lines.push('### فونت‌ها (تصمیم کد)', `- فارسی: ${a.visual.persian_font.family}`, `- لاتین: ${a.visual.latin_font.family}`, '');
      if (a.visual.outro_tagline) lines.push('### شعار لوگوموشن پایانی', a.visual.outro_tagline, '');
    }
    if (lines.length) out.push(`## ${s.title}`, '', ...lines);
  }
  return out.join('\n');
}
