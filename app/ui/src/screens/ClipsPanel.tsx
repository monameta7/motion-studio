// Responsibility: a video job's clips on its job page (Phase 11.6 task 6, docs/11): «کلیپ k از N», a preview of each finished clip, the money used against the cap, and the owner's paid choices, each behind a confirm that shows its price first.
import { useState } from 'react';
import { api, ApiError, fileUrl, type ClipsView, type JobDetail } from '../api';
import { faNum, faUsd } from '../fa';
import { Confirm } from '../Modal';
import { EmptyState } from '../guide/EmptyState';

const usd = faUsd;

const STATUS_FA: Record<ClipsView['clips'][number]['status'], string> = {
  pending: 'در انتظار', sending: 'در حال ساخت', done: 'ساخته شد', flagged: 'ساخته شد، با یک ایراد کوچک', unknown: 'معلوم نیست (ارتباط قطع شد)', failed: 'ساخته نشد', stale: 'کهنه شد',
};
const FLAG_FA: Record<string, string> = {
  no_video: 'بدون ویدیو', unreadable: 'فایل خراب', wrong_length: 'طول نادرست', wrong_size: 'اندازه‌ی نادرست', seam_low: 'درز با کلیپ قبل', speech: 'صدای حرف زدن در کلیپ', drift: 'تغییر رنگ', refused: 'مدل نپذیرفت',
};

type Ask = { title: string; text: string; yes: string; path: string; body: Record<string, unknown> };

