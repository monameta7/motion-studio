// Responsibility: run motion-plan to produce plan/scene-plan.json (with brand-profile, audio, voice.wav and plan.md) and re-check it against the package and the voice (docs/03 S5).
import fs from 'node:fs';
import path from 'node:path';
import { runClaude, type RunOptions, type RunResult } from '../../ai/claudeRunner.js';
import { renderPrompt } from '../../ai/prompts/index.js';
import { brandDir } from '../../brands/index.js';
import type { LoadedConfig } from '../../config.js';
import { AudioJson, BrandProfile, ContentPackage, ContractError, ScenePlan, VoiceLines, checkScenePlan, readJson, type Attachment } from '../../contracts/index.js';
import { jobsRepo, usageRepo } from '../../db/repositories.js';
import { StageError, type Stage, type StageContext, type StageOutput } from '../../orchestrator/stages.js';
import { referenceForPrompt } from '../reference/index.js';

export type RunFn = (o: RunOptions, c: LoadedConfig) => Promise<RunResult>;

export const planPaths = (dir: string) => {
  const p = path.join(dir, 'plan');
  return {
    dir: p, brand: path.join(p, 'brand-profile.json'), audio: path.join(p, 'audio.json'), voice: path.join(p, 'voice.wav'),
    scenePlan: path.join(p, 'scene-plan.json'), md: path.join(p, 'plan.md'), rejectNote: path.join(p, 'reject-note.json'),
  };
};

/** How early (s) a text may appear before its voice line starts. It may stay on screen until its scene ends (checkScenePlan), which can be after the line ends. */
const LINE_SLACK = 0.3;

/** Re-checks a plan beyond its schema: structure (checkScenePlan), cover equal to the package, every text inside its voice line. Returns the problems found. */
export function checkPlan(plan: ScenePlan, pkg: ContentPackage, audio: AudioJson, voice: VoiceLines): string[] {
  const out = checkScenePlan(plan);
  for (const k of ['headline', 'subline', 'visual', 'layout_notes'] as const) {
    if (plan.cover[k] !== pkg.cover[k]) out.push(`cover.${k} is not equal to content/package.json cover.${k}`);
  }
  const ids = voice.lines.map((l) => l.id);
  if (audio.lines.length !== ids.length || audio.lines.some((l, i) => l.id !== ids[i])) out.push('audio.json lines do not match voice/lines.json');
  if (Math.abs(audio.duration - plan.duration) > 0.1 && Math.abs(audio.duration - plan.total_duration) > 0.1) out.push(`audio duration ${audio.duration} does not match plan duration ${plan.duration}`);
  for (const sc of plan.scenes) {
    for (const t of sc.texts) {
      const n = typeof t.voice_line === 'number' ? t.voice_line : sc.voice_line;
      const line = audio.lines.find((l) => l.id === n);
      if (!line) { out.push(`text «${t.text}» names voice line ${String(n)}, which does not exist`); continue; }
      if (t.in < line.start - LINE_SLACK || t.in > line.end) out.push(`text «${t.text}» appears at ${t.in}, outside voice line ${n} (${line.start}–${line.end})`);
    }
  }
  return out;
}

const slash = (f: string) => f.replace(/\\/g, '/');

/** D42: every request attachment is listed in scene-plan.owner_assets with at least one scene id, and every listed scene exists. */
export function ownerAssetProblems(plan: ScenePlan, attachments: readonly Attachment[]): string[] {
  const out: string[] = [];
  const ids = new Set(plan.scenes.map((s) => s.id));
  for (const a of attachments) {
    const entry = (plan.owner_assets ?? []).find((o) => slash(o.file).endsWith(a.file));
    if (!entry) { out.push(`owner image ${a.file} («${a.original_name}») is not in scene-plan.owner_assets; every owner image must appear in the film`); continue; }
    if (entry.scenes.length === 0) out.push(`owner image ${a.file} has no scene in owner_assets`);
    for (const id of entry.scenes) if (!ids.has(id)) out.push(`owner image ${a.file} names scene ${id}, which does not exist`);
  }
  return out;
}

/** The owner's images as absolute paths, for the plan and build prompts. */
export const attachmentList = (dir: string, attachments: readonly Attachment[]): string => attachments.map((a) => `${path.join(dir, ...a.file.split('/'))} («${a.original_name}»)`).join(', ');

