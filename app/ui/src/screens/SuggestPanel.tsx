// Responsibility: the style-suggestion panel of New video (docs/11 §1): 2 s after the topic stops changing it shows three library references with a one-sentence reason, and tells New video which one is the best so it can be preselected.
import { useEffect, useRef, useState } from 'react';
import { api, type RefCard } from '../api';
import { EmptyState } from '../guide/EmptyState';

export interface Suggestion { ref_slug: string; fit: 'best' | 'good' | 'alt'; reason_fa: string }
interface Answer { suggestions: Suggestion[]; source: 'claude' | 'keywords' | 'none' }

const FIT_FA: Record<Suggestion['fit'], string> = { best: 'بهترین', good: 'خوب', alt: 'جایگزین' };
const MIN_CHARS = 8;
/** A suggestion costs a Claude call (about $0.18 measured), so it waits for a real pause in typing (owner, 2026-11-03; docs/07 said 700 ms). */
const PAUSE_MS = 2000;

/** The topic without the owner's [ ] build directions. */
const topicOnly = (t: string) => t.replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();

export function SuggestPanel({ topic, refs, selected, onPick, onSuggested }: {
  topic: string; refs: RefCard[]; selected: string[]; onPick: (slug: string) => void; onSuggested: (slugs: string[]) => void;
}) {
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [busy, setBusy] = useState(false);
  const latest = useRef(0);
  const clean = topicOnly(topic);
  const library = refs.filter((r) => r.source === 'library');
  const ready = clean.length >= MIN_CHARS;

  useEffect(() => {
    if (!ready || library.length === 0) { setAnswer(null); setBusy(false); return; }
    const id = ++latest.current;
    setBusy(true);
    const t = setTimeout(async () => {
      try {
        const a = await api.post<Answer>('/api/suggest', { topic });
        if (id !== latest.current) return;
        setAnswer(a);
        onSuggested(a.suggestions.map((s) => s.ref_slug));
      } catch { if (id === latest.current) setAnswer(null); }
      finally { if (id === latest.current) setBusy(false); }
    }, PAUSE_MS);
    return () => clearTimeout(t);
    // The text decides; the library only matters for «is it empty».
  },[clean, ready, library.length === 0]);

  if (!ready) return null;
  if (library.length === 0) return <section className="card" aria-label="سبک پیشنهادی" data-tour="suggest"><EmptyState text="کتابخانه‌ی مرجع هنوز خالی است. سبک ویدیو از مرجع‌ها گرفته می‌شود؛ اول یک ویدیوی نمونه اضافه کن." action={{ label: 'رفتن به کتابخانه‌ی مرجع', href: '#/library' }} /></section>;

  const cards = (answer?.suggestions ?? []).map((s) => ({ s, ref: library.find((r) => r.slug === s.ref_slug) })).filter((x) => x.ref);
  return (
    <section className="card stack" aria-labelledby="suggest-h" aria-busy={busy} data-tour="suggest">
      <div className="section-head">
        <h2 id="suggest-h">سبک پیشنهادی برای این موضوع</h2>
        {busy && <span className="muted small" role="status">در حال پیدا کردن سبک مناسب…</span>}
      </div>
      {!busy && cards.length > 0 && (
        <ul className="suggest-list">
          {cards.map(({ s, ref }) => {
            const on = selected.includes(s.ref_slug);
            return (
              <li key={s.ref_slug} className="suggest-card">
                <span className={`suggest-thumb f${ref!.format}`}>
                  {ref!.thumb ? <img src={`/api/references/${s.ref_slug}/thumb.webp`} alt="" loading="lazy" /> : <span className="no-thumb" aria-hidden="true">{ref!.name_fa.slice(0, 1)}</span>}
                </span>
                <div className="suggest-body">
                  <div className="suggest-title"><b>{ref!.name_fa}</b><span className={`fit fit-${s.fit}`}>{FIT_FA[s.fit]}</span></div>
                  <p className="muted small">{s.reason_fa}</p>
                  <button type="button" className="btn" disabled={on} aria-pressed={on} onClick={() => onPick(s.ref_slug)}>{on ? '✓ انتخاب شده' : 'استفاده از این سبک'}</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
