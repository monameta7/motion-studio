// Responsibility: the package step of a video film (Phase 11.7 task 3) and the one `package` registry entry that sends each job to its own workspace's package code, so a motion job runs the motion package exactly as before and a video job never touches a motion build.
import fs from 'node:fs';
import path from 'node:path';
import { brandDir } from '../brands/index.js';
import { AssemblyFile, ContentPackage, Manifest, readJson, writeJson } from '../contracts/index.js';
import { jobsRepo, usageRepo } from '../db/repositories.js';
import { StageError, type Stage, type StageContext, type StageOutput } from '../orchestrator/stages.js';
import { runTool } from '../proc.js';
import { ledgerMetrics, writeLedger } from '../metrics/tokenLedger.js';
import { loadRounds } from '../stages/content/index.js';
import { assemblePaths, type Verify } from '../stages/assemble/index.js';
import { captionText, jobMetrics, qaFlaws } from './index.js';
import { coverFrameSeconds, makeCover, type CoverResult, type Tool } from './videoCover.js';

/** `package` for both workspaces (D88): the job's own workspace decides which code runs; the context is passed on untouched. */
export function workspacePackage(motion: Stage, video: Stage): Stage {
  return { name: 'package', run: (ctx: StageContext) => (ctx.req.workspace === 'video' ? video.run(ctx) : motion.run(ctx)) };
}

/**
 * `keepCover` (Phase 11.9, owner «درست کن»): the sound revision keeps the film's own cover and its check instead of drawing it again,
 * so a film made before a later cover design is not refused by the revision's «only the sound changed» guard.
 */
export interface VideoPackageDeps { tool?: Tool; keepCover?: boolean }

const r4 = (x: number) => Math.round(x * 10000) / 10000;

/** The film's ledger in dollars from its usage rows: Google Vertex = the clips' rows (stage `clips`), Claude = every other row. */
export function filmLedger(ctx: StageContext): { claude: number; vertex: number; total: number } {
  const id = jobsRepo.bySlug(ctx.db, ctx.req.slug)?.id;
  const rows = id ? usageRepo.byJob(ctx.db, id) : [];
  const vertex = rows.filter((u) => u.stage === 'clips').reduce((n, u) => n + u.cost_usd_est, 0);
  const claude = rows.filter((u) => u.stage !== 'clips').reduce((n, u) => n + u.cost_usd_est, 0);
  return { claude: r4(claude), vertex: r4(vertex), total: r4(claude + vertex) };
}

/** Caption, package text, the 4:5 cover made on the PC (D102 c, D33), the manifest with the film's ledger, the archive row; never a Claude call. */
export function videoPackageStage(deps: VideoPackageDeps = {}): Stage {
  const tool: Tool = deps.tool ?? ((c, a, o) => runTool(c, a, o));
  return {
    name: 'package',
    async run(ctx: StageContext): Promise<StageOutput> {
      const p = assemblePaths(ctx.dir);
      if (!fs.existsSync(p.final) || !fs.existsSync(p.verify) || !fs.existsSync(p.assembly)) throw new StageError('blocked', 'ویدیوی سرهم‌شده یا نتیجه‌ی بررسی آن پیدا نشد؛ اول مرحله‌ی سرهم کردن را کامل کن.', 'out/final.mp4, logs/assemble-verify.json or video/assembly.json missing');
      const checked = JSON.parse(fs.readFileSync(p.verify, 'utf8')) as Verify;
      if (checked.problems.length) throw new StageError('failed', 'ویدیوی سرهم‌شده بررسی خودکار را رد نکرده است.', checked.problems.join('; '));
      const assembly = readJson(p.assembly, AssemblyFile);
      const pkg = readJson(path.join(ctx.dir, 'content', 'package.json'), ContentPackage);
      const out = path.join(ctx.dir, 'out');
      fs.writeFileSync(path.join(out, 'caption.txt'), captionText(pkg), 'utf8');
      fs.copyFileSync(path.join(ctx.dir, 'content', 'package.md'), path.join(out, 'package.md'));

      let cover: CoverResult | undefined;
      const coverQa = path.join(ctx.dir, 'logs', 'cover-qa.json');
      if (deps.keepCover && fs.existsSync(path.join(out, 'cover-4x5.png')) && fs.existsSync(coverQa)) {
        try { cover = JSON.parse(fs.readFileSync(coverQa, 'utf8')) as CoverResult; } catch { cover = undefined; }
      }
      if (!cover) try {
        cover = await makeCover({
          dir: ctx.dir, root: ctx.config.paths.root, brandDir: brandDir(ctx.config.paths, ctx.req.brand), engineDir: ctx.config.paths.engine,
          cover: pkg.cover, frameS: coverFrameSeconds(assembly.body_frames / assembly.fps), tool,
        });
      } catch (e) { throw new StageError('failed', 'کاور ویدیو ساخته نشد.', (e as Error).message); }
      fs.writeFileSync(path.join(ctx.dir, 'logs', 'cover-qa.json'), `${JSON.stringify(cover, null, 2)}\n`, 'utf8');
      // The correction passes of the mix are copies of out/final.mp4 once it is verified; picture, voice and bed stay for a sound revision.
      for (const f of fs.readdirSync(p.render)) if (/^mix(-.+)?\.mp4$/.test(f)) fs.rmSync(path.join(p.render, f), { force: true });

      const metrics = jobMetrics(ctx.db, ctx.req.slug);
      let ledger: Record<string, unknown>;
      try { ledger = ledgerMetrics(writeLedger(ctx.dir, ctx.req.slug)); } catch (e) { ledger = { error: (e as Error).message.slice(0, 300) }; }
      fs.writeFileSync(path.join(ctx.dir, 'logs', 'metrics.json'), `${JSON.stringify({ ...metrics, ledger }, null, 2)}\n`, 'utf8');

      const rounds = loadRounds(ctx.dir);
      const flaws = [...(fs.existsSync(p.qa) ? qaFlaws(fs.readFileSync(p.qa, 'utf8')) : []), ...cover.problems.map((x) => `cover: ${x}`)];
      const manifest = writeJson(path.join(out, 'manifest.json'), Manifest, {
        slug: ctx.req.slug, topic: ctx.req.topic, format: ctx.req.format, duration: assembly.body_frames / assembly.fps, total_duration: assembly.total_s,
        files: { video: 'out/final.mp4', cover_4x5: 'out/cover-4x5.png', caption: 'out/caption.txt', package: 'out/package.md', qa: 'out/qa.md' },
        references: [],
        truth_score: rounds.at(-1)?.score ?? 0, truth_rounds: Math.max(1, rounds.length),
        qa: { passed: cover.problems.length === 0, flaws },
        metrics: { wall_minutes: metrics.wall_minutes, tokens_in: metrics.tokens_in, tokens_out: metrics.tokens_out, cost_usd_est: metrics.cost_usd_est },
        video: { clips: assembly.clips.length, flagged: assembly.flagged, clip_sound_db: assembly.clip_sound_db, ledger_usd: filmLedger(ctx) },
        created_at: new Date().toISOString(),
      });
      jobsRepo.setManifest(ctx.db, ctx.req.slug, JSON.stringify(manifest));
      return { outputs: ['out/caption.txt', 'out/package.md', 'out/cover-4x5.png', 'out/manifest.json', 'logs/cover-qa.json', 'logs/metrics.json', ...('error' in ledger ? [] : ['logs/token-ledger.json'])] };
    },
  };
}
