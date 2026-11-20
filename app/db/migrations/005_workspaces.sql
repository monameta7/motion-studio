-- Responsibility: schema version 5 (Phase 11.3, D88, two workspaces): every job and every calendar day belongs to one workspace (`motion` or `video`); everything made before is a motion job or a motion day.

ALTER TABLE jobs ADD COLUMN workspace TEXT;
ALTER TABLE calendar ADD COLUMN workspace TEXT;

UPDATE jobs SET workspace = 'motion' WHERE workspace IS NULL;
UPDATE calendar SET workspace = 'motion' WHERE workspace IS NULL;

CREATE INDEX jobs_workspace ON jobs (workspace);

-- As in 004: no column default, so a forgotten workspace is refused loudly instead of being labelled motion silently; an unknown name is refused too.
CREATE TRIGGER jobs_workspace_insert BEFORE INSERT ON jobs WHEN NEW.workspace IS NULL OR NEW.workspace NOT IN ('motion', 'video') BEGIN SELECT RAISE(ABORT, 'jobs.workspace is required (motion or video)'); END;
CREATE TRIGGER jobs_workspace_update BEFORE UPDATE OF workspace ON jobs WHEN NEW.workspace IS NULL OR NEW.workspace NOT IN ('motion', 'video') BEGIN SELECT RAISE(ABORT, 'jobs.workspace is required (motion or video)'); END;
CREATE TRIGGER calendar_workspace_insert BEFORE INSERT ON calendar WHEN NEW.workspace IS NULL OR NEW.workspace NOT IN ('motion', 'video') BEGIN SELECT RAISE(ABORT, 'calendar.workspace is required (motion or video)'); END;
CREATE TRIGGER calendar_workspace_update BEFORE UPDATE OF workspace ON calendar WHEN NEW.workspace IS NULL OR NEW.workspace NOT IN ('motion', 'video') BEGIN SELECT RAISE(ABORT, 'calendar.workspace is required (motion or video)'); END;
