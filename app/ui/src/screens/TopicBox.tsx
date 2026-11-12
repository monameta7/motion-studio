// Responsibility: section 1 of New video (docs/11 §1, D41, D42): «نوشتن موضوع» or «از تقویم محتوا»; the growing topic textarea with «+» for images (picker, drag-and-drop, paste), the thumbnail strip, the [ ] hint and check, and the «هوک» switch.
import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
import { api, ApiError, type CalendarEntry, type Upload } from '../api';
import { CalendarPick } from './CalendarPick';
import { bracketProblem } from '../brackets';
import { faNum } from '../fa';

export interface Picked extends Upload { url: string }

interface Props {
  topic: string; setTopic: (s: string) => void;
  images: Picked[]; setImages: (f: (cur: Picked[]) => Picked[]) => void;
  hook: boolean; setHook: (b: boolean) => void;
  limits: { max_brief_chars: number; max_images: number; max_image_mb: number };
  /** «از تقویم محتوا»: the chosen calendar day; null while writing a topic. */
  fromCalendar: boolean; setFromCalendar: (b: boolean) => void;
  day: CalendarEntry | null; setDay: (e: CalendarEntry | null) => void;
}

const OK_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export function TopicBox({ topic, setTopic, images, setImages, hook, setHook, limits, fromCalendar, setFromCalendar, day, setDay }: Props) {
  const area = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  // The textarea grows with its text (D41: a short topic or a full scenario).
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(140, el.scrollHeight + 2)}px`;
  }, [topic]);

  async function add(files: File[]) {
    if (!files.length) return;
    const errs: string[] = [];
    const room = limits.max_images - images.length;
    if (files.length > room) errs.push(`حداکثر ${faNum(limits.max_images)} تصویر برای هر فیلم؛ ${faNum(files.length - Math.max(0, room))} تصویر اضافه نشد.`);
    const ok = files.slice(0, Math.max(0, room)).filter((f) => {
      if (!OK_TYPES.includes(f.type)) { errs.push(`«${f.name}» تصویر PNG، JPG یا WebP نیست.`); return false; }
      if (f.size > limits.max_image_mb * 1024 * 1024) { errs.push(`«${f.name}» بزرگ‌تر از ${faNum(limits.max_image_mb)} مگابایت است.`); return false; }
      return true;
    });
    setBusy(true);
    for (const f of ok) {
      const form = new FormData();
      form.append('file', f, f.name);
      try {
        const { uploads } = await api.post<{ uploads: Upload[] }>('/api/uploads', form);
        const u = uploads[0]!;
        setImages((cur) => [...cur, { ...u, url: URL.createObjectURL(f) }]);
      } catch (e) { errs.push(e instanceof ApiError ? e.message : String(e)); }
    }
    setBusy(false);
    setProblems(errs);
  }

  const onDrop = (e: DragEvent) => { e.preventDefault(); setDragging(false); void add([...e.dataTransfer.files]); };
  const onPaste = (e: ClipboardEvent) => {
    const files = [...e.clipboardData.files].filter((f) => f.type.startsWith('image/'));
    if (files.length) { e.preventDefault(); void add(files); }
  };

  const chars = [...topic].length;
  const nearLimit = chars > limits.max_brief_chars * 0.9;
  const bracket = bracketProblem(topic);

  return (
    <section className="card stack" aria-labelledby="topic-h" data-tour="topic">
      <div className="section-head">
        <h2 id="topic-h"><span className="step">۱</span>موضوع</h2>
        <div className="seg" role="group" aria-label="منبع موضوع">
          <button type="button" className={fromCalendar ? '' : 'seg-on'} aria-pressed={!fromCalendar} onClick={() => setFromCalendar(false)}>نوشتن موضوع</button>
          <button type="button" className={fromCalendar ? 'seg-on' : ''} aria-pressed={fromCalendar} onClick={() => setFromCalendar(true)}>از تقویم محتوا</button>
        </div>
      </div>

      {fromCalendar ? <CalendarPick day={day} setDay={setDay} /> : <>

      <label htmlFor="topic" className="field-label">موضوع، ایده یا سناریو</label>
      <div className={`topic-wrap${dragging ? ' drag' : ''}`} onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop}>
        <textarea
          id="topic" ref={area} value={topic} onChange={(e) => setTopic(e.target.value)} onPaste={onPaste}
          placeholder="مثلاً: سه کاری که یک دستیار هوشمند برای پیج فروشگاهی انجام می‌دهد"
          aria-describedby="topic-hint topic-count"
        />
        <button type="button" className="plus" aria-label="افزودن تصویر" title="افزودن تصویر" onClick={() => picker.current?.click()} disabled={busy || images.length >= limits.max_images}>+</button>
        <input ref={picker} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => { void add([...(e.target.files ?? [])]); e.target.value = ''; }} />
      </div>
      <div className="row-between">
        <p id="topic-hint" className="muted small">اختیاری: اگر دستوری برای ساخت تصویر داری، همین‌جا داخل [ ] بنویس؛ گوینده آن را نمی‌خواند. مثال: [عکس ۱ را در صحنه‌ی دوم نشان بده]</p>
        <p id="topic-count" className="muted small" aria-live="polite">{nearLimit ? `${faNum(chars)} از ${faNum(limits.max_brief_chars)} حرف` : ''}</p>
      </div>
      {bracket && <p className="problem" role="alert">{bracket}</p>}

      {(images.length > 0 || busy) && (
        <div className="stack-sm">
          <ul className="thumbs" aria-label="تصویرهای اضافه‌شده">
            {images.map((im, i) => (
              <li key={im.id} className="thumb">
                <img src={im.url} alt="" />
                <span className="thumb-name"><b>{faNum(i + 1)}</b> <bdi>{im.name}</bdi></span>
                <button type="button" className="x" aria-label={`حذف ${im.name}`} onClick={() => setImages((cur) => cur.filter((c) => c.id !== im.id))}>×</button>
              </li>
            ))}
            {busy && <li className="thumb loading" aria-live="polite">در حال افزودن…</li>}
          </ul>
          <p className="muted small">همهٔ تصویرها داخل ویدیو استفاده می‌شوند</p>
        </div>
      )}
      {problems.map((p) => <p key={p} className="problem" role="alert">{p}</p>)}
      </>}

      <div className="switch-row">
        <button type="button" role="switch" aria-checked={hook} className="switch" onClick={() => setHook(!hook)} id="hook-switch" aria-describedby="hook-hint">
          <span className="knob" aria-hidden="true" />
          <span>هوک</span>
        </button>
        <p id="hook-hint" className="muted small">
          {hook ? 'هوک متن گوینده را از روی متن تو می‌نویسد' : 'متن گوینده دقیقاً همین متن توست؛ هوک فقط متن روی صفحه، کاور و کپشن را می‌سازد'}
        </p>
      </div>
    </section>
  );
}
