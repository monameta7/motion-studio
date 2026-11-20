// Responsibility: the «سبک‌های بصری» screen of the video workspace (Phase 11.5): the visual styles as picture cards with their titles and texts, with add, edit, delete to the trash and restore.
import { useState } from 'react';
import { api, ApiError, styleCardUrl, type StyleCard, type StylesList } from '../api';
import { faDateTime, faNum } from '../fa';
import { Field } from '../Field';
import { usePoll, useReveal } from '../hooks';
import { Confirm, Modal } from '../Modal';
import { SkeletonCard } from '../Skeleton';
import { SubmitButton } from '../SubmitButton';
import { EmptyState } from '../guide/EmptyState';
import { HelpButton, useScreenTour } from '../guide/Guide';

type Dialog = { kind: 'add' } | { kind: 'edit'; style: StyleCard } | { kind: 'delete'; style: StyleCard } | null;

/** An English title or text is shown in the app's Latin font, left to right (its digits stay Latin: «3D», «90s»); a Persian title stays as it is. */
export const latin = (t: string) => (/[؀-ۿ]/.test(t) ? undefined : 'latin');

export const TEXT_HINT = 'این متن کلمه‌به‌کلمه در پرامپت هر کلیپ می‌رود؛ فقط انگلیسی، بدون کد رنگ.';

/** The card's picture: fixed 3:2 box, so nothing moves when it loads. */
export function StylePicture({ s }: { s: Pick<StyleCard, 'slug' | 'image_sha256'> }) {
  return <span className="ref-media style-media"><img src={styleCardUrl(s)} alt="" width={300} height={200} loading="lazy" decoding="async" /></span>;
}

function StyleDialog({ style, onClose, onSaved }: { style: StyleCard | null; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(style?.title ?? '');
  const [text, setText] = useState(style?.text ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!style && !file) { setError('تصویر سبک را انتخاب کن.'); return; }
    setBusy(true); setError(null);
    const form = new FormData();
    form.append('title', title);
    form.append('text', text);
    if (file) form.append('picture', file);
    try {
      if (style) await api.put(`/api/styles/${style.slug}`, form); else await api.post('/api/styles', form);
      onSaved(); onClose();
    } catch (e) { setError(e instanceof ApiError ? e.message : 'ذخیره نشد؛ دوباره امتحان کن.'); setBusy(false); }
  };
  return (
    <Modal title={style ? 'ویرایش سبک' : 'افزودن سبک'} onClose={onClose}>
      <div className="stack-sm">
        <Field label="عنوان">{(id) => <input id={id} className="text-input" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />}</Field>
        <Field label="متن سبک (انگلیسی)">{(id) => <textarea id={id} className="text-input style-text-input latin" dir="ltr" lang="en" rows={5} maxLength={1200} value={text} aria-describedby="style-text-hint" onChange={(e) => setText(e.target.value)} />}</Field>
        <p className="muted small" id="style-text-hint">{TEXT_HINT}</p>
        <Field label={style ? 'تصویر تازه (اختیاری)' : 'تصویر'}>{(id) => <input id={id} type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />}</Field>
      </div>
      {error && <div className="problem" role="alert">{error}</div>}
      <div className="row-between">
        <SubmitButton busy={busy} failed={Boolean(error)} onClick={() => void save()}>ذخیره</SubmitButton>
        <button type="button" className="btn" disabled={busy} onClick={onClose}>انصراف</button>
      </div>
    </Modal>
  );
}

