// Responsibility: the New video screen (docs/11 §1, without suggestions): topic, format, references (motion) or the visual style (video, Phases 11.3 and 11.5) and the sticky summary footer with «شروع ساخت», for the active brand and workspace.
import { useEffect, useRef, useState } from 'react';
import { api, ApiError, type CalendarEntry, type RefCard, type Settings, type Status, type StylesList } from '../api';
import { dayText } from './CalendarPick';
import { bracketProblem } from '../brackets';
import { faNum } from '../fa';
import { go, usePoll } from '../hooks';
import { useBrand } from '../brand';
import { useWorkspace } from '../workspace';
import { HelpButton, useScreenTour } from '../guide/Guide';
import { MAX_REFS, RefGrid } from './RefGrid';
import { StylePicker } from './StylePicker';
import { latin } from './Styles';
import { SuggestPanel } from './SuggestPanel';
import { UploadDialog } from './UploadDialog';
import { StickyBar } from '../StickyBar';
import { SubmitButton } from '../SubmitButton';
import { TopicBox, type Picked } from './TopicBox';

const FORMATS = [
  { id: '9x16', label: 'عمودی ۹:۱۶', sub: 'ریلز اینستاگرام' },
  { id: '16x9', label: 'افقی ۱۶:۹', sub: 'یوتیوب و سایت' },
] as const;

