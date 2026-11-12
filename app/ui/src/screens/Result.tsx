// Responsibility: the Result screen of a finished job (docs/11 §3): player, voice tone, cover with the profile-grid view, caption copy, QA checklist, revision box (with «متن گوینده»), files and «باز کردن پوشه».
import { useEffect, useState, type ReactNode } from 'react';
import { api, ApiError, fileUrl, type JobDetail } from '../api';
import { faDateTime, faDuration, faNum } from '../fa';
import { useRefName } from '../hooks';
import { ScriptPanel } from './ScriptPanel';
import { HelpButton } from '../guide/Guide';

const TONE_FA: Record<string, string> = { formal: 'رسمی', narrative: 'روایی', friendly: 'دوستانه', meditative: 'آرام', energetic: 'پرانرژی' };
const TARGETS = [
  { id: 'video', label: 'ویدیو' }, { id: 'cover', label: 'کاور' }, { id: 'caption', label: 'کپشن' }, { id: 'sound', label: 'صدا' }, { id: 'script', label: 'متن گوینده' },
] as const;
type Target = (typeof TARGETS)[number]['id'];
const TARGET_FA: Record<string, string> = Object.fromEntries(TARGETS.map((t) => [t.id, t.label]));

const FILES = [
  { rel: 'out/final.mp4', label: 'فیلم نهایی', name: 'final.mp4' },
  { rel: 'out/cover-4x5.png', label: 'کاور ۴:۵', name: 'cover-4x5.png' },
  { rel: 'out/caption.txt', label: 'کپشن', name: 'caption.txt' },
  { rel: 'out/package.md', label: 'پکیج محتوا', name: 'package.md' },
];

type Check = { label: string; ok: boolean | null; note: ReactNode };

/** QA checklist: the app's own measurements where it has them, the build report (qa.md) for the rest. */
function checks(job: JobDetail): Check[] {
  const m = job.manifest!;
  const v = job.verify?.measure ?? null;
  const qaOk = m.qa.passed;
  const fromReport = (label: string): Check => ({ label, ok: qaOk, note: 'طبق گزارش ساخت' });
  return [
    // D77: a script the owner accepted below the gate keeps its real score and mark, with the reason beside it.
    { label: 'امتیاز حقیقت‌سنجی', ok: m.truth_score >= job.pass_score, note: `${faNum(Math.round(m.truth_score))} از ۱۰۰ در ${faNum(m.truth_rounds)} دور${job.script_accepted ? '؛ متن را خودت پذیرفتی' : ''}` },
    { label: 'هم‌زمانی و مدت', ok: v ? Math.abs(v.duration - m.total_duration) <= 1 / 30 + 0.01 : null, note: v ? `${faDuration(v.duration)} (نقشه ${faDuration(m.total_duration)})` : 'اندازه‌گیری نشده' },
    { label: 'صدای گوینده تا آخر شنیده می‌شود', ok: job.verify ? (job.verify.voice_lost ?? []).length === 0 : null, note: job.verify ? 'اندازه‌گیری شد' : 'اندازه‌گیری نشده' },
    { label: 'بلندی صدا', ok: v?.lufs != null ? Math.abs(v.lufs + 14) <= 1 && (v.true_peak_dbtp ?? 0) <= -1.5 : null, note: v?.lufs != null ? <><bdi dir="ltr">{faNum(v.lufs, 1)} LUFS</bdi>، پیک <bdi dir="ltr">{faNum(v.true_peak_dbtp ?? 0, 1)} dBTP</bdi></> : 'اندازه‌گیری نشده' },
    fromReport('متن فارسی'), fromReport('محدوده‌ی امن'), fromReport('رنگ‌های برند'), fromReport('لوگوموشن پایانی'), fromReport('موسیقی زیر صدا'),
  ];
}

