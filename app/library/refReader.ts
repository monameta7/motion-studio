// Responsibility: read the owner's new references in the background, one at a time, never while a film job runs (docs/07 step 3); it holds the job lock while a read runs, so a film cannot start in the middle of one.
import type { RunOptions, RunResult } from '../ai/claudeRunner.js';
import type { LoadedConfig } from '../config.js';
import { ReferenceMeta, readJson } from '../contracts/index.js';
import type { Db } from '../db/db.js';
import { LockBusyError, lockRepo } from '../db/repositories.js';
import { StageError } from '../orchestrator/stages.js';
import { autoNameReference } from './autoName.js';
import { decodeStored, readLimits } from './ingest.js';
import { refPaths, type Tool } from '../stages/reference/index.js';

/** What the lock holder is called on screen while a read runs. */
export const READ_LOCK_NAME = 'تحلیل مرجع';

export interface ReadStatus { state: 'queued' | 'reading' | 'failed'; error_fa: string | null }

export interface RefReaderDeps {
  config: LoadedConfig;
  db: Db;
  tool: Tool;
  /** Runs one Claude read with the per-video time and budget limits. */
  run: (o: RunOptions, limits: { timeoutMs: number; budgetUsd: number }) => Promise<RunResult>;
  /** The small Claude call that names a reference (sonnet, low); only used for references enqueued with `autoName`. */
  nameRun: (o: RunOptions) => Promise<RunResult>;
  /** True while a film job runs or waits in the queue: reads wait for it. */
  filmBusy: () => boolean;
  pollMs?: number;
}

export class RefReader {
  private readonly queue: string[] = [];
  private readonly failed = new Map<string, string>();
  /** References that get a name, use and group after their read. */
  private readonly naming = new Set<string>();
  private current: { slug: string; ctrl: AbortController } | null = null;
  private idle: Promise<void> = Promise.resolve();
  private release: (() => void) | null = null;
  private stopped = false;

  constructor(private readonly d: RefReaderDeps) {}

  /** Puts a reference in the queue (once); a failed one is tried again. `autoName` also names it after the read. */
  enqueue(slug: string, opts: { autoName?: boolean } = {}): void {
    if (opts.autoName) this.naming.add(slug);
    if (this.current?.slug === slug || this.queue.includes(slug)) return;
    this.failed.delete(slug);
    this.queue.push(slug);
    void this.pump();
  }

  status(slug: string): ReadStatus | null {
    if (this.current?.slug === slug) return { state: 'reading', error_fa: null };
    if (this.queue.includes(slug)) return { state: 'queued', error_fa: null };
    const err = this.failed.get(slug);
    return err === undefined ? null : { state: 'failed', error_fa: err };
  }

  /** True while a read is running (not just waiting): a film must not start then. */
  reading(): boolean { return this.current !== null; }
  whenIdle(): Promise<void> { return this.idle; }

  stop(): void {
    this.stopped = true;
    this.queue.length = 0;
    this.current?.ctrl.abort();
  }

  private async pump(): Promise<void> {
    if (this.current || this.stopped) return;
    if (!this.release) this.idle = new Promise((r) => { this.release = r; });
    while (this.queue.length > 0 && !this.stopped) {
      const slug = this.queue[0]!;
      // Wait for the film queue to empty, then take the job lock; another process holding it (a command-line film) also makes us wait.
      if (this.d.filmBusy() || !this.tryLock()) { await new Promise((r) => setTimeout(r, this.d.pollMs ?? 5000)); continue; }
      this.queue.shift();
      const ctrl = new AbortController();
      this.current = { slug, ctrl };
      try { await this.readOne(slug, ctrl.signal); } catch (e) {
        this.failed.set(slug, e instanceof StageError ? e.message_fa : 'تحلیل این مرجع انجام نشد؛ بعداً دوباره امتحانش کن.');
      } finally {
        this.current = null;
        lockRepo.release(this.d.db);
      }
    }
    this.release?.();
    this.release = null;
  }

  private tryLock(): boolean {
    try { lockRepo.acquire(this.d.db, READ_LOCK_NAME); return true; } catch (e) { if (e instanceof LockBusyError) return false; throw e; }
  }

  private async readOne(slug: string, signal: AbortSignal): Promise<void> {
    const { config, tool } = this.d;
    const meta = readJson(refPaths(config.paths.refs, slug).meta, ReferenceMeta);
    const limits = readLimits(config, meta.duration);
    await decodeStored(slug, { config, db: this.d.db, tool, signal, runFn: (o) => this.d.run(o, limits) });
    // A naming call that fails is not a failed read: the reference stays usable and the owner can edit its name.
    if (this.naming.delete(slug)) await autoNameReference(slug, { config, db: this.d.db, run: this.d.nameRun });
  }
}
