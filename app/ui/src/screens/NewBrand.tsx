// Responsibility: the brand creator (Phase 9): name → the 12 required questions → logo, colours and fonts → «ساخت»; shared by the «برند تازه» screen and the first-run wizard (only the required questions; the rest later on «برند من»).
import { useState } from 'react';
import { api, ApiError } from '../api';
import { useBrand } from '../brand';
import { cleanAnswers, requiredProgress, setAnswer, type BrandSchema, type Draft } from '../brandcore/answers';
import { QuestionForm } from '../brandcore/QuestionForm';
import { SaveFlow } from '../brandcore/SaveFlow';
import { VisualForm } from '../brandcore/VisualForm';
import { faNum } from '../fa';
import { go, usePoll } from '../hooks';
import { HelpButton, useScreenTour } from '../guide/Guide';

const FREE_FONTS = { persian_font: { family: 'Vazirmatn', file: null, licence_ok: true }, latin_font: { family: 'Inter', file: null, licence_ok: true } };
const STEPS = ['نام برند', 'سؤال‌های لازم', 'لوگو و رنگ', 'ساخت'] as const;

export function BrandCreator({ schema, resume, onDone, onSkip }: { schema: BrandSchema; resume?: { slug: string; name: string }; onDone: (slug: string) => void; onSkip?: () => void }) {
  const [step, setStep] = useState(resume ? 1 : 0);
  const [slug, setSlug] = useState<string | null>(resume?.slug ?? null);
  const [name, setName] = useState(resume?.name ?? '');
  const [nameEn, setNameEn] = useState('');
  const [draft, setDraft] = useState<Draft>({ identity: resume ? { name: resume.name } : {}, visual: { ...FREE_FONTS } });
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [flow, setFlow] = useState(false);
  const prog = requiredProgress(schema, draft);
  const requiredSections = schema.sections.filter((s) => s.id !== 'visual' && s.questions.some((q) => schema.required.includes(`${s.id}.${q.id}`)));

  const createFolder = async () => {
    if (!name.trim()) { setProblem('نام برند را بنویس.'); return; }
    setBusy(true); setProblem(null);
    try {
      const r = await api.post<{ slug: string }>('/api/brand-core', { name: name.trim(), ...(nameEn.trim() ? { name_en: nameEn.trim() } : {}) });
      setSlug(r.slug);
      setDraft((d) => setAnswer(setAnswer(d, 'identity', 'name', name.trim()), 'identity', 'name_en', nameEn.trim()));
      setStep(1);
    } catch (e) { setProblem(e instanceof ApiError ? e.message : 'برند ساخته نشد.'); } finally { setBusy(false); }
  };

  return (
    <div className="card stack welcome-card" aria-labelledby="creator-h">
      <h2 id="creator-h">برند تازه</h2>
      <p className="muted small" aria-live="polite">قدم {faNum(step + 1)} از {faNum(STEPS.length)}: {STEPS[step]}</p>
      <ol className="welcome-progress" aria-hidden="true">{STEPS.map((s, i) => <li key={s} className={i <= step ? 'on' : ''} />)}</ol>

      {step === 0 && (
        <div className="stack">
          <p>اول اسم برند را بنویس. بقیه‌ی کار با چند سؤال کوتاه انجام می‌شود؛ سندهای برند (راهنما، سیستم طراحی، سیستم کاور) را از روی پاسخ‌هایت می‌سازیم.</p>
          <div className="inline-field"><label htmlFor="bn">نام برند (فارسی)</label><input id="bn" className="text-input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} /></div>
          <div className="inline-field"><label htmlFor="bne">نام لاتین (اختیاری)</label><input id="bne" className="text-input latin" value={nameEn} maxLength={60} onChange={(e) => setNameEn(e.target.value)} /></div>
          {problem && <p className="problem" role="alert">{problem}</p>}
          <div className="row-between">
            {onSkip ? <button type="button" className="btn" onClick={onSkip}>بعداً</button> : <span />}
            <button type="button" className="btn primary" disabled={busy} onClick={() => void createFolder()}>ادامه</button>
          </div>
        </div>
      )}

      {step === 1 && slug && (
        <div className="stack">
          <p className="muted">فقط سؤال‌های لازم؛ بقیه را بعداً در «برند من» کامل می‌کنی. پر شده: {faNum(prog.done)} از {faNum(prog.total)}</p>
          {requiredSections.map((s) => (
            <section key={s.id} className="stack" aria-label={s.title}>
              <h3>{s.title}</h3>
              <QuestionForm schema={schema} section={s} draft={draft} onChange={setDraft} requiredOnly />
            </section>
          ))}
          <div className="row-between">
            <button type="button" className="btn" onClick={() => setStep(0)} disabled={!!resume}>قبلی</button>
            <button type="button" className="btn primary" onClick={() => setStep(2)}>بعدی</button>
          </div>
        </div>
      )}

      {step === 2 && slug && (
        <div className="stack">
          <VisualForm slug={slug} draft={draft} onChange={setDraft} />
          <div className="row-between">
            <button type="button" className="btn" onClick={() => setStep(1)}>قبلی</button>
            <button type="button" className="btn primary" onClick={() => setStep(3)}>بعدی</button>
          </div>
        </div>
      )}

      {step === 3 && slug && (
        <div className="stack">
          <p>همه‌چیز آماده است. با «ساخت»، ابتدا فهرست سندها و هزینه‌ی تقریبی را می‌بینی و بعد تأیید می‌کنی.</p>
          {prog.done < prog.total && <p className="problem" role="alert">هنوز {faNum(prog.total - prog.done)} پاسخ لازم خالی است؛ در قدم بعدی فهرستش را می‌بینی.</p>}
          <div className="row-between">
            <button type="button" className="btn" onClick={() => setStep(2)}>قبلی</button>
            <button type="button" className="btn primary big" onClick={() => setFlow(true)}>ساخت برند</button>
          </div>
        </div>
      )}
      {flow && slug && <SaveFlow slug={slug} answers={cleanAnswers(draft)} onClose={(changed) => { setFlow(false); if (changed) onDone(slug); }} />}
    </div>
  );
}

/** The «برند تازه» screen: the creator, and on success the new brand becomes the active one and «برند من» opens. */
export function NewBrand() {
  useScreenTour('brand-new');
  const { data: schema } = usePoll<BrandSchema>('/api/brand-core/schema', 0);
  const { choose } = useBrand();
  if (!schema) return <p className="muted">در حال بارگذاری…</p>;
  return (
    <div className="stack">
      <div className="page-head"><h1>ساخت برند تازه</h1><HelpButton /></div>
      <BrandCreator schema={schema} onDone={(slug) => { void choose(slug).then(() => go('/brand')); }} />
    </div>
  );
}
