-- Responsibility: schema version 3: the bell list of notifications (docs/09); `dedupe` keeps one row per event (a job outcome, a quota window, a day).

CREATE TABLE notifications (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  at      TEXT NOT NULL,
  kind    TEXT NOT NULL,
  text    TEXT NOT NULL,
  route   TEXT NOT NULL,
  read    INTEGER NOT NULL DEFAULT 0,
  dedupe  TEXT UNIQUE
);
