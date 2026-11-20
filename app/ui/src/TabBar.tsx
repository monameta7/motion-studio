// Responsibility: the phone's bottom bar (Phase 12, under 900 px): the four screens used most and «بیشتر», which opens the sidebar as a drawer with everything else.
import type { Ref } from 'react';
import { faNum } from './fa';
import { Icon, type IconName } from './Icons';

const TABS: { route: string; label: string; icon: IconName; count?: boolean }[] = [
  { route: '/new', label: 'ساخت', icon: 'make' },
  { route: '/progress', label: 'در حال ساخت', count: true, icon: 'clock' },
  { route: '/archive', label: 'بایگانی', icon: 'archive' },
  { route: '/automation', label: 'اتوماسیون', icon: 'calendar' },
];

export function TabBar({ route, active, open, onMore, moreRef }: { route: string; active: number; open: boolean; onMore: () => void; moreRef: Ref<HTMLButtonElement> }) {
  const current = (r: string) => route === r || (r === '/progress' && route.startsWith('/jobs/'));
  const inDrawer = !TABS.some((t) => current(t.route));
  return (
    <nav className="tabbar" aria-label="منوی پایین">
      {TABS.map((t) => (
        <a key={t.route} href={`#${t.route}`} aria-current={current(t.route) ? 'page' : undefined}>
          <Icon name={t.icon} /><span>{t.label}</span>
          {t.count && active > 0 && <span className="count" aria-label={`${faNum(active)} کار`}>{faNum(active)}</span>}
        </a>
      ))}
      <button type="button" ref={moreRef} aria-expanded={open} aria-controls="side-menu" aria-current={inDrawer && !open ? 'page' : undefined} onClick={onMore}>
        <Icon name="menu" /><span>بیشتر</span>
      </button>
    </nav>
  );
}
