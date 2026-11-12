// Responsibility: the New video screen (docs/11 §1, without suggestions): topic, format, references and the sticky summary footer with «شروع ساخت», for the active brand.
import { useEffect, useRef, useState } from 'react';
import { api, ApiError, type CalendarEntry, type RefCard, type Settings, type Status } from '../api';
import { dayText } from './CalendarPick';
import { bracketProblem } from '../brackets';
import { faNum } from '../fa';
import { go, usePoll } from '../hooks';
import { useBrand } from '../brand';
import { HelpButton, useScreenTour } from '../guide/Guide';
import { MAX_REFS, RefGrid } from './RefGrid';
import { SuggestPanel } from './SuggestPanel';
import { UploadDialog } from './UploadDialog';
import { TopicBox, type Picked } from './TopicBox';

const FORMATS = [
  { id: '9x16', label: 'عمودی ۹:۱۶', sub: 'ریلز اینستاگرام' },
  { id: '16x9', label: 'افقی ۱۶:۹', sub: 'یوتیوب و سایت' },
] as const;

export function NewVideo() {
  useScreenTour('new');
  const [refMs, setRefMs] = useState(0);
  const { data: refData, reload: reloadRefs } = usePoll<{ references: RefCard[] }>('/api/references', refMs);
  const { data: settings } = usePoll<Settings>('/api/settings', 0);
  const { data: status } = usePoll<Status>('/api/status', 60000);
  const [topic, setTopic] = useState('');
  const [fromCalendar, setFromCalendar] = useState(false);
  const [day, setDay] = useState<CalendarEntry | null>(null);
  const [images, setImages] = useState<Picked[]>([]);
  const [hook, setHook] = useState(true);
  const [format, setFormat] = useState<'9x16' | '16x9'>('9x16');
  const [refs, setRefs] = useState<string[]>([]);
  const [suggested, setSuggested] = useState<string[]>([]);
  /** Once the owner picks a reference himself, the app stops choosing for him. */
  const chosen = useRef(false);
  const pick = (next: string[]) => { chosen.current = true; setRefs(next); };
  /** A chosen calendar day brings its format and its own style (the owner can still change both). */
  const chooseDay = (e: CalendarEntry | null) => {
    setDay(e);
    if (!e) return;
    if (e.format) setFormat(e.format);
    if (e.style_override && all.some((r) => r.slug === e.style_override)) { chosen.current = true; setRefs([e.style_override]); }
  };
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [uploading, setUploading] = useState(false);
  /** Videos added in this visit: a one-time upload is shown here, and nowhere else. */
  const [mine, setMine] = useState<string[]>([]);

  // The library plus this visit's uploads; while one is being read the list refreshes every few seconds.
  const all = (refData?.references ?? []).filter((r) => r.source === 'library' || mine.includes(r.slug));
  const reading = all.some((r) => r.read && r.read.state !== 'failed');
  useEffect(() => setRefMs(reading ? 4000 : 0), [reading]);
  const limits = settings?.intake ?? { max_brief_chars: 8000, max_images: 10, max_image_mb: 15 };
  const names = refs.map((s) => all.find((r) => r.slug === s)?.name_fa ?? s);
  // The film is made for the active brand (Phase 8); a calendar day of another brand is never kept after a switch.
  const { active: brand, loaded: brandsLoaded } = useBrand();
  useEffect(() => { setDay(null); }, [brand?.slug]);
  // From the calendar the topic is the chosen day's (the suggestion reads it too); images belong to a written topic.
  const text = fromCalendar ? day?.topic ?? '' : topic;
  const missing = brandsLoaded && !brand ? 'هنوز برندی نیست؛ اول یک برند بساز.' : fromCalendar && !day ? 'یک روز تقویم انتخاب کن.' : !text.trim() ? 'موضوع را بنویس.' : bracketProblem(text) ? 'کروشه‌ی باز را ببند.' : refs.length === 0 ? 'یک مرجع انتخاب کن.' : null;

  async function start() {
    if (missing) { setError(missing); return; }
    setStarting(true);
    setError(null);
    try {
      const forBrand = brand ? { brand: brand.slug } : {};
      const body = fromCalendar && day
        ? { topic: day.topic, hook, images: [], format, references: refs, review: false, calendar_entry_id: day.id, ...forBrand }
        : { topic, hook, images: images.map((i) => i.id), format, references: refs, review: false, ...forBrand };
      const { slug } = await api.post<{ slug: string }>('/api/jobs', body);
      go(`/jobs/${slug}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
      setStarting(false);
    }
  }

  return (
    <div className="stack new-video">
      <div className="page-head"><h1>ساخت ویدیو</h1><div className="head-side">{brand && <span className="brand-chip">برای برند: {brand.name}</span>}<HelpButton /></div></div>

      <TopicBox topic={topic} setTopic={setTopic} images={images} setImages={setImages} hook={hook} setHook={setHook} limits={limits}
        fromCalendar={fromCalendar} setFromCalendar={setFromCalendar} day={day} setDay={chooseDay} />
      <SuggestPanel topic={text} refs={all} selected={refs}
        onPick={(slug) => pick(refs.includes(slug) || refs.length >= MAX_REFS ? refs : [...refs, slug])}
        onSuggested={(slugs) => { setSuggested(slugs); if (!chosen.current && slugs[0]) setRefs([slugs[0]]); }} />

      <section className="card stack" aria-labelledby="format-h" data-tour="format">
        <div className="section-head"><h2 id="format-h"><span className="step">۲</span>قالب</h2></div>
        <div className="format-grid" role="radiogroup" aria-labelledby="format-h">
          {FORMATS.map((f) => (
            <label key={f.id} className={`format-card${format === f.id ? ' on' : ''}`}>
              <input type="radio" name="format" value={f.id} checked={format === f.id} onChange={() => setFormat(f.id)} />
              <span className={`frame f${f.id}`} aria-hidden="true" />
              <span><b>{f.label}</b><span className="muted small"> — {f.sub}</span></span>
            </label>
          ))}
        </div>
      </section>

      <RefGrid refs={all} selected={refs} setSelected={pick} suggested={suggested} onUpload={() => setUploading(true)} />
      {uploading && <UploadDialog onClose={() => setUploading(false)} onDone={(r) => { setMine((m) => [...m, r.slug]); void reloadRefs(); }} />}


      <footer className="summary" aria-label="خلاصه">
        <div className="summary-text">
          <p>
            <span>{fromCalendar ? (day ? `از تقویم: ${dayText(day.date)}` : 'از تقویم') : 'نوشتن موضوع'}</span> · <span>هوک {hook ? 'روشن' : 'خاموش'}</span>
            {!fromCalendar && images.length > 0 && <> · <span>{faNum(images.length)} تصویر</span></>}
            {' · '}<span>{format === '9x16' ? '۹:۱۶' : '۱۶:۹'}</span>
            {' · '}<span>{names.length ? `${names.join('، ')}${names.length > 1 ? ' (ترکیبی)' : ''}` : 'بدون مرجع'}</span>
          </p>
          <p className="muted small">
            پایان ویدیو: لوگوموشن {brand?.name ?? 'برند'} · زمان تقریبی: {status?.estimate_min ? `≈ ${faNum(Math.round(status.estimate_min))} دقیقه` : 'هنوز اندازه‌گیری نشده'}
          </p>
          {error && <p className="problem" role="alert">{error}</p>}
        </div>
        <button type="button" className="btn primary big" onClick={() => void start()} disabled={starting} aria-describedby={missing ? 'start-why' : undefined}>
          {starting ? 'در حال شروع…' : 'شروع ساخت'}
        </button>
        {missing && <span id="start-why" className="sr-only">{missing}</span>}
      </footer>
    </div>
  );
}
