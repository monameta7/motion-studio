// Responsibility: run the UI's job work (new job, resume, continue after a hold, revisions) inside the server process one at a time, in order, and pause it on the owner's «توقف».
import { EventEmitter } from 'node:events';
import { ResumeRefused, pauseWaiting } from '../orchestrator/index.js';
import type { Orchestrator } from '../orchestrator/index.js';

export type WorkKind = 'run' | 'resume' | 'continue' | 'revise';

interface Work { slug: string; kind: WorkKind; fn: (pause: AbortSignal) => Promise<unknown> }

/** Fired after any change a client should re-read: `{ slug }`. */
export const CHANGED = 'changed';
/** Fired when a piece of work ended (finished, failed or was stopped): `{ slug, kind }`. The notifications listen to it. */
export const FINISHED = 'finished';

export class JobRunner extends EventEmitter {
  private readonly queue: Work[] = [];
  private current: { work: Work; ctrl: AbortController } | null = null;
  /** The last error of background work per job (Persian message), shown by the UI until the next work for that job starts. */
  readonly lastError = new Map<string, string>();
  private idle: Promise<void> = Promise.resolve();
  private release: (() => void) | null = null;

  constructor(private readonly o: Orchestrator, private readonly describe: (e: unknown) => string) { super(); }

  /** Adds work for a job; it starts at once when nothing else runs (docs/02 §7: one job at a time, others wait). */
  enqueue(slug: string, kind: WorkKind, fn: Work['fn']): { position: number } {
    this.queue.push({ slug, kind, fn });
    const position = this.queue.length - (this.current ? 0 : 1);
    this.emit(CHANGED, { slug });
    void this.pump();
    return { position };
  }

  /** Slug of the job whose work runs now, if any. */
  running(): string | null { return this.current?.work.slug ?? null; }
  isBusy(slug: string): boolean { return this.current?.work.slug === slug || this.queue.some((w) => w.slug === slug); }
  queued(): string[] { return this.queue.map((w) => w.slug); }

  /** «توقف» (D53, a pause): a running job's stage is killed and the job waits as `interrupted`; a job waiting in the queue is taken out and marked the same way. */
  pause(slug: string): 'pausing' | 'paused' {
    if (this.current?.work.slug === slug) { this.current.ctrl.abort(); this.emit(CHANGED, { slug }); return 'pausing'; }
    const before = this.queue.length;
    for (let i = this.queue.length - 1; i >= 0; i--) if (this.queue[i]!.slug === slug) this.queue.splice(i, 1);
    if (this.queue.length === before) throw new ResumeRefused('این کار الان اجرا نمی‌شود که متوقفش کنی.');
    pauseWaiting(this.o, slug);
    this.emit(CHANGED, { slug });
    return 'paused';
  }

  /** Resolves when the queue is empty and nothing runs (tests and shutdown). */
  whenIdle(): Promise<void> { return this.idle; }

  /** Starts the next queued work. A server that shuts down mid-job leaves the job `running`; the next start marks it interrupted (docs/03). */
  private async pump(): Promise<void> {
    if (this.current) return;
    const work = this.queue.shift();
    if (!work) { this.release?.(); this.release = null; return; }
    if (!this.release) this.idle = new Promise((r) => { this.release = r; });
    const ctrl = new AbortController();
    this.current = { work, ctrl };
    this.lastError.delete(work.slug);
    this.emit(CHANGED, { slug: work.slug });
    try {
      await work.fn(ctrl.signal);
    } catch (e) {
      this.lastError.set(work.slug, this.describe(e));
    } finally {
      this.current = null;
      this.emit(FINISHED, { slug: work.slug, kind: work.kind });
      this.emit(CHANGED, { slug: work.slug });
      void this.pump();
    }
  }
}
