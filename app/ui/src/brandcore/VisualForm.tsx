// Responsibility: the visual part of the brand form: logo upload (with colours suggested by code), the palette editor, the Persian and Latin font choice with the licence tick (free defaults when none), and the outro tagline.
import { useId, useState } from 'react';
import { api, ApiError } from '../api';
import { ROLE_FA, getAnswer, setAnswer, type Draft } from './answers';

interface Color { hex: string; name: string; role: string; use?: string }
interface Font { family: string; file: string | null; licence_ok: boolean }

const FREE = { persian: { family: 'Vazirmatn', label: 'وزیرمتن (رایگان)' }, latin: { family: 'Inter', label: 'اینتر (رایگان)' } } as const;
const HEX = /^#[0-9A-Fa-f]{6}$/;

export function VisualForm({ slug, draft, onChange, onLogo }: { slug: string; draft: Draft; onChange: (d: Draft) => void; onLogo?: () => void }) {
  const v = (id: string) => getAnswer(draft, 'visual', id);
  const set = (id: string, val: unknown) => onChange(setAnswer(draft, 'visual', id, val));
  const colors = (v('colors') as Color[] | undefined) ?? [];
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ver, setVer] = useState(() => Date.now());
  const logoId = useId();
  const tagId = useId();

  const upload = async (file: File) => {
    setBusy(true); setProblem(null);
    try {
      const fd = new FormData(); fd.append('file', file);
      const r = await api.post<{ file: string; palette: Color[] | null }>(`/api/brand-core/${slug}/logo`, fd);
      let next = setAnswer(draft, 'visual', 'logo', r.file);
      // The app decides (D58): a palette from the logo fills an empty palette; the owner can change every colour.
      if (colors.length === 0 && r.palette) next = setAnswer(next, 'visual', 'colors', r.palette);
      onChange(next);
      setVer(Date.now());
      onLogo?.();
    } catch (e) { setProblem(e instanceof ApiError ? e.message : 'لوگو بارگذاری نشد.'); } finally { setBusy(false); }
  };

  const suggest = async () => {
    setBusy(true); setProblem(null);
    try { set('colors', (await api.get<{ palette: Color[] }>(`/api/brand-core/${slug}/palette`)).palette); } catch (e) { setProblem(e instanceof ApiError ? e.message : 'رنگ‌ها پیشنهاد داده نشد.'); } finally { setBusy(false); }
  };

  const setColor = (i: number, patch: Partial<Color>) => set('colors', colors.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const logo = v('logo') as string | undefined;

  return (
    <div className="stack">
      <div className="stack-sm">
        <label htmlFor={logoId} className="q-label"><b>لوگو</b><span className="req"> (لازم)</span></label>
        <span className="muted small">یک فایل تصویر (پی‌ان‌جی، جی‌پی‌جی یا وب‌پی)، تا ۸ مگابایت؛ بهتر است پس‌زمینه‌ی شفاف داشته باشد. لوگو فقط در لوگوموشن پایانی ویدیو می‌آید.</span>
        <div className="logo-row">
          {logo ? <img className="logo-preview" src={`/api/brands/${encodeURIComponent(slug)}/logo.png?v=${ver}`} alt="لوگوی بارگذاری‌شده" /> : <span className="logo-preview empty" aria-hidden="true" />}
          <input id={logoId} type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }} />
        </div>
      </div>

      <fieldset className="plain stack-sm">
        <legend><b className="q-label">رنگ‌ها</b><span className="req"> (لازم)</span></legend>
        <span className="muted small">دست‌کم دو رنگ. نقش هر رنگ را انتخاب کن؛ فیلم‌ها دقیقاً همین رنگ‌ها را به کار می‌برند.</span>
        <ul className="color-rows">
          {colors.map((c, i) => (
            <li key={i} className="color-row">
              <input type="color" aria-label={`انتخاب رنگ ${c.name}`} value={HEX.test(c.hex) ? c.hex : '#000000'} onChange={(e) => setColor(i, { hex: e.target.value.toUpperCase() })} />
              <input className="text-input latin hex" aria-label={`کد رنگ ${c.name}`} value={c.hex} maxLength={7} onChange={(e) => setColor(i, { hex: e.target.value.toUpperCase() })} />
              <input className="text-input" aria-label="نام رنگ" value={c.name} onChange={(e) => setColor(i, { name: e.target.value })} />
              <select className="text-input" aria-label={`نقش رنگ ${c.name}`} value={c.role} onChange={(e) => setColor(i, { role: e.target.value })}>
                {Object.entries(ROLE_FA).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
              <button type="button" className="btn link" onClick={() => set('colors', colors.filter((_, j) => j !== i))}>حذف</button>
            </li>
          ))}
        </ul>
        {colors.some((c) => !HEX.test(c.hex)) && <p className="problem" role="alert">کد رنگ باید مثل #059B9A باشد (علامت # و شش رقم یا حرف a تا f).</p>}
        <div className="actions">
          <button type="button" className="btn" onClick={() => set('colors', [...colors, { hex: '#888888', name: 'رنگ تازه', role: 'other' }])}>+ افزودن رنگ</button>
          <button type="button" className="btn" disabled={busy || !logo} onClick={() => void suggest()}>پیشنهاد رنگ از روی لوگو</button>
        </div>
      </fieldset>

      <FontChoice slug={slug} script="persian" title="فونت فارسی" value={v('persian_font') as Font | undefined} onChange={(f) => set('persian_font', f)} />
      <FontChoice slug={slug} script="latin" title="فونت لاتین" value={v('latin_font') as Font | undefined} onChange={(f) => set('latin_font', f)} />

      <div className="stack-sm">
        <label htmlFor={tagId} className="q-label"><b>شعار پایان ویدیو</b><span className="muted small"> (اختیاری)</span></label>
        <span className="muted small">زیر لوگو در لوگوموشن پایانی نوشته می‌شود. خالی بماند، فقط لوگو دیده می‌شود.</span>
        <input id={tagId} className="text-input" value={(v('outro_tagline') as string | undefined) ?? ''} onChange={(e) => set('outro_tagline', e.target.value)} />
      </div>
      {problem && <p className="problem" role="alert">{problem}</p>}
    </div>
  );
}

