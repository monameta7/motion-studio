// Responsibility: the Settings «مدل‌ها» card (D64): one row per Claude stage in plain words; a picker with three model cards and three thinking levels, the «پیشنهاد ما» badge and plain warnings; every choice is saved at once and applies from the next call.
import { useEffect, useState } from 'react';
import { api, ApiError, type ClaudeEffort, type ClaudeModel, type ClaudeStage, type Settings, type StageSetting } from '../api';
import { EFFORT_FA, EFFORT_LINE, HAIKU_WEAK, MODEL_FA, MODEL_LINE, STAGE_INFO, STAGE_ORDER } from '../labels';
import { Modal } from '../Modal';

/** «Opus 5.5 · بالا»: the model name keeps its Latin digits, the level is Persian. */
export function ModelLevel({ v }: { v: StageSetting }) {
  return <bdi><bdi className="latin">{MODEL_FA[v.model]}</bdi> · {EFFORT_FA[v.effort]}</bdi>;
}

const same = (a: StageSetting, b: StageSetting) => a.model === b.model && a.effort === b.effort;

export function ModelsCard({ s, onSaved }: { s: Settings; onSaved: () => Promise<void> }) {
  const [open, setOpen] = useState<ClaudeStage | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 4000); return () => clearTimeout(t); }, [toast]);

  const save = async (stages: Partial<Record<ClaudeStage, StageSetting>>) => {
    setBusy(true);
    try {
      const r = await api.put<Settings>('/api/settings', { claude_stages: stages });
      setToast({ ok: true, text: `ذخیره شد؛ ${r.applies_fa ?? 'از کار بعدی'}.` });
      await onSaved();
    } catch (e) { setToast({ ok: false, text: e instanceof ApiError ? e.message : 'ذخیره نشد؛ دوباره امتحان کن.' }); } finally { setBusy(false); }
  };

  const allRecommended = STAGE_ORDER.every((k) => same(s.claude_stages[k], s.claude_recommended[k]));

  return (
    <section className="card stack-sm" aria-labelledby="models-h">
      <h2 id="models-h">مدل‌ها</h2>
      <p className="muted small">برای هر کار، مدل Claude و سطح فکرش را انتخاب کن. تغییر از کار بعدی اعمال می‌شود؛ کاری که در حال اجراست با انتخاب قبلی تمام می‌شود.</p>
      <ul className="model-rows">
        {STAGE_ORDER.map((k) => {
          const cur = s.claude_stages[k];
          const rec = s.claude_recommended[k];
          return (
            <li key={k}>
              <button type="button" className="model-row" onClick={() => setOpen(k)} aria-haspopup="dialog">
                <span className="stack-sm">
                  <b>{STAGE_INFO[k].name}</b>
                  <span className="muted small">{STAGE_INFO[k].line}</span>
                </span>
                <span className="model-now">
                  <ModelLevel v={cur} />
                  {same(cur, rec) ? <span className="badge-suggested">پیشنهاد ما</span> : <span className="muted small">پیشنهاد ما: <ModelLevel v={rec} /></span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="actions">
        <button type="button" className="btn" disabled={busy || allRecommended} onClick={() => void save(s.claude_recommended)}>برگرداندن همه به پیشنهاد</button>
      </div>
      {open && <Picker stage={open} cur={s.claude_stages[open]} rec={s.claude_recommended[open]} busy={busy} onPick={(v) => void save({ [open]: v })} onClose={() => setOpen(null)} />}
      {toast && <div className="inapp-toast" role="status"><span>{toast.text}</span><button type="button" className="x" aria-label="بستن" onClick={() => setToast(null)}>×</button></div>}
    </section>
  );
}

const MODELS: ClaudeModel[] = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'];
const LEVELS: ClaudeEffort[] = ['high', 'xhigh', 'max'];

function Picker({ stage, cur, rec, busy, onPick, onClose }: { stage: ClaudeStage; cur: StageSetting; rec: StageSetting; busy: boolean; onPick: (v: StageSetting) => void; onClose: () => void }) {
  return (
    <Modal title={STAGE_INFO[stage].name} onClose={onClose}>
      <p className="muted">{STAGE_INFO[stage].line}</p>
      <fieldset className="stack-sm picker-group">
        <legend className="field-label">مدل</legend>
        <div className="model-cards" role="radiogroup" aria-label="مدل">
          {MODELS.map((m) => (
            <button key={m} type="button" role="radio" aria-checked={cur.model === m} disabled={busy} className={`model-card${cur.model === m ? ' on' : ''}`} onClick={() => onPick({ ...cur, model: m })}>
              <b><bdi className="latin">{MODEL_FA[m]}</bdi></b>
              <span className="small">{MODEL_LINE[m]}</span>
              {rec.model === m && <span className="badge-suggested">پیشنهاد ما</span>}
              {m === 'claude-haiku-5-5' && HAIKU_WEAK.includes(stage) && <span className="problem small">برای این کار ضعیف است</span>}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="stack-sm picker-group">
        <legend className="field-label">سطح فکر</legend>
        <div className="level-options" role="radiogroup" aria-label="سطح فکر">
          {LEVELS.map((e) => (
            <button key={e} type="button" role="radio" aria-checked={cur.effort === e} disabled={busy} className={`level-option${cur.effort === e ? ' on' : ''}`} onClick={() => onPick({ ...cur, effort: e })}>
              <b>{EFFORT_FA[e]}</b>
              <span className="small">{EFFORT_LINE[e]}</span>
              {rec.effort === e && <span className="badge-suggested">پیشنهاد ما</span>}
            </button>
          ))}
        </div>
        {cur.effort !== 'high' && <p className="problem small">سطح «{EFFORT_FA[cur.effort]}» سهمیه‌ی Claude را زودتر تمام می‌کند.</p>}
      </fieldset>
      <div className="row-between">
        <span className="muted small">هر انتخاب همان لحظه ذخیره می‌شود.</span>
        <button type="button" className="btn primary" onClick={onClose}>بستن</button>
      </div>
    </Modal>
  );
}
