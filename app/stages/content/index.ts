// Responsibility: run hook then truth until the package passes the gate or the rounds run out, saving every round (docs/03 S2).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { renderPrompt } from '../../ai/prompts/index.js';
import { BrandError, brandDir, brandPrompt, type BrandPrompt } from '../../brands/index.js';
import { runClaude, type RunOptions, type RunResult } from '../../ai/claudeRunner.js';
import type { LoadedConfig } from '../../config.js';
import { ContentPackage, RubricFile, TruthRound, readJson, writeJson, type ClaudeModel, type ClaudeStage, type JobRequest } from '../../contracts/index.js';
import { stripDirections } from '../../intake/index.js';
import { jobsRepo, usageRepo } from '../../db/repositories.js';
import { faNum } from '../../fa.js';
import { StageError, type Stage, type StageContext, type StageOutput } from '../../orchestrator/stages.js';
import { checkVerbatim } from './verbatim.js';
import { ROUNDS_BLOCK_DETAIL, decisionFile, readDecision } from './decision.js';

export type RunFn = (opts: RunOptions, config: LoadedConfig) => Promise<RunResult>;

/** The docs/05 escalation target when a cheaper model fails twice. */
const OPUS: ClaudeModel = 'claude-opus-5-5';
const pad = (n: number) => String(n).padStart(2, '0');
const sha = (file: string) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

/** Paths inside one job's content folder. */
export const contentPaths = (dir: string) => {
  const c = path.join(dir, 'content');
  return {
    dir: c, rounds: path.join(c, 'rounds'), pkg: path.join(c, 'package.json'), md: path.join(c, 'package.md'), rubric: path.join(c, 'rubric.json'),
    roundFile: (n: number) => path.join(c, 'rounds', `${pad(n)}.json`),
    roundPkg: (n: number) => path.join(c, 'rounds', `${pad(n)}.package.json`),
    roundMd: (n: number) => path.join(c, 'rounds', `${pad(n)}.package.md`),
    mdReady: (n: number) => path.join(c, 'rounds', `${pad(n)}.md-ready.json`),
    rubricLock: path.join(c, 'rounds', 'rubric.round1.json'),
  };
};

/** Round files already on disk and valid, in order from round 1; stops at the first gap. */
export function loadRounds(dir: string): TruthRound[] {
  const p = contentPaths(dir);
  const out: TruthRound[] = [];
  for (let n = 1; fs.existsSync(p.roundFile(n)); n++) out.push(readJson(p.roundFile(n), TruthRound));
  return out;
}

/** The pass rule of docs/03: score at or above the bar and no cap active. The code decides; the model's own `passed` flag is ignored. */
export const passes = (score: number, caps: readonly string[], passScore: number): boolean => score >= passScore && caps.length === 0;

const oneSpace = (s: string) => s.replace(/\s+/g, ' ').trim();

/** The docs/05 additions of 2026-10-27 (D41, D42) for the hook's first round: the [ ] rule always, the images when there are any, the verbatim rule when the hook switch is off. */
export function hookAdditions(req: JobRequest, dir: string): string {
  const out = ['Text inside [ ] in the topic is the owner\'s build direction (for example where and how to show an image): follow it, and never put it, or the brackets, in voice lines or on-screen texts.'];
  if (req.attachments.length) {
    const list = req.attachments.map((a) => `${path.join(dir, ...a.file.split('/'))} («${a.original_name}»)`).join(', ');
    out.push(`Owner images, open each with Read: ${list}. Every image must appear in the film, as the [ ] directions say (else where the voice talks about it). Plan shots for them in the shot list.`);
  }
  if (!req.hook_writes_voice) out.push('The topic without its [ ] parts is the owner\'s voice-over. voice_lines = that text split at sentence ends, without changing, adding or removing a single word or character. Write every other field (hook line as on-screen text, on-screen texts, shot list, cover, caption, hashtags) around it.');
  return `\n${out.join('\n')}`;
}

export const TRUTH_IGNORE_VOICE = 'The voice lines are the owner\'s own text: do not score, fact-check, fix or comment on them. Evaluate only the other fields.';
export const NEVER_CHANGE_VOICE = 'Never change the voice lines.';

