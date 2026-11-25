// Responsibility: the Result screen of a finished job (docs/11 §3): player, voice tone, cover with the profile-grid view, caption copy, QA checklist, a video film's clip prompts, revision box (with «متن گوینده»; for a video film: one clip, sound, caption, script), files and «باز کردن پوشه».
import { useEffect, useState, type ReactNode } from 'react';
import { api, ApiError, coverPreviewUrl, fileUrl, type JobDetail } from '../api';
import { faDateTime, faDuration, faNum, faUsd } from '../fa';
import { useRefName } from '../hooks';
import { SubmitButton } from '../SubmitButton';
import { WORKSPACE_FA } from '../labels';
import { ScriptPanel } from './ScriptPanel';
import { ClipsPanel } from './ClipsPanel';
import { PromptsPanel } from './PromptsPanel';
import { HelpButton } from '../guide/Guide';

const TONE_FA: Record<string, string> = { formal: 'رسمی', narrative: 'روایی', friendly: 'دوستانه', meditative: 'آرام', energetic: 'پرانرژی' };
const TARGETS = [
  { id: 'video', label: 'ویدیو' }, { id: 'cover', label: 'کاور' }, { id: 'caption', label: 'کپشن' }, { id: 'sound', label: 'صدا' }, { id: 'script', label: 'متن گوینده' },
] as const;
/** Phase 11.7: a video film is revised by clip (paid), sound (free), cover (free: moment and logo place), caption and script; it has no motion build to revise. */
const VIDEO_TARGETS = [
  { id: 'clip', label: 'یک کلیپ' }, { id: 'sound', label: 'صدا' }, { id: 'cover', label: 'کاور' }, { id: 'caption', label: 'کپشن' }, { id: 'script', label: 'متن گوینده' },
] as const;
type Target = (typeof TARGETS)[number]['id'] | 'clip';
const TARGET_FA: Record<string, string> = Object.fromEntries([...TARGETS, ...VIDEO_TARGETS].map((t) => [t.id, t.label]));
const SOUND_FA = {
  keep: { title: 'زیر صدای گوینده', hint: 'موسیقی و افکت مدل، ۱۲ دسی‌بل پایین‌تر از صدا' },
  off: { title: 'بدون صدای کلیپ‌ها', hint: 'فقط صدای گوینده و لوگوی پایانی' },
} as const;

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
    ...(job.workspace === 'video' ? videoChecks(job) : [fromReport('متن فارسی'), fromReport('محدوده‌ی امن'), fromReport('رنگ‌های برند'), fromReport('لوگوموشن پایانی'), fromReport('موسیقی زیر صدا')]),
  ];
}

/** Phase 11.7: what the assemble and package stages measured on a video film (in place of the motion build report's rows). */
function videoChecks(job: JobDetail): Check[] {
  const r = job.video_result;
  if (!r) return [{ label: 'سرهم کردن ویدیو', ok: null, note: 'گزارشی پیدا نشد' }];
  const muted = r.clips.filter((c) => c.sound === 'muted_speech').map((c) => faNum(c.index));
  return [
    { label: 'لوگوموشن پایانی', ok: r.outro_ok, note: r.outro_ok === null ? 'اندازه‌گیری نشده' : 'درست بعد از صدا، بی‌واسطه (مثل فیلم موشن)' },
    {
      label: 'صدای خود کلیپ‌ها', ok: true,
      note: `${r.clip_sound_db === null ? 'برای این فیلم حذف شده' : '۱۲ دسی‌بل زیر صدای گوینده'}${muted.length ? `؛ کلیپ ${muted.join('، ')} بی‌صدا (حرف زدن در کلیپ)` : ''}`,
    },
    { label: 'کلیپ‌ها', ok: r.flagged.length === 0, note: r.flagged.length ? `کلیپ ${r.flagged.map((k) => faNum(k)).join('، ')} با یک ایراد کوچک نگه داشته شد` : `${faNum(r.clips.length)} کلیپ، بدون ایراد` },
    { label: 'کاور', ok: r.cover_problems === null ? null : r.cover_problems.length === 0, note: r.cover_problems === null ? 'بررسی نشده' : r.cover_problems.length ? `${faNum(r.cover_problems.length)} ایراد (جزئیات در گزارش کیفیت)` : 'اندازه، متن کاور، فونت برند و کنتراست درست است' },
  ];
}

