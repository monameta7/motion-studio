// Responsibility: the account pieces the welcome wizard and Settings share: the Claude sign-in box (status, sign-in in the browser, other account, sign-out, re-check, manual guide) and the Gemini key box (masked key, enter or change it, the text-only AI Studio guide, voice test).
import { useState } from 'react';
import { api, ApiError, type ClaudeAccount, type KeyView } from './api';
import { usePoll } from './hooks';
import { Confirm } from './Modal';

const planFa = (p: string | null) => (p === 'pro' ? 'Pro' : p === 'max' ? 'Max' : p ?? '—');
const errText = (e: unknown) => (e instanceof ApiError ? e.message : 'انجام نشد؛ دوباره امتحان کن.');

/** When the browser does not open: sign in once from a terminal, then «دوباره بررسی کن». */
export function ManualLoginGuide() {
  return (
    <details className="guide">
      <summary>راهنمای ورود دستی (اگر مرورگر باز نشد)</summary>
      <ol>
        <li>کلید Windows را بزن، بنویس <b>PowerShell</b> و بازش کن.</li>
        <li>این دستور را بنویس و Enter بزن: <code className="latin">claude auth login</code></li>
        <li>صفحه‌ای که باز می‌شود (یا لینکی که نشان می‌دهد) را در مرورگر باز کن و با حساب Claude وارد شو.</li>
        <li>اگر کدی نشانت داد، آن را در همان پنجره‌ی PowerShell بچسبان و Enter بزن.</li>
        <li>به این صفحه برگرد و «دوباره بررسی کن» را بزن.</li>
      </ol>
    </details>
  );
}

export function ClaudeAccountBox({ onChange }: { onChange?: (a: ClaudeAccount) => void }) {
  const { data, reload } = usePoll<ClaudeAccount>('/api/account/claude', 0);
  const [busy, setBusy] = useState<'login' | 'logout' | 'recheck' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [askLogout, setAskLogout] = useState(false);
  const shown = data;

  const act = async (kind: 'login' | 'logout' | 'recheck') => {
    setBusy(kind); setError(null); setAskLogout(false);
    try {
      const a = await api.post<ClaudeAccount>(`/api/account/claude/${kind}`, {});
      onChange?.(a);
    } catch (e) { setError(errText(e)); } finally {
      setBusy(null);
      await reload();
    }
  };

  return (
    <div className="stack-sm account-box" aria-live="polite">
      {!shown ? <p className="muted">در حال بررسی حساب Claude…</p> : shown.ok ? (
        <dl className="kv-list">
          <div><dt>حساب Claude</dt><dd><bdi className="latin">{shown.email ?? '—'}</bdi></dd></div>
          <div><dt>اشتراک</dt><dd><bdi className="latin">{planFa(shown.plan)}</bdi></dd></div>
        </dl>
      ) : <p className="problem">{shown.message_fa}</p>}
      {busy === 'login' && (
        <p className="problem" role="status">صفحه‌ی ورود در مرورگر باز شد. همان‌جا با حساب Claude وارد شو و دکمه‌ی تأیید (Authorize) را بزن؛ این صفحه خودش به‌روز می‌شود (تا ۵ دقیقه).</p>
      )}
      <div className="actions">
        <button type="button" className={`btn${shown?.ok ? '' : ' primary'}`} disabled={busy !== null} onClick={() => void act('login')}>
          {shown?.ok ? 'ورود با حساب دیگر' : 'ورود به Claude'}
        </button>
        <button type="button" className="btn" disabled={busy !== null} onClick={() => void act('recheck')}>{busy === 'recheck' ? 'در حال بررسی…' : 'دوباره بررسی کن'}</button>
        {shown?.ok && <button type="button" className="btn link" disabled={busy !== null} onClick={() => setAskLogout(true)}>خروج از حساب</button>}
      </div>
      {shown?.ok && <p className="muted small">برای حساب دیگر: اگر مرورگر حساب قبلی را نشان داد، همان‌جا از آن خارج شو و با حساب دیگر وارد شو.</p>}
      {error && <p className="problem" role="alert">{error}</p>}
      {(error || (shown && !shown.ok)) && <ManualLoginGuide />}
      {askLogout && (
        <Confirm title="خروج از حساب Claude" text="بعد از خروج، برنامه تا وقتی دوباره وارد نشوی هیچ ویدیویی نمی‌سازد. خارج شوم؟" yes="بله، خارج شو" busy={busy === 'logout'} onYes={() => void act('logout')} onNo={() => setAskLogout(false)} />
      )}
    </div>
  );
}

