// Responsibility: small React hooks shared by the screens: polling a GET endpoint (only while the page is shown), following the hash route (soft screen change, scroll kept per screen), and revealing list items as they come into view.
import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { api, ApiError, type RefCard } from './api';

export const reducedMotion = (): boolean => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** GETs `url` now and every `everyMs`; `reload` fetches at once. Keeps the last good data while a later fetch fails. A hidden tab does not ask; it asks once when it is shown again (Phase 12). */
export function usePoll<T>(url: string | null, everyMs: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    if (!url) return;
    try { setData(await api.get<T>(url)); setError(null); } catch (e) { setError(e instanceof ApiError ? e.message : String(e)); }
  }, [url]);
  useEffect(() => {
    void reload();
    if (!everyMs) return;
    const ask = () => { if (document.visibilityState !== 'hidden') void reload(); };
    const t = setInterval(ask, everyMs);
    document.addEventListener('visibilitychange', ask);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', ask); };
  }, [reload, everyMs]);
  return { data, error, reload };
}

/** Maps a reference slug to its Persian name (the slug until the library loads). */
export function useRefName(): (slug: string) => string {
  const { data } = usePoll<{ references: RefCard[] }>('/api/references', 0);
  return (slug) => data?.references.find((r) => r.slug === slug)?.name_fa ?? slug;
}

/** Where each screen was scrolled to when it was left, for this visit. */
const scrollAt = new Map<string, number>();

/**
 * The children of the returned element fade in once, each when it first comes into view (styles: .reveal-ready).
 * `count` is the number of children, so items added later are watched too. Without IntersectionObserver nothing is hidden.
 */
export function useReveal<T extends HTMLElement>(count: number) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const box = ref.current;
    if (!box || typeof IntersectionObserver !== 'function') return;
    box.classList.add('reveal-ready');
    const io = new IntersectionObserver((seen) => { for (const e of seen) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }, { rootMargin: '0px 0px -4% 0px' });
    for (const c of box.children) if (!c.classList.contains('in')) io.observe(c);
    return () => io.disconnect();
  }, [count]);
  return ref;
}

/** The part after `#`, e.g. `/jobs/<slug>`; `/new` when empty. */
export function useRoute(): string {
  const read = () => window.location.hash.replace(/^#/, '') || '/new';
  const [route, setRoute] = useState(read);
  useEffect(() => {
    // Phase 12: a new screen starts at its top; «back» and «forward» return to where that screen was left. The main column cross-fades (View Transitions API) unless motion is reduced.
    try { window.history.scrollRestoration = 'manual'; } catch { /* an old browser keeps its own way */ }
    let current = read();
    let traverse = false;
    const nav = (window as unknown as { navigation?: EventTarget }).navigation;
    const onNav = (e: Event) => { traverse = (e as Event & { navigationType?: string }).navigationType === 'traverse'; };
    nav?.addEventListener('navigate', onNav);
    const on = () => {
      const next = read();
      if (next === current) return;
      scrollAt.set(current, window.scrollY);
      const top = traverse ? scrollAt.get(next) ?? 0 : 0;
      traverse = false;
      current = next;
      const apply = () => { flushSync(() => setRoute(next)); window.scrollTo(0, top); };
      const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
      if (typeof doc.startViewTransition === 'function' && !reducedMotion()) doc.startViewTransition(apply); else apply();
      // The screen's data may arrive a moment later and make the page tall enough.
      if (top > 0) setTimeout(() => { if (read() === next && window.scrollY < top) window.scrollTo(0, top); }, 400);
    };
    window.addEventListener('hashchange', on);
    return () => { window.removeEventListener('hashchange', on); nav?.removeEventListener('navigate', onNav); };
  }, []);
  return route;
}

export const go = (route: string) => { window.location.hash = route; };

/** The job detail, live: the server's SSE stream sends it on connect and after every change; a refresh reconnects and restores it. */
export function useJob(slug: string) {
  const [job, setJob] = useState<import('./api').JobDetail | null>(null);
  const [lost, setLost] = useState(false);
  useEffect(() => {
    setJob(null);
    const es = new EventSource(`/api/jobs/${slug}/events`);
    es.addEventListener('job', (e) => { setJob(JSON.parse((e as MessageEvent<string>).data)); setLost(false); });
    es.onerror = () => setLost(true);
    return () => es.close();
  }, [slug]);
  return { job, lost, setJob };
}
