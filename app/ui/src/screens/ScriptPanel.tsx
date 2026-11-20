// Responsibility: the script panel (docs/11 §2, D45): read-only voice lines with their on-screen texts, «توقف و اصلاح سناریو», and the editor for a held job or a finished job's «متن گوینده» revision (for a video film with clips made, behind a confirm with the price of the clips that may be bought again, V21).
import { useState } from 'react';
import { api, ApiError, type JobDetail, type ScriptLine } from '../api';
import { faNum, faUsd } from '../fa';
import { Confirm } from '../Modal';

const RESTART_FA: Record<string, string> = { voice: 'صدای گوینده، نقشه، ساخت و بسته‌ی خروجی', plan: 'نقشه، ساخت و بسته‌ی خروجی' };
/** A video job restarts from the same points, with its own stages (orchestrator RESET). */
const RESTART_VIDEO_FA: Record<string, string> = { voice: 'صدای گوینده، پرامپت‌ها، کلیپ‌ها، سرهم کردن و بسته‌ی خروجی', plan: 'پرامپت‌ها، کلیپ‌ها، سرهم کردن و بسته‌ی خروجی' };

/** Editable copy of the script: voice text by line id, on-screen text by index. */
type Draft = { voice: Record<number, string>; screen: Record<number, string> };
const draftOf = (lines: ScriptLine[]): Draft => ({
  voice: Object.fromEntries(lines.map((l) => [l.id, l.text])),
  screen: Object.fromEntries(lines.flatMap((l) => l.on_screen.map((t) => [t.index, t.text]))),
});

/**
 * Render with `key={editing ? 'edit' : 'read'}` so entering the editor starts from the current script. `onDone` = the edit was sent;
 * `onCancel` = «انصراف» on a finished film's revision: nothing was sent (2026-11-18: it used to call `onDone`, so the page said a revision had started).
 */
export function ScriptPanel({ job, editing, onDone, onCancel }: { job: JobDetail; editing: boolean; onDone?: (restartFa: string | null) => void; onCancel?: () => void }) {
  const script = job.script!;
  const [opened, setOpen] = useState(false);
  const open = editing || opened;
  const [draft, setDraft] = useState<Draft>(() => draftOf(script.lines));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  // V21 (Phase 11.7): clips already made can be bought again after a text change; the price is shown and confirmed before saving.
  const made = job.workspace === 'video' ? (job.clips?.clips ?? []).filter((c) => c.status === 'done' || c.status === 'flagged') : [];
  const rebuy = Math.round(made.reduce((n, c) => n + c.price_usd, 0) * 100) / 100;
  const clipsWarning = made.length > 0
    ? `با این تغییر، پرامپت کلیپ‌ها دوباره نوشته می‌شود (یک بار Claude) و هر کلیپی که پرامپتش عوض شود باید دوباره خریده شود: تا ${faNum(made.length)} کلیپ، حدود ${faUsd(rebuy)} (سقف هر فیلم ${faUsd(job.clips?.cap_usd ?? 10)}). کلیپ‌هایی که پرامپتشان عوض نشود رایگان می‌مانند و هیچ کلیپی بدون تأیید دوباره‌ی تو خریده نمی‌شود.`
    : null;

  const voiceChanged = script.lines.some((l) => draft.voice[l.id] !== l.text);
  const anyChanged = voiceChanged || script.lines.some((l) => l.on_screen.some((t) => draft.screen[t.index] !== t.text));
  const empty = Object.values(draft.voice).some((t) => !t.trim()) || Object.values(draft.screen).some((t) => !t.trim());

  async function save(unchanged: boolean) {
    setBusy(true);
    setError(null);
    try {
      const body = unchanged ? { unchanged: true } : {
        voice_lines: script.lines.map((l) => ({ id: l.id, text: draft.voice[l.id]!.trim() })),
        on_screen_texts: Object.entries(draft.screen).map(([i, text]) => ({ index: Number(i), text: text.trim() })).sort((a, b) => a.index - b.index),
      };
      const r = await api.put<{ restart_from?: string }>(`/api/jobs/${job.slug}/script${!unchanged && clipsWarning ? '?confirm_clips=1' : ''}`, body);
      setAsking(false);
      const restart = job.workspace === 'video' ? RESTART_VIDEO_FA : RESTART_FA;
      onDone?.(r.restart_from ? restart[r.restart_from] ?? null : null);
    } catch (e) { setError(e instanceof ApiError ? e.message : String(e)); } finally { setBusy(false); }
  }

  return (
    <div className="script">
      {!editing && (
        <button type="button" className="btn link" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'بستن' : 'دیدن سناریو'}</button>
      )}
      {open && (
        <ol className="script-lines">
          {script.lines.map((l) => (
            <li key={l.id}>
              {editing ? (
                <label className="edit-field">
                  <span className="sr-only">متن گوینده‌ی جمله‌ی {faNum(l.id)}</span>
                  <textarea rows={2} value={draft.voice[l.id]} className={draft.voice[l.id] !== l.text ? 'changed' : ''}
                    onChange={(e) => setDraft({ ...draft, voice: { ...draft.voice, [l.id]: e.target.value } })} />
                </label>
              ) : (
                <p className={l.changed ? 'mark' : ''}>{l.text}</p>
              )}
              {l.on_screen.length > 0 && (
                <ul className="on-screen" aria-label="متن روی صفحه">
                  {l.on_screen.map((t) => (
                    <li key={t.index}>
                      <span className="role">روی صفحه</span>
                      {editing ? (
                        <label className="edit-field">
                          <span className="sr-only">متن روی صفحه {faNum(t.index + 1)}</span>
                          <input value={draft.screen[t.index]} className={draft.screen[t.index] !== t.text ? 'changed' : ''}
                            onChange={(e) => setDraft({ ...draft, screen: { ...draft.screen, [t.index]: e.target.value } })} />
                        </label>
                      ) : <span className={t.changed ? 'mark' : ''}>{t.text}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
      {editing && (
        <div className="stack-sm">
          {voiceChanged && script.voice_made && <p className="problem">تغییر متن گوینده یک درخواست صدای جدید می‌گیرد (از ۱۰ درخواست روزانه‌ی Gemini)</p>}
          {anyChanged && clipsWarning && <p className="problem">{clipsWarning}</p>}
          {empty && <p className="problem">هیچ متنی نباید خالی بماند.</p>}
          {error && <p className="problem" role="alert">{error}</p>}
          <div className="actions">
            <button type="button" className="btn primary" disabled={busy || empty || !anyChanged} onClick={() => (clipsWarning ? setAsking(true) : void save(false))}>ادامه با این متن</button>
            {job.status === 'held' && <button type="button" className="btn" disabled={busy} onClick={() => void save(true)}>ادامه بدون تغییر</button>}
            {job.status === 'done' && <button type="button" className="btn" disabled={busy} onClick={() => { setError(null); onCancel?.(); }}>انصراف</button>}
          </div>
          {asking && clipsWarning && (
            <Confirm title="کلیپ‌ها ممکن است دوباره خریده شوند" text={clipsWarning} yes={`بله، ذخیره کن (تا ${faUsd(rebuy)})`} busy={busy}
              onYes={() => void save(false)} onNo={() => { setAsking(false); setError(null); }} />
          )}
        </div>
      )}
    </div>
  );
}
