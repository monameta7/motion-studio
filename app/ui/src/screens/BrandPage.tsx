// Responsibility: the «برند من» screen (Phase 9, docs/11): summary card, one tab per questionnaire section, «ثبت» with the rebuild preview and progress, the readable and hand-editable docs, and the versions with «بازگشت به نسخه‌ی قبل»; read only for the owner's hand-made brand.
import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../api';
import { logoUrl, useBrand } from '../brand';
import { cleanAnswers, toDraft, type BrandSchema, type Draft } from '../brandcore/answers';
import { QuestionForm } from '../brandcore/QuestionForm';
import { SaveFlow } from '../brandcore/SaveFlow';
import { VisualForm } from '../brandcore/VisualForm';
import { faDateTime, faNum } from '../fa';
import { usePoll } from '../hooks';
import { Confirm } from '../Modal';
import { BrandCreator } from './NewBrand';
import { HelpButton, useScreenTour } from '../guide/Guide';

interface DocInfo { doc: string; title: string; file: string; exists: boolean; hand_edited: boolean; editable: boolean }
interface BrandInfo { slug: string; name: string; editable: boolean; answers: Record<string, Record<string, unknown>> | null; built: boolean; docs: DocInfo[]; logo: boolean; outro: boolean }
interface Version { id: string; at: string; sections: string[]; docs: string[]; kind: 'create' | 'save' | 'hand_edit' | 'restore'; restored_from: string | null }
interface DocDiff { doc: string; changed: boolean; added: number; removed: number; lines: { t: '=' | '+' | '-'; s: string }[] }

const KIND_FA: Record<Version['kind'], string> = { create: 'ساخت اول', save: 'ثبت تغییرها', hand_edit: 'ویرایش دستی', restore: 'بازگشت به نسخه‌ی قبل' };
const DOC_FA: Record<string, string> = { 'brand-guide': 'راهنمای برند', 'design-system': 'سیستم طراحی', 'cover-system': 'سیستم کاور', tokens: 'مشخصات برند' };
const stable = (d: Draft) => { const { updated_at: _u, ...rest } = cleanAnswers(d); return JSON.stringify(rest); };

export function BrandPage() {
  useScreenTour('brand');
  const { active, loaded } = useBrand();
  if (!loaded) return null;
  if (!active) {
    return (
      <div className="stack">
        <div className="page-head"><h1>برند من</h1><HelpButton /></div>
        <div className="card stack"><p>هنوز برندی ساخته نشده. با چند سؤال کوتاه اولین برندت را بساز.</p><div><a className="btn primary" href="#/brand/new">ساخت برند تازه</a></div></div>
      </div>
    );
  }
  return <BrandScreen key={active.slug} slug={active.slug} />;
}

/** «حذف برند» with a confirm (D85): the folder goes to brand/_trash; the owner's hand-made brand has no button (it cannot be deleted). */
function DeleteBrand({ slug, name }: { slug: string; name: string }) {
  const { remove } = useBrand();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const yes = async () => {
    setBusy(true);
    const err = await remove(slug);
    setBusy(false); setOpen(false); setProblem(err);
  };
  return (
    <>
      <button type="button" className="btn link" onClick={() => { setProblem(null); setOpen(true); }}>حذف برند</button>
      {problem && <span className="problem" role="alert">{problem}</span>}
      {open && <Confirm title="حذف برند" text={`برند «${name}» برداشته می‌شود. فایل‌هایش پاک نمی‌شود و در پوشه‌ی حذف‌شده‌ها (brand/_trash) می‌ماند. ویدیوهایی که با آن ساخته‌ای در بایگانی می‌مانند و اتوماسیونش خاموش می‌شود.`} yes="حذف" busy={busy} onYes={() => void yes()} onNo={() => setOpen(false)} />}
    </>
  );
}