/** D41 checks on a package: no [ or ] in voice lines or on-screen texts; with the hook off, the joined voice lines equal the input without its [ ] parts (whitespace normalised). */
export function directionProblems(pkg: ContentPackage, req: JobRequest): string[] {
  const out: string[] = [];
  for (const l of pkg.voice_lines) if (/[[\]]/.test(l.text)) out.push(`voice line ${l.id} contains [ or ]; text inside [ ] is a build direction, never voiced`);
  for (const t of pkg.on_screen_texts) if (/[[\]]/.test(t.text)) out.push(`on-screen text «${t.text}» contains [ or ]`);
  if (!req.hook_writes_voice) {
    const want = oneSpace(stripDirections(req.topic));
    const got = oneSpace(pkg.voice_lines.map((l) => l.text).join(' '));
    if (got !== want) {
      let i = 0;
      while (i < want.length && want[i] === got[i]) i++;
      out.push(`the hook switch is off: the voice lines joined must equal the owner's text without [ ] parts, word for word; they differ from character ${i} («${want.slice(i, i + 30)}» expected, «${got.slice(i, i + 30)}» found)`);
    }
  }
  return out;
}

/** The numbered fix list for the next hook revision: truth's fixes, or, if it gave none, the checks it failed. */
export function fixesFor(r: TruthRound): string[] {
  if (r.fixes.length) return r.fixes;
  return r.rubric.filter((x) => !x.pass).map((x) => `${x.criterion}: ${x.check}${x.evidence ? ` (${x.evidence})` : ''}`);
}

const rubricShape = (r: TruthRound) => r.rubric.map((x) => `${x.criterion}|${x.weight}`).sort().join('\n');
const issues = (e: z.ZodError) => e.issues.slice(0, 4).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');

/** An answer from Claude that the app refuses; the call is repeated with this message appended (docs/03 retries). */
class Rejected extends Error {}

