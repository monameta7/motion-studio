// Responsibility: the Automation screen's calendar (docs/11 §4, docs/08 «Calendar»): a Jalali month with Saturday first, a topic and a status on every day, add, drag to another day, the side panel, CSV/XLSX import and paste of a list; the motion calendar, or the brand's own video calendar in the video workspace (Phase 11.8, Q38 b).
import { APP_TIMEZONE } from '../../../calendar/zone';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError, type CalendarEntry, type CalendarRange, type ImportSummary, type RefCard, type StylesList } from '../api';
import { JALALI_MONTHS, WEEKDAYS_FA, addDays, isoOf, jalaliMonthLength, toGregorian, toJalali, weekdayIndex, ymdOf } from '../../../calendar/jalali';
import { faNum } from '../fa';
import { Field } from '../Field';
import { usePoll } from '../hooks';
import { useBrand } from '../brand';
import { Modal } from '../Modal';
import { DayPanel, statusFa, type DayDraft } from './DayPanel';
import { SchedulePanel } from './SchedulePanel';
import { TopicsLowBanner } from '../WarningBanner';
import { EmptyState } from '../guide/EmptyState';
import { HelpButton, useScreenTour } from '../guide/Guide';

interface Month { y: number; m: number }
const EDITABLE: CalendarEntry['status'][] = ['planned', 'failed', 'skipped', 'empty'];

/** Today's date in the app's zone (D63), before the server has answered. */
const localToday = (): string => new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

const monthOf = (iso: string): Month => { const j = toJalali(ymdOf(iso)); return { y: j.y, m: j.m }; };
const firstDay = (mo: Month): string => isoOf(toGregorian({ y: mo.y, m: mo.m, d: 1 }));
const lastDay = (mo: Month): string => isoOf(toGregorian({ y: mo.y, m: mo.m, d: jalaliMonthLength(mo.y, mo.m) }));
const shift = (mo: Month, by: number): Month => { const n = mo.y * 12 + (mo.m - 1) + by; return { y: Math.floor(n / 12), m: (n % 12) + 1 }; };