function BrandScreen({ slug }: { slug: string }) {
  const { data: schema } = usePoll<BrandSchema>('/api/brand-core/schema', 0);
  const { data: info, reload, error } = usePoll<BrandInfo>(`/api/brand-core/${slug}`, 0);
  const [tab, setTab] = useState('identity');
  const [draft, setDraft] = useState<Draft>({});
  const [saved, setSaved] = useState('');
  const [flow, setFlow] = useState(false);

  useEffect(() => {
    if (!info) return;
    const d = toDraft(info.answers);
    setDraft(d); setSaved(stable(d));
    if (!info.editable) setTab('docs');
  }, [info]);

  const dirty = useMemo(() => stable(draft) !== saved, [draft, saved]);
  if (error && !info) return <div className="stack"><div className="page-head"><h1>برند من</h1></div><p className="problem" role="alert">{error}</p></div>;
  if (!schema || !info) return <p className="muted">در حال بارگذاری…</p>;
  // A brand folder that was created but never filled in (the creator was closed half-way): the creator continues it.
  if (info.editable && !info.answers) return <div className="stack"><div className="page-head"><h1>برند من</h1><div className="head-side"><DeleteBrand slug={slug} name={info.name} /></div></div><BrandCreator schema={schema} resume={{ slug, name: info.name }} onDone={() => void reload()} /></div>;

  const tabs = info.editable ? [...schema.sections.map((s) => ({ id: s.id, label: s.title })), { id: 'docs', label: 'سندها' }, { id: 'versions', label: 'نسخه‌ها' }] : [{ id: 'docs', label: 'سندها' }];
  const section = schema.sections.find((s) => s.id === tab);

  return (
    <div className="stack brand-page">
      <div className="page-head row-between">
        <h1>برند من: {info.name}</h1>
        <div className="head-side"><HelpButton /><a className="btn" href="#/brand/new">+ برند تازه</a>{info.editable && <DeleteBrand slug={slug} name={info.name} />}</div>
      </div>
      {!info.editable && <p className="problem">این برند فایل‌های دست‌ساز مالک است و فقط خواندنی است؛ هیچ‌چیزش تغییر نمی‌کند. برای برند خودت «برند تازه» بساز.</p>}
      <Summary slug={slug} info={info} draft={draft} />

      <div role="tablist" aria-label="بخش‌های برند" className="tabs">
        {tabs.map((t) => <button key={t.id} id={`tab-${t.id}`} type="button" role="tab" aria-selected={tab === t.id} aria-controls="tab-panel" className={tab === t.id ? 'tab on' : 'tab'} onClick={() => setTab(t.id)}>{t.label}</button>)}
      </div>

      <section id="tab-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="card stack">
        {section && (
          <>
            <h2>{section.title}</h2>
            <p className="muted">{section.why}</p>
            {section.id === 'visual' && <VisualForm slug={slug} draft={draft} onChange={setDraft} />}
            <QuestionForm schema={schema} section={section} draft={draft} onChange={setDraft} />
          </>
        )}
        {tab === 'docs' && <DocsPanel slug={slug} docs={info.docs} editable={info.editable} onSaved={() => void reload()} />}
        {tab === 'versions' && <VersionsPanel slug={slug} titles={schema.section_titles} onRestored={() => void reload()} />}
      </section>

      {info.editable && (
        <div className="save-bar" role="region" aria-label="ثبت تغییرها">
          <span aria-live="polite">{dirty ? 'تغییرهای ثبت‌نشده داری.' : 'همه‌ی تغییرها ثبت شده.'}</span>
          <button type="button" className="btn primary" disabled={!dirty && info.built} onClick={() => setFlow(true)}>{info.built ? 'ثبت' : 'ساخت سندهای برند'}</button>
        </div>
      )}
      {flow && <SaveFlow slug={slug} answers={cleanAnswers(draft)} onClose={(changed) => { setFlow(false); if (changed) void reload(); }} />}
    </div>
  );
}

const TONE: { id: string; a: string; b: string }[] = [{ id: 'formal', a: 'رسمی', b: 'خودمانی' }, { id: 'funny', a: 'جدی', b: 'شوخ' }, { id: 'respect', a: 'محترمانه', b: 'بی‌پروا' }, { id: 'energy', a: 'پرشور', b: 'خونسرد' }];

