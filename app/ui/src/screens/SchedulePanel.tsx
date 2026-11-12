// Responsibility: the active brand's schedule and style-rule cards on the Automation screen (docs/08, docs/11 §4; each brand has its own): the on/off switch, the time with its measured start, the run days, how a style is chosen for a day without one, and a warning when another brand's film starts too close. Every change is saved at once.
import { useEffect, useState } from 'react';
import { api, ApiError, type RefCard } from '../api';
import { WEEKDAYS_FA } from '../../../calendar/jalali';
import { faNum } from '../fa';
import { Field } from '../Field';
import { usePoll } from '../hooks';
import { useBrand } from '../brand';

type RuleType = 'suggest' | 'weekday' | 'rotate' | 'fixed';
const KEYS = ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'] as const;
interface Rule { type: RuleType; weekday_map: Partial<Record<(typeof KEYS)[number], string>>; rotation: string[]; fixed: string | null }
interface ScheduleView {
  /** `brand`: whose schedule this is (Phase 8: each brand has its own automation, from its own calendar). */
  schedule: { enabled: boolean; time: string; weekdays: boolean[]; timing_mode: 'start_at' | 'ready_by'; style_rule: Rule; brand: string };
  brand_name: string;
  avg_minutes: number | null; lead_minutes: number | null; start_time: string; start_previous_day: boolean;
  /** Other brands' films that start less than 5 hours from this one (they may share one quota window). */
  nearby: { brand: string; brand_name: string; start_time: string; gap_minutes: number }[];
}

const RULES: { id: RuleType; title: string; hint: string }[] = [
  { id: 'suggest', title: 'پیشنهادی', hint: 'برای هر موضوع بهترین مرجع انتخاب می‌شود؛ مرجع دو روز اخیر تکرار نمی‌شود.' },
  { id: 'weekday', title: 'بر اساس روز هفته', hint: 'برای هر روز هفته یک سبک می‌گذاری.' },
  { id: 'rotate', title: 'چرخشی', hint: 'چند سبک پشت‌سر هم می‌چرخند و هیچ‌وقت یک سبک دوبار پشت‌سر هم نمی‌آید.' },
  { id: 'fixed', title: 'ثابت', hint: 'همه‌ی روزها یک سبک.' },
];

const two = (n: number): string => String(n).padStart(2, '0');

/** A 24-hour clock as two plain choices (the browser's own time field shows «AM» in English). Minutes go in steps of five, plus the saved one. */
function TimePicker({ value, onPick }: { value: string; onPick: (hhmm: string) => void }) {
  const [h, m] = value.split(':');
  const minutes = Array.from({ length: 12 }, (_, i) => two(i * 5));
  if (m && !minutes.includes(m)) minutes.push(m);
  minutes.sort();
  return (
    <div className="time-row" role="group" aria-label="ساعت اجرا">
      <Field label="ساعت">{(id) => <select id={id} value={h} onChange={(e) => onPick(`${e.target.value}:${m}`)}>{Array.from({ length: 24 }, (_, i) => <option key={i} value={two(i)}>{faNum(two(i))}</option>)}</select>}</Field>
      <span className="time-colon" aria-hidden="true">:</span>
      <Field label="دقیقه">{(id) => <select id={id} value={m} onChange={(e) => onPick(`${h}:${e.target.value}`)}>{minutes.map((x) => <option key={x} value={x}>{faNum(x)}</option>)}</select>}</Field>
    </div>
  );
}