export function Automation({ workspace = 'motion' }: { workspace?: 'motion' | 'video' }) {
  useScreenTour(workspace === 'video' ? 'automation-video' : 'automation');
  const [month, setMonth] = useState<Month>(() => monthOf(localToday()));
  // Each brand has its own calendar; the screen shows the active brand's (Phase 8), and in the video workspace its video calendar (Phase 11.8).
  const video = workspace === 'video';
  const { active } = useBrand();
  const brandQuery = active ? `&brand=${encodeURIComponent(active.slug)}` : '';
  const wsQuery = video ? '&workspace=video' : '';
  const { data: raw, error, reload } = usePoll<CalendarRange>(active ? `/api/calendar?from=${firstDay(month)}&to=${lastDay(month)}${brandQuery}${wsQuery}` : null, 30000);
  // Never another brand's (or the other workspace's) month while a switch is loading.
  const data = raw && active && raw.brand === active.slug && (raw.workspace ?? 'motion') === workspace ? raw : null;
  const { data: refData } = usePoll<{ references: RefCard[] }>(video ? null : '/api/references', 0);
  // A video day's own style is a visual style with its text (Phase 11.5).
  const { data: styleData } = usePoll<StylesList>(video ? '/api/styles' : null, 0);
  const styleOptions = video ? (styleData?.styles ?? []).filter((s) => s.text).map((s) => ({ slug: s.slug, name: s.title })) : undefined;
  const [draft, setDraft] = useState<DayDraft | null>(null);
  const [result, setResult] = useState<ImportSummary | null>(null);
  const [pasting, setPasting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragging = useRef<CalendarEntry | null>(null);
  useEffect(() => { setDraft(null); setResult(null); setProblem(null); }, [active?.slug]);

  const today = data?.today ?? localToday();
  const byDate = useMemo(() => new Map((data?.entries ?? []).map((e) => [e.date, e])), [data]);
  const first = firstDay(month);
  const length = jalaliMonthLength(month.y, month.m);
  const blanks = weekdayIndex(first);
  const days = Array.from({ length }, (_, i) => addDays(first, i));
  /** The month as rows of seven cells; null is an empty cell before the first day. */
  const cells: (string | null)[] = [...Array.from({ length: blanks }, () => null), ...days];
  const weeks = Array.from({ length: Math.ceil(cells.length / 7) }, (_, i) => cells.slice(i * 7, i * 7 + 7));
  const runDays = data?.run_days ?? [true, true, true, true, true, true, false];

  /** «افزودن موضوع»: the app picks the day, the first free run-day from today on. */
  const addTopic = () => {
    const start = first < today ? today : first;
    const free = days.find((d) => d >= start && runDays[weekdayIndex(d)] && !byDate.has(d)) ?? days.find((d) => d >= today && !byDate.has(d));
    if (free) setDraft({ date: free, entry: null }); else setProblem('در این ماه روز خالی نمانده؛ ماه بعد را باز کن.');
  };

  const move = async (entry: CalendarEntry, date: string) => {
    if (entry.date === date) return;
    setProblem(null);
    try { await api.put(`/api/calendar/${entry.id}`, { date }); await reload(); }
    catch (e) { setProblem(e instanceof ApiError ? e.message : 'جابه‌جا نشد؛ دوباره امتحان کن.'); }
  };

  const upload = async (file: File) => {
    setProblem(null); setResult(null);
    const form = new FormData();
    form.append('file', file);
    try { setResult(await api.post<ImportSummary>(`/api/calendar/import${brandQuery.replace('&', '?')}${video ? `${brandQuery ? '&' : '?'}workspace=video` : ''}`, form)); await reload(); }
    catch (e) { setProblem(e instanceof ApiError ? e.message : 'فایل خوانده نشد؛ دوباره امتحان کن.'); }
  };

  const title = `${JALALI_MONTHS[month.m - 1]} ${faNum(month.y)}`;
  const count = data?.entries.length ?? 0;

  return (
    <div className="stack">
      <div className="page-head"><h1>{video ? 'اتوماسیون ویدیو' : 'اتوماسیون'}</h1><div className="head-side">{active && <span className="brand-chip">{video ? 'تقویم ویدیوی برند' : 'تقویم برند'}: {active.name}</span>}<HelpButton /></div></div>
      {error && <div className="problem" role="alert">{error}</div>}
      {problem && <div className="problem" role="alert">{problem}</div>}
      {result && (
        <section className="card stack" aria-label="نتیجه‌ی وارد کردن">
          <p><b>{faNum(result.added)}</b> موضوع به تقویم اضافه شد.</p>
          {result.problems.length > 0 && <ul className="problem import-problems">{result.problems.map((p) => <li key={p}>{p}</li>)}</ul>}
          <button type="button" className="btn" onClick={() => setResult(null)}>باشه</button>
        </section>
      )}

      <TopicsLowBanner />
      <SchedulePanel workspace={workspace} />

      <div className="cal-layout">
        <section className="card stack" aria-labelledby="cal-h">
          <div className="cal-toolbar">
            <div className="cal-nav">
              <button type="button" className="btn" aria-label="ماه قبل" onClick={() => setMonth(shift(month, -1))}>›</button>
              <h2 id="cal-h" aria-live="polite">{title}</h2>
              <button type="button" className="btn" aria-label="ماه بعد" onClick={() => setMonth(shift(month, 1))}>‹</button>
              <button type="button" className="btn link" onClick={() => setMonth(monthOf(today))}>امروز</button>
            </div>
            <div className="cal-actions">
              <button type="button" className="btn primary" onClick={addTopic}>افزودن موضوع</button>
              <button type="button" className="btn" onClick={() => fileRef.current?.click()}>وارد کردن اکسل یا CSV</button>
              <button type="button" className="btn" onClick={() => setPasting(true)}>چسباندن لیست موضوع</button>
              <input ref={fileRef} type="file" className="visually-hidden" accept=".csv,.xlsx" aria-label="انتخاب فایل اکسل یا CSV"
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void upload(f); }} />
            </div>
          </div>

          <div className="cal-grid" role="grid" aria-label={title}>
            {/* A grid needs rows (Lighthouse, Phase 12); the rows take no box of their own, so the seven-column layout is unchanged. */}
            <div className="cal-row" role="row">{WEEKDAYS_FA.map((w) => <div key={w} className="cal-head" role="columnheader">{w}</div>)}</div>
            {weeks.map((week, wi) => <div key={wi} className="cal-row" role="row">{week.map((iso, ci) => {
              if (iso === null) return <div key={`b${ci}`} className="cal-blank" role="gridcell" />;
              const e = byDate.get(iso);
              const past = iso < today;
              const off = !runDays[weekdayIndex(iso)];
              const j = toJalali(ymdOf(iso));
              const label = `${faNum(j.d)} ${JALALI_MONTHS[j.m - 1]}${e ? `، ${e.topic}، ${statusFa(e.status)}` : past ? '' : '، خالی'}`;
              return (
                <div key={iso} role="gridcell" className={`cal-day${iso === today ? ' today' : ''}${past ? ' past' : ''}${off ? ' off' : ''}`}
                  onDragOver={(ev) => { if (dragging.current && !e && !past) ev.preventDefault(); }}
                  onDrop={(ev) => { ev.preventDefault(); const d = dragging.current; dragging.current = null; if (d && !e && !past) void move(d, iso); }}>
                  <button type="button" className="cal-btn" aria-label={label} aria-pressed={draft?.date === iso} disabled={past && !e}
                    draggable={!!e && EDITABLE.includes(e.status)}
                    onDragStart={(ev) => { if (e) { dragging.current = e; ev.dataTransfer.effectAllowed = 'move'; } }}
                    onClick={() => setDraft({ date: iso, entry: e ?? null })}>
                    <span className="cal-num">{faNum(j.d)}</span>
                    {e && (
                      <>
                        <span className="cal-topic clamp">{e.topic}</span>
                        <span className="cal-meta">
                          <span className={`cal-dot dot-${e.status}`} aria-hidden="true" />
                          {e.style_override && <span className="cal-tag">دستی</span>}
                          {e.similar && <span className="cal-tag cal-warn">شبیه قبلی</span>}
                        </span>
                      </>
                    )}
                  </button>
                </div>
              );
            })}</div>)}
          </div>
          {data && count === 0 && <EmptyState icon="calendar" text={video ? 'برای این ماه هنوز موضوع ویدیویی نیست. یک موضوع بگذار، یا یک‌جا فایل یا لیستی از موضوع‌ها را وارد کن؛ تقویم موشن جداست.' : 'برای این ماه هنوز موضوعی نیست. یک موضوع بگذار، یا یک‌جا فایل یا لیستی از موضوع‌ها را وارد کن.'} action={{ label: 'اولین موضوع را اضافه کن', onClick: addTopic }} />}
        </section>

        {draft && <DayPanel key={`${draft.date}:${draft.entry?.id ?? 'new'}`} draft={draft} refs={refData?.references ?? []} {...(video ? { workspace, styleOptions } : {})} onChanged={() => void reload()} onClose={() => setDraft(null)} />}
      </div>

      {pasting && active && <PasteDialog brand={active.slug} video={video} onClose={() => setPasting(false)} onDone={(r) => { setResult(r); void reload(); }} />}
    </div>
  );
}

