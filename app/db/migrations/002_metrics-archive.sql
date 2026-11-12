-- Responsibility: schema version 2: per-stage run metrics (docs/03 Metrics) and the delivered manifest on the job row (archive, docs/03 S7).

CREATE TABLE stage_runs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  job_slug    TEXT NOT NULL,
  stage       TEXT NOT NULL,
  attempt     INTEGER NOT NULL,
  status      TEXT NOT NULL,
  started_at  TEXT NOT NULL,
  ended_at    TEXT NOT NULL,
  minutes     REAL NOT NULL
);
CREATE INDEX stage_runs_job ON stage_runs (job_slug);

ALTER TABLE jobs ADD COLUMN manifest_json TEXT;