function Summary({ slug, info, draft }: { slug: string; info: BrandInfo; draft: Draft }) {
  const v = (draft.visual ?? {}) as { colors?: { hex: string; name: string }[]; persian_font?: { family: string }; latin_font?: { family: string } };
  const tone = ((draft.voice ?? {}) as { tone?: Record<string, number> }).tone ?? {};
  return (
    <section className="card brand-summary" aria-label="خلاصه‌ی برند">
      {info.logo ? <img className="logo-preview" src={logoUrl(slug)} alt={`لوگوی ${info.name}`} /> : <span className="logo-preview empty" aria-hidden="true" />}
      <div className="stack-sm">
        <b>{info.name}</b>
        {v.colors && v.colors.length > 0 && <ul className="swatches" aria-label="رنگ‌ها">{v.colors.map((c, i) => <li key={i}><span className="swatch" style={{ background: c.hex }} aria-hidden="true" /><span className="latin small">{c.hex}</span><span className="muted small"> {c.name}</span></li>)}</ul>}
        {(v.persian_font || v.latin_font) && <p className="muted small">فونت‌ها: <span className="latin">{v.persian_font?.family ?? '—'}</span> (فارسی) · <span className="latin">{v.latin_font?.family ?? '—'}</span> (لاتین)</p>}
      </div>
      {Object.keys(tone).length > 0 && (
        <ul className="tone-bars" aria-label="لحن">
          {TONE.filter((t) => typeof tone[t.id] === 'number').map((t) => (
            <li key={t.id}><span>{t.a}</span><span className="bar" role="img" aria-label={`${t.a} تا ${t.b}: ${faNum(tone[t.id]!)} از ۱۰۰`}><i style={{ width: `${tone[t.id]}%` }} /></span><span>{t.b}</span></li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DocsPanel({ slug, docs, editable, onSaved }: { slug: string; docs: DocInfo[]; editable: boolean; onSaved: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const shown = docs.filter((d) => d.editable);
  return (
    <div className="stack">
      <h2>سندهای برند</h2>
      <p className="muted">این سندها را فیلم‌ها می‌خوانند. {editable ? 'می‌توانی با دست ویرایششان کنی؛ ویرایش دستی تو نهایی است و بدون اجازه‌ات دوباره نوشته نمی‌شود.' : ''}</p>
      <ul className="doc-list">
        {shown.map((d) => (
          <li key={d.doc} className="card stack-sm">
            <div className="row-between">
              <b>{d.title}</b>
              <span>{d.hand_edited && <span className="chip on">ویرایش دستی</span>} {!d.exists && <span className="muted small">هنوز ساخته نشده</span>}</span>
              {d.exists && <button type="button" className="btn" aria-expanded={open === d.doc} onClick={() => setOpen(open === d.doc ? null : d.doc)}>{open === d.doc ? 'بستن' : 'خواندن'}</button>}
            </div>
            {open === d.doc && <DocView slug={slug} doc={d.doc} editable={editable} onSaved={onSaved} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

function DocView({ slug, doc, editable, onSaved }: { slug: string; doc: string; editable: boolean; onSaved: () => void }) {
  const { data } = usePoll<{ text: string }>(`/api/brand-core/${slug}/docs/${doc}`, 0);
  const [text, setText] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  useEffect(() => { if (data) setText(data.text); }, [data]);
  if (data === null || text === null) return <p className="muted">در حال بارگذاری…</p>;
  const save = async () => {
    try { await api.put(`/api/brand-core/${slug}/docs/${doc}`, { text }); setMsg({ ok: true, t: 'ذخیره شد.' }); onSaved(); } catch (e) { setMsg({ ok: false, t: e instanceof ApiError ? e.message : 'ذخیره نشد.' }); }
  };
  return (
    <div className="stack-sm">
      <textarea className="text-input doc-text" dir="auto" rows={18} readOnly={!editable} aria-label="متن سند" value={text} onChange={(e) => setText(e.target.value)} />
      {editable && <div className="actions"><button type="button" className="btn primary" disabled={text === data.text} onClick={() => void save()}>ذخیره‌ی ویرایش دستی</button></div>}
      {msg && <p className={msg.ok ? 'success' : 'problem'} role="status">{msg.t}</p>}
    </div>
  );
}

function VersionsPanel({ slug, titles, onRestored }: { slug: string; titles: Record<string, string>; onRestored: () => void }) {
  const { data, reload } = usePoll<{ versions: Version[] }>(`/api/brand-core/${slug}/versions`, 0);
  const [diff, setDiff] = useState<{ id: string; diffs: DocDiff[] } | null>(null);
  const [ask, setAsk] = useState<Version | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const showDiff = async (id: string) => {
    if (diff?.id === id) { setDiff(null); return; }
    try { setDiff({ id, diffs: (await api.get<{ diffs: DocDiff[] }>(`/api/brand-core/${slug}/versions/${id}/diff`)).diffs }); } catch (e) { setProblem(e instanceof ApiError ? e.message : 'مقایسه انجام نشد.'); }
  };
  const restore = async () => {
    if (!ask) return;
    setBusy(true); setProblem(null);
    try { await api.post(`/api/brand-core/${slug}/versions/${ask.id}/restore`); setAsk(null); setDiff(null); await reload(); onRestored(); } catch (e) { setProblem(e instanceof ApiError ? e.message : 'بازگشت انجام نشد.'); setAsk(null); } finally { setBusy(false); }
  };
  const versions = data?.versions ?? [];
  return (
    <div className="stack">
      <h2>نسخه‌ها</h2>
      <p className="muted">هر ثبت یک نسخه می‌سازد. با «بازگشت» پاسخ‌ها و سندها به همان نسخه برمی‌گردند؛ خود بازگشت هم نسخه‌ی تازه‌ای می‌شود و چیزی از دست نمی‌رود.</p>
      {versions.length === 0 && <p className="muted">هنوز نسخه‌ای نیست.</p>}
      <ul className="doc-list">
        {versions.map((v, i) => (
          <li key={v.id} className="card stack-sm">
            <div className="row-between">
              <span><b>{KIND_FA[v.kind]}</b> <span className="muted small">{faDateTime(v.at)}</span>{i === 0 && <span className="chip on"> نسخه‌ی فعلی</span>}</span>
              <span className="actions">
                <button type="button" className="btn" aria-expanded={diff?.id === v.id} onClick={() => void showDiff(v.id)}>تغییرها</button>
                {i > 0 && <button type="button" className="btn" onClick={() => setAsk(v)}>بازگشت به این نسخه</button>}
              </span>
            </div>
            {v.sections.length > 0 && <span className="muted small">بخش‌ها: {v.sections.map((s) => titles[s] ?? s).join('، ')}</span>}
            {diff?.id === v.id && <DiffView diffs={diff.diffs} />}
          </li>
        ))}
      </ul>
      {problem && <p className="problem" role="alert">{problem}</p>}
      {ask && <Confirm title="بازگشت به نسخه‌ی قبل" text={`پاسخ‌ها و سندها به نسخه‌ی ${faDateTime(ask.at)} برمی‌گردند. وضع فعلی هم به‌صورت یک نسخه نگه داشته می‌شود.`} yes="بازگردان" busy={busy} onYes={() => void restore()} onNo={() => setAsk(null)} />}
    </div>
  );
}

function DiffView({ diffs }: { diffs: DocDiff[] }) {
  return (
    <div className="stack-sm">
      {diffs.map((d) => (
        <details key={d.doc} open={d.changed}>
          <summary>{DOC_FA[d.doc] ?? d.doc}: {d.changed ? `${faNum(d.added)} سطر اضافه، ${faNum(d.removed)} سطر حذف` : 'بدون تغییر'}</summary>
          {d.changed && (
            <pre className="diff" dir="auto">{d.lines.filter((l, i, a) => l.t !== '=' || a[i - 1]?.t !== '=' || a[i + 1]?.t !== '=').map((l, i) => <span key={i} className={`diff-${l.t === '+' ? 'add' : l.t === '-' ? 'del' : 'same'}`}>{l.t === '+' ? '+ ' : l.t === '-' ? '− ' : '  '}{l.s}{'\n'}</span>)}</pre>
          )}
        </details>
      ))}
    </div>
  );
}