export function NewVideo() {
  // The video workspace has its own tour (Phase 11.9).
  useScreenTour(useWorkspace().active === 'video' ? 'new-video' : 'new');
  const [refMs, setRefMs] = useState(0);
  const { data: refData, reload: reloadRefs } = usePoll<{ references: RefCard[] }>('/api/references', refMs);
  const { data: settings } = usePoll<Settings>('/api/settings', 0);
  const { data: status } = usePoll<Status>('/api/status', 60000);
  // Phase 11.6: the price of one video clip and the cap per film, from config (D92), shown before «شروع ساخت».
  const { data: ws } = usePoll<{ video?: { resolution: string; clip_usd: number; max_usd_per_film: number } }>('/api/workspace', 0);
  const clipPrice = ws?.video ?? null;
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
  /** A chosen calendar day brings its format and its own style (the owner can still change both); a video day's style is a visual style. */
  const chooseDay = (e: CalendarEntry | null) => {
    setDay(e);
    if (!e) return;
    if (e.format) setFormat(e.format);
    if (video) { if (e.style_override && styleData?.styles.some((s) => s.slug === e.style_override && s.text)) setStyle(e.style_override); return; }
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
  // The video workspace (Phase 11.3): no reference and no «+» image; a visual style instead (Phase 11.5), starting on the style used last; a day of the video calendar (Phase 11.8).
  const video = useWorkspace().active === 'video';
  const { data: styleData } = usePoll<StylesList>(video ? '/api/styles' : null, 0);
  const [style, setStyle] = useState<string | null>(null);
  useEffect(() => { if (styleData && !style) setStyle(styleData.default); }, [styleData, style]);
  const styleTitle = styleData?.styles.find((s) => s.slug === style)?.title ?? null;
  const cal = fromCalendar;
  const text = cal ? day?.topic ?? '' : topic;
  const missing = brandsLoaded && !brand ? 'هنوز برندی نیست؛ اول یک برند بساز.' : cal && !day ? 'یک روز تقویم انتخاب کن.' : !text.trim() ? 'موضوع را بنویس.' : bracketProblem(text) ? 'کروشه‌ی باز را ببند.' : video ? (style ? null : 'یک سبک تصویری انتخاب کن.') : refs.length === 0 ? 'یک مرجع انتخاب کن.' : null;

  // «≈ X دقیقه» of this workspace's own finished films (Phase 11.3).
  const estimate = status?.by_workspace?.[video ? 'video' : 'motion'].estimate_min ?? (video ? null : status?.estimate_min ?? null);

  async function start() {
    if (missing) { setError(missing); return; }
    setStarting(true);
    setError(null);
    try {
      const forBrand = brand ? { brand: brand.slug } : {};
      // A video job: the topic (or a day of the video calendar, Phase 11.8) and the style only (no references or «+» images, D88).
      const body = video
        ? { topic: cal && day ? day.topic : topic, hook, images: [], format, references: [], review: false, workspace: 'video', style, ...(cal && day ? { calendar_entry_id: day.id } : {}), ...forBrand }
        : fromCalendar && day
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
      <div className="page-head"><div className="title-block"><h1>ساخت ویدیو</h1><p className="lede">{video ? 'یک موضوع بنویس؛ سناریو، صدا، کلیپ‌ها و کاور با ما.' : 'یک موضوع بنویس؛ سناریو، صدا، موشن و کاور با ما.'}</p></div><div className="head-side">{brand && <span className="brand-chip">برای برند: {brand.name}</span>}<span className={`ws-chip ws-${video ? 'video' : 'motion'}`}>{video ? 'ویدیو' : 'موشن'}</span><HelpButton /></div></div>

      <TopicBox topic={topic} setTopic={setTopic} images={images} setImages={setImages} hook={hook} setHook={setHook} limits={limits}
        fromCalendar={cal} setFromCalendar={setFromCalendar} day={day} setDay={chooseDay} video={video} />
      {!video && <SuggestPanel topic={text} refs={all} selected={refs}
        onPick={(slug) => pick(refs.includes(slug) || refs.length >= MAX_REFS ? refs : [...refs, slug])}
        onSuggested={(slugs) => { setSuggested(slugs); if (!chosen.current && slugs[0]) setRefs([slugs[0]]); }} />}

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

      {video ? <StylePicker styles={styleData?.styles ?? []} selected={style} setSelected={setStyle} loaded={Boolean(styleData)} /> : <RefGrid refs={all} selected={refs} setSelected={pick} suggested={suggested} onUpload={() => setUploading(true)} />}
      {!video && uploading && <UploadDialog onClose={() => setUploading(false)} onDone={(r) => { setMine((m) => [...m, r.slug]); void reloadRefs(); }} />}


      <StickyBar tag="footer" className="summary" aria-label="خلاصه">
        <div className="summary-text">
          <p>
            <span>{cal ? (day ? `از تقویم: ${dayText(day.date)}` : 'از تقویم') : 'نوشتن موضوع'}</span> · <span>هوک {hook ? 'روشن' : 'خاموش'}</span>
            {!cal && !video && images.length > 0 && <> · <span>{faNum(images.length)} تصویر</span></>}
            {' · '}<span>{format === '9x16' ? '۹:۱۶' : '۱۶:۹'}</span>
            {' · '}<span>{video ? (styleTitle ? <>سبک: <bdi className={latin(styleTitle)}>{styleTitle}</bdi></> : 'بدون سبک') : names.length ? `${names.join('، ')}${names.length > 1 ? ' (ترکیبی)' : ''}` : 'بدون مرجع'}</span>
          </p>
          <p className="muted small">
            پایان ویدیو: لوگوموشن {brand?.name ?? 'برند'} · زمان تقریبی: {estimate ? `≈ ${faNum(Math.round(estimate))} دقیقه` : 'هنوز اندازه‌گیری نشده'}
          </p>
          {video && (
            <p className="muted small" id="video-stop">
              بعد از پرامپت‌ها برنامه کلیپ‌ها را با Google می‌سازد و هزینه دارد: هر کلیپ ده‌ثانیه‌ای حدود {clipPrice ? faNum(clipPrice.clip_usd, 2) : '…'} دلار (<bdi className="latin">{clipPrice?.resolution ?? '720p'}</bdi>)، سقف هر فیلم {clipPrice ? faNum(clipPrice.max_usd_per_film, 2) : '…'} دلار (برآورد خود برنامه؛ صورت‌حساب Google ممکن است بیشتر باشد). بعد برنامه کلیپ‌ها را با صدا و لوگوی پایانی برند سرهم می‌کند.
            </p>
          )}
          {error && <p className="problem" role="alert">{error}</p>}
        </div>
        <SubmitButton className="btn primary big" style={{ viewTransitionName: 'film' }} busy={starting} failed onClick={() => void start()} aria-describedby={missing ? 'start-why' : undefined}>
          {starting ? 'در حال شروع…' : 'شروع ساخت'}
        </SubmitButton>
        {missing && <span id="start-why" className="sr-only">{missing}</span>}
      </StickyBar>
    </div>
  );
}