function Revision({ job }: { job: JobDetail }) {
  const [target, setTarget] = useState<Target>('video');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const working = job.active || job.queued;
  // started → running (seen live) → finished: the message follows the revision.
  const [phase, setPhase] = useState<'idle' | 'started' | 'running' | 'finished'>('idle');
  useEffect(() => {
    if (working && (phase === 'started' || phase === 'idle')) setPhase(phase === 'idle' ? 'idle' : 'running');
    if (!working && phase === 'running') setPhase('finished');
  }, [working, phase]);

  async function send(t: string, n: string) {
    setBusy(true); setError(null); setSent(null);
    try {
      await api.post(`/api/jobs/${job.slug}/revise`, { target: t, note: n });
      setSent(TARGET_FA[t] ?? t);
      setPhase('started');
      setNote('');
    } catch (e) { setError(e instanceof ApiError ? e.message : String(e)); } finally { setBusy(false); }
  }
  const apply = () => send(target, note);
  const cut = job.revision_pending;

  return (
    <section className="card stack" aria-labelledby="rev-h">
      <h2 id="rev-h">اصلاح</h2>
      {cut && !working && (
        <div className="problem stack-sm" role="alert">
          <p>اصلاح «{TARGET_FA[cut.target] ?? cut.target}» نیمه‌کاره ماند (برنامه وسط کار بسته یا دوباره روشن شد) و انجام نشد.{cut.note ? ` یادداشت: «${cut.note}»` : ''}</p>
          <div className="actions"><button type="button" className="btn primary" disabled={busy} onClick={() => void send(cut.target, cut.note)}>دوباره</button></div>
        </div>
      )}
      <div className="chips" role="radiogroup" aria-label="چه چیزی اصلاح شود">
        {TARGETS.map((t) => (
          <button key={t.id} type="button" role="radio" aria-checked={target === t.id} className={`chip${target === t.id ? ' on' : ''}`} onClick={() => setTarget(t.id)}>{t.label}</button>
        ))}
      </div>
      {target === 'script' ? (
        job.script ? <ScriptPanel key="edit" job={job} editing onDone={() => { setTarget('video'); setSent('متن گوینده'); setPhase('started'); }} />
          : <p className="muted">سناریو پیدا نشد.</p>
      ) : (
        <div className="stack-sm">
          <label htmlFor="rev-note" className="field-label">یادداشت اصلاح</label>
          <textarea id="rev-note" className="note" rows={3} value={note} onChange={(e) => setNote(e.target.value)}
            placeholder={target === 'cover' ? 'مثلاً: تیتر کاور بزرگ‌تر شود' : target === 'sound' ? 'مثلاً: موسیقی کمی آرام‌تر' : ''} />
          <div className="actions">
            <button type="button" className="btn primary" disabled={busy || working || !note.trim()} onClick={() => void apply()}>اعمال اصلاح</button>
          </div>
        </div>
      )}
      {working && <p className="muted" role="status">اصلاح در حال انجام است…</p>}
      {sent && phase === 'started' && <p className="muted" role="status">اصلاح «{sent}» شروع شد؛ نسخه‌ی قبلی پشتیبان گرفته می‌شود.</p>}
      {sent && phase === 'finished' && !job.last_error && <p className="success" role="status">اصلاح «{sent}» انجام شد. نسخه‌ی قبلی در «اصلاح‌های قبلی» ثبت است.</p>}
      {job.last_error && <p className="problem" role="alert">{job.last_error}</p>}
      {error && <p className="problem" role="alert">{error}</p>}
      {job.revisions.length > 0 && (
        <details>
          <summary>اصلاح‌های قبلی ({faNum(job.revisions.length)})</summary>
          <ul className="small muted">
            {job.revisions.map((r) => <li key={r.at}>{faDateTime(r.at)} · {TARGET_FA[r.target] ?? r.target}{r.note ? ` · ${r.note}` : ''}</li>)}
          </ul>
        </details>
      )}
    </section>
  );
}

