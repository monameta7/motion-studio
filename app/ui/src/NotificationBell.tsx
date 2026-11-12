// Responsibility: the bell of the sidebar and the small in-app message (docs/09): the unread count, the list of the latest events (clicking one opens its screen), and a message that shows for a few seconds when a new event arrives while the page is open.
import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { faAgo, faNum } from './fa';
import { go, usePoll } from './hooks';

export interface Notice { id: number; at: string; kind: string; text: string; route: string; read: boolean }
interface Feed { items: Notice[]; unread: number; sound: boolean }

const SHOW_MS = 8000;

export function NotificationBell() {
  const { data, reload } = usePoll<Feed>('/api/notifications', 5000);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<Notice | null>(null);
  const seen = useRef<number | null>(null);

  // The first answer only sets the starting point; after that, a newer event is shown once as a message.
  useEffect(() => {
    if (!data) return;
    const top = data.items[0]?.id ?? 0;
    if (seen.current === null) { seen.current = top; return; }
    const fresh = data.items.find((n) => n.id > seen.current! && !n.read);
    seen.current = Math.max(seen.current, top);
    if (fresh) setToast(fresh);
  }, [data]);
  // Going to another screen closes the list.
  useEffect(() => { const close = () => setOpen(false); window.addEventListener('hashchange', close); return () => window.removeEventListener('hashchange', close); }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), SHOW_MS); return () => clearTimeout(t); }, [toast]);

  const visit = async (n: Notice) => {
    setOpen(false); setToast(null);
    await api.post('/api/notifications/read', { ids: [n.id] }).catch(() => undefined);
    void reload();
    go(n.route);
  };
  const readAll = async () => { await api.post('/api/notifications/read', {}).catch(() => undefined); void reload(); };
  const unread = data?.unread ?? 0;

  return (
    <>
      <button type="button" className="bell" aria-expanded={open} aria-controls="bell-panel" onClick={() => setOpen(!open)}>
        <span>اعلان‌ها</span>
        {unread > 0 && <span className="count" aria-label={`${faNum(unread)} اعلان خوانده‌نشده`}>{faNum(unread)}</span>}
      </button>

      {open && (
        <section id="bell-panel" className="bell-panel" aria-label="اعلان‌ها">
          {data && data.items.length > 0 ? (
            <>
              <ul>
                {data.items.map((n) => (
                  <li key={n.id}>
                    <button type="button" className={n.read ? '' : 'unread'} onClick={() => void visit(n)}>
                      <span>{n.text}</span>
                      <small className="muted">{faAgo((Date.now() - Date.parse(n.at)) / 60000)}</small>
                    </button>
                  </li>
                ))}
              </ul>
              {unread > 0 && <button type="button" className="btn link" onClick={() => void readAll()}>همه خوانده شد</button>}
            </>
          ) : <p className="muted">هنوز اعلانی نیست.</p>}
        </section>
      )}

      {toast && (
        <div className="inapp-toast" role="status">
          <span>{toast.text}</span>
          <button type="button" className="btn link" onClick={() => void visit(toast)}>باز کردن</button>
          <button type="button" className="x" aria-label="بستن" onClick={() => setToast(null)}>×</button>
        </div>
      )}
    </>
  );
}
