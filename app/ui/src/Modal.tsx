// Responsibility: one modal dialog frame (the browser's own <dialog>: focus stays inside, Esc closes) used by the upload, edit and confirm dialogs of the library.
import { useEffect, useId, useRef, type ReactNode } from 'react';

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => { ref.current?.showModal(); }, []);
  return (
    <dialog ref={ref} className="modal" aria-labelledby={id} onClose={onClose}>
      <div className="stack">
        <h2 id={id}>{title}</h2>
        {children}
      </div>
    </dialog>
  );
}

/** A yes/no question; «نه» and Esc both cancel. */
export function Confirm({ title, text, yes, busy, onYes, onNo }: { title: string; text: string; yes: string; busy?: boolean; onYes: () => void; onNo: () => void }) {
  return (
    <Modal title={title} onClose={onNo}>
      <p>{text}</p>
      <div className="row-between">
        <button type="button" className="btn primary" disabled={busy} onClick={onYes}>{busy ? 'کمی صبر کن…' : yes}</button>
        <button type="button" className="btn" disabled={busy} onClick={onNo}>نه، برگرد</button>
      </div>
    </Modal>
  );
}
