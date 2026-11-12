// Responsibility: the headless command line: create a job and run it (`--topic`), continue a stopped job (`--resume`), or approve a plan (`--approve`), printing progress in Persian.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { ConfigError, loadConfig, type LoadedConfig } from './config.js';
import { openDb, type Db } from './db/db.js';
import { LockBusyError, jobsRepo } from './db/repositories.js';
import { ContractError, ScenePlan, TONES, readJson, type JobState, type StageName } from './contracts/index.js';
import { IntakeError, checkInput, copyImages, prepareImages, requestFromManual } from './intake/index.js';
import { BrandError, activeBrand } from './brands/index.js';
import { createJobFolder, jobDir, readState } from './orchestrator/jobFolder.js';
import { ResumeRefused, approvePlan, recoverInterrupted, rejectPlan, requestHold, resumeJob, runJob, type Orchestrator } from './orchestrator/index.js';
import { writeScriptEditFile } from './orchestrator/scriptEdit.js';
import { buildRegistry, preflightStage } from './orchestrator/stages.js';
import { packageStage } from './package/index.js';
import { defaultDeps } from './preflight/index.js';
import { contentStage } from './stages/content/index.js';
import { buildStage } from './stages/build/index.js';
import { planStage } from './stages/plan/index.js';
import { storyboardTable } from './stages/plan/storyboard.js';
import { referenceStage } from './stages/reference/index.js';
import { stopStartedAvaFarsi } from './stages/voice/avaClient.js';
import { toneOverrideFile, voiceStage } from './stages/voice/index.js';
import { preferPythonForThisProcess } from './pythonPath.js';

const STAGE_FA: Record<StageName, string> = {
  preflight: 'بررسی پیش از شروع', content: 'محتوا', voice: 'صدا', reference: 'خواندن مرجع', plan: 'نقشه‌ی صحنه‌ها', build: 'ساخت فیلم', package: 'بسته‌بندی خروجی',
};
const STATUS_FA: Record<JobState['status'], string> = {
  queued: 'در صف', running: 'در حال اجرا', awaiting_approval: 'منتظر تأیید نقشه', held: 'نگه داشته شد؛ سناریو را اصلاح کن و ادامه بده', blocked: 'متوقف شد؛ کار تو لازم است', failed: 'خطا',
  paused_quota: 'سهمیه پر شد؛ بعداً ادامه می‌دهد', interrupted: 'نیمه‌کاره ماند', done: 'تمام شد', cancelled: 'لغو شد',
};

const USAGE = `استفاده:
  npm run job -- (--topic "متن" | --brief-file <file.txt>) [--attach <image>]… [--no-hook] --ref <slug> [--ref <slug>] [--format 9x16|16x9] [--review] [--note "توضیح"] [--tone formal|narrative|friendly|meditative|energetic]
  npm run job -- --resume <slug> [--force]
  npm run job -- --approve <slug>
  npm run job -- --reject <slug> --note "چه چیزی عوض شود"
  npm run job -- --hold <slug>      (توقف و اصلاح سناریو)
  npm run job -- --script <slug>    (فایل ویرایش سناریو؛ بعد --resume)`;

export function exitCodeFor(state: JobState): number {
  if (state.status === 'done' || state.status === 'awaiting_approval') return 0;
  if (state.status === 'blocked' || state.status === 'paused_quota') return 2;
  return 1;
}

export function makeOrchestrator(config: LoadedConfig, db: Db, print: (s: string) => void): Orchestrator {
  return {
    config,
    db,
    // Phase 3: every stage is real (preflight → content → voice → reference → plan → [gate] → build → package).
    registry: buildRegistry(preflightStage((ctx) => defaultDeps(ctx.config, ctx.db)), {
      content: contentStage(),
      voice: voiceStage(),
      reference: referenceStage(),
      plan: planStage(),
      build: buildStage(),
      package: packageStage(),
    }),
    onStage: (_slug, stage, event, state) => {
      if (event === 'start') print(`… ${STAGE_FA[stage]}`);
      else if (event === 'done') print(`✓ ${STAGE_FA[stage]}`);
      else print(`■ ${STAGE_FA[stage]}: ${STATUS_FA[state.status]}${state.error ? ` — ${state.error.message_fa}` : ''}`);
    },
  };
}

