// Responsibility: the video workspace's prompts stage: one Claude call with the video-prompts skill writes video/clip-plan.json, code fills the skill's template into video/prompts/clip-NN.txt and checks the skill's measurable rules (Phase 11.4; docs/13 V1–V3, V36).
import fs from 'node:fs';
import path from 'node:path';
import { runClaude, type RunOptions, type RunResult } from '../../ai/claudeRunner.js';
import { renderPrompt, type PromptName } from '../../ai/prompts/index.js';
import { brandDir } from '../../brands/index.js';
import type { LoadedConfig } from '../../config.js';
import { ClipPlan, ContractError, MAX_CLIPS_PER_FILM, StyleMeta, VoiceLines, VoiceTiming, clipPromptFile, clipsForVoice, readJson, voiceTiming, writeJson } from '../../contracts/index.js';
import { jobsRepo, usageRepo } from '../../db/repositories.js';
import { StageError, type Stage, type StageContext, type StageOutput } from '../../orchestrator/stages.js';
import { parseSheet, readSheet, sheetFile, sheetProblems, type BrandSheet } from './brandSheet.js';
import { colourNamesOf, planProblems, promptProblems } from './checks.js';
import { fillClip, readTemplate } from './template.js';

export type RunFn = (o: RunOptions, c: LoadedConfig) => Promise<RunResult>;

export interface PromptsDeps {
  /** The styles folder (`styles/<slug>/style.json`); left out: the library `paths.styles` (Phase 11.5). Tests pass a fixture folder. */
  stylesDir?: string;
}

/** The skill's default (its «On-screen text» section: ON, limited); the job has no switch for it yet. */
const ON_SCREEN_TEXT = 'on';

export const videoPaths = (dir: string) => {
  const v = path.join(dir, 'video');
  return {
    dir: v, timing: path.join(v, 'voice-timing.json'), sheet: path.join(v, 'brand-sheet.md'), sheetDraft: path.join(v, 'brand-sheet.draft.md'),
    style: path.join(v, 'style.txt'), plan: path.join(v, 'clip-plan.json'), prompts: path.join(v, 'prompts'),
  };
};
const rel = (dir: string, f: string) => path.relative(dir, f).split(path.sep).join('/');

/** The style's text (StyleMeta.text), copied word for word into the skill's style slot: `blocked` with a Persian message when the style is missing or has no text yet (D99: the owner's text is title + card line). */
export function styleText(stylesDir: string, slug: string): string {
  const f = path.join(stylesDir, slug, 'style.json');
  if (!fs.existsSync(f)) throw new StageError('blocked', `سبک تصویری «${slug}» پیدا نشد.`, f);
  let meta: StyleMeta;
  try { meta = readJson(f, StyleMeta); } catch (e) { throw new StageError('failed', `فایل سبک تصویری «${slug}» معتبر نیست.`, (e as Error).message); }
  if (!meta.text) throw new StageError('blocked', `سبک «${meta.title}» هنوز متن سبک ندارد؛ متنش را در «کتابخانه‌ی سبک‌ها» بنویس.`, `style ${slug} has text null`);
  return meta.text;
}

interface Call { stage: StageContext; runFn: RunFn; brandFolder: string; jobId: string | null; totals: { in: number; out: number; cost: number } }

async function callClaude(c: Call, name: PromptName, values: Record<string, string>, logPrefix: string): Promise<RunResult> {
  const logs = path.join(c.stage.dir, 'logs');
  fs.mkdirSync(logs, { recursive: true });
  const attempt = fs.readdirSync(logs).filter((f) => f.startsWith(logPrefix)).length + 1;
  const r = await c.runFn({ stage: 'prompts', jobDir: c.stage.dir, brandDir: c.brandFolder, attempt, prompt: renderPrompt(name, values), signal: c.stage.signal }, c.stage.config);
  c.totals.in += r.usage.input_tokens; c.totals.out += r.usage.output_tokens; c.totals.cost += r.costUsdEst;
  usageRepo.insert(c.stage.db, {
    job_id: c.jobId, brand: c.stage.req.brand, stage: 'prompts', model: r.model, tokens_in: r.usage.input_tokens, tokens_out: r.usage.output_tokens,
    cache_read: r.usage.cache_read_input_tokens, cache_write: r.usage.cache_creation_input_tokens, cost_usd_est: r.costUsdEst,
  });
  if (r.rateLimited && !r.ok) throw new StageError('paused_quota', 'سهمیه‌ی Claude پر شد؛ بعد از آزاد شدن خودش ادامه می‌دهد.', r.error ?? 'rate limit', r.resumeAt);
  return r;
}

