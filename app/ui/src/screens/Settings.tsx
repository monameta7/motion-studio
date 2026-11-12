// Responsibility: the Settings screen (docs/11): account and keys (Claude sign-in, Gemini key), each stage's model and thinking level, voice and tone with a test sentence, quota thresholds, notifications (sound and a test), start with Windows, and jobs/ disk usage with the temp cleanup.
import { useEffect, useState } from 'react';
import { api, ApiError, type Settings as S } from '../api';
import { ClaudeAccountBox, GeminiKeyBox } from '../Account';
import { ModelsCard } from './ModelsCard';
import { faNum } from '../fa';
import { usePoll } from '../hooks';
import { HelpButton, useGuide, useScreenTour } from '../guide/Guide';

const TONE_FA: Record<string, string> = { auto: 'خودکار (از روی متن)', formal: 'رسمی', narrative: 'روایی', friendly: 'دوستانه', meditative: 'آرام', energetic: 'پرانرژی' };
const gb = (b: number | null) => (b === null ? '—' : `${faNum(b / 1024 ** 3, 2)} گیگابایت`);
const mb = (b: number) => `${faNum(b / 1024 ** 2, 1)} مگابایت`;

export function Settings() {
  useScreenTour('settings');
  const { data: s, reload } = usePoll<S>('/api/settings', 0);
  const { data: disk, reload: reloadDisk } = usePoll<{ jobs_bytes: number; temp_bytes: number; free_bytes: number | null; jobs_count: number }>('/api/disk', 0);
  const [form, setForm] = useState<{ voice: string; tone: string; max5: number; max7: number; budget: string } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [sentence, setSentence] = useState('سلام! این یک جمله‌ی آزمایشی برای صدای مهدیار هوش‌افزاست.');
  const [audio, setAudio] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testErr, setTestErr] = useState<string | null>(null);
  const [cleanMsg, setCleanMsg] = useState<string | null>(null);

  useEffect(() => {
    if (s && !form) setForm({ voice: s.voice, tone: s.tone, max5: s.quota.max_5h_pct_to_start, max7: s.quota.max_7d_pct_to_start, budget: s.quota.app_tokens_5h_budget === null ? '' : String(s.quota.app_tokens_5h_budget) });
  }, [s, form]);
  if (!s || !form) return <div className="card"><p className="muted">در حال بارگذاری…</p></div>;

  async function save() {
    setMsg(null);
    try {
      await api.put('/api/settings', { voice: form!.voice, tone: form!.tone, max_5h_pct_to_start: form!.max5, max_7d_pct_to_start: form!.max7, app_tokens_5h_budget: form!.budget.trim() ? Number(form!.budget) : null });
      await reload();
      setMsg({ ok: true, text: 'ذخیره شد.' });
    } catch (e) { setMsg({ ok: false, text: e instanceof ApiError ? e.message : String(e) }); }
  }

  async function test() {
    setTesting(true); setTestErr(null);
    try {
      const res = await fetch('/api/voice-test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: sentence, voice: form!.voice, ...(form!.tone !== 'auto' ? { tone: form!.tone } : {}) }) });
      if (!res.ok) throw new ApiError(res.status, ((await res.json().catch(() => ({}))) as { error_fa?: string }).error_fa ?? 'آزمایش صدا انجام نشد.');
      if (audio) URL.revokeObjectURL(audio);
      setAudio(URL.createObjectURL(await res.blob()));
    } catch (e) { setTestErr(e instanceof ApiError ? e.message : String(e)); } finally { setTesting(false); }
  }

  async function clean() {
    try { const r = await api.post<{ freed_bytes: number }>('/api/disk/clean'); setCleanMsg(`${mb(r.freed_bytes)} آزاد شد.`); await reloadDisk(); } catch (e) { setCleanMsg(e instanceof ApiError ? e.message : String(e)); }
  }

  const set = (k: keyof typeof form, v: string | number) => setForm({ ...form, [k]: v });

  return (
    <div className="stack settings">
      <div className="page-head"><h1>تنظیمات</h1><HelpButton /></div>

      <section className="card stack" aria-labelledby="account-h">
        <h2 id="account-h">حساب و کلیدها</h2>
        <h3>حساب Claude</h3>
        <ClaudeAccountBox />
        <h3>کلید Gemini (صدا)</h3>
        <GeminiKeyBox mode="settings" />
      </section>

      <ModelsCard s={s} onSaved={reload} />

      <section className="card stack" aria-labelledby="voice-h">
        <h2 id="voice-h">صدا</h2>
        <div className="form-grid">
          <label className="inline-field">گوینده
            <select value={form.voice} onChange={(e) => set('voice', e.target.value)}>{s.voices.map((v) => <option key={v} value={v}>{v}</option>)}</select>
          </label>
          <label className="inline-field">لحن
            <select value={form.tone} onChange={(e) => set('tone', e.target.value)}>{['auto', ...s.tones].map((t) => <option key={t} value={t}>{TONE_FA[t] ?? t}</option>)}</select>
          </label>
        </div>
        <label className="stack-sm"><span className="field-label">جمله‌ی آزمایشی</span>
          <input className="text-input" value={sentence} maxLength={300} onChange={(e) => setSentence(e.target.value)} />
        </label>
        <p className="problem small">هر آزمایش یک درخواست از ۱۰ درخواست روزانه‌ی Gemini را مصرف می‌کند.</p>
        <div className="actions">
          <button type="button" className="btn" disabled={testing || !sentence.trim()} onClick={() => void test()}>{testing ? 'در حال ساخت صدا…' : 'پخش جمله‌ی آزمایشی'}</button>
          {audio && <audio controls autoPlay src={audio} aria-label="صدای آزمایشی" />}
        </div>
        {testErr && <p className="problem" role="alert">{testErr}</p>}
      </section>

      <section className="card stack" aria-labelledby="quota-set-h">
        <h2 id="quota-set-h">آستانه‌های سهمیه</h2>
        <div className="form-grid">
          <label className="inline-field">حداکثر مصرف پنج‌ساعته برای شروع کار (٪)
            <input type="number" min={0} max={100} value={form.max5} onChange={(e) => set('max5', Number(e.target.value))} />
          </label>
          <label className="inline-field">حداکثر مصرف هفتگی برای شروع کار (٪)
            <input type="number" min={0} max={100} value={form.max7} onChange={(e) => set('max7', Number(e.target.value))} />
          </label>
          <label className="inline-field">بودجه‌ی توکن خروجی اپ در ۵ ساعت (خالی = خاموش)
            <input type="number" min={1} value={form.budget} onChange={(e) => set('budget', e.target.value)} />
          </label>
        </div>
        <div className="actions"><button type="button" className="btn primary" onClick={() => void save()}>ذخیره‌ی صدا و آستانه‌ها</button></div>
        {msg && <p className={msg.ok ? 'success' : 'problem'} role="status">{msg.text}</p>}
      </section>

      <NotificationSettings />

      <AutostartSettings />

      <section className="card stack-sm" aria-labelledby="disk-h">
        <h2 id="disk-h">فضای دیسک</h2>
        {disk ? (
          <dl className="kv-list">
            <div><dt>پوشه‌ی jobs ({faNum(disk.jobs_count)} کار)</dt><dd>{gb(disk.jobs_bytes)}</dd></div>
            <div><dt>فایل‌های موقت (فریم‌های رندر کارهای تمام‌شده، تصویرهای آپلود رهاشده)</dt><dd>{mb(disk.temp_bytes)}</dd></div>
            <div><dt>فضای آزاد</dt><dd>{gb(disk.free_bytes)}</dd></div>
          </dl>
        ) : <p className="muted">…</p>}
        <div className="actions"><button type="button" className="btn" onClick={() => void clean()} disabled={!disk || disk.temp_bytes === 0}>پاک‌کردن فایل‌های موقت</button></div>
        <p className="muted small">فیلم‌ها، پروژه‌ها و نسخه‌های پشتیبان پاک نمی‌شوند.</p>
        {cleanMsg && <p className="success" role="status">{cleanMsg}</p>}
      </section>

      <GuideSettings />
    </div>
  );
}

