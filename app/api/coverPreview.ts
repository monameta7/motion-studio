// Responsibility: a small JPEG copy of a finished film's cover for the Result page (Phase 11.9, owner «انجام بده»), made once with ffmpeg and kept in the system temp folder, never in the job folder; the delivered `out/cover-4x5.png` is not touched.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runTool } from '../proc.js';

/** Half the cover's 1080 px: sharp on a phone at the size the page shows it, a fraction of the PNG's bytes. */
export const PREVIEW_WIDTH = 540;
export const coverPreviewDir = (): string => path.join(os.tmpdir(), 'mms-cover-preview');

type Tool = (cmd: string, args: string[], o?: { timeoutMs?: number }) => Promise<{ code: number | null; stderr: string }>;

/**
 * The preview file for `cover` (made now if needed), or null when the cover is missing or ffmpeg fails (the page then shows the PNG).
 * The cache key holds the cover's path, size and time, so a new cover (a revision) gets a new preview.
 */
export async function coverPreview(cover: string, tool: Tool = (c, a, o) => runTool(c, a, o), dir = coverPreviewDir()): Promise<string | null> {
  let st: fs.Stats;
  try { st = fs.statSync(cover); } catch { return null; }
  const key = crypto.createHash('sha256').update(`${path.resolve(cover)}|${st.size}|${st.mtimeMs}`).digest('hex').slice(0, 24);
  const out = path.join(dir, `${key}.jpg`);
  if (fs.existsSync(out)) return out;
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${out}.${process.pid}.tmp.jpg`;
  const r = await tool('ffmpeg', ['-v', 'error', '-y', '-i', cover, '-vf', `scale=${PREVIEW_WIDTH}:-2:flags=lanczos`, '-q:v', '3', '-frames:v', '1', tmp], { timeoutMs: 30000 });
  if (r.code !== 0 || !fs.existsSync(tmp)) { fs.rmSync(tmp, { force: true }); return null; }
  fs.renameSync(tmp, out);
  return out;
}
