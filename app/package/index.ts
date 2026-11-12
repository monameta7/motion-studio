// Responsibility: write caption.txt, package.md, metrics.json and manifest.json, clean temporary frames and record the archive row (docs/03 S7, Metrics).
import fs from 'node:fs';
import path from 'node:path';
import { ContentPackage, Manifest, ScenePlan, readJson, writeJson } from '../contracts/index.js';
import type { Db } from '../db/db.js';
import { jobsRepo, stageRunsRepo, usageRepo } from '../db/repositories.js';
import { StageError, type Stage, type StageContext, type StageOutput } from '../orchestrator/stages.js';
import { loadRounds } from '../stages/content/index.js';

/** Caption + hashtags exactly as in the package (docs/13 film acceptance 8). */
export const captionText = (pkg: ContentPackage): string => `${pkg.caption}\n\n${pkg.hashtags.join(' ')}\n`;

/** The pipeline stage a Claude call belongs to (usage rows name the Claude stage). */
const pipelineStage = (claudeStage: string): string => (claudeStage.startsWith('content') ? 'content' : claudeStage);

export interface StageMetric { minutes: number; runs: number; tokens_in: number; tokens_out: number; cost_usd_est: number }
export interface JobMetrics { stages: Record<string, StageMetric>; wall_minutes: number; tokens_in: number; tokens_out: number; cost_usd_est: number }

/** Minutes from every recorded stage run, tokens from every Claude call of the job (resumed runs included). */
export function jobMetrics(db: Db, slug: string): JobMetrics {
  const stages: Record<string, StageMetric> = {};
  const get = (s: string) => (stages[s] ??= { minutes: 0, runs: 0, tokens_in: 0, tokens_out: 0, cost_usd_est: 0 });
  for (const r of stageRunsRepo.forJob(db, slug)) { const m = get(r.stage); m.minutes += r.minutes; m.runs++; }
  const id = jobsRepo.bySlug(db, slug)?.id;
  for (const u of id ? usageRepo.byJob(db, id) : []) {
    const m = get(pipelineStage(u.stage));
    m.tokens_in += u.tokens_in; m.tokens_out += u.tokens_out; m.cost_usd_est += u.cost_usd_est;
  }
  const all = Object.values(stages);
  const round = (n: number) => Math.round(n * 100) / 100;
  for (const m of all) { m.minutes = round(m.minutes); m.cost_usd_est = round(m.cost_usd_est); }
  return {
    stages,
    wall_minutes: round(all.reduce((n, m) => n + m.minutes, 0)),
    tokens_in: all.reduce((n, m) => n + m.tokens_in, 0),
    tokens_out: all.reduce((n, m) => n + m.tokens_out, 0),
    cost_usd_est: round(all.reduce((n, m) => n + m.cost_usd_est, 0)),
  };
}

/** Lines under a qa.md heading that names flaws ("Remaining flaws", "Flaws", ...), one per bullet. */
export function qaFlaws(qaMd: string): string[] {
  const out: string[] = [];
  let inFlaws = false;
  for (const line of qaMd.split(/\r?\n/)) {
    const h = /^#{1,6}\s+(.*)$/.exec(line);
    if (h) { inFlaws = /flaw|نقص|ایراد/i.test(h[1]!); continue; }
    const b = /^\s*[-*]\s+(.*\S)/.exec(line);
    if (inFlaws && b && !/^(none|هیچ)/i.test(b[1]!)) out.push(b[1]!);
  }
  return out;
}

/** Deletes temporary frame folders in project/render (frames*, sub*); keeps video.mp4, film_outro.mp4 and everything else. */
export function cleanFrames(dir: string): string[] {
  const render = path.join(dir, 'project', 'render');
  if (!fs.existsSync(render)) return [];
  const removed: string[] = [];
  for (const e of fs.readdirSync(render, { withFileTypes: true })) {
    if (e.isDirectory() && /^(frames|sub)/i.test(e.name)) { fs.rmSync(path.join(render, e.name), { recursive: true, force: true }); removed.push(e.name); }
  }
  return removed;
}

export function packageStage(): Stage {
  return {
    name: 'package',
    async run(ctx: StageContext): Promise<StageOutput> {
      const out = path.join(ctx.dir, 'out');
      const verify = path.join(ctx.dir, 'logs', 'build-verify.json');
      if (!fs.existsSync(path.join(out, 'final.mp4')) || !fs.existsSync(verify)) throw new StageError('blocked', 'فیلم نهایی یا نتیجه‌ی بررسی آن پیدا نشد؛ اول مرحله‌ی ساخت را کامل کن.', 'out/final.mp4 or logs/build-verify.json missing');
      const checked = JSON.parse(fs.readFileSync(verify, 'utf8')) as { problems: string[] };
      // Frames are deleted only after the final file is verified (docs/03 S7).
      if (checked.problems.length) throw new StageError('failed', 'فیلم نهایی بررسی خودکار را رد نکرده؛ فریم‌ها نگه داشته شدند.', checked.problems.join('; '));

      const pkg = readJson(path.join(ctx.dir, 'content', 'package.json'), ContentPackage);
      const plan = readJson(path.join(ctx.dir, 'plan', 'scene-plan.json'), ScenePlan);
      fs.writeFileSync(path.join(out, 'caption.txt'), captionText(pkg), 'utf8');
      fs.copyFileSync(path.join(ctx.dir, 'content', 'package.md'), path.join(out, 'package.md'));
      const removed = cleanFrames(ctx.dir);

      const metrics = jobMetrics(ctx.db, ctx.req.slug);
      fs.writeFileSync(path.join(ctx.dir, 'logs', 'metrics.json'), `${JSON.stringify({ ...metrics, frames_removed: removed }, null, 2)}\n`, 'utf8');

      const rounds = loadRounds(ctx.dir);
      const qaFile = path.join(out, 'qa.md');
      const flaws = [...checked.problems, ...(fs.existsSync(qaFile) ? qaFlaws(fs.readFileSync(qaFile, 'utf8')) : [])];
      const manifest = writeJson(path.join(out, 'manifest.json'), Manifest, {
        slug: ctx.req.slug, topic: ctx.req.topic, format: ctx.req.format, duration: plan.duration, total_duration: plan.total_duration,
        files: { video: 'out/final.mp4', cover_4x5: 'out/cover-4x5.png', caption: 'out/caption.txt', package: 'out/package.md', qa: 'out/qa.md' },
        references: ctx.req.references,
        // Hook switched off (D41) or no truth round recorded: the score is not applicable; 0 rounds is not allowed, so one is reported.
        truth_score: rounds.at(-1)?.score ?? 0, truth_rounds: Math.max(1, rounds.length),
        qa: { passed: checked.problems.length === 0, flaws },
        metrics: { wall_minutes: metrics.wall_minutes, tokens_in: metrics.tokens_in, tokens_out: metrics.tokens_out, cost_usd_est: metrics.cost_usd_est },
        created_at: new Date().toISOString(),
      });
      jobsRepo.setManifest(ctx.db, ctx.req.slug, JSON.stringify(manifest));
      return { outputs: ['out/caption.txt', 'out/package.md', 'out/manifest.json', 'logs/metrics.json'] };
    },
  };
}