/** Asks on the terminal; null when there is no terminal (a script or a test), so the job simply stays at the gate. */
export function terminalAsk(): ((q: string) => Promise<string>) | null {
  if (!process.stdin.isTTY) return null;
  return async (q) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try { return await rl.question(q); } finally { rl.close(); }
  };
}

export async function main(argv: string[], print: (s: string) => void = (s) => console.log(s), ask: ((q: string) => Promise<string>) | null = terminalAsk()): Promise<number> {
  let args;
  try {
    args = parseArgs({
      args: argv,
      options: {
        topic: { type: 'string' }, 'brief-file': { type: 'string' }, attach: { type: 'string', multiple: true }, 'no-hook': { type: 'boolean', default: false }, ref: { type: 'string', multiple: true }, format: { type: 'string', default: '9x16' },
        review: { type: 'boolean', default: false }, note: { type: 'string' }, tone: { type: 'string' },
        resume: { type: 'string' }, approve: { type: 'string' }, reject: { type: 'string' }, hold: { type: 'string' }, script: { type: 'string' }, force: { type: 'boolean', default: false },
      },
      strict: true,
    }).values;
  } catch (e) {
    print(`${(e as Error).message}\n${USAGE}`);
    return 64;
  }

  let config: LoadedConfig;
  try { config = loadConfig(); } catch (e) {
    if (e instanceof ConfigError) { print(`خطای تنظیمات: ${e.message_fa}\n${e.message}`); return 78; }
    throw e;
  }
  const db = openDb(config.paths.db);
  const o = makeOrchestrator(config, db, print);
  try {
    for (const slug of recoverInterrupted(o)) {
      print(slug === args.resume ? `کار «${slug}» نیمه‌کاره مانده بود؛ از همان مرحله ادامه می‌دهم.` : `کار «${slug}» نیمه‌کاره مانده بود؛ با --resume ادامه بده.`);
    }

    let state: JobState;
    let slug: string;
    if (args.resume) {
      slug = args.resume;
      if (!fs.existsSync(jobDir(config.paths.jobs, slug))) { print(`کاری با نام «${slug}» پیدا نشد.`); return 66; }
      state = await resumeJob(o, slug, args.force);
    } else if (args.approve) {
      slug = args.approve;
      state = await approvePlan(o, slug);
    } else if (args.reject) {
      slug = args.reject;
      state = await rejectPlan(o, slug, args.note ?? '');
    } else if (args.hold) {
      slug = args.hold;
      if (!fs.existsSync(jobDir(config.paths.jobs, slug))) { print(`کاری با نام «${slug}» پیدا نشد.`); return 66; }
      state = requestHold(o, slug, 'cli');
      print(state.status === 'held'
        ? `کار نگه داشته شد. برای اصلاح: npm run job -- --script ${slug}`
        : 'درخواست توقف ثبت شد؛ مرحله‌ی در حال اجرا تا چند ثانیه‌ی دیگر متوقف می‌شود.');
    } else if (args.script) {
      slug = args.script;
      if (!fs.existsSync(jobDir(config.paths.jobs, slug))) { print(`کاری با نام «${slug}» پیدا نشد.`); return 66; }
      state = readState(jobDir(config.paths.jobs, slug));
      if (state.status !== 'held') { print(`اول کار را نگه دار: npm run job -- --hold ${slug}`); return 65; }
      const { file, created } = writeScriptEditFile(jobDir(config.paths.jobs, slug));
      print(`${created ? 'فایل ویرایش ساخته شد' : 'فایل ویرایش از قبل هست'}: ${file}\nمتن‌ها را در همین فایل عوض کن (جمله اضافه یا کم نکن)، بعد: npm run job -- --resume ${slug}`);
    } else if (args.topic !== undefined || args['brief-file'] !== undefined) {
      if (args.topic !== undefined && args['brief-file'] !== undefined) { print(`فقط یکی از --topic یا --brief-file.\n${USAGE}`); return 64; }
      if (args.format !== '9x16' && args.format !== '16x9') { print(`قالب باید 9x16 یا 16x9 باشد.\n${USAGE}`); return 64; }
      if (args.tone !== undefined && !(TONES as readonly string[]).includes(args.tone)) { print(`لحن باید یکی از ${TONES.join('، ')} باشد.\n${USAGE}`); return 64; }
      let topic = args.topic ?? '';
      if (args['brief-file'] !== undefined) {
        if (!fs.existsSync(args['brief-file'])) { print(`فایل متن پیدا نشد: ${args['brief-file']}`); return 66; }
        topic = fs.readFileSync(args['brief-file'], 'utf8').replace(new RegExp('^' + String.fromCharCode(0xfeff)), '').replace(/\r\n/g, '\n');
      }
      const hookWritesVoice = args['no-hook'] ? false : config.cfg.content.hook_writes_voice_default;
      let images;
      let brand: string;
      try {
        checkInput(topic, hookWritesVoice, config.cfg.intake);
        images = prepareImages(args.attach ?? [], config.cfg.intake);
        // Phase 8: the film is the active brand's (the sidebar switcher sets it).
        brand = activeBrand(db, config).slug;
      } catch (e) {
        if (e instanceof IntakeError || e instanceof BrandError) { print(e.message_fa); return 65; }
        throw e;
      }
      const req = requestFromManual(
        { topic, topicNote: args.note ?? null, references: args.ref ?? [], format: args.format, automationLevel: args.review ? 'review' : 'full', hookWritesVoice, attachments: images.map((i) => i.attachment), brand },
        (s) => jobsRepo.slugExists(db, s) || fs.existsSync(jobDir(config.paths.jobs, s)),
      );
      const dir = createJobFolder(config.paths.jobs, req);
      copyImages(dir, images);
      if (args.tone !== undefined) fs.writeFileSync(toneOverrideFile(dir), `${JSON.stringify({ tone: args.tone })}\n`, 'utf8');
      jobsRepo.insert(db, req);
      slug = req.slug;
      print(`کار تازه: ${slug}${hookWritesVoice ? '' : ' (هوک خاموش: متن بیرون از کروشه همان متن گوینده است)'}${images.length ? `، ${images.length} تصویر` : ''}`);
      state = await runJob(o, slug);
    } else {
      print(USAGE);
      return 64;
    }
    // Approval gate (docs/03 S5b): show the storyboard and wait for `approve` or `reject "<note>"` when a person is at the terminal.
    while (ask && state.status === 'awaiting_approval') {
      try { print(storyboardTable(readJson(path.join(jobDir(config.paths.jobs, slug), 'plan', 'scene-plan.json'), ScenePlan))); } catch (e) { print(`نقشه خوانده نشد: ${(e as Error).message}`); break; }
      const answer = (await ask('approve  یا  reject "توضیح"  یا  (خالی = بعداً): ')).trim();
      if (answer === '') break;
      if (/^approve$/i.test(answer)) { state = await approvePlan(o, slug); continue; }
      const m = /^reject\s+"?(.+?)"?$/i.exec(answer);
      if (m) { state = await rejectPlan(o, slug, m[1]!); continue; }
      print('فقط approve یا reject "توضیح" را بنویس.');
    }
    print(`وضعیت «${slug}»: ${STATUS_FA[state.status]}`);
    return exitCodeFor(state);
  } catch (e) {
    if (e instanceof ResumeRefused) { print(e.message_fa); return 65; }
    if (e instanceof LockBusyError) { print(`کار دیگری («${e.holder}») در حال اجراست؛ هر بار فقط یک کار.`); return 75; }
    if (e instanceof ContractError) { print(`داده‌ی نامعتبر: ${e.message}`); return 65; }
    throw e;
  } finally {
    await stopStartedAvaFarsi();
    db.close();
  }
}

const isEntry = process.argv[1] && /cli\.(ts|js)$/.test(process.argv[1]);
if (isEntry) {
  // Before anything starts python (alignment, sound, Claude's Bash): see app/pythonPath.ts.
  preferPythonForThisProcess().catch(() => undefined).then(() => main(process.argv.slice(2))).then((code) => { process.exitCode = code; }, (e: unknown) => { console.error(e); process.exitCode = 1; });
}