const feedbackOf = (problems: string[], what: string) => `\nThe app rejected your ${what}. Fix exactly these problems and write the file again:\n${problems.map((x, i) => `${i + 1}. ${x}`).join('\n')}`;
const reject = (dir: string, file: string, problems: string[]) => fs.appendFileSync(path.join(dir, 'logs', file), `${JSON.stringify({ at: new Date().toISOString(), problems })}\n`, 'utf8');

/** A brand with no sheet yet gets one, written once by the skill from the brand's own docs, checked, then kept in `brand/_sheets/` (owner 2026-11-17). */
async function newBrandSheet(c: Call): Promise<BrandSheet> {
  const p = videoPaths(c.stage.dir);
  let problems: string[] = [];
  let extra = '';
  for (let round = 0; round < 2; round++) {
    fs.rmSync(p.sheetDraft, { force: true });
    const r = await callClaude(c, 'video-brand-sheet', { brandDir: c.brandFolder, jobDir: c.stage.dir, extra }, 'prompts-sheet-');
    let sheet: BrandSheet | null = null;
    if (!r.ok) problems = [r.error ?? 'the claude call failed'];
    else if (!fs.existsSync(p.sheetDraft)) problems = ['video/brand-sheet.draft.md was not written'];
    else {
      try { sheet = parseSheet(fs.readFileSync(p.sheetDraft, 'utf8')); problems = sheetProblems(sheet); } catch (e) { problems = [(e as Error).message]; }
    }
    if (sheet && problems.length === 0) {
      const target = sheetFile(c.stage.config.paths.root, c.stage.req.brand);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(p.sheetDraft, target);
      return sheet;
    }
    reject(c.stage.dir, 'prompts-sheet-rejections.jsonl', problems);
    extra = feedbackOf(problems, 'brand sheet');
  }
  throw new StageError('failed', 'برگه‌ی برند ویدیو پس از دو بار تلاش معتبر نشد.', problems.slice(0, 6).join('; '));
}

/** Reads the plan and fills every prompt; returns the prompts and the problems (empty = every rule kept). */
function verify(dir: string, template: string, sheet: BrandSheet, style: string, styleSlug: string, timing: VoiceTiming, colourNames: string[]): { prompts: string[]; problems: string[] } {
  const p = videoPaths(dir);
  if (!fs.existsSync(p.plan)) return { prompts: [], problems: ['video/clip-plan.json was not written'] };
  let plan: ClipPlan;
  try { plan = readJson(p.plan, ClipPlan); } catch (e) { return { prompts: [], problems: [e instanceof ContractError ? e.message : (e as Error).message] }; }
  const problems = planProblems(plan, timing, styleSlug);
  if (plan.on_screen_text !== ON_SCREEN_TEXT) problems.push(`on_screen_text is «${plan.on_screen_text}», but this job asks for «${ON_SCREEN_TEXT}»`);
  const prompts = plan.clips.map((c) => fillClip(template, plan, sheet, style, c.index));
  problems.push(...promptProblems({ template, plan, prompts, timing, colourNames }));
  return { prompts, problems };
}

