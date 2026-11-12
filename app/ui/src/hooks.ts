// Responsibility: small React hooks shared by the screens: polling a GET endpoint and following the hash route.
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type RefCard } from './api';

/** GETs `url` now and every `everyMs`; `reload` fetches at once. Keeps the last good data while a later fetch fails. */
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
    const t = setInterval(() => void reload(), everyMs);
    return () => clearInterval(t);
  }, [reload, everyMs]);
  return { data, error, reload };
}

/** Maps a reference slug to its Persian name (the slug until the library loads). */
export function useRefName(): (slug: string) => string {
  const { data } = usePoll<{ references: RefCard[] }>('/api/references', 0);
  return (slug) => data?.references.find((r) => r.slug === slug)?.name_fa ?? slug;
}

/** The part after `#`, e.g. `/jobs/<slug>`; `/new` when empty. */
export function useRoute(): string {
  const read = () => window.location.hash.replace(/^#/, '') || '/new';
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => setRoute(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
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
