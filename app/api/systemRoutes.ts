// Responsibility: the Settings screen's actions that touch the machine: disk usage of jobs/ and the temp-file cleanup, and the voice test sentence (one Gemini request through ava-farsi).
import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { TONES, VOICES } from '../contracts/index.js';
import { listJobSlugs, readState } from '../orchestrator/jobFolder.js';
import { cleanFrames } from '../package/index.js';
import { AvaClient } from '../stages/voice/avaClient.js';
import { applyLexiconFile } from '../stages/voice/lexicon.js';
import { fail, sendError, type ApiContext } from './context.js';
import { removeUploads } from './uploads.js';

/** Bytes under `dir` (0 when missing); symlinks are not followed. */
export function dirBytes(dir: string): number {
  let total = 0;
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return 0; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) total += dirBytes(full);
    else if (e.isFile()) { try { total += fs.statSync(full).size; } catch { /* removed meanwhile */ } }
  }
  return total;
}

/** Temporary render frames (project/render/frames*, sub*) of one job: the files package deletes after delivery (docs/03 S7). */
function frameBytes(jobDir: string): number {
  const render = path.join(jobDir, 'project', 'render');
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(render, { withFileTypes: true }); } catch { return 0; }
  return entries.filter((e) => e.isDirectory() && /^(frames|sub)/i.test(e.name)).reduce((n, e) => n + dirBytes(path.join(render, e.name)), 0);
}

/** Jobs whose frames may go: finished or cancelled, and not running in this server. */
function cleanable(ctx: ApiContext): string[] {
  return listJobSlugs(ctx.config.paths.jobs).filter((slug) => {
    if (ctx.runner.isBusy(slug)) return false;
    try { return ['done', 'cancelled'].includes(readState(path.join(ctx.config.paths.jobs, slug)).status); } catch { return false; }
  });
}

export const VoiceTestBody = z.strictObject({ text: z.string().trim().min(1).max(300), voice: z.enum(VOICES).optional(), tone: z.enum(TONES).optional() });

export function systemRoutes(app: FastifyInstance, ctx: ApiContext): void {
  app.get('/api/disk', async () => {
    const jobs = ctx.config.paths.jobs;
    const temp = cleanable(ctx).reduce((n, s) => n + frameBytes(path.join(jobs, s)), 0) + dirBytes(ctx.uploadsDir);
    let free: number | null = null;
    try { const s = fs.statfsSync(jobs); free = s.bavail * s.bsize; } catch { /* unknown */ }
    return { jobs_bytes: dirBytes(jobs), temp_bytes: temp, free_bytes: free, jobs_count: listJobSlugs(jobs).length };
  });

  /** «پاک‌کردن فایل‌های موقت»: render frames of finished jobs and image uploads older than a day; films, projects and backups stay. */
  app.post('/api/disk/clean', async () => {
    const jobs = ctx.config.paths.jobs;
    let freed = 0;
    for (const slug of cleanable(ctx)) {
      const before = frameBytes(path.join(jobs, slug));
      if (before > 0) { cleanFrames(path.join(jobs, slug)); freed += before; }
    }
    const up = dirBytes(ctx.uploadsDir);
    removeUploads(ctx.uploadsDir, []);
    freed += up - dirBytes(ctx.uploadsDir);
    return { freed_bytes: freed };
  });

  /** The test sentence (docs/11 Settings): one ava-farsi request, which counts against Gemini's daily limit (D32); the UI says so before sending. */
  app.post('/api/voice-test', async (request, reply) => {
    const body = VoiceTestBody.safeParse(request.body);
    if (!body.success) return fail(reply, 400, 'جمله‌ی آزمایشی خالی یا بیشتر از ۳۰۰ حرف است.');
    const tts = ctx.config.cfg.tts;
    try {
      const client = new AvaClient(ctx.config);
      await client.ensureUp();
      const text = applyLexiconFile(body.data.text, ctx.config.paths.lexicon).text;
      const wav = await client.synthesize(text, body.data.voice ?? tts.voice, body.data.tone ?? (tts.tone === 'auto' ? tts.tone_fallback : tts.tone));
      return reply.header('Content-Type', 'audio/wav').header('Cache-Control', 'no-store').send(wav);
    } catch (e) { return sendError(reply, e); }
  });
}
