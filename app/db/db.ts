// Responsibility: open data/studio.db and bring it to the latest schema version (schema.sql = v1, then migrations/NNN_*.sql in order), copying an existing database before any migration changes it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

export type Db = Database.Database;

const HERE = path.dirname(fileURLToPath(import.meta.url));

export interface Migration { version: number; name: string; sql: string }

export function listMigrations(dir: string = HERE): Migration[] {
  const out: Migration[] = [{ version: 1, name: 'schema.sql', sql: fs.readFileSync(path.join(dir, 'schema.sql'), 'utf8') }];
  const mdir = path.join(dir, 'migrations');
  const files = fs.existsSync(mdir) ? fs.readdirSync(mdir).filter((f) => /^\d{3}_.+\.sql$/.test(f)).sort() : [];
  for (const f of files) {
    const version = Number(f.slice(0, 3));
    if (version !== out.length + 1) throw new Error(`migration ${f}: expected number ${String(out.length + 1).padStart(3, '0')}`);
    out.push({ version, name: f, sql: fs.readFileSync(path.join(mdir, f), 'utf8') });
  }
  return out;
}

/** Where a database file's copies go before a migration changes it (next to the file, git-ignored). */
export const backupDirFor = (file: string): string => path.join(path.dirname(file), 'backups');

/**
 * Brings the database to the latest version. With `backup`, an existing database (version ≥ 1) that has migrations pending is first
 * copied whole and consistently (`VACUUM INTO`, safe while another process has it open) into `backup.dir`: no migration ever runs on
 * the owner's data without a copy (Phase 8 rule), whoever starts the new code (the server, the CLI, a logon start).
 */
export function migrate(db: Db, migrations: Migration[] = listMigrations(), backup?: { dir: string; log?: (line: string) => void }): number {
  const current = db.pragma('user_version', { simple: true }) as number;
  const pending = migrations.filter((x) => x.version > current);
  if (backup && current >= 1 && pending.length) {
    fs.mkdirSync(backup.dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const copy = path.join(backup.dir, `studio-v${current}-before-v${pending.at(-1)!.version}-${stamp}.db`);
    db.exec(`VACUUM INTO '${copy.replace(/'/g, "''")}'`);
    backup.log?.(`database backup before migration v${current} → v${pending.at(-1)!.version}: ${copy}`);
  }
  for (const m of pending) {
    db.transaction(() => {
      db.exec(m.sql);
      db.pragma(`user_version = ${m.version}`);
    })();
  }
  return db.pragma('user_version', { simple: true }) as number;
}

export function openDb(file: string): Db {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  migrate(db, listMigrations(), file === ':memory:' ? undefined : { dir: backupDirFor(file), log: (line) => console.log(line) });
  return db;
}