export function SchedulePanel() {
  // The active brand's own schedule (Phase 8); switching the brand shows that brand's.
  const { active } = useBrand();
  const { data, reload } = usePoll<ScheduleView>(active ? `/api/schedule?brand=${encodeURIComponent(active.slug)}` : null, 0);
  const { data: refData } = usePoll<{ references: RefCard[] }>('/api/references', 0);
  const [view, setView] = useState<ScheduleView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (data) setView(data); }, [data]);
  useEffect(() => { setError(null); setSaved(false); }, [active?.slug]);
  useEffect(() => { if (!saved) return; const t = setTimeout(() => setSaved(false), 2500); return () => clearTimeout(t); }, [saved]);
  // Never another brand's schedule while a switch is loading.
  if (!view || !active || view.schedule.brand !== active.slug) return null;
  const s = view.schedule;
  const library = (refData?.references ?? []).filter((r) => r.source === 'library');

  /** Saves one change at once; the screen shows the answer (with the new start time), or the reason it was refused. */
  const change = async (patch: Partial<ScheduleView['schedule']>) => {
    setError(null);
    // Shown at once; the server's answer (with the new start time) replaces it, and a refusal brings the old value back.
    setView((v) => (v ? { ...v, schedule: { ...v.schedule, ...patch } } : v));
    try { setView(await api.put<ScheduleView>('/api/schedule', { ...patch, brand: s.brand })); setSaved(true); }
    catch (e) { setError(e instanceof ApiError ? e.message : 'ذخیره نشد؛ دوباره امتحان کن.'); void reload(); }
  };
  const rule = (patch: Partial<Rule>) => change({ style_rule: { ...s.style_rule, ...patch } });
  const r = s.style_rule;
  const startText = `${faNum(view.start_time)}${view.start_previous_day ? ' (شب قبل)' : ''}`;
  const picker = (value: string, onPick: (v: string) => void, id: string, none = 'خودکار') => (
    <select id={id} value={value} onChange={(e) => onPick(e.target.value)}>
      <option value="">{none}</option>
      {library.map((l) => <option key={l.slug} value={l.slug}>{l.name_fa}</option>)}
    </select>
  );

  return (
    <section className="card stack" aria-labelledby="sched-h">
      <div className="section-head">
        <h2 id="sched-h">برنامه‌ی زمانی</h2>
        <button type="button" role="switch" aria-checked={s.enabled} className="switch" onClick={() => void change({ enabled: !s.enabled })}>
          <span className="knob" aria-hidden="true" />
          <span>{s.enabled ? 'اتوماسیون روشن' : 'اتوماسیون خاموش'}</span>
        </button>
      </div>
      {error && <div className="problem" role="alert">{error}</div>}
      {saved && <p className="muted small" role="status">ذخیره شد.</p>}
      <p className="muted small">این برنامه فقط برای برند «{active.name}» و از تقویم همین برند فیلم می‌سازد. هر برند برنامه‌ی جدای خودش را دارد؛ اگر وقت دو فیلم روی هم بیفتد، پشت سر هم ساخته می‌شوند.</p>
      {view.nearby.length > 0 && (
        <div className="problem" role="note">
          {view.nearby.map((n) => (
            <p key={n.brand}>فیلم برند «{n.brand_name}» ساعت {faNum(n.start_time)} شروع می‌شود؛ کمتر از ۵ ساعت با فیلم این برند فاصله دارد. ممکن است سهمیه‌ی هوش مصنوعی برای هر دو کافی نباشد و فیلم دوم منتظر آزاد شدن سهمیه بماند. بهتر است دست‌کم ۵ ساعت فاصله بدهی.</p>
          ))}
        </div>
      )}

      <div className="sched-grid">
        <div className="stack-sm">
          <span className="field-label" id="timing-l">زمان</span>
          <div className="seg" role="radiogroup" aria-labelledby="timing-l">
            {([['ready_by', 'آماده تا ساعت'], ['start_at', 'شروع در ساعت']] as const).map(([id, label]) => (
              <button key={id} type="button" role="radio" aria-checked={s.timing_mode === id} className={s.timing_mode === id ? 'seg-on' : ''} onClick={() => void change({ timing_mode: id })}>{label}</button>
            ))}
          </div>
          <TimePicker value={s.time} onPick={(time) => void change({ time })} />
          <p className="muted small">
            {s.timing_mode === 'ready_by'
              ? `فیلم تا ساعت ${faNum(s.time)} آماده می‌شود. شروع تقریبی: ${startText}${view.avg_minutes === null ? ' (هنوز فیلمی ساخته نشده؛ ۷۵ دقیقه زودتر حساب شده)' : ` (میانگین ${faNum(view.avg_minutes)} دقیقه به‌اضافه‌ی ۱۵ دقیقه)`}.`
              : `ساخت دقیقاً ساعت ${faNum(s.time)} شروع می‌شود.`}
          </p>
        </div>

        <div className="stack-sm">
          <span className="field-label" id="days-l">روزهای اجرا</span>
          <div className="chips" role="group" aria-labelledby="days-l">
            {WEEKDAYS_FA.map((w, i) => (
              <button key={w} type="button" className={`chip${s.weekdays[i] ? ' on' : ''}`} aria-pressed={s.weekdays[i]}
                onClick={() => void change({ weekdays: s.weekdays.map((v, j) => (j === i ? !v : v)) })}>{w}</button>
            ))}
          </div>
          <p className="muted small">برنامه و کامپیوتر باید روشن باشند؛ وقتی خاموش‌اند چیزی ساخته نمی‌شود.</p>
        </div>
      </div>

      <div className="stack-sm" data-tour="style-rule">
        <span className="field-label" id="rule-l">سبک ویدیوهای خودکار</span>
        <div className="format-grid" role="radiogroup" aria-labelledby="rule-l">
          {RULES.map((x) => (
            <label key={x.id} className={`format-card${r.type === x.id ? ' on' : ''}`}>
              <input type="radio" name="style-rule" value={x.id} checked={r.type === x.id} onChange={() => void rule({ type: x.id })} />
              <span><b>{x.title}</b><span className="muted small"> — {x.hint}</span></span>
            </label>
          ))}
        </div>
        <p className="muted small">سبکی که برای یک روز خاص در تقویم انتخاب کنی از این قانون مهم‌تر است.</p>

        {r.type === 'weekday' && (
          <div className="form-grid">
            {WEEKDAYS_FA.map((w, i) => s.weekdays[i] && (
              <Field key={w} label={w}>{(id) => picker(r.weekday_map[KEYS[i]!] ?? '', (v) => {
                const map = { ...r.weekday_map };
                if (v) map[KEYS[i]!] = v; else delete map[KEYS[i]!];
                void rule({ weekday_map: map });
              }, id)}</Field>
            ))}
          </div>
        )}
        {r.type === 'rotate' && (
          <fieldset className="plain stack-sm">
            <legend className="field-label">سبک‌هایی که می‌چرخند (به ترتیب انتخاب)</legend>
            {r.rotation.length < 2 && <p className="muted small">دو سبک یا بیشتر انتخاب کن؛ تا آن موقع «پیشنهادی» کار می‌کند.</p>}
            <div className="chips">
              {library.map((l) => {
                const at = r.rotation.indexOf(l.slug);
                return (
                  <button key={l.slug} type="button" className={`chip${at >= 0 ? ' on' : ''}`} aria-pressed={at >= 0}
                    onClick={() => void rule({ rotation: at >= 0 ? r.rotation.filter((x) => x !== l.slug) : [...r.rotation, l.slug] })}>
                    {at >= 0 && <b className="chip-order">{faNum(at + 1)}</b>}{l.name_fa}
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}
        {r.type === 'fixed' && !r.fixed && <p className="muted small">یک سبک انتخاب کن؛ تا آن موقع «پیشنهادی» کار می‌کند.</p>}
        {r.type === 'fixed' && <Field label="سبک ثابت">{(id) => picker(r.fixed ?? '', (v) => void rule({ fixed: v || null }), id, 'یکی را انتخاب کن')}</Field>}
      </div>
    </section>
  );
}