/** «دیدن دوباره‌ی راهنما» (Phase 10): every screen's tour opens again the next time that screen is shown; this screen's at once. */
function GuideSettings() {
  const g = useGuide();
  const [done, setDone] = useState(false);
  if (!g) return null;
  const again = async () => { await g.reset().catch(() => undefined); setDone(true); };
  return (
    <section className="card stack-sm" aria-labelledby="guide-h">
      <h2 id="guide-h">راهنما</h2>
      <p className="muted small">راهنمای قدم‌به‌قدم هر صفحه یک بار خودش باز می‌شود. برای دیدن دوباره، این دکمه را بزن؛ راهنمای هر صفحه دفعه‌ی بعد که آن صفحه را باز کنی نشان داده می‌شود.</p>
      <div className="actions"><button type="button" className="btn" onClick={() => void again()}>دیدن دوباره‌ی راهنما</button></div>
      {done && <p className="success" role="status">راهنماها از نو روشن شدند.</p>}
    </section>
  );
}

function NotificationSettings() {
  const { data, reload } = usePoll<{ sound: boolean }>('/api/notifications', 0);
  const [sent, setSent] = useState(false);
  if (!data) return null;
  const toggle = async () => { await api.put('/api/notifications/settings', { sound: !data.sound }).catch(() => undefined); void reload(); };
  const test = async () => { await api.post('/api/notifications/test').catch(() => undefined); setSent(true); };
  return (
    <section className="card stack-sm" aria-labelledby="notify-h">
      <h2 id="notify-h">اعلان‌ها</h2>
      <p className="muted small">وقتی برنامه باز است، پایان هر ویدیو، خطا و توقف کار را با پیام ویندوز خبر می‌دهد؛ با کلیک روی پیام صفحه‌ی همان کار باز می‌شود.</p>
      <div className="switch-row">
        <button type="button" role="switch" aria-checked={data.sound} className="switch" onClick={() => void toggle()}>
          <span className="knob" aria-hidden="true" />
          <span>صدای اعلان</span>
        </button>
        <button type="button" className="btn" onClick={() => void test()}>آزمایش اعلان</button>
      </div>
      {sent && <p className="muted small" role="status">یک اعلان آزمایشی فرستاده شد.</p>}
    </section>
  );
}