function PasteDialog({ brand, video, onClose, onDone }: { brand: string; video: boolean; onClose: () => void; onDone: (r: ImportSummary) => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const send = async () => {
    setBusy(true); setError(null);
    try { onDone(await api.post<ImportSummary>('/api/calendar/paste', { text, brand, ...(video ? { workspace: 'video' } : {}) })); onClose(); }
    catch (e) { setError(e instanceof ApiError ? e.message : 'اضافه نشد؛ دوباره امتحان کن.'); setBusy(false); }
  };
  return (
    <Modal title="چسباندن لیست موضوع" onClose={onClose}>
      <Field label="هر خط یک موضوع">{(id) => <textarea id={id} className="text-input" rows={8} value={text} onChange={(e) => setText(e.target.value)} />}</Field>
      <p className="muted small">موضوع‌ها از اولین روز خالی به بعد، فقط در روزهای اجرا، در تقویم چیده می‌شوند.</p>
      {error && <div className="problem" role="alert">{error}</div>}
      <div className="row-between">
        <button type="button" className="btn primary" disabled={busy || !text.trim()} onClick={() => void send()}>اضافه به تقویم</button>
        <button type="button" className="btn" disabled={busy} onClick={onClose}>انصراف</button>
      </div>
    </Modal>
  );
}
