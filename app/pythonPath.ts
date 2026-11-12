// Responsibility: make `python` in this process and every child it starts (alignment, sound, runtime Claude's Bash) the installed Python that has numpy, scipy and faster-whisper, by moving that Python's folder to the front of this process's PATH; Windows settings are not touched.
import fs from 'node:fs';
import path from 'node:path';
import { runTool } from './proc.js';

/** Fast: only asks whether the packages are installed (importing faster_whisper takes seconds). */
export const PY_PACKAGES_CHECK = ['-c', "import importlib.util as u, sys; sys.exit(0 if all(u.find_spec(m) for m in ('numpy', 'scipy', 'faster_whisper')) else 1)"];

export interface PythonPathDeps {
  env: NodeJS.ProcessEnv;
  platform: NodeJS.Platform;
  exists: (p: string) => boolean;
  /** True when this python.exe has the packages. */
  hasPackages: (exe: string) => Promise<boolean>;
}

const norm = (p: string) => path.win32.normalize(p).replace(/[\\/]+$/, '').toLowerCase();
const isStoreStub = (dir: string) => /\\microsoft\\windowsapps$/i.test(norm(dir));

export function pathKey(env: NodeJS.ProcessEnv): string {
  return Object.keys(env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH';
}

/**
 * When the first `python.exe` on PATH lacks the packages (seen 2026-11-08: the user PATH lists Python 3.12 before 3.13, and only
 * 3.13 has them; a terminal had another order, so films from a terminal worked and the autostart app did not), the first
 * Python folder that has them moves to the front, with its Scripts folder. Nothing changes when the first one is fine or none is.
 */
export async function preferPythonWithPackages(d: PythonPathDeps): Promise<{ changed: boolean; dir: string | null }> {
  if (d.platform !== 'win32') return { changed: false, dir: null };
  const key = pathKey(d.env);
  const entries = (d.env[key] ?? '').split(';').filter(Boolean);
  const withPython = entries.filter((dir, i) => entries.findIndex((x) => norm(x) === norm(dir)) === i && d.exists(path.win32.join(dir, 'python.exe')));
  const first = withPython[0];
  for (const dir of withPython) {
    if (isStoreStub(dir)) continue; // the Microsoft Store placeholder, not a Python
    if (!(await d.hasPackages(path.win32.join(dir, 'python.exe')))) continue;
    if (first && norm(first) === norm(dir)) return { changed: false, dir };
    const scripts = path.win32.join(dir, 'Scripts');
    const rest = entries.filter((x) => norm(x) !== norm(dir) && norm(x) !== norm(scripts));
    d.env[key] = [dir, ...(d.exists(scripts) ? [scripts] : []), ...rest].join(';');
    return { changed: true, dir };
  }
  return { changed: false, dir: null };
}

/** The real machine: this process's environment, children inherit it. */
export function preferPythonForThisProcess(log: (s: string) => void = (s) => console.log(s)): Promise<{ changed: boolean; dir: string | null }> {
  return preferPythonWithPackages({
    env: process.env,
    platform: process.platform,
    exists: (p) => fs.existsSync(p),
    hasPackages: async (exe) => (await runTool(exe, PY_PACKAGES_CHECK, { timeoutMs: 20000 })).code === 0,
  }).then((r) => {
    if (r.changed) log(`python: using ${r.dir} (it has numpy, scipy and faster-whisper; moved to the front of PATH for this app)`);
    return r;
  });
}