interface Autostart { supported: boolean; installed: boolean; at: string | null }

function AutostartSettings() {
  const { data, reload } = usePoll<Autostart>('/api/autostart', 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!data || !data.supported) return null;
  const toggle = async () => {
    setBusy(true); setError(null);
    try { await api.post('/api/autostart', { on: !data.installed }); await reload(); }
    catch (e) { setError(e instanceof ApiError ? e.message : 'انجام نشد؛ دوباره امتحان کن.'); }
    finally { setBusy(false); }
  };
  return (
    <section className="card stack-sm" aria-labelledby="auto-h">
      <h2 id="auto-h">اجرای خودکار با ویندوز</h2>
      <p className="muted small">
        برنامه با ورود به ویندوز{data.at ? ` و هر روز ساعت ${data.at.split(',').map((t) => faNum(t)).join(' و ')} (۳۰ دقیقه قبل از شروع فیلم هر برند)` : ''} خودش باز می‌شود تا فیلم‌های زمان‌بندی‌شده ساخته شوند.
        کامپیوتر باید روشن باشد؛ وقتی خاموش است یا در حالت خواب، چیزی ساخته نمی‌شود.
      </p>
      <div className="switch-row">
        <button type="button" role="switch" aria-checked={data.installed} className="switch" disabled={busy} onClick={() => void toggle()}>
          <span className="knob" aria-hidden="true" />
          <span>{data.installed ? 'روشن' : 'خاموش'}</span>
        </button>
      </div>
      {error && <p className="problem" role="alert">{error}</p>}
    </section>
  );
}
