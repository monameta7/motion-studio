// Responsibility: the «ثبت» flow of the brand page and the creator: preview of the docs that will be rebuilt (with the estimated cost and the hand-edit warning), then the live progress of the build, then done or failed.
import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api';
import { faNum } from '../fa';
import { Modal } from '../Modal';

export interface PlanDoc { doc: string; title: string; sections: string[]; hand_edited: boolean; rebuild: boolean; est_usd: number }
export interface Plan { first_build: boolean; sections: { id: string; title: string }[]; docs: PlanDoc[]; outro: boolean; est_usd: number; est_quota_pct: number; measured: boolean }
export interface BuildStep { id: string; label_fa: string; state: 'waiting' | 'running' | 'done' | 'failed' | 'skipped'; detail_fa?: string }
export interface BuildStatus { slug: string; state: 'idle' | 'running' | 'done' | 'failed'; steps: BuildStep[]; error_fa: string | null; version: string | null }

const MARK: Record<BuildStep['state'], string> = { waiting: '○', running: '◐', done: '✓', failed: '!', skipped: '–' };

/** Starts the preview at once; `answers` is the cleaned draft. `onClose(changed)` tells the page whether to reload. */
export function SaveFlow({ slug, answers, onClose }: { slug: string; answers: Record<string, unknown>; onClose: (changed: boolean) => void }) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busyFilm, setBusyFilm] = useState(false);
  const [missing, setMissing] = useState<string[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [include, setInclude] = useState<string[]>([]);
  const [status, setStatus] = useState<BuildStatus | null>(null);
  const [starting, setStarting] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    api.post<{ plan: Plan; busy: boolean }>(`/api/brand-core/${slug}/preview`, { answers }).then((r) => { setPlan(r.plan); setBusyFilm(r.busy); }, (e: unknown) => {
      setProblem(e instanceof ApiError ? e.message : 'پیش‌نمایش ساخته نشد.');
      // The server names the missing required answers in the error body.
      const miss = e instanceof ApiError ? (e.body as { missing?: string[] } | undefined)?.missing : undefined;
      if (miss) setMissing(miss);
    });
  }, [slug, answers]);

  const running = status?.state === 'running';
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => { api.get<BuildStatus>(`/api/brand-core/${slug}/build`).then(setStatus, () => undefined); }, 2000);
    return () => clearInterval(t);
  }, [running, slug]);

  const commit = async () => {
    setStarting(true); setProblem(null);
    try { setStatus(await api.post<BuildStatus>(`/api/brand-core/${slug}/commit`, { answers, include_edited: include })); } catch (e) { setProblem(e instanceof ApiError ? e.message : 'ساخت شروع نشد.'); } finally { setStarting(false); }
  };

  const finished = status && status.state !== 'running';
  const title = status ? (running ? 'در حال ساخت برند' : status.state === 'done' ? 'برند آماده شد' : 'ساخت برند کامل نشد') : 'ثبت تغییرها';

  return (
    <Modal title={title} onClose={() => { if (!running) onClose(!!finished); }}>
      {!status && !plan && !problem && <p className="muted" aria-live="polite">در حال بررسی تغییرها…</p>}
      {!status && problem && (
        <div className="problem" role="alert">
          <p>{problem}</p>
          {missing && <ul>{missing.map((m) => <li key={m}>{m}</li>)}</ul>}
        </div>
      )}
      {!status && plan && (
        <div className="stack">
          {plan.docs.length === 0 && !plan.outro ? (
            <p>سندی برای بازسازی نیست؛ فقط پاسخ‌هایت ذخیره می‌شود.</p>
          ) : (
            <>
              {plan.first_build
                ? <p>ساخت اول برند: این سندها از روی پاسخ‌هایت نوشته می‌شوند.</p>
                : plan.sections.length > 0 && <p>بخش‌های تغییرکرده: <b>{plan.sections.map((s) => s.title).join('، ')}</b></p>}
              {plan.docs.length > 0 && (
                <ul className="plan-docs">
                  {plan.docs.map((d) => (
                    <li key={d.doc}>
                      <b>{d.title}</b>
                      {d.hand_edited && (
                        <label className="check-row problem"><input type="checkbox" checked={include.includes(d.doc)} onChange={(e) => setInclude(e.target.checked ? [...include, d.doc] : include.filter((x) => x !== d.doc))} />
                          این سند را با دست ویرایش کرده‌ای و نوشته‌ات می‌ماند. اگر می‌خواهی دوباره ساخته شود (ویرایشت پاک می‌شود) این را بزن.</label>
                      )}
                      {!plan.first_build && !d.hand_edited && d.sections.length > 0 && <span className="muted small"> ← از «{d.sections.map((id) => plan.sections.find((s) => s.id === id)?.title ?? id).join('، ')}»</span>}
                    </li>
                  ))}
                </ul>
              )}
              {plan.outro && <p className="muted">لوگوموشن پایانی هم با کد دوباره ساخته می‌شود (بدون هزینه).</p>}
              {plan.docs.some((d) => d.rebuild || include.includes(d.doc)) && (
                <p className="problem">
                  هزینه‌ی تقریبی: حدود {faNum(Math.max(1, Math.round(plan.est_quota_pct)))}٪ از سهمیه‌ی پنج‌ساعته (حدود {faNum(plan.est_usd.toFixed(1))} دلار برآوردی).
                  {plan.measured ? ' این عدد میانگین ساخت‌های قبلی است.' : ' این عدد از یک ساخت آزمایشی اندازه گرفته شده و برای برند تو کمی فرق می‌کند.'}
                </p>
              )}
            </>
          )}
          {busyFilm && <p className="problem" role="alert">الان یک ویدیو در حال ساخت است. بعد از پایان آن دوباره «ثبت» را بزن.</p>}
          {problem && <p className="problem" role="alert">{problem}</p>}
          <div className="row-between">
            <button type="button" className="btn primary" disabled={starting || busyFilm} onClick={() => void commit()}>{starting ? 'کمی صبر کن…' : 'تأیید و ثبت'}</button>
            <button type="button" className="btn" disabled={starting} onClick={() => onClose(false)}>برگرد</button>
          </div>
        </div>
      )}
      {status && (
        <div className="stack">
          <ol className="build-steps" aria-live="polite">
            {status.steps.map((s) => (
              <li key={s.id} className={`bs-${s.state}`}><span className="bs-mark" aria-hidden="true">{MARK[s.state]}</span><span>{s.label_fa}{s.detail_fa ? <span className="muted small"> — {s.detail_fa}</span> : null}</span></li>
            ))}
          </ol>
          {running && <p className="muted">ساخت هر سند چند دقیقه طول می‌کشد. می‌توانی این پنجره را باز نگه داری.</p>}
          {status.state === 'done' && <p className="success">همه‌چیز ساخته و نسخه‌ی تازه ذخیره شد.</p>}
          {status.state === 'failed' && <p className="problem" role="alert">{status.error_fa}</p>}
          {finished && <div><button type="button" className="btn primary" onClick={() => onClose(true)}>بستن</button></div>}
        </div>
      )}
    </Modal>
  );
}