export function Result({ job }: { job: JobDetail }) {
  const [grid, setGrid] = useState(false);
  const [copied, setCopied] = useState(false);
  const [folderMsg, setFolderMsg] = useState<string | null>(null);
  const m = job.manifest;
  const refName = useRefName();
  // Files change on a revision; the job's update time keeps the browser from showing the old one.
  const v = encodeURIComponent(job.updated_at);

  async function copy() {
    if (!job.caption) return;
    try { await navigator.clipboard.writeText(job.caption); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setCopied(false); }
  }
  async function openFolder() {
    try { await api.post(`/api/jobs/${job.slug}/open-folder`); setFolderMsg(null); } catch (e) { setFolderMsg(e instanceof ApiError ? e.message : String(e)); }
  }

  return (
    <div className="stack">
      <header className="card job-head">
        <div className="stack-sm">
          <h1 className="topic-title">{job.title}</h1>
          <p className="muted small">
            آماده · برند: {job.brand_name} · {job.format === '9x16' ? 'عمودی ۹:۱۶' : 'افقی ۱۶:۹'} · مرجع: {job.references.map(refName).join('، ')}
            {m && <> · {faDuration(m.total_duration)} · {faDateTime(m.created_at)}</>}
          </p>
        </div>
        <div className="actions"><HelpButton /></div>
      </header>

      <div className="result-grid">
        <section className="card stack-sm" aria-labelledby="player-h">
          <h2 id="player-h">فیلم</h2>
          <video className={`player f${job.format}`} controls preload="metadata" src={`${fileUrl(job.slug, 'out/final.mp4')}?v=${v}`} />
          {job.voice && (
            <p className="small muted">
              صدا: <bdi className="latin">{job.voice.voice}</bdi> · لحن {TONE_FA[job.voice.tone] ?? job.voice.tone}{job.voice.tone_source === 'auto' ? ' (انتخاب خودکار)' : ''}
            </p>
          )}
        </section>

        <section className="card stack-sm" aria-labelledby="cover-h">
          <div className="row-between">
            <h2 id="cover-h">کاور</h2>
            <button type="button" role="switch" aria-checked={grid} className="switch" onClick={() => setGrid(!grid)}>
              <span className="knob" aria-hidden="true" /><span>نمای گرید پروفایل</span>
            </button>
          </div>
          <div className={`cover-box${grid ? ' grid-view' : ''}`}>
            <img src={`${fileUrl(job.slug, 'out/cover-4x5.png')}?v=${v}`} alt={`کاور: ${job.topic}`} />
          </div>
          {grid && <p className="small muted">بالا و پایین تیره شده: بخشی که در گرید پروفایل دیده نمی‌شود.</p>}
        </section>
      </div>

      <section className="card stack-sm" aria-labelledby="cap-h">
        <div className="row-between">
          <h2 id="cap-h">کپشن</h2>
          <button type="button" className="btn" onClick={() => void copy()} disabled={!job.caption}>{copied ? 'کپی شد ✓' : 'کپی'}</button>
        </div>
        <p className="caption-text" dir="auto">{job.caption ?? '—'}</p>
      </section>

      {m && (
        <section className="card stack-sm" aria-labelledby="qa-h">
          <h2 id="qa-h">کنترل کیفیت</h2>
          <ul className="checklist">
            {checks(job).map((c) => (
              <li key={c.label} className={c.ok === false ? 'bad' : ''}>
                <span className="mark-icon" aria-hidden="true">{c.ok === null ? '–' : c.ok ? '✓' : '!'}</span>
                <span><b>{c.label}</b> <span className="muted small">{c.note}</span></span>
                <span className="sr-only">{c.ok === null ? 'نامعلوم' : c.ok ? 'قبول' : 'رد'}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Revision job={job} />

      <section className="card stack-sm" aria-labelledby="files-h">
        <div className="row-between">
          <h2 id="files-h">فایل‌ها</h2>
          <button type="button" className="btn" onClick={() => void openFolder()}>باز کردن پوشه</button>
        </div>
        {folderMsg && <p className="problem" role="alert">{folderMsg}</p>}
        <ul className="files">
          {FILES.map((f) => (
            <li key={f.rel}>
              <a className="file-card" href={`${fileUrl(job.slug, f.rel)}?v=${v}`} download={f.name}>
                <b>{f.label}</b>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