export function contentStage(runFn: RunFn = (o, c) => runClaude(o, { config: c })): Stage {
  return {
    name: 'content',
    async run(ctx: StageContext): Promise<StageOutput> {
      // No copy of the config: Settings replaces `ctx.config.cfg`, and every call below reads the current one, so a model or level change applies from the next call (Phase 7).
      const cfg = () => ctx.config.cfg;
      if (cfg().content.use_story_series) {
        throw new StageError('blocked', 'گزینه‌ی story-series هنوز ساخته و آزمایش نشده؛ آن را در تنظیمات خاموش کن.', 'content.use_story_series=true');
      }
      const p = contentPaths(ctx.dir);
      fs.mkdirSync(p.rounds, { recursive: true });
      fs.mkdirSync(path.join(ctx.dir, 'logs'), { recursive: true });
      const totals = { in: 0, out: 0, cost: 0 };
      const done = (): StageOutput => ({
        outputs: ['content/package.json', 'content/package.md', 'content/rubric.json', ...fs.readdirSync(p.rounds).sort().map((f) => `content/rounds/${f}`),
          ...(fs.existsSync(decisionFile(ctx.dir)) ? ['content/owner-decision.json'] : [])],
        tokens: { in: totals.in, out: totals.out },
        cost_usd_est: totals.cost,
      });

      const rounds = loadRounds(ctx.dir);
      const last = rounds.at(-1);
      if (last && passes(last.score, last.caps, cfg().content.pass_score) && fs.existsSync(p.pkg)) return done();
      // D77: the owner accepted the last package below the gate (final, like a D45 edit), or allowed more rounds.
      const decision = readDecision(ctx.dir);
      if (decision.accepted && fs.existsSync(p.pkg)) return done();
      const maxRounds = cfg().content.max_rounds + decision.extra_rounds;

      const jobId = jobsRepo.bySlug(ctx.db, ctx.req.slug)?.id ?? null;
      // Phase 8: the job's own brand (request.json), for the prompts and the folder the runner adds.
      let brand: BrandPrompt & { folder: string };
      try { brand = { ...brandPrompt(ctx.config.paths, ctx.req.brand), folder: brandDir(ctx.config.paths, ctx.req.brand) }; } catch (e) {
        if (e instanceof BrandError) throw new StageError('blocked', e.message_fa, e.message);
        throw e;
      }

      type Outcome = { value: unknown } | { problem: string; rejected: boolean };
      const once = async (stage: ClaudeStage, model: ClaudeModel, prompt: string, schema: z.ZodType, accept: (structured: unknown) => unknown): Promise<Outcome> => {
        const attempt = fs.readdirSync(path.join(ctx.dir, 'logs')).filter((f) => f.startsWith(`${stage}-`)).length + 1;
        const r = await runFn({ stage, jobDir: ctx.dir, brandDir: brand.folder, attempt, model, prompt, jsonSchema: z.toJSONSchema(schema, { io: 'input' }) }, ctx.config);
        totals.in += r.usage.input_tokens;
        totals.out += r.usage.output_tokens;
        totals.cost += r.costUsdEst;
        usageRepo.insert(ctx.db, {
          job_id: jobId, brand: ctx.req.brand, stage, model: r.model, tokens_in: r.usage.input_tokens, tokens_out: r.usage.output_tokens,
          cache_read: r.usage.cache_read_input_tokens, cache_write: r.usage.cache_creation_input_tokens, cost_usd_est: r.costUsdEst,
        });
        if (r.rateLimited && !r.ok) throw new StageError('paused_quota', 'سهمیه‌ی Claude پر شد؛ بعد از آزاد شدن خودش ادامه می‌دهد.', r.error ?? 'rate limit', r.resumeAt);
        if (!r.ok) return { problem: r.error ?? 'the claude call failed', rejected: false };
        try { return { value: accept(r.structured) }; } catch (e) {
          if (!(e instanceof Rejected)) throw e;
          fs.appendFileSync(path.join(ctx.dir, 'logs', 'content-rejections.jsonl'), `${JSON.stringify({ stage, model, at: new Date().toISOString(), problem: e.message })}
`, 'utf8');
          return { problem: e.message, rejected: true };
        }
      };

      /**
       * One Claude call with the docs/03 retry (the reason appended) and the docs/05 escalation to Opus when a cheaper model fails twice.
       * `rescue`: when the model finished but the app rejected the answer, repeating the whole call would redo (and pay for) all the
       * writing; the rescue call only asks again for the structured answer.
       */
      const call = async (stage: ClaudeStage, prompt: string, schema: z.ZodType, accept: (structured: unknown) => unknown, rescue?: { stage: ClaudeStage; prompt: string; mark: () => void }): Promise<unknown> => {
        const configured = cfg().claude.stages[stage].model;
        const models: ClaudeModel[] = configured === OPUS ? [configured, configured] : [configured, configured, OPUS];
        let feedback = '';
        let problem = '';
        for (const model of models) {
          const o = await once(stage, model, prompt + feedback, schema, accept);
          if ('value' in o) return o.value;
          problem = o.problem;
          feedback = `

Your previous answer was rejected by the app: ${problem}
Fix exactly that and answer again.`;
          if (o.rejected && rescue) {
            rescue.mark();
            return call(rescue.stage, rescue.prompt + feedback, schema, accept);
          }
        }
        throw new StageError('failed', `مرحله‌ی محتوا (${stage}) خروجی درست نداد.`, problem);
      };

      /** Writes the round's package to content/package.json and rounds/NN.package.* . */
      const hookStep = async (n: number, previous: TruthRound | undefined): Promise<void> => {
        const accept = (structured: unknown): ContentPackage => {
          if (!fs.existsSync(p.md)) throw new Rejected('content/package.md was not written');
          const md = fs.readFileSync(p.md, 'utf8');
          const parsed = ContentPackage.safeParse(structured);
          if (!parsed.success) throw new Rejected(`structured package invalid: ${issues(parsed.error)}`);
          // `markdown` is the file itself, byte for byte; every other text field is compared with it.
          const pkg: ContentPackage = { ...parsed.data, markdown: md };
          const bad = [...checkVerbatim(pkg, md), ...directionProblems(pkg, ctx.req)];
          if (bad.length) throw new Rejected(bad.slice(0, 5).join(' | '));
          return pkg;
        };
        const structure = renderPrompt('content-hook-structure', { jobDir: ctx.dir });
        const rescue = { stage: 'content-hook-revise' as const, prompt: structure, mark: () => fs.writeFileSync(p.mdReady(n), JSON.stringify({ sha256: sha(p.md), at: new Date().toISOString() }) + '\n', 'utf8') };
        // A previous run finished writing package.md but its structured answer was rejected: do not write it again.
        const written = fs.existsSync(p.mdReady(n)) && fs.existsSync(p.md) && (JSON.parse(fs.readFileSync(p.mdReady(n), 'utf8')) as { sha256?: string }).sha256 === sha(p.md);
        const prompt = previous
          ? renderPrompt('content-hook-revise', { jobDir: ctx.dir, fixes: fixesFor(previous).map((f, i) => `${i + 1}. ${f}`).join('\n') }) + (ctx.req.hook_writes_voice ? '' : `\n${NEVER_CHANGE_VOICE}`)
          : renderPrompt('content-hook', {
            topic: ctx.req.topic, topic_note: ctx.req.topic_note ?? '', format: ctx.req.format, jobDir: ctx.dir,
            brandName: brand.brandName, brandDir: brand.brandDir, brandFont: brand.brandFont,
          }) + hookAdditions(ctx.req, ctx.dir);
        const pkg = (written
          ? await call(rescue.stage, structure, ContentPackage, accept)
          : await call(previous ? 'content-hook-revise' : 'content-hook', prompt, ContentPackage, accept, rescue)) as ContentPackage;
        writeJson(p.roundPkg(n), ContentPackage, pkg);
        fs.copyFileSync(p.md, p.roundMd(n));
        writeJson(p.pkg, ContentPackage, pkg);
      };

      const truthStep = async (n: number): Promise<TruthRound> => {
        const accept = (structured: unknown): TruthRound => {
          if (typeof structured !== 'object' || structured === null) throw new Rejected('truth returned no object');
          const s = structured as Record<string, unknown>;
          const score = typeof s.score === 'number' ? s.score : NaN;
          const caps = Array.isArray(s.caps) ? s.caps.map(String) : [];
          const r = TruthRound.safeParse({ ...s, caps, passed: passes(score, caps, cfg().content.pass_score) });
          if (!r.success) throw new Rejected(`truth round invalid: ${issues(r.error)}`);
          if (r.data.round !== n) throw new Rejected(`truth answered for round ${r.data.round}, expected ${n}`);
          if (!fs.existsSync(p.rubric)) throw new Rejected('truth did not save content/rubric.json');
          try { RubricFile.parse(JSON.parse(fs.readFileSync(p.rubric, 'utf8'))); } catch (e) { throw new Rejected(`content/rubric.json invalid: ${(e as Error).message.slice(0, 200)}`); }
          if (n === 1) fs.copyFileSync(p.rubric, p.rubricLock);
          else {
            if (sha(p.rubric) !== sha(p.rubricLock)) {
              fs.copyFileSync(p.rubricLock, p.rubric);
              throw new Rejected('content/rubric.json was changed after round 1; the rubric must stay fixed (it was restored)');
            }
            if (rubricShape(r.data) !== rubricShape(readJson(p.roundFile(1), TruthRound))) throw new Rejected('the rubric rows differ from round 1; use the same criteria and weights');
          }
          return r.data;
        };
        // Later rounds must start from round 1's rubric even if an earlier failed attempt touched the file.
        if (n > 1 && fs.existsSync(p.rubricLock)) fs.copyFileSync(p.rubricLock, p.rubric);
        const truthPrompt = renderPrompt('content-truth', { jobDir: ctx.dir, round: String(n), brandShortName: brand.brandShortName }) +(ctx.req.hook_writes_voice ? '' : `\n${TRUTH_IGNORE_VOICE}`);
        const round = (await call('content-truth', truthPrompt, TruthRound, accept)) as TruthRound;
        writeJson(p.roundFile(n), TruthRound, round);
        return round;
      };

      for (let n = rounds.length + 1; n <= maxRounds; n++) {
        // A stop between hook and truth leaves rounds/NN.package.json behind; its hook call is not repeated (it costs quota).
        const reusable = fs.existsSync(p.roundPkg(n)) && fs.existsSync(p.md) && fs.readFileSync(p.md, 'utf8') === fs.readFileSync(p.roundMd(n), 'utf8');
        if (reusable) writeJson(p.pkg, ContentPackage, readJson(p.roundPkg(n), ContentPackage));
        else await hookStep(n, rounds.at(-1));
        const r = await truthStep(n);
        rounds.push(r);
        if (r.passed) return done();
      }
      const best = rounds.at(-1)!;
      throw new StageError(
        'blocked',
        `بعد از ${faNum(rounds.length)} دور بازبینی، امتیاز بسته ${faNum(best.score)} از ۱۰۰ است (حداقل ${faNum(cfg().content.pass_score)}${best.caps.length ? ` و بدون سقف؛ سقف فعال: ${best.caps.join('، ')}` : ''}). متن آخر زیر «سناریو و پکیج محتوا» است؛ اگر درست است «قبول همین متن» را بزن، وگرنه «یک دور دیگر».`,
        `${ROUNDS_BLOCK_DETAIL}${rounds.length} last_score=${best.score} caps=${best.caps.join(',')}`,
      );
    },
  };
}
