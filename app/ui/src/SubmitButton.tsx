// Responsibility: a submit button that shows its work (Phase 12): its label, a spinner while the work runs, then a drawn tick for a moment when it has worked.
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';

const DONE_MS = 1600;

/** `busy`: the work is running. When `busy` ends and `failed` is not true, the tick shows for a moment. */
export function SubmitButton({ busy, failed, children, className = 'btn primary', disabled, ...rest }: { busy: boolean; failed?: boolean; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const [done, setDone] = useState(false);
  const was = useRef(false);
  useEffect(() => {
    if (was.current && !busy && !failed) {
      setDone(true);
      const t = setTimeout(() => setDone(false), DONE_MS);
      was.current = busy;
      return () => clearTimeout(t);
    }
    was.current = busy;
    return undefined;
  }, [busy, failed]);
  return (
    <button type="button" {...rest} className={className} disabled={disabled || busy} aria-busy={busy || undefined}>
      {busy ? <span className="btn-mark spin" aria-hidden="true" /> : done ? <span className="btn-mark check" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}