/** Reads and checks the plan folder; returns the problems (empty = good). */
export function verifyPlan(dir: string, attachments: readonly Attachment[] = []): string[] {
  const p = planPaths(dir);
  for (const f of [p.scenePlan, p.audio, p.brand, p.voice, p.md]) if (!fs.existsSync(f)) return [`${path.relative(dir, f).split(path.sep).join('/')} was not written`];
  try {
    const plan = readJson(p.scenePlan, ScenePlan);
    readJson(p.brand, BrandProfile);
    const audio = readJson(p.audio, AudioJson);
    const pkg = readJson(path.join(dir, 'content', 'package.json'), ContentPackage);
    const voice = readJson(path.join(dir, 'voice', 'lines.json'), VoiceLines);
    if (plan.status === 'blocked') return [`scene-plan.status is "blocked": ${plan.risks.join('; ')}`];
    return [...checkPlan(plan, pkg, audio, voice), ...ownerAssetProblems(plan, attachments)];
  } catch (e) {
    return [e instanceof ContractError ? e.message : (e as Error).message];
  }
}

export function planStage(runFn: RunFn = (o, c) => runClaude(o, { config: c })): Stage {
  return {
    name: 'plan',
    async run(ctx: StageContext): Promise<StageOutput> {
      const { cfg, paths } = ctx.config;
      const p = planPaths(ctx.dir);
      const outputs = ['plan/brand-profile.json', 'plan/audio.json', 'plan/voice.wav', 'plan/scene-plan.json', 'plan/plan.md'];
      const totals = { in: 0, out: 0, cost: 0 };
      const note = fs.existsSync(p.rejectNote) ? (JSON.parse(fs.readFileSync(p.rejectNote, 'utf8')) as { note: string }).note : null;
      // A finished, valid plan (for example the stage was interrupted after the files were written) is kept; a rejection by the owner forces a new one.
      if (!note && verifyPlan(ctx.dir, ctx.req.attachments).length === 0) return { outputs, tokens: { in: 0, out: 0 }, cost_usd_est: 0 };

      const jobId = jobsRepo.bySlug(ctx.db, ctx.req.slug)?.id ?? null;
      // Phase 8: the job's own brand folder (request.json), never a global one.
      const brandFolder = brandDir(paths, ctx.req.brand);
      const refs = ctx.req.references.map((s) => referenceForPrompt(paths.refs, s)).join('; ');
      const base = renderPrompt('plan', {
        jobDir: ctx.dir, refs, brandDir: brandFolder, format: ctx.req.format, outroAudio: String(cfg.render.outro_audio),
        extra: ctx.req.attachments.length ? ` Owner assets: ${attachmentList(ctx.dir, ctx.req.attachments)}. Owner directions (the [ ] parts of the owner's input, in place): «${ctx.req.topic}».` : '',
      });
      const logs = path.join(ctx.dir, 'logs');
      fs.mkdirSync(logs, { recursive: true });
      let feedback = note ? `\nThe owner rejected the previous plan. Their note: «${note}». Make a new plan that answers it.` : '';
      let problems: string[] = [];
      for (let round = 0; round < 2; round++) {
        const attempt = fs.readdirSync(logs).filter((f) => f.startsWith('plan-')).length + 1;
        const r = await runFn({ stage: 'plan', jobDir: ctx.dir, brandDir: brandFolder, attempt, prompt: base + feedback, signal: ctx.signal }, ctx.config);
        totals.in += r.usage.input_tokens; totals.out += r.usage.output_tokens; totals.cost += r.costUsdEst;
        usageRepo.insert(ctx.db, {
          job_id: jobId, brand: ctx.req.brand, stage: 'plan', model: r.model, tokens_in: r.usage.input_tokens, tokens_out: r.usage.output_tokens,
          cache_read: r.usage.cache_read_input_tokens, cache_write: r.usage.cache_creation_input_tokens, cost_usd_est: r.costUsdEst,
        });
        if (r.rateLimited && !r.ok) throw new StageError('paused_quota', 'سهمیه‌ی Claude پر شد؛ بعد از آزاد شدن خودش ادامه می‌دهد.', r.error ?? 'rate limit', r.resumeAt);
        problems = r.ok ? verifyPlan(ctx.dir, ctx.req.attachments) : [r.error ?? 'the claude call failed'];
        if (problems.length === 0) {
          fs.rmSync(p.rejectNote, { force: true });
          return { outputs, tokens: { in: totals.in, out: totals.out }, cost_usd_est: totals.cost };
        }
        fs.appendFileSync(path.join(logs, 'plan-rejections.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), problems })}\n`, 'utf8');
        feedback += `\nThe app rejected your plan. Fix exactly these problems and write all files again:\n${problems.map((x, i) => `${i + 1}. ${x}`).join('\n')}`;
      }
      throw new StageError('failed', 'نقشه‌ی صحنه‌ها پس از دو بار تلاش معتبر نشد.', problems.slice(0, 6).join('; '));
    },
  };
}
