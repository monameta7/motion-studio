# Migrations

`../schema.sql` is version 1. Every later change is one file here named `NNN_short-name.sql` (`002_…`, `003_…`), applied once, in order, inside a transaction by `app/db/db.ts`. The applied version is stored in `PRAGMA user_version`. Never edit a migration that has already shipped; add a new one.

Before any migration runs on an existing database file, `openDb` writes a full, consistent copy next to it: `data/backups/studio-v<from>-before-v<to>-<time>.db` (`VACUUM INTO`; git-ignored; logged). A new database gets no copy.
