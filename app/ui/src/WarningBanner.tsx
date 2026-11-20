// Responsibility: the two warning banners of docs/08, for the active brand (Phase 8: each brand has its own automation) and the active workspace's calendar (Phase 11.8): «automation is off but days are planned» on every screen, and «the topics are running out» on the Automation screen.
import type { Warnings } from './api';
import { useBrand } from './brand';
import { toJalali, ymdOf } from '../../calendar/jalali';
import { faNum } from './fa';
import { usePoll } from './hooks';
import { useWorkspace } from './workspace';

const jalaliText = (iso: string): string => {
  const j = toJalali(ymdOf(iso));
  return faNum(`${j.y}/${String(j.m).padStart(2, '0')}/${String(j.d).padStart(2, '0')}`);
};

/** The active brand's warnings for the calendar of the active workspace; nothing until the brand is known. */
function useWarnings() {
  const { active } = useBrand();
  const video = useWorkspace().active === 'video';
  return usePoll<Warnings>(active ? `/api/warnings?brand=${encodeURIComponent(active.slug)}${video ? '&workspace=video' : ''}` : null, 15000);
}

export function AutomationOffBanner({ onAutomation }: { onAutomation: boolean }) {
  const { data } = useWarnings();
  const { active } = useBrand();
  const video = useWorkspace().active === 'video';
  const off = data?.automation_off;
  if (!off) return null;
  return (
    <div className="problem warn-banner" role="status">
      <span>اتوماسیون {video ? 'ویدیوی ' : ''}برند «{active?.name}» خاموش است ولی {faNum(off.planned)} روز موضوع دارد؛ تا روشنش نکنی چیزی ساخته نمی‌شود.</span>
      {!onAutomation && <a className="btn" href="#/automation">رفتن به اتوماسیون</a>}
    </div>
  );
}

export function TopicsLowBanner() {
  const { data } = useWarnings();
  const cal = useWorkspace().active === 'video' ? 'تقویم ویدیو' : 'تقویم';
  const low = data?.topics_low;
  if (!low) return null;
  return (
    <div className="problem warn-banner" role="status">
      {low.last_date ? `موضوعات ${cal} تا ${jalaliText(low.last_date)} تمام می‌شود؛ موضوع تازه اضافه کن.` : `موضوعی در ${cal} نمانده؛ موضوع تازه اضافه کن.`}
    </div>
  );
}