export function Styles() {
  useScreenTour('styles');
  const { data, error, reload } = usePoll<StylesList>('/api/styles', 30000);
  const styles = data?.styles ?? [];
  const trash = data?.trash ?? [];
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const grid = useReveal<HTMLUListElement>(styles.length);

  const act = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key); setProblem(null);
    try { await fn(); setDialog(null); await reload(); } catch (e) { setDialog(null); setProblem(e instanceof ApiError ? e.message : 'انجام نشد؛ دوباره امتحان کن.'); }
    finally { setBusy(null); }
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div className="title-block"><h1>کتابخانه‌ی سبک‌ها <span className="muted small">{faNum(styles.length)} سبک</span></h1><p className="lede">سبک تصویری هر ویدیو؛ متن سبک در پرامپت همه‌ی کلیپ‌های فیلم می‌رود.</p></div>
        <div className="head-side"><HelpButton /><button type="button" className="btn primary" data-tour="style-add" onClick={() => setDialog({ kind: 'add' })}>افزودن سبک</button></div>
      </div>
      {error && <div className="problem" role="alert">{error}</div>}
      {problem && <div className="problem" role="alert">{problem}</div>}

      {!data && !error ? <SkeletonCard lines={3} block label="در حال بارگذاری سبک‌ها…" /> : (
        <section className="card stack" aria-label="سبک‌ها">
          {styles.length === 0
            ? <EmptyState icon="palette" text="هنوز سبکی نیست. یک تصویر، یک عنوان و متن انگلیسی سبک را اضافه کن؛ ویدیوها با همین سبک ساخته می‌شوند." action={{ label: 'اولین سبک را اضافه کن', onClick: () => setDialog({ kind: 'add' }) }} />
            : (
              <ul className="ref-grid style-grid" ref={grid}>
                {styles.map((s) => (
                  <li key={s.slug}>
                    <article className="ref-card lib-card" aria-label={s.title}>
                      <StylePicture s={s} />
                      <div className="ref-body">
                        <b className={latin(s.title)}>{s.title}</b>
                        {s.text ? <span className="muted small clamp latin" lang="en">{s.text}</span> : <span className="problem small">هنوز متن سبک ندارد</span>}
                        {s.in_use && <span className="muted small">در یک کار در حال ساخت</span>}
                      </div>
                      <div className="lib-actions">
                        <button type="button" className="btn link" disabled={s.in_use} onClick={() => setDialog({ kind: 'edit', style: s })}>ویرایش<span className="sr-only"> {s.title}</span></button>
                        <button type="button" className="btn link" disabled={s.in_use} onClick={() => setDialog({ kind: 'delete', style: s })}>حذف<span className="sr-only"> {s.title}</span></button>
                      </div>
                    </article>
                  </li>
                ))}
              </ul>
            )}
        </section>
      )}

      {trash.length > 0 && (
        <section className="card stack-sm" aria-labelledby="style-trash-h">
          <div className="section-head"><h2 id="style-trash-h">حذف‌شده‌ها</h2><p className="muted small">پوشه‌ی styles/_trash؛ خالی کردنش با خودت است.</p></div>
          <ul className="style-trash">
            {trash.map((t) => (
              <li key={t.name} className="row-between">
                <span><b className={latin(t.title)}>{t.title}</b> <span className="muted small">{faDateTime(t.deleted_at)}</span></span>
                <SubmitButton className="btn" busy={busy === t.name} onClick={() => void act(t.name, () => api.post(`/api/styles/trash/${encodeURIComponent(t.name)}/restore`))}>بازگرداندن<span className="sr-only"> {t.title}</span></SubmitButton>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(dialog?.kind === 'add' || dialog?.kind === 'edit') && <StyleDialog style={dialog.kind === 'edit' ? dialog.style : null} onClose={() => setDialog(null)} onSaved={() => void reload()} />}
      {dialog?.kind === 'delete' && (
        <Confirm title="حذف سبک" text={`«${dialog.style.title}» از کتابخانه برداشته می‌شود و در «حذف‌شده‌ها» می‌ماند؛ از همان‌جا برمی‌گردد.`} yes="حذف" busy={busy === 'delete'}
          onYes={() => void act('delete', () => api.del(`/api/styles/${dialog.style.slug}`))} onNo={() => setDialog(null)} />
      )}
    </div>
  );
}
