// Responsibility: the In progress screen of one job (docs/11 §2): header with «توقف»/«ادامه», overall progress, the six stage rows (truth chips, voice play, plan link, build steps), the script panel, and the frame preview.
import { useEffect, useState } from 'react';
import { api, ApiError, fileUrl, type JobDetail, type StageName, type Status } from '../api';
import { faDateTime, faDuration, faNum } from '../fa';
import { usePoll, useRefName } from '../hooks';
import { BUILD_STEPS, ROWS, ROW_STATE_FA, isPaused, rowState, statusText } from '../labels';
import { ScriptPanel } from './ScriptPanel';
import { FirstTip, HelpButton } from '../guide/Guide';

/** The newest rendered frame, checked every 5 s while the build runs. */
function Frame({ job }: { job: JobDetail }) {
  const building = job.state.stage === 'build' && job.status === 'running';
  const { data, reload } = usePoll<{ file: string | null }>(`/api/jobs/${job.slug}/frame`, building ? 5000 : 0);
  useEffect(() => { void reload(); }, [job.state.stage, reload]);
  return (
    <figure className={`frame-box f${job.format}`}>
      {data?.file ? <img src={`${fileUrl(job.slug, data.file)}?t=${Date.now()}`} alt="آخرین فریم رندرشده" /> : <figcaption className="muted small">فریمی هنوز رندر نشده.</figcaption>}
    </figure>
  );
}

/**
 * «حدود X دقیقه مانده» from each stage's measured average (stage_runs): the stages still to run plus what is left of the running one.
 * When the running stage already took longer than usual, it says so instead of showing a number that would stay at «۱ دقیقه».
 */
function remaining(job: JobDetail, avg: Partial<Record<StageName, number>>): string | null {
  const order: StageName[] = ['preflight', 'content', 'voice', 'reference', 'plan', 'build', 'package'];
  const cur = job.state.stage;
  if (!cur) return null;
  const curAvg = avg[cur];
  const startedAt = job.state.stages[cur]?.started_at;
  const inCur = startedAt ? (Date.now() - Date.parse(startedAt)) / 60000 : 0;
  const later = order.slice(order.indexOf(cur) + 1).filter((s) => job.state.stages[s]?.status !== 'done');
  if (curAvg === undefined || later.some((s) => avg[s] === undefined)) return null;
  const rest = later.reduce((n, s) => n + (avg[s] ?? 0), 0);
  const over = inCur > curAvg;
  const mins = Math.round(rest + Math.max(0, curAvg - inCur));
  if (over && mins < 2) return 'این مرحله کمی بیشتر از معمول طول کشیده';
  return `حدود ${faNum(Math.max(1, mins))} دقیقه مانده${over ? ' (این مرحله بیشتر از معمول طول کشیده)' : ''}`;
}