/** Step-by-step: getting a free Gemini key from Google AI Studio (text only, owner 2026-11-07, Q24). */
export function AiStudioGuide() {
  return (
    <ol className="guide-steps">
      <li>این صفحه را باز کن: <a className="latin" href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">aistudio.google.com/apikey</a></li>
      <li>با حساب Google خودت وارد شو.</li>
      <li>دکمه‌ی <b className="latin">Create API key</b> را بزن.</li>
      <li>کلیدی را که ساخته شد کپی کن (معمولاً با <b className="latin">AIza</b> شروع می‌شود).</li>
      <li>کلید را در خانه‌ی پایین بچسبان و «ذخیره» را بزن.</li>
    </ol>
  );
}

export function GeminiKeyBox({ mode, onSaved }: { mode: 'wizard' | 'settings'; onSaved?: (k: KeyView) => void }) {
  const { data, reload } = usePoll<KeyView>('/api/keys', 0);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [askTest, setAskTest] = useState(false);
  const [testing, setTesting] = useState(false);
  const [audio, setAudio] = useState<string | null>(null);
  const showForm = mode === 'wizard' || editing || (data !== null && !data.set);

  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      const k = await api.put<KeyView>('/api/keys/gemini', { key: value });
      setValue(''); setEditing(false);
      setMsg({ ok: true, text: k.message_fa ?? 'ذخیره شد.' });
      onSaved?.(k);
    } catch (e) { setMsg({ ok: false, text: errText(e) }); } finally { setBusy(false); await reload(); }
  };

  const test = async () => {
    setAskTest(false); setTesting(true); setMsg(null);
    try {
      const res = await fetch('/api/voice-test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'سلام! این یک آزمایش کوتاه برای کلید Gemini است.' }) });
      if (!res.ok) throw new ApiError(res.status, ((await res.json().catch(() => ({}))) as { error_fa?: string }).error_fa ?? 'آزمایش صدا انجام نشد.');
      if (audio) URL.revokeObjectURL(audio);
      setAudio(URL.createObjectURL(await res.blob()));
      setMsg({ ok: true, text: 'کلید کار می‌کند.' });
    } catch (e) { setMsg({ ok: false, text: errText(e) }); } finally { setTesting(false); }
  };

  return (
    <div className="stack-sm key-box">
      {data && data.set && (
        <dl className="kv-list">
          <div><dt>کلید Gemini</dt><dd><bdi className="latin">{data.masked}</bdi></dd></div>
          <div><dt>از کجا</dt><dd>{data.source_fa}</dd></div>
        </dl>
      )}
      {data && !data.set && mode === 'settings' && <p className="problem">کلید Gemini وارد نشده؛ تا واردش نکنی صدا ساخته نمی‌شود.</p>}
      {data?.env_locked && <p className="muted small">این کلید از متغیر محیطی GEMINI_API_KEY می‌آید و بر کلید ذخیره‌شده مقدم است.</p>}
      {mode === 'settings' && data?.set && !editing && (
        <div className="actions">
          <button type="button" className="btn" onClick={() => { setEditing(true); setMsg(null); }}>تغییر</button>
          <button type="button" className="btn" disabled={testing} onClick={() => setAskTest(true)}>{testing ? 'در حال ساخت صدا…' : 'آزمایش صدا'}</button>
          {audio && <audio controls autoPlay src={audio} aria-label="صدای آزمایشی" />}
        </div>
      )}
      {showForm && (
        <>
          {(mode === 'wizard' || editing || !data?.set) && <AiStudioGuide />}
          <label className="stack-sm"><span className="field-label">کلید Gemini</span>
            <input className="text-input latin" type="password" autoComplete="off" spellCheck={false} value={value} placeholder="AIza…" onChange={(e) => setValue(e.target.value)} />
          </label>
          <div className="actions">
            <button type="button" className="btn primary" disabled={busy || value.trim().length < 20} onClick={() => void save()}>{busy ? 'در حال ذخیره…' : 'ذخیره'}</button>
            {mode === 'settings' && editing && <button type="button" className="btn" onClick={() => { setEditing(false); setValue(''); }}>انصراف</button>}
          </div>
          <p className="muted small">کلید فقط روی همین کامپیوتر ذخیره می‌شود و هیچ جا کامل نشان داده نمی‌شود.</p>
        </>
      )}
      {msg && <p className={msg.ok ? 'success' : 'problem'} role="status">{msg.text}</p>}
      {askTest && (
        <Confirm title="آزمایش صدا" text="این آزمایش یکی از ۱۰ درخواست روزانه‌ی رایگان Gemini را مصرف می‌کند. انجامش بدهم؟" yes="بله، آزمایش کن" onYes={() => void test()} onNo={() => setAskTest(false)} />
      )}
    </div>
  );
}
