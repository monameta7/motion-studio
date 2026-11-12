// Responsibility: a labelled form field whose label is tied to the control by id, so the control's accessible name is only the label (not the text typed in it).
import { useId, type ReactNode } from 'react';

export function Field({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="inline-field">
      <label htmlFor={id}>{label}</label>
      {children(id)}
    </div>
  );
}
