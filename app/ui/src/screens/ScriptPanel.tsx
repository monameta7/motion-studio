// Responsibility: the script panel (docs/11 §2, D45): read-only voice lines with their on-screen texts, «توقف و اصلاح سناریو», and the editor for a held job or a finished job's «متن گوینده» revision.
import { useState } from 'react';
import { api, ApiError, type JobDetail, type ScriptLine } from '../api';
import { faNum } from '../fa';

const RESTART_FA: Record<string, string> = { voice: 'صدای گوینده، نقشه، ساخت و بسته‌ی خروجی', plan: 'نقشه، ساخت و بسته‌ی خروجی' };

/** Editable copy of the script: voice text by line id, on-screen text by index. */
type Draft = { voice: Record<number, string>; screen: Record<number, string> };
const draftOf = (lines: ScriptLine[]): Draft => ({
  voice: Object.fromEntries(lines.map((l) => [l.id, l.text])),
  screen: Object.fromEntries(lines.flatMap((l) => l.on_screen.map((t) => [t.index, t.text]))),
});

/** Render with `key={editing ? 'edit' : 'read'}` so entering the editor starts from the current script. */
export function ScriptPanel({ job, editing, onDone }: { job: JobDetail; editing: boolean; onDone?: (restartFa: string | null) => void }) {
  const script = job.script!;
  const [opened, setOpen] = useState(false);
  const open = editing || opened;
  const [draft, setDraft] = useState<Draft>(() => draftOf(script.lines));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const r = await api.put<{ restart_from?: string }>(`/api/jobs/${job.slug}/script`, body);
      onDone?.(r.restart_from ? RESTART_FA[r.restart_from] ?? null : null);
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
          {voiceChanged && script.voice_made && <p className="problem">تغییر متن گوینده یک درخواست صدای جدید می‌گیرد (از ۱۰ درخواست روزانهٔ Gemini)</p>}
          {empty && <p className="problem">هیچ متنی نباید خالی بماند.</p>}
          {error && <p className="problem" role="alert">{error}</p>}
          <div className="actions">
            <button type="button" className="btn primary" disabled={busy || empty || !anyChanged} onClick={() => void save(false)}>ادامه با این متن</button>
            {job.status === 'held' && <button type="button" className="btn" disabled={busy} onClick={() => void save(true)}>ادامه بدون تغییر</button>}
            {job.status === 'done' && <button type="button" className="btn" disabled={busy} onClick={() => onDone?.(null)}>انصراف</button>}
          </div>
        </div>
      )}
    </div>
  );
}
