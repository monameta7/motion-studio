-- Responsibility: schema version 1 of data/studio.db (jobs, calendar, settings, usage, references, ratings, the one-job lock); later changes go in migrations/NNN_*.sql.

CREATE TABLE jobs (
  id            TEXT PRIMARY KEY,               -- JobRequest.id (uuid)
  slug          TEXT NOT NULL UNIQUE,
  topic         TEXT NOT NULL,
  format        TEXT NOT NULL CHECK (format IN ('9x16', '16x9')),
  source        TEXT NOT NULL CHECK (source IN ('manual', 'schedule')),
  status        TEXT NOT NULL,
  stage         TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  request_json  TEXT NOT NULL
);
CREATE INDEX jobs_status ON jobs (status);

CREATE TABLE calendar (
  id              TEXT PRIMARY KEY,
  date            TEXT NOT NULL,                 -- Gregorian ISO date; the UI shows Jalali
  topic           TEXT NOT NULL,
  note            TEXT,
  style_override  TEXT,
  format          TEXT,
  status          TEXT NOT NULL,
  job_id          TEXT REFERENCES jobs (id)
);
CREATE INDEX calendar_date ON calendar (date);

CREATE TABLE settings (
  key         TEXT PRIMARY KEY,
  value_json  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE usage (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id       TEXT REFERENCES jobs (id),
  stage        TEXT NOT NULL,
  at           TEXT NOT NULL,
  model        TEXT,
  tokens_in    INTEGER NOT NULL DEFAULT 0,
  tokens_out   INTEGER NOT NULL DEFAULT 0,
  cache_read   INTEGER NOT NULL DEFAULT 0,
  cache_write  INTEGER NOT NULL DEFAULT 0,
  cost_usd_est REAL NOT NULL DEFAULT 0
);
CREATE INDEX usage_at ON usage (at);

CREATE TABLE "references" (
  slug            TEXT PRIMARY KEY,
  meta_json       TEXT NOT NULL,
  reading_sha256  TEXT,
  updated_at      TEXT NOT NULL
);

CREATE TABLE ratings (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id  TEXT NOT NULL REFERENCES jobs (id),
  item    TEXT NOT NULL CHECK (item IN ('hook', 'visual', 'brand', 'sync', 'sound', 'voice', 'cover')),
  score   INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
  note    TEXT,
  at      TEXT NOT NULL
);

-- Global one-job lock (docs/02 §7): at most one row.
CREATE TABLE job_lock (
  id           INTEGER PRIMARY KEY CHECK (id = 1),
  job_slug     TEXT NOT NULL,
  pid          INTEGER NOT NULL,
  acquired_at  TEXT NOT NULL
);
