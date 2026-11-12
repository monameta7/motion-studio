// Responsibility: the side panel of the calendar (docs/08 «Click a day → side panel»): add or edit one day's topic, note, style and format, move it by typing a date, and delete it.
import { useState } from 'react';
import { api, ApiError, type CalendarEntry, type RefCard } from '../api';
import { parseDate, toJalali, ymdOf } from '../../../calendar/jalali';
import { faNum } from '../fa';
import { Field } from '../Field';
import { useBrand } from '../brand';

const STATUS_FA: Record<CalendarEntry['status'], string> = {
  planned: 'برنامه‌ریزی‌شده', queued: 'در صف ساخت', running: 'در حال ساخت', awaiting_approval: 'منتظر شما', done: 'ساخته شد', failed: 'ساخت خطا داد', skipped: 'ردشده', empty: 'خالی',
};
export const statusFa = (s: CalendarEntry['status']): string => STATUS_FA[s];

/** «۱۴۰۵/۰۸/۱۲» for a date field. */
export const jalaliField = (iso: string): string => {
  const j = toJalali(ymdOf(iso));
  return faNum(`${j.y}/${String(j.m).padStart(2, '0')}/${String(j.d).padStart(2, '0')}`);
};

export interface DayDraft { date: string; entry: CalendarEntry | null }

export function DayPanel({ draft, refs, onChanged, onClose }: { draft: DayDraft; refs: RefCard[]; onChanged: () => void; onClose: () => void }) {
  const { entry } = draft;
  const { active } = useBrand();
  const editable = !entry || ['planned', 'failed', 'skipped', 'empty'].includes(entry.status);
  const [dateText, setDateText] = useState(jalaliField(draft.date));
  const [topic, setTopic] = useState(entry?.topic ?? '');
  const [note, setNote] = useState(entry?.note ?? '');
  const [style, setStyle] = useState(entry?.style_override ?? '');
  const [format, setFormat] = useState<'9x16' | '16x9'>(entry?.format ?? '9x16');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const date = parseDate(dateText);
    if (!date) { setError('تاریخ را مثل ۱۴۰۵/۰۸/۲۰ بنویس.'); return; }
    if (!topic.trim()) { setError('موضوع را بنویس.'); return; }
    setBusy(true); setError(null);
    const body = { date, topic, note: note || null, style_override: style || null, format };
    try {
      // A new day goes into the active brand's calendar (Phase 8); a day never moves to another brand.
      if (entry) await api.put(`/api/calendar/${entry.id}`, body); else await api.post('/api/calendar', { ...body, ...(active ? { brand: active.slug } : {}) });
      onChanged(); onClose();
    } catch (e) { setError(e instanceof ApiError ? e.message : 'ذخیره نشد؛ دوباره امتحان کن.'); setBusy(false); }
  };
  const remove = async () => {
    if (!entry) return;
    setBusy(true); setError(null);
    try { await api.del(`/api/calendar/${entry.id}`); onChanged(); onClose(); }
    catch (e) { setError(e instanceof ApiError ? e.message : 'حذف نشد؛ دوباره امتحان کن.'); setBusy(false); }
  };

  return (
    <aside className="card stack day-panel" aria-labelledby="day-h">
      <div className="section-head">
        <h2 id="day-h">{entry ? 'ویرایش روز' : 'موضوع تازه'}</h2>
        <button type="button" className="btn link" onClick={onClose}>بستن</button>
      </div>
      {entry && <p className="muted small" role="status">وضعیت: {STATUS_FA[entry.status]}</p>}
      {entry?.similar && <div className="problem" role="note">این موضوع شبیه «{entry.similar.topic}» است که روز {jalaliField(entry.similar.date)} ساخته شد. ساخت ادامه پیدا می‌کند، مگر اینکه حذفش کنی.</div>}
      {!editable && <div className="problem">ساخت این روز شروع شده یا تمام شده و دیگر قابل تغییر نیست.</div>}
      <Field label="روز (شمسی)">{(id) => <input id={id} className="text-input" inputMode="numeric" value={dateText} disabled={!editable} onChange={(e) => setDateText(e.target.value)} />}</Field>
      <Field label="موضوع">{(id) => <textarea id={id} className="text-input" rows={4} value={topic} disabled={!editable} onChange={(e) => setTopic(e.target.value)} />}</Field>
      <Field label="یادداشت (اختیاری)">{(id) => <input id={id} className="text-input" value={note} disabled={!editable} onChange={(e) => setNote(e.target.value)} />}</Field>
      <Field label="سبک">
        {(id) => (
          <select id={id} value={style} disabled={!editable} onChange={(e) => setStyle(e.target.value)}>
            <option value="">خودکار</option>
            {refs.filter((r) => r.source === 'library').map((r) => <option key={r.slug} value={r.slug}>{r.name_fa}</option>)}
          </select>
        )}
      </Field>
      <Field label="قالب">
        {(id) => (
          <select id={id} value={format} disabled={!editable} onChange={(e) => setFormat(e.target.value as typeof format)}>
            <option value="9x16">عمودی ۹:۱۶</option>
            <option value="16x9">افقی ۱۶:۹</option>
          </select>
        )}
      </Field>
      {error && <div className="problem" role="alert">{error}</div>}
      {editable && (
        <div className="row-between">
          <button type="button" className="btn primary" disabled={busy} onClick={() => void save()}>ذخیره</button>
          {entry && <button type="button" className="btn" disabled={busy} onClick={() => void remove()}>حذف</button>}
        </div>
      )}
    </aside>
  );
}

