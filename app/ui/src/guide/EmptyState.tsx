// Responsibility: a guided empty state (Phase 10): a small picture from the app's icon set (Phase 12), one plain sentence of what goes here and one button or link that does the first step.
import type { ReactNode } from 'react';
import { Icon, type IconName } from '../Icons';

export function EmptyState({ text, action, icon = 'spark' }: { text: ReactNode; action: { label: string; onClick?: () => void; href?: string }; icon?: IconName }) {
  return (
    <div className="empty-state">
      <span className="empty-art"><Icon name={icon} /></span>
      <p>{text}</p>
      {action.href
        ? <a className="btn primary" href={action.href}>{action.label}</a>
        : <button type="button" className="btn primary" onClick={action.onClick}>{action.label}</button>}
    </div>
  );
}
