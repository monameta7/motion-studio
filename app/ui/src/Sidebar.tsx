// Responsibility: the sidebar of every screen (docs/11 Sidebar): the brand switcher with the workspace switch under it, navigation with the in-progress count, the quota card and the system status card; on a phone it is the drawer that «بیشتر» opens.
import { useEffect, useRef } from 'react';
import type { JobSummary, Status } from './api';
import { BrandSwitcher } from './BrandSwitcher';
import { faAgo, faDateTime, faNum, faTime } from './fa';
import { usePoll } from './hooks';
import { ModelLevel } from './screens/ModelsCard';
import { NotificationBell } from './NotificationBell';
import { useWorkspace } from './workspace';
import { WorkspaceSwitch } from './WorkspaceSwitch';

/** Statuses that count as "در حال ساخت": everything not finished and not cancelled. */
export const ACTIVE: JobSummary['status'][] = ['queued', 'running', 'awaiting_approval', 'held', 'blocked', 'failed', 'paused_quota', 'interrupted'];

const NAV: { route: string; label: string; soon?: boolean; count?: boolean }[] = [
  { route: '/new', label: 'ساخت ویدیو' },
  { route: '/automation', label: 'اتوماسیون' },
  { route: '/progress', label: 'در حال ساخت', count: true },
  { route: '/archive', label: 'بایگانی ویدیوها' },
  { route: '/library', label: 'کتابخانه‌ی مرجع' },
  { route: '/brand', label: 'برند من' },
  { route: '/settings', label: 'تنظیمات' },
];

function Meter({ label, pct, limit }: { label: string; pct: number | null; limit: number }) {
  const v = pct === null ? null : Math.max(0, Math.min(100, pct));
  return (
    <div className="meter">
      <div className="meter-row"><span>{label}</span><b>{v === null ? '—' : `${faNum(Math.round(v))}٪`}</b></div>
      <div className={`bar${v !== null && v > limit ? ' over' : ''}`} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={v ?? undefined}>
        <i style={{ width: `${v ?? 0}%` }} />
      </div>
    </div>
  );
}

export function Sidebar({ route, jobs, open, onClose }: { route: string; jobs: JobSummary[]; open: boolean; onClose: () => void }) {
  // When the drawer opens it starts at its top and focus goes to its close button (shown on a phone only; last in the page order, first on the screen).
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (!open) return; const b = close.current; if (b?.parentElement) b.parentElement.scrollTop = 0; b?.focus({ preventScroll: true }); }, [open]);
  const { data: s } = usePoll<Status>('/api/status', 30000);
  const active = jobs.filter((j) => ACTIVE.includes(j.status)).length;
  const current = (r: string) => route === r || (r === '/brand' && route === '/brand/new') || (r === '/progress' && route.startsWith('/jobs/'));
  const q = s?.quota;
  // The library item follows the workspace switch (Phase 11.3): references for motion, visual styles for video.
  const { active: ws } = useWorkspace();
  const label = (n: (typeof NAV)[number]) => (n.route === '/library' && ws === 'video' ? 'کتابخانه‌ی سبک‌ها' : n.label);
  return (
    <aside className="sidebar" id="side-menu" aria-label="منوی اصلی">
      <BrandSwitcher />
      <WorkspaceSwitch />

      <NotificationBell />

      <nav className="nav">
        {NAV.map((n) => n.soon
          ? <span key={n.route} className="soon" aria-disabled="true">{label(n)}<small>به‌زودی</small></span>
          : (
            <a key={n.route} href={`#${n.route}`} aria-current={current(n.route) ? 'page' : undefined}>
              {label(n)}
              {n.count && active > 0 && <span className="count" aria-label={`${faNum(active)} کار`}>{faNum(active)}</span>}
            </a>
          ))}
      </nav>

      <section className="side-card" aria-labelledby="quota-h">
        <h2 id="quota-h">سهمیه‌ی Claude</h2>
        {q && q.ageMin !== null ? (
          <>
            <Meter label="پنج ساعت" pct={q.fiveHourPct} limit={q.max_5h_pct_to_start} />
            <Meter label="هفت روز" pct={q.sevenDayPct} limit={q.max_7d_pct_to_start} />
            {q.fiveHourResetsAt && <p className="muted">آزاد شدن: {faTime(q.fiveHourResetsAt)}</p>}
            <p className="muted">داده: {faAgo(q.ageMin)}{q.fresh ? '' : ' (کهنه)'}</p>
          </>
        ) : (
          <p className="muted">درصد سهمیه هنوز خوانده نشده؛ بعد از اولین کاری که Claude انجام بدهد، اینجا پیدا می‌شود.</p>
        )}
        {q && <div className="kv"><span className="muted">مصرف اپ در ۵ ساعت</span><b>{faNum(q.app_tokens_5h.toLocaleString('en-US'))}</b></div>}
      </section>

      <section className="side-card" aria-labelledby="sys-h">
        <h2 id="sys-h">وضعیت سیستم</h2>
        <div className="kv"><span><i className={`dot${s?.claude.login_ok ? '' : ' off'}`} />Claude</span><b>{s ? <ModelLevel v={s.claude.build} /> : '…'}</b></div>
        {s && !s.claude.login_ok && <p className="muted">ورود اشتراکی Claude پیدا نشد. <a href="#/settings">ورود در تنظیمات</a></p>}
        <div className="kv"><span><i className={`dot${s?.voice.up && s.voice.has_key ? '' : ' off'}`} />اپ صدا</span><b>{s ? (s.voice.up ? (s.voice.has_key ? s.voice.voice : 'بدون کلید') : 'خاموش') : '…'}</b></div>
        {s && !s.voice.key_set && <p className="muted">کلید Gemini وارد نشده؛ تا واردش نکنی صدا ساخته نمی‌شود. <a href="#/settings">وارد کردن کلید</a></p>}
        {s && s.voice.key_set && !s.voice.up && <p className="muted">هنگام ساخت صدا خودکار روشن می‌شود.</p>}
        <div className="kv"><span className="muted">اجرای زمان‌بندی‌شده‌ی بعدی</span><b>{s?.next_run ? faDateTime(s.next_run.at) : '—'}</b></div>
        {s?.next_run && <p className="muted">برای برند «{s.next_run.brand_name}»</p>}
      </section>
      <button type="button" ref={close} className="drawer-close" onClick={onClose}>بستن منو</button>
    </aside>
  );
}
