// Responsibility: the guide around the screens (Phase 10): which screen's tour is current, opening it once by itself (D76 a) or from «؟», saving its progress, the «؟» panel with the short explanation and glossary (and the video words and prices on the video screens, Phase 11.9), and the first-time tip card.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { GuideProgress, TipId, TourId } from '../../../contracts/guide';
import { api } from '../api';
import { Modal } from '../Modal';
import { Tour } from './Tour';
import { DEFAULT_MONEY, fillMoney, GLOSSARY, TIPS, TOURS, VIDEO_GLOSSARY, VIDEO_TOURS, type GuideMoney, type TourStep } from './tours';

interface GuideApi {
  progress: GuideProgress | null;
  current: TourId | null;
  setCurrent: (id: TourId | null) => void;
  start: (id: TourId) => void;
  tipSeen: (id: TipId) => boolean;
  markTip: (id: TipId) => void;
  reset: () => Promise<void>;
  /** The video guide's prices from the app's own config (D92, D108). */
  money: GuideMoney;
}

const Ctx = createContext<GuideApi | null>(null);

/** Time for a screen to draw its first data before its own tour opens by itself. */
const AUTO_DELAY_MS = 500;

export function GuideProvider({ children }: { children: ReactNode }) {
  const [progress, setProgress] = useState<GuideProgress | null>(null);
  const [current, setCurrent] = useState<TourId | null>(null);
  const [open, setOpen] = useState<TourId | null>(null);
  // An unreachable server never blocks the screens: the guide then stays closed.
  useEffect(() => { api.get<GuideProgress>('/api/guide').then(setProgress, () => setProgress(null)); }, []);
  // The numbers the video guide quotes come from config, so the guide says what Settings and New video say.
  const [money, setMoney] = useState<GuideMoney>(DEFAULT_MONEY);
  useEffect(() => {
    api.get<{ video?: Partial<GuideMoney> }>('/api/workspace').then((r) => setMoney((m) => ({ ...m, ...r.video })), () => undefined);
  }, []);

  // The current screen's tour opens by itself once, while nothing else of the guide is open.
  useEffect(() => {
    if (!progress || !current || open || progress.tours[current]) return;
    // Phase 11.9: not over the open phone drawer (the page behind it is inert); it opens once the drawer is closed.
    const t = setInterval(() => { if (document.getElementById('main')?.hasAttribute('inert')) return; clearInterval(t); setOpen(current); }, AUTO_DELAY_MS);
    return () => clearInterval(t);
  }, [progress, current, open]);

  const end = useCallback((state: 'done' | 'skipped') => {
    const id = open;
    setOpen(null);
    if (!id) return;
    setProgress((p) => (p ? { ...p, tours: { ...p.tours, [id]: state } } : p));
    api.post<GuideProgress>('/api/guide/tour', { id, state }).then(setProgress, () => undefined);
  }, [open]);

  const value: GuideApi = {
    progress, current, setCurrent,
    start: (id) => setOpen(id),
    tipSeen: (id) => progress?.tips[id] === true,
    markTip: (id) => {
      setProgress((p) => (p ? { ...p, tips: { ...p.tips, [id]: true } } : p));
      api.post<GuideProgress>('/api/guide/tip', { id }).then(setProgress, () => undefined);
    },
    reset: async () => { setProgress(await api.post<GuideProgress>('/api/guide/reset')); },
    money,
  };
  const filled = (steps: TourStep[]): TourStep[] => steps.map((s) => ({ ...s, title: fillMoney(s.title, money), body: fillMoney(s.body, money) }));

  return (
    <Ctx.Provider value={value}>
      {children}
      {open && <Tour key={open} steps={filled(TOURS[open].steps)} label={`راهنمای ${TOURS[open].name}`} onEnd={end} />}
    </Ctx.Provider>
  );
}

export function useGuide(): GuideApi | null { return useContext(Ctx); }

/** A screen names its tour; it opens by itself the first time and «؟» reopens it. */
export function useScreenTour(id: TourId) {
  const g = useGuide();
  const set = g?.setCurrent;
  useEffect(() => { set?.(id); return () => set?.(null); }, [id, set]);
}

/** «؟» in the screen's header: the short explanation, the step-by-step tour again, and the glossary. */
export function HelpButton() {
  const g = useGuide();
  const [shown, setShown] = useState(false);
  if (!g?.current) return null;
  const s = TOURS[g.current];
  const words = VIDEO_TOURS.has(g.current) ? [...VIDEO_GLOSSARY, ...GLOSSARY] : GLOSSARY;
  return (
    <>
      <button type="button" className="help-btn" aria-label={`راهنمای ${s.name}`} title="راهنما" onClick={() => setShown(true)}>؟</button>
      {shown && (
        <Modal title={`راهنمای ${s.name}`} onClose={() => setShown(false)}>
          <p>{fillMoney(s.about, g.money)}</p>
          <div className="actions">
            <button type="button" className="btn primary" onClick={() => { setShown(false); g.start(g.current!); }}>دیدن راهنمای قدم‌به‌قدم</button>
            <button type="button" className="btn" onClick={() => setShown(false)}>بستن</button>
          </div>
          <details className="glossary">
            <summary>واژه‌نامه</summary>
            <dl>{words.map((w) => <div key={w.word}><dt>{w.word}</dt><dd>{fillMoney(w.text, g.money)}</dd></div>)}</dl>
          </details>
        </Modal>
      )}
    </>
  );
}

/** A first-time tip: shown while `when` is true and the tip was never closed; «فهمیدم» closes it for good. */
export function FirstTip({ id, when, link }: { id: TipId; when: boolean; link?: { href: string; label: string } }) {
  const g = useGuide();
  if (!g?.progress || !when || g.tipSeen(id)) return null;
  const t = TIPS[id];
  return (
    <section className="first-tip" role="status" aria-labelledby={`tip-${id}`}>
      <div className="stack-sm">
        <h2 id={`tip-${id}`}>{t.title}</h2>
        <p>{t.text}</p>
      </div>
      <div className="actions">
        {link && <a className="btn" href={link.href}>{link.label}</a>}
        <button type="button" className="btn primary" onClick={() => g.markTip(id)}>فهمیدم</button>
      </div>
    </section>
  );
}
