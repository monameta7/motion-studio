// Responsibility: the two-part workspace switch under the brand switcher (D88, Phase 11.3; words «موشن | ویدیو», owner 2026-11-16): New video, Automation and the library item follow it; while the video side is locked (Phase 11.9, D91) it explains the four Google Cloud steps and checks again.
import { useState } from 'react';
import type { Workspace } from './api';
import { WORKSPACE_FA } from './labels';
import { Modal } from './Modal';
import { SubmitButton } from './SubmitButton';
import { useWorkspace, type SwitchRefusal } from './workspace';

const SIDES: Workspace[] = ['motion', 'video'];
type Step = Exclude<SwitchRefusal['lock'], null | 'cloud'>;
const STEPS: Step[] = ['sdk', 'signin', 'project', 'vertex'];

/** The four things the user does once, on their own Google account; the missing one is marked. */
function VideoLock({ refusal, busy, onCheck, onClose }: { refusal: SwitchRefusal; busy: boolean; onCheck: () => void; onClose: () => void }) {
  const at = refusal.lock === 'cloud' ? -1 : STEPS.indexOf(refusal.lock as Step);
  const state = (i: number) => (at < 0 ? '' : i < at ? 'ok' : i === at ? 'missing' : '');
  return (
    <Modal title="فضای ویدیو هنوز بسته است" onClose={onClose}>
      <p>در فضای ویدیو، کلیپ‌ها را مدل ویدیوی Google روی پروژه‌ی Google Cloud خودت می‌سازد و پولش از حساب خودت کم می‌شود (قیمت هر کلیپ پیش از «شروع ساخت» نوشته می‌شود). برای باز شدنش این چهار کار را یک بار انجام بده:</p>
      <p className="problem" role="alert">{refusal.message}</p>
      {refusal.lock !== 'cloud' && (
        <ol className="check-list" aria-label="کارهای لازم">
          <li className={state(0)} aria-current={state(0) === 'missing' ? 'step' : undefined}>
            <span className="check-mark" aria-hidden="true">{state(0) === 'ok' ? '✓' : '۱'}</span>
            <span>ابزار خط فرمان Google Cloud (<bdi className="latin">Google Cloud CLI</bdi>) را نصب کن: <a href="https://cloud.google.com/sdk/docs/install" target="_blank" rel="noreferrer">صفحه‌ی نصب</a>.</span>
          </li>
          <li className={state(1)} aria-current={state(1) === 'missing' ? 'step' : undefined}>
            <span className="check-mark" aria-hidden="true">{state(1) === 'ok' ? '✓' : '۲'}</span>
            <span>در ترمینال بزن <code className="latin">gcloud auth login</code> و با حساب Google خودت وارد شو.</span>
          </li>
          <li className={state(2)} aria-current={state(2) === 'missing' ? 'step' : undefined}>
            <span className="check-mark" aria-hidden="true">{state(2) === 'ok' ? '✓' : '۳'}</span>
            <span>پروژه‌ی خودت را انتخاب کن: <code className="latin">gcloud config set project</code> و بعد شناسه‌ی پروژه‌ات.</span>
          </li>
          <li className={state(3)} aria-current={state(3) === 'missing' ? 'step' : undefined}>
            <span className="check-mark" aria-hidden="true">{state(3) === 'ok' ? '✓' : '۴'}</span>
            <span>در همان پروژه <bdi className="latin">Vertex AI</bdi> را روشن کن و صورت‌حساب (<bdi className="latin">Billing</bdi>) را فعال کن.</span>
          </li>
        </ol>
      )}
      <p className="muted small">بررسی رایگان است: هیچ کلیپی ساخته نمی‌شود. موشن بدون این‌ها کار می‌کند.</p>
      <div className="row-between">
        {refusal.lock !== 'cloud' && <SubmitButton busy={busy} failed onClick={onCheck}>{busy ? 'در حال بررسی…' : 'دوباره بررسی کن'}</SubmitButton>}
        <button type="button" className="btn" disabled={busy} onClick={onClose}>بستن</button>
      </div>
    </Modal>
  );
}

export function WorkspaceSwitch() {
  const { active, choose, videoLocked } = useWorkspace();
  const [problem, setProblem] = useState<string | null>(null);
  const [locked, setLocked] = useState<SwitchRefusal | null>(null);
  const [busy, setBusy] = useState(false);
  const pick = async (ws: Workspace) => {
    if (ws === active || busy) return;
    setProblem(null);
    setBusy(true);
    const r = await choose(ws);
    setBusy(false);
    if (r?.lock) { setLocked(r); return; }
    setLocked(null);
    if (r) setProblem(r.message);
  };
  return (
    <div className="ws-switch">
      <div className="seg ws-seg" role="group" aria-label="فضای کار: ساخت ویدیو، اتوماسیون و کتابخانه دنبالش می‌کنند" aria-busy={busy}>
        {SIDES.map((ws) => (
          <button key={ws} type="button" className={active === ws ? 'seg-on' : ''} aria-pressed={active === ws} onClick={() => void pick(ws)}>
            {WORKSPACE_FA[ws]}{ws === 'video' && videoLocked && <span className="sr-only"> (بسته؛ اول باید Google Cloud را آماده کنی)</span>}
          </button>
        ))}
      </div>
      {problem && <p className="problem small" role="alert">{problem}</p>}
      {locked && <VideoLock refusal={locked} busy={busy} onCheck={() => void pick('video')} onClose={() => setLocked(null)} />}
    </div>
  );
}
