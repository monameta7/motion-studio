// Responsibility: section 3 of New video in the video workspace (Phase 11.5): the styles library as picture cards, one chosen; the page starts on the style used last.
import { useReveal } from '../hooks';
import type { StyleCard } from '../api';
import { EmptyState } from '../guide/EmptyState';
import { StylePicture, latin } from './Styles';

export function StylePicker({ styles, selected, setSelected, loaded }: { styles: StyleCard[]; selected: string | null; setSelected: (slug: string) => void; loaded: boolean }) {
  const grid = useReveal<HTMLUListElement>(styles.length);
  return (
    <section className="card stack" aria-labelledby="style-h" data-tour="style">
      <div className="section-head">
        <h2 id="style-h"><span className="step">۳</span>سبک تصویری</h2>
        <p className="muted small">متن سبک در پرامپت همه‌ی کلیپ‌ها می‌رود. تصویر «+» در ویدیو نیست.</p>
      </div>
      {loaded && styles.length === 0
        ? <EmptyState icon="palette" text="هنوز سبکی در کتابخانه نیست. اول در «کتابخانه‌ی سبک‌ها» یک سبک اضافه کن." action={{ label: 'رفتن به کتابخانه‌ی سبک‌ها', href: '#/library' }} />
        : (
          // The radio group wraps the list, so the list keeps its items (Lighthouse «listitem»).
          <div role="radiogroup" aria-labelledby="style-h">
          <ul className="ref-grid style-grid" ref={grid}>
            {styles.map((s) => {
              const on = selected === s.slug;
              return (
                <li key={s.slug}>
                  <label className={`ref-card style-pick${on ? ' picked' : ''}${s.text ? '' : ' off'}`}>
                    <input type="radio" name="style" className="sr-only" value={s.slug} checked={on} disabled={!s.text} onChange={() => setSelected(s.slug)} />
                    <StylePicture s={s} />
                    <span className="ref-body">
                      <b className={latin(s.title)}>{s.title}</b>
                      {s.text ? <span className="muted small clamp latin" lang="en">{s.text}</span> : <span className="muted small">هنوز متن سبک ندارد</span>}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          </div>
        )}
    </section>
  );
}
