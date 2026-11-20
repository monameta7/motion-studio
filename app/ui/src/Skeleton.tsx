// Responsibility: loading placeholders in the shape of what is coming (Phase 12), so a screen is never blank and nothing jumps when its data arrives.
/** A card with a title bar and `lines` grey lines; `block` adds one tall box (a picture, a table). */
export function SkeletonCard({ lines = 3, block = false, label = 'در حال بارگذاری…' }: { lines?: number; block?: boolean; label?: string }) {
  return (
    <div className="card stack-sm" role="status" aria-label={label}>
      <span className="skeleton sk-title" />
      {block && <span className="skeleton sk-block" />}
      {Array.from({ length: lines }, (_, i) => <span key={i} className="skeleton sk-line" style={{ width: `${92 - i * 14}%` }} />)}
    </div>
  );
}

/** `rows` grey rows of button height, for a list that is still loading. */
export function SkeletonRows({ rows = 3, label = 'در حال بارگذاری…' }: { rows?: number; label?: string }) {
  return (
    <div className="stack-sm" role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => <span key={i} className="skeleton sk-row" />)}
    </div>
  );
}
