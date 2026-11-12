// Responsibility: a guided empty state (Phase 10): one plain sentence of what goes here and one button or link that does the first step.
import type { ReactNode } from 'react';

export function EmptyState({ text, action }: { text: ReactNode; action: { label: string; onClick?: () => void; href?: string } }) {
  return (
    <div className="empty-state">
      <p>{text}</p>
      {action.href
        ? <a className="btn primary" href={action.href}>{action.label}</a>
        : <button type="button" className="btn primary" onClick={action.onClick}>{action.label}</button>}
    </div>
  );
}
