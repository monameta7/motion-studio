// Responsibility: the Library screen (docs/11 «Library»): the owner's saved references as a grid, with add, edit (name, use, group), delete and read-again, and the progress of the background reading.
import { useEffect, useState } from 'react';
import { api, ApiError, type RefCard, type RefGroup } from '../api';
import { faDuration, faNum } from '../fa';
import { Field } from '../Field';
import { usePoll } from '../hooks';
import { GROUP_FA } from '../labels';
import { Confirm, Modal } from '../Modal';
import { FILTERS } from './RefGrid';
import { UploadDialog } from './UploadDialog';
import { EmptyState } from '../guide/EmptyState';
import { HelpButton, useScreenTour } from '../guide/Guide';

type Dialog = { kind: 'upload' } | { kind: 'edit'; ref: RefCard } | { kind: 'delete'; ref: RefCard } | null;

const playing = (el: HTMLElement, on: boolean) => {
  const v = el.querySelector('video');
  if (!v) return;
  if (on) { v.classList.add('playing'); void v.play().catch(() => undefined); } else { v.pause(); v.currentTime = 0; v.classList.remove('playing'); }
};

function Status({ r }: { r: RefCard }) {
  if (r.read?.state === 'reading') return <span className="muted small" role="status">در حال تحلیل…</span>;
  if (r.read?.state === 'queued') return <span className="muted small" role="status">در صف تحلیل</span>;
  if (r.read?.state === 'failed') return <span className="small">تحلیل نشد: {r.read.error_fa}</span>;
  return r.analysed ? <span className="tag-ok">✓ تحلیل‌شده</span> : <span className="muted small">هنوز تحلیل نشده</span>;
}

function EditDialog({ r, onClose, onSaved }: { r: RefCard; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(r.name_fa);
  const [use, setUse] = useState(r.use_fa);
  const [group, setGroup] = useState<RefGroup>(r.group);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true); setError(null);
    try { await api.put(`/api/references/${r.slug}`, { name_fa: name, use_fa: use, group }); onSaved(); onClose(); }
    catch (e) { setError(e instanceof ApiError ? e.message : 'ذخیره نشد؛ دوباره امتحان کن.'); setBusy(false); }
  };
  return (
    <Modal title="ویرایش مرجع" onClose={onClose}>
      <div className="stack-sm">
        <Field label="نام">{(id) => <input id={id} className="text-input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label="کاربرد">{(id) => <input id={id} className="text-input" value={use} maxLength={300} onChange={(e) => setUse(e.target.value)} />}</Field>
        <Field label="دسته">
          {(id) => (
            <select id={id} value={group} onChange={(e) => setGroup(e.target.value as RefGroup)}>
              {(Object.keys(GROUP_FA) as RefGroup[]).map((g) => <option key={g} value={g}>{GROUP_FA[g]}</option>)}
            </select>
          )}
        </Field>
      </div>
      {error && <div className="problem" role="alert">{error}</div>}
      <div className="row-between">
        <button type="button" className="btn primary" disabled={busy} onClick={() => void save()}>ذخیره</button>
        <button type="button" className="btn" disabled={busy} onClick={onClose}>انصراف</button>
      </div>
    </Modal>
  );
}