/** Phase 11.7: the sound of a finished video film: the clips' own sound kept (D102) or off; local and free. */
function VideoSoundChoice({ job, working, onSent }: { job: JobDetail; working: boolean; onSent: (label: string) => void }) {
  const current = job.video_result?.clip_sound_db === null ? 'off' : 'keep';
  const [choice, setChoice] = useState<'keep' | 'off'>(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function apply() {
    setBusy(true); setError(null);
    try { await api.post(`/api/jobs/${job.slug}/video-sound`, { clip_sound: choice }); onSent(TARGET_FA.sound!); }
    catch (e) { setError(e instanceof ApiError ? e.message : String(e)); } finally { setBusy(false); }
  }
  return (
    <div className="stack-sm">
      <span className="field-label" id="clip-sound-l">صدای خود کلیپ‌ها (موسیقی و افکتی که مدل ساخته)</span>
      <div className="format-grid" role="radiogroup" aria-labelledby="clip-sound-l">
        {(['keep', 'off'] as const).map((k) => (
          <label key={k} className={`format-card${choice === k ? ' on' : ''}`}>
            <input type="radio" name="clip-sound" value={k} checked={choice === k} onChange={() => setChoice(k)} />
            <span><b>{SOUND_FA[k].title}</b><span className="muted small"> — {SOUND_FA[k].hint}{current === k ? ' (الان)' : ''}</span></span>
          </label>
        ))}
      </div>
      <p className="small muted">کلیپی که بیش از یک ثانیه حرف زدن دارد در هر حالت بی‌صداست. فقط صدا دوباره میکس می‌شود؛ تصویر، کاور و کپشن عوض نمی‌شوند و هزینه‌ای ندارد.</p>
      {error && <p className="problem" role="alert">{error}</p>}
      <div className="actions"><SubmitButton busy={busy} failed={!!error} disabled={working || choice === current} onClick={() => void apply()}>اعمال اصلاح (رایگان)</SubmitButton></div>
    </div>
  );
}

const LOGO_FA = {
  under: { title: 'زیر زیرتیتر', hint: 'لوگوی بزرگ وسط‌چین، زیر متن کاور' },
  bottom: { title: 'پایین، وسط', hint: 'لوگوی بزرگ پایین کاور' },
} as const;

/** The cover of a finished video film: the moment of the reel behind it and where the logo sits; the cover is drawn on the PC, free. */
function VideoCoverChoice({ job, working, onSent }: { job: JobDetail; working: boolean; onSent: (label: string) => void }) {
  const length = Math.floor(job.manifest?.duration ?? 600);
  const [useDefault, setUseDefault] = useState(true);
  const [second, setSecond] = useState('5');
  const [logo, setLogo] = useState<'under' | 'bottom'>('under');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function apply() {
    setBusy(true); setError(null);
    try {
      const s = Number(second);
      if (!useDefault && (!Number.isFinite(s) || s < 0 || s > length)) throw new Error(`لحظه باید بین ۰ و ${faNum(length)} ثانیه باشد.`);
      await api.post(`/api/jobs/${job.slug}/video-cover`, { frame_s: useDefault ? null : s, logo });
      onSent(TARGET_FA.cover!);
    } catch (e) { setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }
  return (
    <div className="stack-sm">
      <span className="field-label" id="cover-logo-l">جای لوگو روی کاور</span>
      <div className="format-grid" role="radiogroup" aria-labelledby="cover-logo-l">
        {(['under', 'bottom'] as const).map((k) => (
          <label key={k} className={`format-card${logo === k ? ' on' : ''}`}>
            <input type="radio" name="cover-logo" value={k} checked={logo === k} onChange={() => setLogo(k)} />
            <span><b>{LOGO_FA[k].title}</b><span className="muted small"> — {LOGO_FA[k].hint}</span></span>
          </label>
        ))}
      </div>
      <label className="field-label" htmlFor="cover-sec">کدام لحظه‌ی فیلم پشت کاور باشد</label>
      <label className="small"><input type="checkbox" checked={useDefault} onChange={(e) => setUseDefault(e.target.checked)} /> لحظه‌ی پیش‌فرض (وسط کلیپ اول)</label>
      {!useDefault && <input id="cover-sec" type="number" min={0} max={length} step={0.5} value={second} onChange={(e) => setSecond(e.target.value)} aria-label="ثانیه" />}
      <p className="small muted">فقط کاور دوباره ساخته می‌شود؛ تصویر، صدا و کپشن عوض نمی‌شوند و هزینه‌ای ندارد.</p>
      {error && <p className="problem" role="alert">{error}</p>}
      <div className="actions"><SubmitButton busy={busy} failed={!!error} disabled={working} onClick={() => void apply()}>اعمال اصلاح (رایگان)</SubmitButton></div>
    </div>
  );
}

function Revision({ job }: { job: JobDetail }) {
  const video = job.workspace === 'video';
  const targets = video ? VIDEO_TARGETS : TARGETS;
  const [target, setTarget] = useState<Target>(video ? 'clip' : 'video');
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
        {targets.map((t) => (
          <button key={t.id} type="button" role="radio" aria-checked={target === t.id} className={`chip${target === t.id ? ' on' : ''}`} onClick={() => setTarget(t.id)}>{t.label}</button>
        ))}
      </div>
      {target === 'script' ? (
        job.script ? <ScriptPanel key="edit" job={job} editing onDone={() => { setTarget(video ? 'clip' : 'video'); setSent('متن گوینده'); setPhase('started'); }} onCancel={() => setTarget(video ? 'clip' : 'video')} />
          : <p className="muted">سناریو پیدا نشد.</p>
      ) : video && target === 'clip' ? (
        <ClipsPanel job={job} idle={!working} finished onResume={null} onNotice={() => { setSent(TARGET_FA.clip!); setPhase('started'); }} />
      ) : video && target === 'sound' ? (
        <VideoSoundChoice job={job} working={working} onSent={(l) => { setSent(l); setPhase('started'); }} />
      ) : video && target === 'cover' ? (
        <VideoCoverChoice job={job} working={working} onSent={(l) => { setSent(l); setPhase('started'); }} />
      ) : (
        <div className="stack-sm">
          <label htmlFor="rev-note" className="field-label">یادداشت اصلاح</label>
          <textarea id="rev-note" className="note" rows={3} value={note} onChange={(e) => setNote(e.target.value)}
            placeholder={target === 'cover' ? 'مثلاً: تیتر کاور بزرگ‌تر شود' : target === 'sound' ? 'مثلاً: موسیقی کمی آرام‌تر' : ''} />
          <div className="actions">
            <SubmitButton busy={busy} failed={!!error} disabled={working || !note.trim()} onClick={() => void apply()}>اعمال اصلاح</SubmitButton>
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

/** `fresh`: the film finished while its screen was open, so the cover makes its entrance once (Phase 12). */
export function Result({ job, fresh = false }: { job: JobDetail; fresh?: boolean }) {
  const [grid, setGrid] = useState(false);
  const [copied, setCopied] = useState(false);
  const [folderMsg, setFolderMsg] = useState<string | null>(null);
  const m = job.manifest;
  const refName = useRefName();
  // Files change on a revision; the job's update time keeps the browser from showing the old one.
  const v = encodeURIComponent(job.updated_at);
  // Phase 11.9: a video film's cover is a photo PNG (about 0.7 MB, phone LCP 10 s); the page shows its 540 px JPEG. A motion cover is a light graphic and stays as it is.
  const coverSrc = job.workspace === 'video' ? coverPreviewUrl(job.slug) : fileUrl(job.slug, 'out/cover-4x5.png');

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
            آماده · {WORKSPACE_FA[job.workspace]} · برند: {job.brand_name} · {job.format === '9x16' ? 'عمودی ۹:۱۶' : 'افقی ۱۶:۹'} · {job.workspace === 'video' ? <>سبک: <bdi className="latin">{job.style_title ?? job.style ?? '—'}</bdi></> : `مرجع: ${job.references.map(refName).join('، ')}`}
            {m && <> · {faDuration(m.total_duration)} · {faDateTime(m.created_at)}</>}
          </p>
        </div>
        <div className="actions"><HelpButton /></div>
      </header>

      <div className="result-grid">
        <section className="card stack-sm" aria-labelledby="player-h">
          <h2 id="player-h">فیلم</h2>
          <video className={`player f${job.format}`} controls preload="metadata" poster={`${coverSrc}?v=${v}`} src={`${fileUrl(job.slug, 'out/final.mp4')}?v=${v}`} />
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
          <div className={`cover-box${grid ? ' grid-view' : ''}${fresh ? ' fresh' : ''}`}>
            <img src={`${coverSrc}?v=${v}`} alt={`کاور: ${job.topic}`} width={1080} height={1350} decoding="async" />
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
          {m.video && (
            <p className="small muted">
              هزینه‌ی این فیلم (برآورد برنامه): حدود {faUsd(m.video.ledger_usd.total)}؛ ساخت کلیپ‌ها با Google {faUsd(m.video.ledger_usd.vertex)}، Claude {faUsd(m.video.ledger_usd.claude)}. سرهم کردن، صدا، کاور و بسته‌ی خروجی روی همین کامپیوتر و رایگان است.
            </p>
          )}
        </section>
      )}

      {job.workspace === 'video' && job.prompts.length > 0 && (
        <section className="card stack" aria-labelledby="prompts-h">
          <div className="stack-sm">
            <h2 id="prompts-h">پرامپت کلیپ‌ها</h2>
            <p className="small muted">هر کلیپ با همین متن از مدل ویدیو ساخته شد. خلاصه‌ی بخش مخصوص هر کلیپ اینجاست؛ متن کامل را می‌شود دید، کپی یا دانلود کرد.</p>
          </div>
          <PromptsPanel job={job} />
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
