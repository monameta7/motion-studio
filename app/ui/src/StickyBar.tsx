// Responsibility: a bar that sticks to the bottom of the screen (New video's summary, «برند من»'s save bar) and gets a soft shadow only while page content is under it (Phase 12).
import { useEffect, useRef, type ReactNode } from 'react';

export function StickyBar({ tag: Tag = 'div', className, children, ...rest }: { tag?: 'div' | 'footer'; className: string; children: ReactNode; role?: string; 'aria-label'?: string }) {
  const bar = useRef<HTMLElement>(null);
  const mark = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = bar.current; const m = mark.current;
    if (!el || !m || typeof IntersectionObserver !== 'function') return;
    // The mark sits right after the bar: while it is below the visible area (or behind the phone's bottom bar), the bar floats over content.
    const tabbar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tabbar-h')) || 0;
    const io = new IntersectionObserver(([e]) => el.classList.toggle('stuck', !e!.isIntersecting), { rootMargin: `0px 0px -${tabbar + 4}px 0px` });
    io.observe(m);
    return () => io.disconnect();
  }, []);
  return (
    <>
      <Tag ref={bar as never} className={className} {...rest}>{children}</Tag>
      <span ref={mark} className="stuck-mark" aria-hidden="true" />
    </>
  );
}
