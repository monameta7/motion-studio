// Responsibility: run motion-plan to produce plan/scene-plan.json (with brand-profile, audio, voice.wav and plan.md) and re-check it against the package and the voice (docs/03 S5).
import fs from 'node:fs';
import path from 'node:path';
import { runClaude, type RunOptions, type RunResult } from '../../ai/claudeRunner.js';
import { renderPrompt } from '../../ai/prompts/index.js';
import { brandDir } from '../../brands/index.js';
import type { LoadedConfig } from '../../config.js';
import { AudioJson, BrandProfile, ContentPackage, ContractError, ScenePlan, UiSource, VoiceLines, checkScenePlan, readJson, type Attachment } from '../../contracts/index.js';
import { jobsRepo, usageRepo } from '../../db/repositories.js';
import { StageError, type Stage, type StageContext, type StageOutput } from '../../orchestrator/stages.js';
import { runTool, type RunResult as ToolResult } from '../../proc.js';
import { referenceForPrompt } from '../reference/index.js';

export type RunFn = (o: RunOptions, c: LoadedConfig) => Promise<RunResult>;
export type Tool = (cmd: string, args: string[], opts?: { cwd?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv }) => Promise<ToolResult>;

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

/** D42, D84: every request attachment is listed in scene-plan.owner_assets with at least one scene id, and every listed scene exists. */
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

/**
 * D84: re-checks `scene-plan.ui_screens` (product screens built in code): scenes exist, every state and action time is inside one of the
 * screen's scenes, an action tied to a voice word sits on that word's start (±1 frame), an image-sourced screen names an owner image whose
 * `owner_assets` mode is `rebuild`, and every `rebuild` image is the blueprint of a screen.
 */
export function uiScreenProblems(plan: ScenePlan, audio: AudioJson, attachments: readonly Attachment[]): string[] {
  const out: string[] = [];
  const screens = plan.ui_screens ?? [];
  const frame = 1 / plan.format.fps;
  const byId = new Map(plan.scenes.map((s) => [s.id, s]));
  const assets = plan.owner_assets ?? [];
  for (const u of screens) {
    const scenes = u.scenes.map((id) => byId.get(id));
    u.scenes.forEach((id, i) => { if (!scenes[i]) out.push(`ui screen ${u.id} names scene ${id}, which does not exist`); });
    const inside = (t: number) => scenes.some((s) => s && t >= s.start - frame && t <= s.end + frame);
    for (const st of u.states) if (!inside(st.at)) out.push(`ui screen ${u.id} state ${st.id} is at ${st.at}, outside the screen's scenes`);
    for (const a of u.actions) {
      if (!inside(a.at)) out.push(`ui screen ${u.id} action ${a.id} is at ${a.at}, outside the screen's scenes`);
      if (!a.voice_word) continue;
      const word = audio.lines.find((l) => l.id === a.voice_word?.line)?.words[a.voice_word.index];
      if (!word) out.push(`ui screen ${u.id} action ${a.id} names word ${a.voice_word.index} of voice line ${a.voice_word.line}, which does not exist in audio.json`);
      else if (Math.abs(a.at - word.start) > frame + 1e-6) out.push(`ui screen ${u.id} action ${a.id} is at ${a.at} but its word «${word.w}» starts at ${word.start}; put the action on the word's start (±1 frame)`);
    }
    if (u.source === 'image') {
      const att = attachments.find((a) => u.asset !== null && slash(u.asset).endsWith(a.file));
      if (!att) { out.push(`ui screen ${u.id} has source "image" but its asset ${String(u.asset)} is not one of the owner's images`); continue; }
      if (assets.find((o) => slash(o.file).endsWith(att.file))?.mode !== 'rebuild') out.push(`ui screen ${u.id} rebuilds ${att.file}, so its owner_assets entry must have mode "rebuild"`);
    }
  }
  for (const o of assets) {
    if (o.mode === 'rebuild' && !screens.some((u) => u.asset !== null && slash(u.asset).endsWith(slash(o.file).split('/').slice(-2).join('/')))) out.push(`owner image ${o.file} has mode "rebuild" but no ui_screens entry uses it as its asset`);
  }
  return out;
}

const uiSourceFile = (dir: string, a: Attachment) => path.join(dir, 'plan', 'ui-source', `${path.basename(a.file, path.extname(a.file))}.json`);

/**
 * D84: measures every owner image from its pixels (engine/ui-measure.py) into plan/ui-source/NN.json, so a rebuilt screen takes its colours
 * and element boxes from numbers, not from a guess. Done once per image; a file that is already valid is kept.
 */
export async function measureOwnerImages(dir: string, attachments: readonly Attachment[], engineDir: string, run: Tool): Promise<string[]> {
  const made: string[] = [];
  for (const a of attachments) {
    const out = uiSourceFile(dir, a);
    made.push(path.relative(dir, out).split(path.sep).join('/'));
    try { if (fs.existsSync(out)) { readJson(out, UiSource); continue; } } catch { /* an invalid file is measured again */ }
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const r = await run('python', ['-I', path.join(engineDir, 'ui-measure.py'), path.join(dir, ...a.file.split('/')), out], { timeoutMs: 5 * 60000, env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' } });
    if (r.code !== 0) throw new StageError('failed', `اندازه‌گیری تصویر «${a.original_name}» (ui-measure.py) خطا داد.`, (r.stderr || r.error || '').slice(-1500));
    try { readJson(out, UiSource); } catch (e) { throw new StageError('failed', `خروجی اندازه‌گیری تصویر «${a.original_name}» معتبر نیست.`, (e as Error).message); }
  }
  return made;
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
    return [...checkPlan(plan, pkg, audio, voice), ...ownerAssetProblems(plan, attachments), ...uiScreenProblems(plan, audio, attachments)];
  } catch (e) {
    return [e instanceof ContractError ? e.message : (e as Error).message];
  }
}

export function planStage(runFn: RunFn = (o, c) => runClaude(o, { config: c }), tool: Tool = runTool): Stage {
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
      await measureOwnerImages(ctx.dir, ctx.req.attachments, paths.engine, tool);
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