export function promptsStage(runFn: RunFn = (o, c) => runClaude(o, { config: c }), deps: PromptsDeps = {}): Stage {
  return {
    name: 'prompts',
    async run(ctx: StageContext): Promise<StageOutput> {
      if (ctx.req.workspace !== 'video' || !ctx.req.style) throw new StageError('failed', 'مرحله‌ی پرامپت فقط برای کار ویدیو با یک سبک تصویری است.', `workspace ${ctx.req.workspace}, style ${String(ctx.req.style)}`);
      const { paths } = ctx.config;
      const p = videoPaths(ctx.dir);
      fs.mkdirSync(p.prompts, { recursive: true });
      fs.mkdirSync(path.join(ctx.dir, 'logs'), { recursive: true });

      // The real voice decides the clip count (D86 i); more than the cap is stopped before any call (D92 a, docs/13 V36).
      const lines = readJson(path.join(ctx.dir, 'voice', 'lines.json'), VoiceLines);
      const timing = writeJson(p.timing, VoiceTiming, voiceTiming(lines.lines));
      const need = clipsForVoice(timing.voice_end_s);
      if (need > MAX_CLIPS_PER_FILM) {
        throw new StageError('blocked', `صدای این ویدیو ${timing.voice_end_s} ثانیه است و ${need} کلیپ ۱۰ ثانیه‌ای لازم دارد؛ بیشترین تعداد ${MAX_CLIPS_PER_FILM} کلیپ (۹۰ ثانیه) است. متن را کوتاه‌تر کن.`, `clips ${need} > ${MAX_CLIPS_PER_FILM}`);
      }

      const style = styleText(deps.stylesDir ?? paths.styles, ctx.req.style);
      fs.writeFileSync(p.style, `${style}\n`, 'utf8');
      const template = readTemplate(paths.runtime);
      const brandFolder = brandDir(paths, ctx.req.brand);
      const tokensFile = path.join(brandFolder, 'tokens.json');
      const colourNames = fs.existsSync(tokensFile) ? colourNamesOf(JSON.parse(fs.readFileSync(tokensFile, 'utf8'))) : [];
      const call: Call = { stage: ctx, runFn, brandFolder, jobId: jobsRepo.bySlug(ctx.db, ctx.req.slug)?.id ?? null, totals: { in: 0, out: 0, cost: 0 } };

      let sheet: BrandSheet | null;
      try { sheet = readSheet(paths.root, ctx.req.brand); } catch (e) { throw new StageError('failed', `برگه‌ی برند ویدیو (brand/_sheets/${ctx.req.brand}.md) معتبر نیست.`, (e as Error).message); }
      if (!sheet) sheet = await newBrandSheet(call);
      fs.copyFileSync(sheetFile(paths.root, ctx.req.brand), p.sheet);

      const outputs = (n: number) => [rel(ctx.dir, p.timing), rel(ctx.dir, p.sheet), rel(ctx.dir, p.style), rel(ctx.dir, p.plan), ...Array.from({ length: n }, (_, k) => clipPromptFile(k + 1))];
      const write = (prompts: string[]) => {
        for (const f of fs.readdirSync(p.prompts)) if (/^clip-\d{2}\.txt$/.test(f)) fs.rmSync(path.join(p.prompts, f));
        prompts.forEach((text, k) => fs.writeFileSync(path.join(ctx.dir, ...clipPromptFile(k + 1).split('/')), text, 'utf8'));
      };
      const done = () => ({ tokens: { in: call.totals.in, out: call.totals.out }, cost_usd_est: call.totals.cost });

      // A plan that is already valid (the stage was interrupted after Claude wrote it) is kept, and its prompts are filled again.
      const kept = verify(ctx.dir, template, sheet, style, ctx.req.style, timing, colourNames);
      if (kept.problems.length === 0) { write(kept.prompts); return { outputs: outputs(kept.prompts.length), ...done() }; }

      let extra = '';
      let problems: string[] = [];
      for (let round = 0; round < 2; round++) {
        fs.rmSync(p.plan, { force: true });
        const r = await callClaude(call, 'video-prompts', { jobDir: ctx.dir, style: ctx.req.style, onOff: ON_SCREEN_TEXT.toUpperCase(), extra }, 'prompts-');
        const v = r.ok ? verify(ctx.dir, template, sheet, style, ctx.req.style, timing, colourNames) : { prompts: [], problems: [r.error ?? 'the claude call failed'] };
        problems = v.problems;
        if (problems.length === 0) { write(v.prompts); return { outputs: outputs(v.prompts.length), ...done() }; }
        reject(ctx.dir, 'prompts-rejections.jsonl', problems);
        extra = feedbackOf(problems, 'clip plan');
      }
      throw new StageError('failed', 'پرامپت کلیپ‌ها پس از دو بار تلاش قانون‌های اسکیل را رعایت نکرد.', problems.slice(0, 6).join('; '));
    },
  };
}
