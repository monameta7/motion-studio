// Responsibility: the small switch that picks a screen by the active workspace (the video placeholder pages are gone: the styles library came in 11.5, video automation in 11.8).
import type { ReactNode } from 'react';
import { useWorkspace } from '../workspace';

/** The motion screen or the video one, by the sidebar switch (Phase 11.3). */
export function ForWorkspace({ motion, video }: { motion: ReactNode; video: ReactNode }) {
  const { active } = useWorkspace();
  return <>{active === 'video' ? video : motion}</>;
}