export function Library() {
  useScreenTour('library');
  const [ms, setMs] = useState(30000);
  const { data, error, reload } = usePoll<{ references: RefCard[] }>('/api/references', ms);
  const all = (data?.references ?? []).filter((r) => r.source === 'library');
  // While a reference is being read the list refreshes every few seconds; otherwise rarely.
  const pending = all.some((r) => r.read && r.read.state !== 'failed');
  useEffect(() => setMs(pending ? 4000 : 30000), [pending]);

  const [filter, setFilter] = useState(0);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const shown = all.filter(FILTERS[filter]!.match);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true); setProblem(null);
    try { await fn(); setDialog(null); await reload(); } catch (e) { setDialog(null); setProblem(e instanceof ApiError ? e.message : 'انجام نشد؛ دوباره امتحان کن.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="stack">
      <div className="page-head">
        <h1>کتابخانه‌ی مرجع <span className="muted small">{faNum(all.length)} مرجع</span></h1>
        <div className="head-side"><HelpButton /><button type="button" className="btn primary" data-tour="lib-add" onClick={() => setDialog({ kind: 'upload' })}>افزودن مرجع</button></div>
      </div>
      {error && <div className="problem" role="alert">{error}</div>}
      {problem && <div className="problem" role="alert">{problem}</div>}

      <section className="card stack" aria-label="مرجع‌ها">
        <div className="chips" role="group" aria-label="دسته‌ی مرجع">
          {FILTERS.map((f, i) => (
            <button key={f.label} type="button" className={`chip${i === filter ? ' on' : ''}`} aria-pressed={i === filter} onClick={() => setFilter(i)}>{f.label}</button>
          ))}
        </div>
        <ul className="ref-grid">
          {shown.map((r) => (
            <li key={r.slug}>
              <article className="ref-card lib-card" aria-label={r.name_fa}>
                <span className={`ref-media f${r.format}`} onMouseEnter={(e) => playing(e.currentTarget, true)} onMouseLeave={(e) => playing(e.currentTarget, false)}>
                  {r.thumb ? <img src={`/api/references/${r.slug}/thumb.webp`} alt="" loading="lazy" /> : <span className="no-thumb" aria-hidden="true">{r.name_fa.slice(0, 1)}</span>}
                  <video src={`/api/references/${r.slug}/${r.preview ? 'preview.mp4' : 'video.mp4'}`} muted loop playsInline preload="none" aria-hidden="true" />
                  <span className="dur">{faDuration(r.duration)}</span>
                </span>
                <div className="ref-body">
                  <b>{r.name_fa}</b>
                  <span className="muted small clamp">{r.use_fa}</span>
                  <span className="small">{GROUP_FA[r.group]}</span>
                  <Status r={r} />
                  {r.warning_fa && <p className="problem small">{r.warning_fa}</p>}
                </div>
                <div className="lib-actions">
                  <button type="button" className="btn link" onClick={() => setDialog({ kind: 'edit', ref: r })}>ویرایش</button>
                  <button type="button" className="btn link" disabled={r.read?.state === 'queued' || r.read?.state === 'reading'} onClick={() => void act(() => api.post(`/api/references/${r.slug}/reread`))}>{r.analysed || r.read ? 'تحلیل دوباره' : 'تحلیل'}</button>
                  <button type="button" className="btn link" onClick={() => setDialog({ kind: 'delete', ref: r })}>حذف</button>
                </div>
              </article>
            </li>
          ))}
        </ul>
        {data && shown.length === 0 && (all.length === 0
          ? <EmptyState text="کتابخانه‌ی مرجع هنوز خالی است. یک ویدیوی نمونه که سبکش را دوست داری اضافه کن؛ برنامه خودش آن را تحلیل می‌کند." action={{ label: 'اولین مرجع را اضافه کن', onClick: () => setDialog({ kind: 'upload' }) }} />
          : <EmptyState text="در این دسته مرجعی نیست." action={{ label: 'نمایش همه‌ی مرجع‌ها', onClick: () => setFilter(0) }} />)}
      </section>

      {dialog?.kind === 'upload' && <UploadDialog onClose={() => setDialog(null)} onDone={() => void reload()} />}
      {dialog?.kind === 'edit' && <EditDialog r={dialog.ref} onClose={() => setDialog(null)} onSaved={() => void reload()} />}
      {dialog?.kind === 'delete' && (
        <Confirm title="حذف مرجع" text={`«${dialog.ref.name_fa}» از کتابخانه برداشته می‌شود. فایلش پاک نمی‌شود و در پوشه‌ی حذف‌شده‌ها می‌ماند.`} yes="حذف" busy={busy}
          onYes={() => void act(() => api.del(`/api/references/${dialog.ref.slug}`))} onNo={() => setDialog(null)} />
      )}
    </div>
  );
}