/** A free default (no file, no tick needed) or the user's own font file with a family name and the licence tick. */
function FontChoice({ slug, script, title, value, onChange }: { slug: string; script: 'persian' | 'latin'; title: string; value: Font | undefined; onChange: (f: Font) => void }) {
  const free = FREE[script];
  const own = !!value && value.file !== null;
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const name = useId();
  const upload = async (file: File) => {
    setBusy(true); setProblem(null);
    try {
      const fd = new FormData(); fd.append('file', file);
      const r = await api.post<{ file: string; family_guess: string }>(`/api/brand-core/${slug}/font`, fd);
      onChange({ family: r.family_guess, file: r.file, licence_ok: value?.licence_ok ?? false });
    } catch (e) { setProblem(e instanceof ApiError ? e.message : 'فونت بارگذاری نشد.'); } finally { setBusy(false); }
  };
  return (
    <fieldset className="plain stack-sm">
      <legend><b className="q-label">{title}</b></legend>
      <div className="seg" role="group" aria-label={title}>
        <button type="button" className={own ? '' : 'seg-on'} aria-pressed={!own} onClick={() => onChange({ family: free.family, file: null, licence_ok: true })}>{free.label}</button>
        <button type="button" className={own ? 'seg-on' : ''} aria-pressed={own} onClick={() => onChange({ family: value?.family ?? '', file: value?.file ?? '', licence_ok: value?.licence_ok ?? false })}>فونت خودم</button>
      </div>
      {(own || (value && value.file === '')) && (
        <div className="stack-sm">
          <input type="file" accept=".woff2,.woff,.ttf,.otf" aria-label={`فایل ${title}`} disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }} />
          {value?.file ? <span className="muted small">فایل: <span className="latin">{value.file}</span></span> : <span className="muted small">فایل فونت را انتخاب کن (همه‌ی فرمت‌های رایج فونت).</span>}
          <div className="inline-field"><label htmlFor={name}>نام فونت</label><input id={name} className="text-input latin" value={value?.family ?? ''} onChange={(e) => onChange({ family: e.target.value, file: value?.file ?? null, licence_ok: value?.licence_ok ?? false })} /></div>
          <label className="check-row"><input type="checkbox" checked={value?.licence_ok ?? false} onChange={(e) => onChange({ family: value?.family ?? '', file: value?.file ?? '', licence_ok: e.target.checked })} /> مجوز استفاده دارم</label>
        </div>
      )}
      {!own && <span className="muted small">اگر فونتی ندهی، فونت رایگان به‌کار می‌رود.</span>}
      {problem && <p className="problem" role="alert">{problem}</p>}
    </fieldset>
  );
}
