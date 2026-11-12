// Responsibility: the first-run wizard /welcome (Phase 7): welcome → system check (each missing tool with its fix) → Claude sign-in → Gemini key («بعداً» allowed) → done; later phases add their steps to STEPS.
import { useState } from 'react';
import { api, type ClaudeAccount, type KeyView, type SystemItem } from '../api';
import { ClaudeAccountBox, GeminiKeyBox } from '../Account';
import { faNum } from '../fa';
import { go, usePoll } from '../hooks';
import type { BrandSchema } from '../brandcore/answers';
import { BrandCreator } from './NewBrand';

const STEPS = ['خوش آمدی', 'بررسی سیستم', 'ورود به Claude', 'کلید Gemini', 'برند', 'تمام'] as const;

export function Welcome({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [claudeOk, setClaudeOk] = useState<boolean | null>(null);
  const [keyLater, setKeyLater] = useState(false);
  const [brandLater, setBrandLater] = useState(false);
  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  /** With the guide, the New video tour opens by itself on arrival (Phase 10); without it, that tour is marked skipped («؟» still opens it). */
  const finish = async (withTour: boolean) => {
    if (!withTour) await api.post('/api/guide/tour', { id: 'new', state: 'skipped' }).catch(() => undefined);
    await api.post('/api/onboarding/done').catch(() => undefined);
    onDone();
    go('/new');
  };

  return (
    <main className="welcome" id="main">
      <div className="card stack welcome-card">
        <p className="muted small" aria-live="polite">قدم {faNum(step + 1)} از {faNum(STEPS.length)}: {STEPS[step]}</p>
        <ol className="welcome-progress" aria-hidden="true">{STEPS.map((s, i) => <li key={s} className={i <= step ? 'on' : ''} />)}</ol>

        {step === 0 && (
          <section className="stack" aria-labelledby="w0">
            <h1 id="w0">به استودیوی موشن خوش آمدی</h1>
            <p>این برنامه از یک موضوع، یک ویدیوی موشن‌گرافیک کامل با صدای فارسی می‌سازد: متن، صدا، صحنه‌ها، کاور و کپشن.</p>
            <p>برای شروع چند کار کوتاه لازم است: بررسی ابزارهای کامپیوتر، ورود به حساب Claude و وارد کردن کلید Gemini برای صدا. حدود ۵ دقیقه طول می‌کشد.</p>
            <div className="actions"><button type="button" className="btn primary big" onClick={next}>شروع</button></div>
          </section>
        )}

        {step === 1 && <SystemStep onNext={next} onBack={back} />}

        {step === 2 && (
          <section className="stack" aria-labelledby="w2">
            <h2 id="w2">ورود به Claude</h2>
            <p>متن و موشن را Claude می‌سازد. با حساب Claude خودت وارد شو؛ <b>اشتراک Pro یا Max لازم است</b> (حساب رایگان یا کلید API کار نمی‌کند).</p>
            <ClaudeAccountBox onChange={(a: ClaudeAccount) => setClaudeOk(a.ok)} />
            <ClaudeGate ok={claudeOk} onNext={next} onBack={back} />
          </section>
        )}

        {step === 3 && (
          <section className="stack" aria-labelledby="w3">
            <h2 id="w3">کلید Gemini برای صدا</h2>
            <p>صدای گوینده را Gemini گوگل می‌سازد. کلیدش رایگان است و روزی ۱۰ درخواست صدا می‌دهد (هر ویدیو یکی).</p>
            <GeminiKeyBox mode="wizard" onSaved={(k) => { if (k.set) { setKeyLater(false); next(); } }} />
            <KeyGate onBack={back} onNext={() => { setKeyLater(false); next(); }} onLater={() => { setKeyLater(true); next(); }} />
          </section>
        )}

        {step === 4 && <BrandStep onNext={next} onBack={back} onLater={() => { setBrandLater(true); next(); }} />}

        {step === 5 && (
          <section className="stack" aria-labelledby="w5">
            <h2 id="w5">آماده‌ای!</h2>
            {keyLater && <p className="problem">کلید Gemini را بعداً وارد کن (تنظیمات ← «حساب و کلیدها»)؛ تا آن موقع صدا ساخته نمی‌شود.</p>}
            {brandLater && <p className="problem">برندت را بعداً از «برند من» بساز؛ تا آن موقع ویدیو ساخته نمی‌شود.</p>}
            {!keyLater && !brandLater && <p>همه چیز آماده است. حالا اولین ویدیو را بساز.</p>}
            <p>اگر بخواهی، در صفحه‌ی ساخت ویدیو قدم‌به‌قدم نشانت می‌دهیم هر بخش چه کاری می‌کند؛ چند قدم کوتاه است و هر وقت خواستی می‌توانی ردش کنی.</p>
            <div className="row-between">
              <button type="button" className="btn" onClick={back}>قبلی</button>
              <div className="actions">
                <button type="button" className="btn" onClick={() => void finish(false)}>بدون راهنما</button>
                <button type="button" className="btn primary big" onClick={() => void finish(true)}>ساخت اولین ویدیو با راهنما</button>
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

/** The Claude step can be left only when the sign-in is a subscription login; the box reports every change. */
function ClaudeGate({ ok, onNext, onBack }: { ok: boolean | null; onNext: () => void; onBack: () => void }) {
  const { data } = usePoll<ClaudeAccount>('/api/account/claude', 3000);
  const signed = ok ?? data?.ok ?? false;
  return (
    <div className="row-between">
      <button type="button" className="btn" onClick={onBack}>قبلی</button>
      <button type="button" className="btn primary" disabled={!signed} onClick={onNext}>{signed ? 'بعدی' : 'اول وارد Claude شو'}</button>
    </div>
  );
}

/** A PC that already has a key goes on with «بعدی» (the novice walk, Phase 10: «بعداً» made the last step say the voice was locked); without one, «بعداً». */
function KeyGate({ onBack, onNext, onLater }: { onBack: () => void; onNext: () => void; onLater: () => void }) {
  const { data } = usePoll<KeyView>('/api/keys', 3000);
  return (
    <>
      {data?.set && <p className="success">کلید Gemini روی این کامپیوتر هست؛ می‌توانی بروی قدم بعد. اگر کلید تازه‌ای داری، بالا بچسبان و «ذخیره» را بزن.</p>}
      <div className="row-between">
        <button type="button" className="btn" onClick={onBack}>قبلی</button>
        {data?.set
          ? <button type="button" className="btn primary" onClick={onNext}>بعدی</button>
          : <button type="button" className="btn" onClick={onLater}>بعداً</button>}
      </div>
    </>
  );
}

function SystemStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const { data, reload } = usePoll<{ ok: boolean; items: SystemItem[] }>('/api/system-check', 0);
  const [checking, setChecking] = useState(false);
  const recheck = async () => { setChecking(true); await reload(); setChecking(false); };
  return (
    <section className="stack" aria-labelledby="w1">
      <h2 id="w1">بررسی سیستم</h2>
      <p>این ابزارها باید روی کامپیوتر نصب باشند. بررسی هیچ هزینه‌ای ندارد.</p>
      {!data ? <p className="muted">در حال بررسی… (چند ثانیه)</p> : (
        <ul className="check-list">
          {data.items.map((i) => (
            <li key={i.id} className={i.ok ? 'ok' : 'missing'}>
              <span className="check-mark" aria-hidden="true">{i.ok ? '✓' : '!'}</span>
              <div className="stack-sm">
                <b>{i.label_fa}</b>
                <span className="muted small">{i.ok ? 'نصب است' : 'پیدا نشد'}</span>
                {!i.ok && i.fix_fa && <p className="problem small">{i.fix_fa}</p>}
                {!i.ok && i.command && <CopyCommand text={i.command} />}
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="row-between">
        <button type="button" className="btn" onClick={onBack}>قبلی</button>
        <div className="actions">
          <button type="button" className="btn" disabled={checking} onClick={() => void recheck()}>{checking ? 'در حال بررسی…' : 'دوباره بررسی کن'}</button>
          <button type="button" className="btn primary" disabled={!data} onClick={onNext}>{data && !data.ok ? 'با همین وضع ادامه بده' : 'بعدی'}</button>
        </div>
      </div>
      {data && !data.ok && <p className="muted small">می‌توانی ادامه بدهی و بعداً نصب کنی، ولی تا همه نصب نشوند ویدیو ساخته نمی‌شود.</p>}
    </section>
  );
}

function CopyCommand({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(text); setCopied(true); } catch { setCopied(false); } };
  return (
    <div className="copy-cmd">
      <code className="latin">{text}</code>
      <button type="button" className="btn" onClick={() => void copy()}>{copied ? 'کپی شد' : 'کپی دستور'}</button>
    </div>
  );
}

/** The brand step (Phase 9): a PC that already has a brand skips it; otherwise only the 12 required questions are asked, the rest later on «برند من». */
function BrandStep({ onNext, onBack, onLater }: { onNext: () => void; onBack: () => void; onLater: () => void }) {
  const { data: schema } = usePoll<BrandSchema>('/api/brand-core/schema', 0);
  const { data: brands } = usePoll<{ brands: { slug: string; name: string }[] }>('/api/brands', 0);
  const [made, setMade] = useState(false);
  if (!schema || !brands) return <p className="muted">در حال بارگذاری…</p>;
  const has = made || brands.brands.length > 0;
  return (
    <section className="stack" aria-labelledby="w4">
      <h2 id="w4">برند تو</h2>
      {has ? (
        <>
          <p>{made ? 'برندت ساخته شد.' : `برند داری: ${brands.brands.map((b) => b.name).join('، ')}.`} هر وقت خواستی در «برند من» کاملش کن یا برند تازه بساز.</p>
          <div className="row-between"><button type="button" className="btn" onClick={onBack}>قبلی</button><button type="button" className="btn primary" onClick={onNext}>بعدی</button></div>
        </>
      ) : (
        <>
          <p>ویدیوها با هویت برند تو ساخته می‌شوند. فقط چند سؤال لازم را جواب بده؛ بقیه را بعداً در «برند من» کامل می‌کنی.</p>
          <BrandCreator schema={schema} onDone={() => setMade(true)} onSkip={onLater} />
          <div><button type="button" className="btn" onClick={onBack}>قبلی</button></div>
        </>
      )}
    </section>
  );
}
