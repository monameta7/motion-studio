// Responsibility: the tour engine (Phase 10, no library): a spotlight on one element of the screen and a bubble beside it, right to left, keyboard-only friendly, with «بعدی / قبلی / رد کردن», progress dots and no movement under reduced motion.
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { faNum } from '../fa';
import type { TourStep } from './tours';


interface Box { top: number; left: number; width: number; height: number }

const GAP = 12;
const EDGE = 16;
/** A target that appears a little later (a list still loading) is waited for this long before the bubble goes to the middle. */
const WAIT_MS = 1200;

const reducedMotion = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The element of a step when it is really on the screen (not hidden, not zero-sized). */
function find(selector: string | undefined): HTMLElement | null {
  if (!selector) return null;
  const el = document.querySelector<HTMLElement>(selector);
  if (!el || el.getClientRects().length === 0) return null;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? el : null;
}

const boxOf = (el: HTMLElement): Box => {
  const r = el.getBoundingClientRect();
  const pad = 6;
  return { top: r.top - pad, left: r.left - pad, width: r.width + pad * 2, height: r.height + pad * 2 };
};

/** Where the bubble goes: under the spot when it fits, else above it, else over the bottom of the screen; its right edge follows the spot's (RTL). */
function place(spot: Box | null, bubble: { width: number; height: number }): { top: number; left: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const clampX = (x: number) => Math.max(EDGE, Math.min(x, vw - EDGE - bubble.width));
  const clampY = (y: number) => Math.max(EDGE, Math.min(y, vh - EDGE - bubble.height));
  if (!spot) return { top: clampY((vh - bubble.height) / 2), left: clampX((vw - bubble.width) / 2) };
  const left = clampX(spot.left + spot.width - bubble.width);
  const below = spot.top + spot.height + GAP;
  if (below + bubble.height <= vh - EDGE) return { top: below, left };
  const above = spot.top - GAP - bubble.height;
  if (above >= EDGE) return { top: above, left };
  // Neither fits (a tall element or a small phone): the bubble covers the half of the screen the spot uses less.
  const spotMid = spot.top + spot.height / 2;
  return { top: spotMid > vh / 2 ? EDGE : vh - EDGE - bubble.height, left };
}

export function Tour({ steps: all, label, onEnd }: { steps: TourStep[]; label: string; onEnd: (state: 'done' | 'skipped') => void }) {
  const [steps] = useState(() => { const s = all.filter((x) => !x.optional || find(x.target)); return s.length ? s : all.slice(0, 1); });
  const [i, setI] = useState(0);
  const [spot, setSpot] = useState<Box | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const primary = useRef<HTMLButtonElement>(null);
  const target = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const bodyId = useId();
  const step = steps[i]!;
  const last = i === steps.length - 1;

  const next = useCallback(() => { if (last) onEnd('done'); else setI((n) => n + 1); }, [last, onEnd]);
  const back = useCallback(() => setI((n) => Math.max(0, n - 1)), []);
  const skip = useCallback(() => onEnd('skipped'), [onEnd]);

  // The rest of the page cannot be reached while the tour is open (focus, clicks, screen readers); the old focus comes back after it.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const root = document.getElementById('root');
    root?.setAttribute('inert', '');
    return () => { root?.removeAttribute('inert'); before?.focus?.(); };
  }, []);

  // Each step: find its element (waiting a little for one still loading), bring it into view, then light it up.
  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();
    const seek = () => {
      if (cancelled) return;
      const el = find(step.target);
      // While waiting for an element still loading, nothing stays lit: the previous step's spot would point at the wrong thing.
      if (!el && step.target && Date.now() - startedAt < WAIT_MS) { setSpot(null); setTimeout(seek, 100); return; }
      target.current = el;
      if (el) el.scrollIntoView({ block: 'start', inline: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
      // The element goes to the top of the screen (16 px gap, styles.css) so the bubble fits under it; after a smooth scroll the box is read again on every scroll event.
      setSpot(el ? boxOf(el) : null);
    };
    seek();
    return () => { cancelled = true; };
  }, [step.target, i]);

  // The spot and the bubble follow scrolling and resizing (375 px phone or a wide screen).
  useEffect(() => {
    const again = () => setSpot(target.current && target.current.isConnected ? boxOf(target.current) : null);
    window.addEventListener('scroll', again, true);
    window.addEventListener('resize', again);
    return () => { window.removeEventListener('scroll', again, true); window.removeEventListener('resize', again); };
  }, []);

  useLayoutEffect(() => {
    const b = bubble.current;
    if (!b) return;
    setPos(place(spot, { width: b.offsetWidth, height: b.offsetHeight }));
  }, [spot, i]);

  // Focus goes to «بعدی» once the bubble is placed (a hidden element cannot take focus).
  const placed = pos !== null;
  useEffect(() => { if (placed) primary.current?.focus({ preventScroll: true }); }, [i, placed]);

  // Keys, wherever focus is: Esc skips; in a right-to-left screen ← goes forward and → goes back; Tab stays inside the bubble.
  useEffect(() => {
    const on = (e: KeyboardEvent) => onKey(e);
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  });
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); skip(); return; }
    if (e.key === 'ArrowLeft') { e.preventDefault(); next(); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); back(); return; }
    if (e.key !== 'Tab' || !bubble.current) return;
    const items = [...bubble.current.querySelectorAll<HTMLElement>('button:not([disabled])')];
    if (items.length === 0) return;
    const first = items[0]!;
    const end = items[items.length - 1]!;
    const inside = bubble.current.contains(document.activeElement);
    if (!inside) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); end.focus(); }
    else if (!e.shiftKey && document.activeElement === end) { e.preventDefault(); first.focus(); }
  };

  return createPortal(
    <div className="tour-layer" dir="rtl">
      {spot ? <div className="tour-spot" style={{ top: spot.top, left: spot.left, width: spot.width, height: spot.height }} aria-hidden="true" />
        : <div className="tour-dim" aria-hidden="true" />}
      <div
        ref={bubble} className="tour-bubble" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={bodyId}
        style={pos ? { top: pos.top, left: pos.left } : { visibility: 'hidden', top: 0, left: 0 }}
      >
        <p className="tour-count small">{label} · قدم {faNum(i + 1)} از {faNum(steps.length)}</p>
        <h2 id={titleId}>{step.title}</h2>
        <p id={bodyId}>{step.body}</p>
        <ol className="tour-dots" aria-hidden="true">{steps.map((s, n) => <li key={s.title} className={n === i ? 'on' : n < i ? 'seen' : ''} />)}</ol>
        <div className="tour-actions">
          <button ref={primary} type="button" className="btn primary" onClick={next}>{last ? 'تمام' : 'بعدی'}</button>
          {i > 0 && <button type="button" className="btn" onClick={back}>قبلی</button>}
          <button type="button" className="btn link tour-skip" onClick={skip}>رد کردن</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
