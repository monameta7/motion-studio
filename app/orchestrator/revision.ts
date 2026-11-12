// Responsibility: revise a finished job (target video, cover, sound or caption): back up the delivery to _approved_vN/, run the one targeted Claude call, prove that only the target changed, and re-package (docs/03 Revisions).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { runClaude, type RunOptions, type RunResult } from '../ai/claudeRunner.js';
import { renderPrompt } from '../ai/prompts/index.js';
import { BrandError, brandDir, brandPrompt } from '../brands/index.js';
import type { LoadedConfig } from '../config.js';
import { ContentPackage, TruthRound, readJson, writeJson, type JobState } from '../contracts/index.js';
import type { Db } from '../db/db.js';
import { jobsRepo, lockRepo, usageRepo } from '../db/repositories.js';
import { packageStage } from '../package/index.js';
import { runTool } from '../proc.js';
import { verifyBuild } from '../stages/build/index.js';
import type { Tool } from '../stages/build/verify.js';
import { loadRounds } from '../stages/content/index.js';
import { checkVerbatim } from '../stages/content/verbatim.js';
import { resetFrom, runJob, type Orchestrator } from './index.js';
import { jobDir, readRequest, readState, writeState } from './jobFolder.js';
import { ScriptEditError, applyScriptEdits, scriptPaths, writeScriptEditFile, type EditOutcome } from './scriptEdit.js';
import { StageError } from './stages.js';

export const REVISION_TARGETS = ['video', 'cover', 'sound', 'caption'] as const;
export type RevisionTarget = (typeof REVISION_TARGETS)[number];
export type RunFn = (o: RunOptions, c: LoadedConfig) => Promise<RunResult>;

export interface RevisionDeps { config: LoadedConfig; db: Db; run?: RunFn; tool?: Tool }

