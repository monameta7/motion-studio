// Responsibility: draws one section of the brand questionnaire from the schema (text, paragraph, list, group cards, tone sliders) and reports every change; `requiredOnly` shows only the required questions (creator and wizard).
import { useId } from 'react';
import { faNum } from '../fa';
import { getAnswer, isRequired, setAnswer, type BrandSchema, type Draft, type QItem, type Question, type SectionDef } from './answers';

type Change = (d: Draft) => void;

export function QuestionForm({ schema, section, draft, onChange, requiredOnly = false, skip = [] }: { schema: BrandSchema; section: SectionDef; draft: Draft; onChange: Change; requiredOnly?: boolean; skip?: string[] }) {
  const qs = section.questions.filter((q) => !skip.includes(q.id) && (!requiredOnly || isRequired(schema, section.id, q.id)));
  if (qs.length === 0) return null;
  return (
    <div className="stack">
      {qs.map((q) => <QuestionField key={q.id} q={q} required={isRequired(schema, section.id, q.id)} value={getAnswer(draft, section.id, q.id)} onChange={(v) => onChange(setAnswer(draft, section.id, q.id, v))} />)}
    </div>
  );
}

function Label({ q, required, htmlFor }: { q: Question; required: boolean; htmlFor?: string }) {
  return (
    <div className="stack-sm">
      <label htmlFor={htmlFor} className="q-label"><b>{q.label}</b>{required ? <span className="req"> (لازم)</span> : q.level === 3 ? <span className="muted small"> (اختیاری)</span> : null}</label>
      <span className="muted small">{q.q}</span>
      {q.help && <span className="muted small">{q.help}</span>}
    </div>
  );
}

function QuestionField({ q, required, value, onChange }: { q: Question; required: boolean; value: unknown; onChange: (v: unknown) => void }) {
  const id = useId();
  if (q.type === 'text') {
    return (
      <div className="stack-sm">
        <Label q={q} required={required} htmlFor={id} />
        <input id={id} className="text-input" value={(value as string) ?? ''} placeholder={q.ph} onChange={(e) => onChange(e.target.value)} />
        <Chips chips={q.chips} onPick={(c) => onChange(c)} />
      </div>
    );
  }
  if (q.type === 'para') {
    return (
      <div className="stack-sm">
        <Label q={q} required={required} htmlFor={id} />
        <textarea id={id} className="text-input area" rows={3} value={(value as string) ?? ''} placeholder={q.ph} onChange={(e) => onChange(e.target.value)} />
        <Chips chips={q.chips} onPick={(c) => onChange(c)} />
      </div>
    );
  }
  if (q.type === 'list') {
    const items = (value as string[] | undefined) ?? [];
    return (
      <div className="stack-sm">
        <Label q={q} required={required} htmlFor={id} />
        <textarea id={id} className="text-input area" rows={Math.min(8, Math.max(3, items.length + 1))} value={items.join('\n')} placeholder={q.ph ?? 'هر مورد در یک خط'}
          onChange={(e) => onChange(e.target.value.split('\n'))} />
        <span className="muted small">هر مورد را در یک خط جدا بنویس.</span>
        <Chips chips={q.chips?.filter((c) => !items.includes(c))} onPick={(c) => onChange([...items.filter((x) => x.trim() !== ''), c])} />
      </div>
    );
  }
  if (q.type === 'scales') return <Scales q={q} required={required} value={(value as Record<string, number> | undefined) ?? {}} onChange={onChange} />;
  return <Group q={q} required={required} value={(value as Record<string, string>[] | undefined) ?? []} onChange={onChange} />;
}

function Chips({ chips, onPick }: { chips: string[] | undefined; onPick: (c: string) => void }) {
  if (!chips || chips.length === 0) return null;
  return <div className="chips" aria-label="پیشنهادهای یک‌کلیکی">{chips.map((c) => <button key={c} type="button" className="chip" onClick={() => onPick(c)}>{c}</button>)}</div>;
}

/** Four sliders from 0 (the left word) to 100 (the right word); «پاک‌کردن» takes a slider back to «میانه». */
function Scales({ q, required, value, onChange }: { q: Question; required: boolean; value: Record<string, number>; onChange: (v: unknown) => void }) {
  const base = useId();
  return (
    <fieldset className="plain stack-sm">
      <legend><Label q={q} required={required} /></legend>
      {(q.scales ?? []).map((s) => {
        const v = value[s.id];
        const set = typeof v === 'number';
        const rowId = `${base}-${s.id}`;
        return (
          <div key={s.id} className="scale-row">
            <label htmlFor={rowId} className="scale-end">{s.a}</label>
            <input id={rowId} type="range" min={0} max={100} step={5} value={set ? v : 50} aria-valuetext={set ? `${faNum(v)} از ۱۰۰` : 'میانه'}
              className={set ? 'range' : 'range unset'} onChange={(e) => onChange({ ...value, [s.id]: Number(e.target.value) })} />
            <span className="scale-end">{s.b}</span>
            <button type="button" className="btn link" disabled={!set} onClick={() => { const { [s.id]: _drop, ...rest } = value; onChange(rest); }}>{set ? 'پاک‌کردن' : 'میانه'}</button>
          </div>
        );
      })}
    </fieldset>
  );
}

/** Cards with several fields each (values, products, proofs…); «افزودن» adds a card, «حذف» removes one. */
function Group({ q, required, value, onChange }: { q: Question; required: boolean; value: Record<string, string>[]; onChange: (v: unknown) => void }) {
  const cards = value.length ? value : [{}];
  const set = (i: number, f: QItem, v: string) => onChange(cards.map((c, j) => (j === i ? { ...c, [f.id]: v } : c)));
  return (
    <fieldset className="plain stack-sm">
      <legend><Label q={q} required={required} /></legend>
      <ul className="group-cards">
        {cards.map((c, i) => (
          <li key={i} className="group-card">
            {(q.item ?? []).map((f) => <GroupInput key={f.id} f={f} v={c[f.id] ?? ''} onChange={(v) => set(i, f, v)} />)}
            {cards.length > 1 || Object.values(c).some((x) => x) ? <button type="button" className="btn link" onClick={() => onChange(cards.filter((_, j) => j !== i))}>حذف این مورد</button> : null}
          </li>
        ))}
      </ul>
      <div><button type="button" className="btn" onClick={() => onChange([...cards, {}])}>+ {q.add ?? 'مورد تازه'}</button></div>
    </fieldset>
  );
}

function GroupInput({ f, v, onChange }: { f: QItem; v: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <div className="inline-field">
      <label htmlFor={id}>{f.label}</label>
      {f.type === 'para' ? <textarea id={id} className="text-input area" rows={2} value={v} placeholder={f.ph} onChange={(e) => onChange(e.target.value)} />
        : <input id={id} className="text-input" value={v} placeholder={f.ph} onChange={(e) => onChange(e.target.value)} />}
    </div>
  );
}
