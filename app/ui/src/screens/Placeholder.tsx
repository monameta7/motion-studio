// Responsibility: a stand-in for a screen that a later Phase 4 task builds, so the frame and navigation can be checked first.
export function Placeholder({ title }: { title: string }) {
  return (
    <div className="stack">
      <div className="page-head"><h1>{title}</h1></div>
      <div className="card"><p className="muted">این صفحه در کارهای بعدی فاز ۴ ساخته می‌شود.</p></div>
    </div>
  );
}
