// Responsibility: the active workspace (D88, Phase 11.3): which side of the sidebar switch is on, kept in settings `active_workspace`; motion when nothing (or something unknown) is saved.
import type { Db } from './db/db.js';
import { settingsRepo } from './db/repositories.js';
import { workspace, type Workspace } from './contracts/index.js';

export const ACTIVE_WORKSPACE_KEY = 'active_workspace';

/** The workspace New video, Automation and the library item work in; a job already made keeps its own (request.json). */
export function activeWorkspace(db: Db): Workspace {
  const saved = workspace.safeParse(settingsRepo.get<unknown>(db, ACTIVE_WORKSPACE_KEY));
  return saved.success ? saved.data : 'motion';
}

export function setActiveWorkspace(db: Db, ws: Workspace): Workspace {
  settingsRepo.set(db, ACTIVE_WORKSPACE_KEY, workspace.parse(ws));
  return ws;
}