/** `finished`: on the result page of a finished film (Phase 11.7), where «دوباره بساز» is a revision and the current film is backed up first. */
export function ClipsPanel({ job, idle, onNotice, onResume, finished = false }: { job: JobDetail; idle: boolean; onNotice: (s: string) => void; onResume: (() => void) | null; finished?: boolean }) {
  const v = job.clips;
  const [ask, setAsk] = useState<Ask | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!v) return null;
  const making = job.status === 'running' && job.state.stage === 'clips';

  const send = async (a: Ask) => {
    setBusy(true); setError(null);
    try { await api.post(`/api/jobs/${job.slug}/${a.path}`, a.body); setAsk(null); onNotice('انجام شد؛ ساخت کلیپ‌ها ادامه پیدا می‌کند.'); }
    catch (e) { setError(e instanceof ApiError ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const rebuild = (index: number, price: number, later: boolean): Ask => ({
    title: `کلیپ ${faNum(index)} دوباره ساخته شود؟`,
    text: `هزینه حدود ${usd(price)} است (از اعتبار Google Cloud).${later ? ' کلیپ‌های بعد از آن از تصویر تازه‌ای شروع نشده‌اند؛ بعد از ساخت می‌پرسیم که دوباره ساخته شوند یا بمانند.' : ''}${finished ? ' فیلم فعلی اول پشتیبان گرفته می‌شود و بعد فیلم با کلیپ تازه دوباره سرهم می‌شود.' : ''}`,
    yes: `بله، بساز (حدود ${usd(price)})`, path: 'clip-rebuild', body: { confirm: true, index },
  });

  return (
    <div className="stage-body stack-sm" aria-label="کلیپ‌ها">
      <p className="small">
        <b>{making && v.current ? `در حال ساخت کلیپ ${faNum(v.current)} از ${faNum(v.count)}` : `کلیپ ${faNum(v.finished)} از ${faNum(v.count)} ساخته شد`}</b>
        <span className="muted"> · هزینه تا اینجا حدود {usd(v.spent_usd)} از سقف {usd(v.cap_usd)} (برآورد خود برنامه؛ صورت‌حساب Google ممکن است بیشتر باشد؛ کیفیت <span className="latin">{v.resolution}</span>)</span>
      </p>

      {v.choice && idle && (
        <div className="first-tip stack-sm" role="alert">
          {v.choice.kind === 'unknown' && <p>ارتباط با Google وسط ساخت کلیپ {faNum(v.choice.clips[0]!)} قطع شد؛ ممکن است هزینه‌اش گرفته شده باشد. برنامه خودش دوباره نمی‌فرستد.</p>}
          {v.choice.kind === 'stale' && <p>کلیپ {v.choice.clips.map((k) => faNum(k)).join('، ')} از تصویری ساخته شده که دیگر نیست (یا پرامپتش عوض شده).</p>}
          {v.choice.kind === 'failed' && <p>کلیپ {faNum(v.choice.clips[0]!)} ساخته نشد. اگر مدل پرامپت را نپذیرفته باشد، دوباره ساختن همان جواب را می‌گیرد.</p>}
          <div className="actions">
            {v.choice.kind === 'stale' ? (
              <>
                <button type="button" className="btn primary" disabled={busy} onClick={() => setAsk({ title: 'کلیپ‌های کهنه دوباره ساخته شوند؟', text: `${faNum(v.choice!.clips.length)} کلیپ دوباره ساخته می‌شود؛ هزینه حدود ${usd(v.choice!.price_usd)}.`, yes: `بله، بساز (حدود ${usd(v.choice!.price_usd)})`, path: 'clips-stale', body: { confirm: true, choice: 'rebuild' } })}>
                  دوباره ساختن (حدود {usd(v.choice.price_usd)})
                </button>
                <button type="button" className="btn" disabled={busy} onClick={() => setAsk({ title: 'همین کلیپ‌ها بمانند؟', text: 'هیچ پولی خرج نمی‌شود؛ ممکن است جای اتصال دو کلیپ کمی پرش داشته باشد.', yes: 'بله، نگه دار', path: 'clips-stale', body: { confirm: true, choice: 'keep' } })}>
                  نگه داشتن همین‌ها
                </button>
              </>
            ) : (
              <button type="button" className="btn primary" disabled={busy} onClick={() => setAsk(rebuild(v.choice!.clips[0]!, v.choice!.price_usd, false))}>
                دوباره بساز (حدود {usd(v.choice.price_usd)})
              </button>
            )}
          </div>
        </div>
      )}

      {v.finished === 0 && !making && !v.choice && onResume && (
        <EmptyState icon="film" text={`هنوز کلیپی ساخته نشده. هر کلیپ ده‌ثانیه‌ای حدود ${usd(v.clips[0]?.price_usd ?? 0.71)} هزینه دارد و از آخرین فریم کلیپ قبلی شروع می‌شود.`} action={{ label: 'ادامه', onClick: onResume }} />
      )}

      <ol className="clip-list">
        {Array.from({ length: v.count }, (_, i) => v.clips[i] ?? null).map((c, i) => (
          <li key={i} className="clip-item">
            <div className={`frame-box f${job.format}`}>
              {c?.file ? <video controls preload="none" src={fileUrl(job.slug, c.file)} aria-label={`پیش‌نمایش کلیپ ${faNum(i + 1)}`} />
                : making && v.current === i + 1 ? <span className="skeleton sk-block clip-wait" role="status" aria-label={`کلیپ ${faNum(i + 1)} در حال ساخت`} />
                  : <span className="muted small">کلیپ {faNum(i + 1)}</span>}
            </div>
            <div className="stack-sm">
              <b>کلیپ {faNum(i + 1)}</b>
              <span className="muted small">{STATUS_FA[c?.status ?? 'pending']}{c && c.attempts > 1 ? ` · ${faNum(c.attempts)} بار ساخته شد` : ''}</span>
              {c && c.flags.length > 0 && <span className="small">{c.flags.map((f) => FLAG_FA[f] ?? f).join('، ')}</span>}
              {c && idle && !v.choice && (c.status === 'done' || c.status === 'flagged') && (
                <button type="button" className="btn" disabled={busy} onClick={() => setAsk(rebuild(c.index, c.price_usd, c.index < v.count))}>دوباره بساز</button>
              )}
            </div>
          </li>
        ))}
      </ol>
      {error && <p className="problem" role="alert">{error}</p>}
      {ask && <Confirm title={ask.title} text={ask.text} yes={ask.yes} busy={busy} onYes={() => void send(ask)} onNo={() => { setAsk(null); setError(null); }} />}
    </div>
  );
}