export function Progress({ job }: { job: JobDetail }) {
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { data: status } = usePoll<Status>('/api/status', 60000);
  const refName = useRefName();
  const held = job.status === 'held';
  const paused = isPaused(job);
  const canStop = job.active || job.queued;
  // D77: a script blocked below the truth gate is shown with its own two choices; «ادامه» would only block again.
  const scriptBlocked = job.script_blocked && job.script !== null;
  const idle = !job.active && !job.queued;
  const canResume = idle && !scriptBlocked && ['interrupted', 'failed', 'blocked', 'paused_quota'].includes(job.status);
  // D45: the script is shown (and can be held) once the content stage is done.
  const scriptReady = job.script !== null && (job.state.stages.content?.status === 'done' || scriptBlocked);
  const canHold = scriptReady && !scriptBlocked && !held && job.status !== 'done' && job.status !== 'cancelled';

  const done = ROWS.filter((r) => rowState(job, r.stages) === 'done').length;
  const started = job.state.started_at ?? job.request.created_at;
  const eta = remaining(job, status?.stage_avg_min ?? {});

  const act = async (what: string, msg: string | null = null) => {
    setBusy(true); setError(null);
    try { await api.post(`/api/jobs/${job.slug}/${what}`); if (msg) setNotice(msg); } catch (e) { setError(e instanceof ApiError ? e.message : String(e)); } finally { setBusy(false); }
  };

  return (
    <div className="stack">
      <header className="card job-head">
        <div className="stack-sm">
          <h1 className="topic-title">{job.title}</h1>
          <p className="muted small">
            برند: {job.brand_name} · {job.format === '9x16' ? 'عمودی ۹:۱۶' : 'افقی ۱۶:۹'} · مرجع: {job.references.map(refName).join('، ')} · شروع: {faDateTime(started)}
          </p>
        </div>
        <div className="actions">
          <HelpButton />
          {canStop && <button type="button" className="btn" data-tour="stop" disabled={busy} onClick={() => void act('stop', 'کار متوقف شد؛ هر وقت خواستی «ادامه» را بزن.')}>توقف</button>}
          {canResume && <button type="button" className="btn primary" disabled={busy} onClick={() => void act('resume')}>ادامه</button>}
        </div>
      </header>

      <section className="card stack-sm" aria-label="پیشرفت کلی">
        <div className="row-between">
          <b>{statusText(job)}{job.queued ? ' — در صف، بعد از کار جاری شروع می‌شود' : ''}</b>
          <span className="muted small">مرحله {faNum(done)} از {faNum(ROWS.length)}{eta && job.status === 'running' ? ` · ${eta}` : ''}</span>
        </div>
        <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={ROWS.length} aria-valuenow={done} aria-label="مرحله‌های انجام‌شده"><i style={{ width: `${(done / ROWS.length) * 100}%` }} /></div>
        {(job.state.error && !paused) && <p className="problem" role="alert">{job.state.error.message_fa}</p>}
        {job.last_error && <p className="problem" role="alert">{job.last_error}</p>}
        {paused && <p className="muted">با «توقف» مکث شد. مرحله‌ی «{ROWS.find((r) => r.stages.includes(job.state.stage!))?.label ?? ''}» با «ادامه» دوباره اجرا می‌شود.</p>}
        {notice && <p className="success" role="status">{notice}</p>}
        <FirstTip id="held" when={held} />
        <FirstTip id="paused_owner" when={paused} />
        {error && <p className="problem" role="alert">{error}</p>}
      </section>

      <div className="progress-grid">
        <section className="card" aria-labelledby="stages-h">
          <h2 id="stages-h" className="sr-only">مرحله‌ها</h2>
          <ol className="stages">
            {ROWS.map((r) => {
              const st = rowState(job, r.stages);
              return (
                <li key={r.key} className={`stage s-${st}`}>
                  <div className="stage-head">
                    <span className="stage-dot" aria-hidden="true" />
                    <b>{r.label}</b>
                    <span className="muted small">{ROW_STATE_FA[st]}</span>
                  </div>
                  {r.key === 'content' && scriptReady && (
                    <div className="stage-body">
                      <ScriptPanel key={held ? 'edit' : 'read'} job={job} editing={held}
                        onDone={(restart) => { setNotice(restart ? `ادامه با متن تازه؛ دوباره اجرا می‌شود: ${restart}` : 'ادامه بدون تغییر.'); }} />
                      {scriptBlocked && idle && (
                        <div className="actions">
                          <button type="button" className="btn primary" disabled={busy} onClick={() => { void act('accept-script', 'متن پذیرفته شد؛ ساخت با صدای گوینده ادامه پیدا می‌کند.'); }}>قبول همین متن</button>
                          <button type="button" className="btn" disabled={busy} onClick={() => { void act('extra-round', 'یک دور دیگر نوشتن و بازبینی شروع شد.'); }}>یک دور دیگر</button>
                        </div>
                      )}
                      {job.script_accepted && <p className="muted small">این متن را خودت پذیرفتی؛ امتیاز آخرش زیر حد قبولی بود.</p>}
                      {canHold && (
                        <button type="button" className="btn" data-tour="hold" disabled={busy} onClick={() => { void act('hold', 'کار نگه داشته شد؛ متن‌ها را اصلاح کن.'); }}>توقف و اصلاح سناریو</button>
                      )}
                    </div>
                  )}
                  {r.key === 'truth' && job.rounds.length > 0 && (
                    <ul className="chips stage-body" aria-label="دورهای کنترل کیفیت">
                      {job.rounds.map((x) => (
                        <li key={x.round} className={`chip${x.passed ? ' on' : ''}`}>دور {faNum(x.round)}: {faNum(Math.round(x.score))}{x.passed ? ' ✓' : ''}</li>
                      ))}
                      <li className="muted small">حد قبولی {faNum(job.pass_score)}</li>
                    </ul>
                  )}
                  {r.key === 'voice' && job.voice_file && st === 'done' && (
                    <audio className="stage-body" controls preload="none" src={fileUrl(job.slug, job.voice_file)} aria-label="پخش صدای گوینده" />
                  )}
                  {r.key === 'plan' && job.plan && (
                    <details className="stage-body plan-view">
                      <summary>دیدن استوری‌بورد ({faNum(job.plan.rows.length)} صحنه، {faDuration(job.plan.total_duration)})</summary>
                      <ol className="plan-rows">
                        {job.plan.rows.map((p) => (
                          <li key={p.id}>
                            <span className="muted small nowrap">{faDuration(p.start)} تا {faDuration(p.end)}</span>
                            {/* Only the Persian on-screen text: the picture notes are the plan skill's English working notes. */}
                            <b dir="auto">{p.texts.length > 0 ? p.texts.join(' / ') : 'بدون متن روی صفحه'}</b>
                          </li>
                        ))}
                      </ol>
                    </details>
                  )}
                  {r.key === 'build' && (
                    <ul className="sub-steps stage-body">{BUILD_STEPS.map((s) => <li key={s} className="small muted">{s}</li>)}</ul>
                  )}
                </li>
              );
            })}
          </ol>
        </section>

        <aside className="stack" aria-label="پیش‌نمایش">
          <section className="card stack-sm" data-tour="frame">
            <h2>آخرین فریم</h2>
            <Frame job={job} />
          </section>
          <section className="card stack-sm">
            <h2>کنترل‌ها</h2>
            {job.qa_md ? <pre className="qa-log">{job.qa_md.split('\n').slice(-12).join('\n')}</pre>
              : <p className="muted small">گزارش کنترل کیفیت ساخت بعد از رندر پیش‌نویس می‌آید.</p>}
          </section>
        </aside>
      </div>
    </div>
  );
}
