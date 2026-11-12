// Responsibility: run motion-build to write scene code, render, mix and deliver, then re-verify the film with ffprobe and ebur128 (docs/03 S6).
import fs from 'node:fs';
import path from 'node:path';
import { runClaude, type RunOptions, type RunResult } from '../../ai/claudeRunner.js';
import { renderPrompt } from '../../ai/prompts/index.js';
import { brandDir } from '../../brands/index.js';
import type { LoadedConfig } from '../../config.js';
import { ScenePlan, readJson } from '../../contracts/index.js';
import { jobsRepo, usageRepo } from '../../db/repositories.js';
import { StageError, type Stage, type StageContext, type StageOutput } from '../../orchestrator/stages.js';
import { runTool } from '../../proc.js';
import { attachmentList } from '../plan/index.js';
import { judgeFilm, measureFilm, measureVoiceLost, type FilmMeasure, type Span, type Tool } from './verify.js';

export type RunFn = (o: RunOptions, c: LoadedConfig) => Promise<RunResult>;

export const buildPaths = (dir: string) => ({
  out: path.join(dir, 'out'), video: path.join(dir, 'out', 'final.mp4'), qa: path.join(dir, 'out', 'qa.md'), cover: path.join(dir, 'out', 'cover-4x5.png'),
  project: path.join(dir, 'project'), renderMd: path.join(dir, 'project', 'RENDER.md'), verify: path.join(dir, 'logs', 'build-verify.json'),
});

/** Files motion-build must leave behind (SKILL §11); the film itself is measured separately. */
export function missingDeliverables(dir: string): string[] {
  const p = buildPaths(dir);
  return [p.video, p.cover, p.qa, p.renderMd].filter((f) => !fs.existsSync(f)).map((f) => path.relative(dir, f).split(path.sep).join('/'));
}

/** Measures out/final.mp4 against the plan, records the numbers in logs/build-verify.json and returns the problems. */
export async function verifyBuild(dir: string, run: Tool): Promise<{ problems: string[]; measure: FilmMeasure | null }> {
  const p = buildPaths(dir);
  const missing = missingDeliverables(dir);
  if (missing.length) return { problems: missing.map((m) => `${m} was not written`), measure: null };
  const plan = readJson(path.join(dir, 'plan', 'scene-plan.json'), ScenePlan);
  let measure: FilmMeasure;
  try { measure = await measureFilm(p.video, run); } catch (e) { return { problems: [(e as Error).message], measure: null }; }
  const problems = judgeFilm(measure, { duration: plan.total_duration, fps: plan.format.fps, w: plan.format.w, h: plan.format.h });
  // The voice must be heard to its last word: film B once passed every check above with 3.8 s of its CTA voice missing.
  const voice = path.join(dir, 'plan', 'voice.wav');
  let voice_lost: Span[] | null = null;
  if (fs.existsSync(voice)) {
    try { voice_lost = await measureVoiceLost(p.video, voice, run); } catch (e) { problems.push((e as Error).message); }
    for (const [a, b] of voice_lost ?? []) problems.push(`voice missing in the film at ${a.toFixed(2)}–${b.toFixed(2)} s (film silent while plan/voice.wav speaks)`);
  }
  fs.mkdirSync(path.dirname(p.verify), { recursive: true });
  fs.writeFileSync(p.verify, `${JSON.stringify({ at: new Date().toISOString(), measure, voice_lost, problems }, null, 2)}\n`, 'utf8');
  return { problems, measure };
}

export function buildStage(runFn: RunFn = (o, c) => runClaude(o, { config: c }), tool: Tool = runTool): Stage {
  return {
    name: 'build',
    async run(ctx: StageContext): Promise<StageOutput> {
      const { paths } = ctx.config;
      const outputs = ['out/final.mp4', 'out/cover-4x5.png', 'out/qa.md', 'project/RENDER.md'];
      if (!fs.existsSync(path.join(ctx.dir, 'plan', 'scene-plan.json'))) throw new StageError('blocked', 'نقشه‌ی صحنه‌ها وجود ندارد؛ اول مرحله‌ی نقشه را اجرا کن.', 'plan/scene-plan.json missing');
      // A finished and verified film (the stage was interrupted after delivery) is kept.
      if ((await verifyBuild(ctx.dir, tool)).problems.length === 0) return { outputs, tokens: { in: 0, out: 0 }, cost_usd_est: 0 };

      const prompt = renderPrompt('build', { jobDir: ctx.dir, engineDir: paths.engine, extra: ctx.req.attachments.length ? ` Owner assets: ${attachmentList(ctx.dir, ctx.req.attachments)}.` : '' });
      const logs = path.join(ctx.dir, 'logs');
      fs.mkdirSync(logs, { recursive: true });
      const attempt = fs.readdirSync(logs).filter((f) => f.startsWith('build-') && f.endsWith('.jsonl')).length + 1;
      const r = await runFn({ stage: 'build', jobDir: ctx.dir, brandDir: brandDir(paths, ctx.req.brand), attempt, prompt, signal: ctx.signal }, ctx.config);
      usageRepo.insert(ctx.db, {
        job_id: jobsRepo.bySlug(ctx.db, ctx.req.slug)?.id ?? null, brand: ctx.req.brand, stage: 'build', model: r.model, tokens_in: r.usage.input_tokens, tokens_out: r.usage.output_tokens,
        cache_read: r.usage.cache_read_input_tokens, cache_write: r.usage.cache_creation_input_tokens, cost_usd_est: r.costUsdEst,
      });
      if (r.rateLimited && !r.ok) throw new StageError('paused_quota', 'سهمیه‌ی Claude پر شد؛ بعد از آزاد شدن خودش ادامه می‌دهد.', r.error ?? 'rate limit', r.resumeAt);
      if (!r.ok) throw new StageError('failed', 'ساخت فیلم با Claude خطا داد.', r.error ?? '');
      const { problems } = await verifyBuild(ctx.dir, tool);
      if (problems.length) throw new StageError('failed', 'فیلم ساخته شد ولی بررسی خودکار (مدت، صدا، بلندی) را رد نکرد.', problems.join('; '));
      return { outputs, tokens: { in: r.usage.input_tokens, out: r.usage.output_tokens }, cost_usd_est: r.costUsdEst };
    },
  };
}
