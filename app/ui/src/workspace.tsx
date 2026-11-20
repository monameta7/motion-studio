// Responsibility: the active workspace for every screen (D88, Phase 11.3): «موشن» or «ویدیو» from /api/workspace, whether the video side is still locked (Phase 11.9, D91), and switching it, shared through one React context.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError, type Workspace } from './api';

/** Why the switch refused: a Persian message, and for a locked video workspace the missing set-up step (D91). */
export interface SwitchRefusal { message: string; lock: 'cloud' | 'sdk' | 'signin' | 'project' | 'vertex' | null }

export interface WorkspaceState {
  /** The side of the switch that is on; motion until loaded. */
  active: Workspace;
  /** Makes `ws` the active workspace; resolves with why it was refused, or null when it worked. */
  choose: (ws: Workspace) => Promise<SwitchRefusal | null>;
  loaded: boolean;
  /** The video workspace opens only after its free Google Cloud check passed once (Phase 11.9). */
  videoLocked: boolean;
}

const WorkspaceContext = createContext<WorkspaceState>({ active: 'motion', choose: async () => null, loaded: false, videoLocked: false });

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<Workspace | null>(null);
  const [videoLocked, setVideoLocked] = useState(false);
  useEffect(() => {
    api.get<{ active: Workspace; video?: { locked?: boolean } }>('/api/workspace').then((r) => { setActive(r.active); setVideoLocked(r.video?.locked === true); }, () => setActive('motion'));
  }, []);
  const choose = useCallback(async (ws: Workspace): Promise<SwitchRefusal | null> => {
    // The switch moves at once (Phase 12); a refusal brings the old side back. A locked video side moves only after its check passed.
    let before: Workspace | null = null;
    const wait = ws === 'video' && videoLocked;
    if (!wait) setActive((cur) => { before = cur; return ws; });
    try {
      setActive((await api.put<{ active: Workspace }>('/api/workspace/active', { workspace: ws })).active);
      if (ws === 'video') setVideoLocked(false);
      return null;
    } catch (e) {
      if (!wait) setActive(before);
      const lock = e instanceof ApiError ? (e.body as { lock?: { step?: SwitchRefusal['lock'] } } | undefined)?.lock?.step ?? null : null;
      if (lock) setVideoLocked(true);
      return { message: e instanceof ApiError ? e.message : 'فضای کار عوض نشد؛ دوباره امتحان کن.', lock };
    }
  }, [videoLocked]);
  return <WorkspaceContext.Provider value={{ active: active ?? 'motion', choose, loaded: active !== null, videoLocked }}>{children}</WorkspaceContext.Provider>;
}

export const useWorkspace = (): WorkspaceState => useContext(WorkspaceContext);
