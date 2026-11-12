// Responsibility: read and write contract files only through their zod schema, so invalid data fails loudly on both sides (CLAUDE.md rule 9).
import fs from 'node:fs';
import path from 'node:path';
import type { z } from 'zod';

/** Some editors on Windows save JSON with a byte-order mark; JSON.parse rejects it. */
const BOM = new RegExp('^' + String.fromCharCode(0xfeff));

export class ContractError extends Error {
  constructor(public readonly file: string, public readonly issues: string[]) {
    super(`invalid ${path.basename(file)}: ${issues.slice(0, 5).join('; ')}`);
    this.name = 'ContractError';
  }
}

export function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((i) => `${i.path.length ? i.path.join('.') : '(root)'}: ${i.message}`);
}

export function parseOrThrow<S extends z.ZodType>(schema: S, data: unknown, file: string): z.infer<S> {
  const r = schema.safeParse(data);
  if (!r.success) throw new ContractError(file, formatIssues(r.error));
  return r.data;
}

export function readJson<S extends z.ZodType>(file: string, schema: S): z.infer<S> {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8').replace(BOM, ''));
  } catch (e) {
    throw new ContractError(file, [`not readable JSON: ${(e as Error).message}`]);
  }
  return parseOrThrow(schema, raw, file);
}

/** Validates, then writes through a temp file and a rename, so a crash never leaves half a file behind. */
export function writeJson<S extends z.ZodType>(file: string, schema: S, data: z.input<S>): z.infer<S> {
  const valid = parseOrThrow(schema, data, file);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(valid, null, 2) + '\n', 'utf8');
  renameWithRetry(tmp, file);
  return valid;
}

const RENAME_RETRY_CODES = new Set(['EPERM', 'EBUSY', 'EACCES']);

/** On Windows a rename over a file that another process is reading fails with EPERM/EBUSY for a moment; wait and retry (about 2 s in total). */
export function renameWithRetry(from: string, to: string, attempts = 25): void {
  const pause = new Int32Array(new SharedArrayBuffer(4));
  for (let i = 1; ; i++) {
    try {
      fs.renameSync(from, to);
      return;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code ?? '';
      if (!RENAME_RETRY_CODES.has(code) || i >= attempts) {
        try { fs.rmSync(from, { force: true }); } catch { /* leave it; the next write replaces it */ }
        throw e;
      }
      Atomics.wait(pause, 0, 0, Math.min(10 * i, 150));
    }
  }
}
