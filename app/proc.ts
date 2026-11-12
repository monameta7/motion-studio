// Responsibility: run local tools (ffmpeg, python, node, taskkill) as child processes with argument arrays, and refuse to start the claude CLI, which only the runner may spawn.
import { spawn, type SpawnOptions } from 'node:child_process';
import path from 'node:path';

export interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
  error?: string;
}

function assertNotClaude(cmd: string): void {
  const base = path.basename(cmd).toLowerCase().replace(/\.(exe|cmd|bat|ps1)$/, '');
  if (base === 'claude') throw new Error('only app/ai/claudeRunner.ts may start the claude CLI (CLAUDE.md rule 3)');
}

/** Runs a command to completion. Never uses a shell; arguments are passed as an array (CLAUDE.md rule 11). */
export function runTool(cmd: string, args: string[], opts: { cwd?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv } = {}): Promise<RunResult> {
  assertNotClaude(cmd);
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    const done = (r: RunResult) => { if (!settled) { settled = true; resolve(r); } };
    let child;
    try {
      child = spawn(cmd, args, { cwd: opts.cwd, env: opts.env ?? process.env, windowsHide: true, shell: false });
    } catch (e) {
      done({ code: null, stdout, stderr, error: (e as Error).message });
      return;
    }
    const timer = opts.timeoutMs ? setTimeout(() => { child.kill(); done({ code: null, stdout, stderr, error: `timeout after ${opts.timeoutMs} ms` }); }, opts.timeoutMs) : undefined;
    child.stdout?.on('data', (d: Buffer) => { stdout += d.toString('utf8'); });
    child.stderr?.on('data', (d: Buffer) => { stderr += d.toString('utf8'); });
    child.on('error', (e) => { if (timer) clearTimeout(timer); done({ code: null, stdout, stderr, error: e.message }); });
    child.on('close', (code) => { if (timer) clearTimeout(timer); done({ code, stdout, stderr }); });
  });
}

/**
 * Starts a long-running local helper (ava-farsi) and leaves it running. `npm` on Windows is a .cmd file, which Node can
 * only start through the shell (docs/10 allows `shell: true` for npm.cmd only); every other command runs without a shell.
 */
export function startDetached(cmd: 'npm', args: string[], opts: { cwd: string; env?: NodeJS.ProcessEnv; secretEnv?: Record<string, string> }): number | undefined {
  const isWin = process.platform === 'win32';
  if (args.some((a) => /[&|<>^"%]/.test(a))) throw new Error('startDetached: shell metacharacters are not allowed in arguments');
  // `secretEnv` (the user's Gemini key, D65) goes only into the child's environment: never into arguments, where a process list or a log would show it.
  const o: SpawnOptions = { cwd: opts.cwd, env: { ...(opts.env ?? process.env), ...opts.secretEnv }, detached: true, stdio: 'ignore', windowsHide: true, shell: isWin };
  const child = spawn(isWin ? 'npm.cmd' : cmd, args, o);
  child.unref();
  return child.pid;
}

export interface Helper { pid: number | undefined; exited: Promise<number | null>; stop: () => void }

/**
 * Starts a small helper that lives until `stop()` (or until this app dies): its stdin stays open, and closing it is the signal
 * to end (the keep-awake helper). No shell; arguments as an array.
 */
export function startHelper(cmd: string, args: string[]): Helper {
  assertNotClaude(cmd);
  const child = spawn(cmd, args, { stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true, shell: false });
  const exited = new Promise<number | null>((resolve) => {
    child.on('error', () => resolve(null));
    child.on('close', (code) => resolve(code));
  });
  child.stdin?.on('error', () => undefined);
  return {
    pid: child.pid,
    exited,
    stop: () => {
      child.stdin?.end();
      // A helper that does not end on its own within a few seconds is killed.
      const t = setTimeout(() => { if (child.exitCode === null) child.kill(); }, 5000);
      t.unref();
      void exited.then(() => clearTimeout(t));
    },
  };
}

/** Kills a process and all its children. Windows: `taskkill /T` first (polite), `/F` after the grace period. */
export async function killTree(pid: number, graceMs: number, isAlive: (pid: number) => boolean = pidAlive): Promise<void> {
  if (process.platform === 'win32') {
    await runTool('taskkill', ['/T', '/PID', String(pid)], { timeoutMs: 10000 });
    const until = Date.now() + graceMs;
    while (Date.now() < until && isAlive(pid)) await new Promise((r) => setTimeout(r, 250));
    if (isAlive(pid)) await runTool('taskkill', ['/T', '/F', '/PID', String(pid)], { timeoutMs: 10000 });
    return;
  }
  try { process.kill(-pid, 'SIGINT'); } catch { try { process.kill(pid, 'SIGINT'); } catch { return; } }
  const until = Date.now() + graceMs;
  while (Date.now() < until && isAlive(pid)) await new Promise((r) => setTimeout(r, 250));
  if (isAlive(pid)) { try { process.kill(-pid, 'SIGKILL'); } catch { try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ } } }
}

export function pidAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code === 'EPERM'; }
}
