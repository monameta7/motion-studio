// Responsibility: section 3 of New video (docs/11 §1.3): filter chips and the library grid where the owner picks one to three references in order (hover or focus plays the preview), and the first card that adds a motion of the owner's own.
import { useState } from 'react';
import type { RefCard } from '../api';
import { faDuration, faNum } from '../fa';
import { EmptyState } from '../guide/EmptyState';

/** Filter chips of docs/11; each matches a library group or a tag. */
export const FILTERS: { label: string; match: (r: RefCard) => boolean }[] = [
  { label: 'همه', match: () => true },
  { label: 'تایپوگرافی', match: (r) => r.group === 'type' || r.tags.some((t) => /type|typo/.test(t)) },
  { label: 'رابط کاربری', match: (r) => r.group === 'ui' || r.tags.includes('ui') },
  { label: 'اکسپلینر', match: (r) => r.group === 'char' || r.tags.some((t) => /explain/.test(t)) },
  { label: 'داده و نمودار', match: (r) => r.group === 'data' || r.tags.some((t) => /data|chart/.test(t)) },
  { label: 'انتزاعی', match: (r) => r.group === 'abs' || r.tags.some((t) => /abstract|3d/.test(t)) },
  { label: 'مینیمال', match: (r) => r.tags.some((t) => /minimal|clean/.test(t)) },
  { label: 'ترمینال', match: (r) => r.group === 'term' || r.tags.some((t) => /terminal|code/.test(t)) },
];

export const MAX_REFS = 3;

export function RefGrid({ refs, selected, setSelected, onUpload, suggested = [] }: { refs: RefCard[]; selected: string[]; setSelected: (s: string[]) => void; onUpload: () => void; suggested?: string[] }) {
  const [filter, setFilter] = useState(0);
  const shown = refs.filter(FILTERS[filter]!.match);
  const toggle = (slug: string) => {
    if (selected.includes(slug)) setSelected(selected.filter((s) => s !== slug));
    else if (selected.length < MAX_REFS) setSelected([...selected, slug]);
  };
  const play = (el: HTMLElement, on: boolean) => {
    const v = el.querySelector('video');
    if (!v) return;
    if (on) { v.classList.add('playing'); void v.play().catch(() => undefined); } else { v.pause(); v.currentTime = 0; v.classList.remove('playing'); }
  };

  return (
    <section className="card stack" aria-labelledby="ref-h" data-tour="refs">
      <div className="section-head">
        <h2 id="ref-h"><span className="step">۳</span>سبک مرجع</h2>
        <p className="muted small">تا {faNum(MAX_REFS)} مرجع؛ ترتیب انتخاب مهم است.</p>
      </div>
      <div className="chips" role="group" aria-label="دسته‌ی مرجع">
        {FILTERS.map((f, i) => (
          <button key={f.label} type="button" className={`chip${i === filter ? ' on' : ''}`} aria-pressed={i === filter} onClick={() => setFilter(i)}>{f.label}</button>
        ))}
      </div>
      <ul className="ref-grid">
        <li>
          <button type="button" className="ref-card upload" onClick={onUpload}>
            <span className="ref-media upload-media" aria-hidden="true">+</span>
            <span className="ref-body"><b>آپلود موشن دلخواه</b><span className="muted small">یک ویدیوی مرجع از خودت</span></span>
          </button>
        </li>
        {shown.map((r) => {
          const order = selected.indexOf(r.slug);
          // A reference still waiting to be read cannot start a film: the film would read it a second time.
          const reading = r.read?.state === 'queued' || r.read?.state === 'reading';
          const full = (order < 0 && selected.length >= MAX_REFS) || reading;
          return (
            <li key={r.slug}>
              <button
                type="button" className={`ref-card${order >= 0 ? ' picked' : ''}`} aria-pressed={order >= 0} disabled={full}
                onClick={() => toggle(r.slug)} onMouseEnter={(e) => play(e.currentTarget, true)} onMouseLeave={(e) => play(e.currentTarget, false)}
                onFocus={(e) => play(e.currentTarget, true)} onBlur={(e) => play(e.currentTarget, false)}
                aria-label={`${r.name_fa}${order >= 0 ? `، انتخاب ${faNum(order + 1)}` : ''}`}
              >
                <span className={`ref-media f${r.format}`}>
                  {r.thumb ? <img src={`/api/references/${r.slug}/thumb.webp`} alt="" loading="lazy" /> : <span className="no-thumb" aria-hidden="true">{r.name_fa.slice(0, 1)}</span>}
                  {/* The short preview when the app has made one, else the reference itself; it plays while the mouse is on the card. */}
                  <video src={`/api/references/${r.slug}/${r.preview ? 'preview.mp4' : 'video.mp4'}`} muted loop playsInline preload="metadata" aria-hidden="true" />
                  <span className="dur">{faDuration(r.duration)}</span>
                  {order >= 0 && <span className="order" aria-hidden="true">{faNum(order + 1)}</span>}
                </span>
                <span className="ref-body">
                  <b>{r.name_fa}</b>
                  <span className="muted small clamp">{r.use_fa}</span>
                  {reading ? <span className="muted small" role="status">در حال تحلیل…</span> : r.analysed && <span className="tag-ok">✓ تحلیل‌شده</span>}
                  {r.source === 'upload' && <span className="muted small">یک‌بار مصرف</span>}
                  {suggested.includes(r.slug) && <span className="badge-suggested">پیشنهادی</span>}
                  {r.warning_fa && <span className="problem small">{r.warning_fa}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {shown.length === 0 && refs.length > 0 && <EmptyState text="در این دسته مرجعی نیست." action={{ label: 'نمایش همه‌ی مرجع‌ها', onClick: () => setFilter(0) }} />}
    </section>
  );
}