const sha = (file: string): string | null => (fs.existsSync(file) ? crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') : null);

/** Hash of the decoded video stream only (a sound revision copies it, so it must not change even though the file does). */
export async function videoStreamHash(file: string, tool: Tool): Promise<string | null> {
  if (!fs.existsSync(file)) return null;
  const r = await tool('ffmpeg', ['-v', 'error', '-i', file, '-map', '0:v:0', '-c', 'copy', '-f', 'md5', '-'], { timeoutMs: 5 * 60000 });
  return r.code === 0 ? r.stdout.trim() : null;
}

export interface Fingerprint { video_file: string | null; video_stream: string | null; cover: string | null; caption: string | null }

export async function fingerprint(dir: string, tool: Tool): Promise<Fingerprint> {
  const out = path.join(dir, 'out');
  return { video_file: sha(path.join(out, 'final.mp4')), video_stream: await videoStreamHash(path.join(out, 'final.mp4'), tool), cover: sha(path.join(out, 'cover-4x5.png')), caption: sha(path.join(out, 'caption.txt')) };
}

/** What each target is allowed to change; anything else changing is a failed revision. */
export function unexpectedChanges(target: RevisionTarget, before: Fingerprint, after: Fingerprint): string[] {
  const changed = (k: keyof Fingerprint) => before[k] !== after[k];
  const out: string[] = [];
  if (target === 'cover') { if (changed('video_file')) out.push('final.mp4 changed'); if (changed('caption')) out.push('caption.txt changed'); }
  if (target === 'sound') { if (changed('video_stream')) out.push('the video stream changed'); if (changed('cover')) out.push('cover-4x5.png changed'); if (changed('caption')) out.push('caption.txt changed'); }
  if (target === 'caption') { if (changed('video_file')) out.push('final.mp4 changed'); if (changed('cover')) out.push('cover-4x5.png changed'); }
  if (target === 'video' && changed('caption')) out.push('caption.txt changed');
  return out;
}

const skipInBackup = (rel: string) => /(^|[\\/])render[\\/](frames|sub)[^\\/]*([\\/]|$)/i.test(rel) || /(^|[\\/])node_modules([\\/]|$)/.test(rel);

/** Copies out/ and project/ (without frame folders) to the next free _approved_vN/; returns its name. */
export function backupDelivery(dir: string): string {
  let n = 1;
  while (fs.existsSync(path.join(dir, `_approved_v${n}`))) n++;
  const dest = path.join(dir, `_approved_v${n}`);
  for (const sub of ['out', 'project']) {
    const src = path.join(dir, sub);
    if (fs.existsSync(src)) fs.cpSync(src, path.join(dest, sub), { recursive: true, filter: (s) => !skipInBackup(path.relative(dir, s)) });
  }
  return path.basename(dest);
}

/** Every package field except caption and hashtags must stay the same in a caption revision. */
export function captionOnlyProblems(before: ContentPackage, after: ContentPackage): string[] {
  const keep = (p: ContentPackage) => { const { caption: _c, hashtags: _h, markdown: _m, ...rest } = p; return JSON.stringify(rest); };
  return keep(before) === keep(after) ? [] : ['fields other than caption and hashtags changed'];
}

export type ScriptRevision = { needsEdit: true; file: string } | { needsEdit: false; backup: string; outcome: EditOutcome; state: JobState };

/**
 * Revision target `script` (D45) on a finished job: first call writes content/script-edit.json for the owner; the next call backs up
 * the delivery, applies the edit and runs again from voice (a voice line changed) or plan (on-screen texts only), then build and package.
 */
export async function reviseScript(o: Orchestrator, slug: string): Promise<ScriptRevision> {
  const dir = jobDir(o.config.paths.jobs, slug);
  const state = readState(dir);
  if (state.status !== 'done') throw new StageError('blocked', 'فقط کار تمام‌شده را می‌شود بازبینی کرد.', `status ${state.status}`);
  if (!fs.existsSync(scriptPaths(dir).editFile)) return { needsEdit: true, file: writeScriptEditFile(dir).file };
  const backup = backupDelivery(dir);
  let outcome: EditOutcome;
  try { outcome = applyScriptEdits(dir); } catch (e) {
    if (e instanceof ScriptEditError) throw new StageError('blocked', e.message_fa, e.message);
    throw e;
  }
  if (outcome.changes === 0) return { needsEdit: false, backup, outcome, state };
  const stages = resetFrom(dir, state.stages, outcome.voiceChanged ? 'voice' : 'plan');
  // A finished job has no edge back to running; the revision starts it again as a new run of the reset stages (the delivery is in the backup).
  writeState(dir, { ...state, status: 'queued', stage: null, stages, error: null, hold: null, resume_at: null });
  fs.appendFileSync(path.join(dir, 'logs', 'revisions.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), target: 'script', backup, ...outcome })}\n`, 'utf8');
  return { needsEdit: false, backup, outcome, state: await runJob(o, slug) };
}

export interface RevisionResult { backup: string; target: RevisionTarget; changed: Partial<Record<keyof Fingerprint, boolean>>; tokens_out: number }

/** Written while a revision runs and removed when it ends either way; left behind only when the process was killed mid-revision. */
export const revisionPendingFile = (dir: string): string => path.join(dir, 'logs', 'revision-pending.json');
export interface RevisionPending { at: string; target: RevisionTarget; note: string; backup: string }

export async function reviseJob(deps: RevisionDeps, slug: string, target: RevisionTarget, note: string): Promise<RevisionResult> {
  const { config, db } = deps;
  const run = deps.run ?? ((o, c) => runClaude(o, { config: c }));
  const tool = deps.tool ?? runTool;
  const dir = jobDir(config.paths.jobs, slug);
  if (!note.trim()) throw new StageError('blocked', 'برای بازبینی یک توضیح بنویس.', 'empty note');
  if (readState(dir).status !== 'done') throw new StageError('blocked', 'فقط کار تمام‌شده را می‌شود بازبینی کرد.', `status ${readState(dir).status}`);
  const req = readRequest(dir);
  // Phase 8: the job's own brand folder and names, never a global one.
  let brand: ReturnType<typeof brandPrompt> & { folder: string };
  try { brand = { ...brandPrompt(config.paths, req.brand), folder: brandDir(config.paths, req.brand) }; } catch (e) {
    if (e instanceof BrandError) throw new StageError('blocked', e.message_fa, e.message);
    throw e;
  }
  const jobId = jobsRepo.bySlug(db, slug)?.id ?? null;
  const logs = path.join(dir, 'logs');
  fs.mkdirSync(logs, { recursive: true });
  let tokensOut = 0;
  const call = async (o: Omit<RunOptions, 'jobDir' | 'attempt' | 'brandDir'>): Promise<RunResult> => {
    const attempt = fs.readdirSync(logs).filter((f) => f.startsWith(`${o.stage}-`)).length + 1;
    const r = await run({ ...o, jobDir: dir, brandDir: brand.folder, attempt }, config);
    tokensOut += r.usage.output_tokens;
    usageRepo.insert(db, { job_id: jobId, brand: req.brand, stage: o.stage, model: r.model, tokens_in: r.usage.input_tokens, tokens_out: r.usage.output_tokens, cache_read: r.usage.cache_read_input_tokens, cache_write: r.usage.cache_creation_input_tokens, cost_usd_est: r.costUsdEst });
    if (r.rateLimited && !r.ok) throw new StageError('paused_quota', 'سهمیه‌ی Claude پر شد؛ بعداً دوباره بازبینی کن.', r.error ?? 'rate limit', r.resumeAt);
    if (!r.ok) throw new StageError('failed', 'بازبینی با Claude خطا داد.', r.error ?? '');
    return r;
  };

  lockRepo.acquire(db, slug);
  try {
    const before = await fingerprint(dir, tool);
    const backup = backupDelivery(dir);
    const pending: RevisionPending = { at: new Date().toISOString(), target, note: note.trim(), backup };
    fs.writeFileSync(revisionPendingFile(dir), `${JSON.stringify(pending)}\n`, 'utf8');
    if (target === 'caption') {
      const pkgFile = path.join(dir, 'content', 'package.json');
      const old = readJson(pkgFile, ContentPackage);
      const fixes = `1. Change only the caption and the hashtags, following the owner's note: «${note.trim()}». Every other line of package.md stays exactly as it is.`;
      const r = await call({ stage: 'content-hook-revise', prompt: renderPrompt('content-hook-revise', { jobDir: dir, fixes }), jsonSchema: z.toJSONSchema(ContentPackage, { io: 'input' }) });
      const next = ContentPackage.parse(r.structured);
      const problems = [...captionOnlyProblems(old, next), ...checkVerbatim(next, fs.readFileSync(path.join(dir, 'content', 'package.md'), 'utf8'))];
      if (problems.length) {
        fs.copyFileSync(path.join(dir, backup, 'out', 'package.md'), path.join(dir, 'content', 'package.md'));
        throw new StageError('failed', 'بازبینی کپشن چیزی غیر از کپشن را عوض کرد؛ نسخه‌ی قبلی برگردانده شد.', problems.join('; '));
      }
      writeJson(pkgFile, ContentPackage, next);
      // The documented truth call reviews the package with its fixed rubric; the result is kept with the revision, it does not gate it (docs/14 open question).
      const t = await call({ stage: 'content-truth', prompt: renderPrompt('content-truth', { jobDir: dir, round: String(loadRounds(dir).length + 1), brandShortName: brand.brandShortName }), jsonSchema: z.toJSONSchema(TruthRound, { io: 'input' }) });
      fs.mkdirSync(path.join(dir, 'content', 'revisions'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'content', 'revisions', `${backup}.caption-truth.json`), `${JSON.stringify(t.structured, null, 2)}\n`, 'utf8');
    } else {
      await call({ stage: 'revise', prompt: renderPrompt('revise', { jobDir: dir, target, note: note.trim() }) });
      const v = await verifyBuild(dir, tool);
      if (v.problems.length) throw new StageError('failed', 'فیلم بازبینی‌شده بررسی خودکار را رد نکرد؛ نسخه‌ی قبلی در پوشه‌ی پشتیبان است.', `${backup}: ${v.problems.join('; ')}`);
    }

    const state = readState(dir);
    await packageStage().run({ config, db, req, dir, state, attempt: 1 });
    const after = await fingerprint(dir, tool);
    const wrong = unexpectedChanges(target, before, after);
    const changed = Object.fromEntries((Object.keys(before) as (keyof Fingerprint)[]).map((k) => [k, before[k] !== after[k]]));
    fs.appendFileSync(path.join(logs, 'revisions.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), target, note: note.trim(), backup, changed, unexpected: wrong })}\n`, 'utf8');
    if (wrong.length) throw new StageError('failed', `بازبینی «${target}» چیزی غیر از هدف را هم عوض کرد.`, `${backup}: ${wrong.join('; ')}`);
    return { backup, target, changed, tokens_out: tokensOut };
  } finally {
    fs.rmSync(revisionPendingFile(dir), { force: true });
    lockRepo.release(db);
  }
}
