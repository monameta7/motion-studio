// Responsibility: the partial rebuild of a brand (D67): plans which docs a save will rebuild (with a cost estimate), then runs it in the background — Claude writes only the mapped docs through the one runner, code writes colours, fonts, tokens and the outro, and every save is kept as a version.
import fs from 'node:fs';
import path from 'node:path';
import type { RunOptions, RunResult } from '../ai/claudeRunner.js';
import type { LoadedConfig } from '../config.js';
import { BRAND_SECTIONS, BrandAnswers, type BrandBuild, type BrandSection, type VersionMeta } from '../contracts/index.js';
import type { Db } from '../db/db.js';
import { LockBusyError, lockRepo, usageRepo } from '../db/repositories.js';
import { brandDir } from '../brands/index.js';
import { AssetError, TOKENS_TEXT_FILE, ensureFiles, normalizeFonts, taglineFontFile, writeTokens } from './assets.js';
import { OUTRO_FILE, OutroError, outroInputHash, renderOutro, type OutroTool } from './outro.js';
import { CLAUDE_DOCS, DOC_FILES, DOC_TITLES, SECTION_DOCS, SECTION_TITLES, type ClaudeDoc } from './questions.js';
import { answersToMarkdown } from './render.js';
import { changedSections, docPath, handEditedDocs, readBuild, saveVersion, sectionHashes, sha, writeAnswers, writeBuild } from './store.js';
import { TokensText } from './tokens.js';

/** What a doc cost in the Phase 9 quality check (Mahdiyar as a scratch brand, Opus 5.5 high, 2026-11-08: 0.85 + 0.99 + 0.88 + 0.30 = $3.02, 10 min); used until this machine has its own measured average. */
export const DEFAULT_DOC_COST_USD: Record<ClaudeDoc, number> = { 'brand-guide': 0.85, 'design-system': 0.99, 'cover-system': 0.88, tokens: 0.3 };
/** One film ≈ $24 ≈ 70 % of a Pro 5-hour window (docs/14 R2), so one dollar ≈ 2.9 %. */
export const QUOTA_PCT_PER_USD = 70 / 24;
export const BUILD_LOCK_NAME = 'ساخت سندهای برند';
export const SKILL_NAME = 'brand-build';

export class BrandBuildError extends Error {
  constructor(public readonly message_fa: string, detail = '') { super(`${message_fa}${detail ? ` (${detail})` : ''}`); this.name = 'BrandBuildError'; }
}

export interface PlanDoc { doc: ClaudeDoc; title: string; sections: BrandSection[]; hand_edited: boolean; rebuild: boolean; est_usd: number }
export interface Plan {
  first_build: boolean;
  sections: { id: BrandSection; title: string }[];
  docs: PlanDoc[];
  /** The outro is re-rendered by code (free). */
  outro: boolean;
  est_usd: number;
  est_quota_pct: number;
  /** True when the estimate comes from real runs; false for the first, unmeasured numbers. */
  measured: boolean;
}

/** Average cost of one call per doc from the usage table (stage `brand-build:<doc>`), else the Phase 9 quality-check figures. */
export function docCost(db: Db, doc: ClaudeDoc): { usd: number; measured: boolean } {
  // Calls that cost nothing (refused before work, dry runs) say nothing about the price of a doc.
  const r = db.prepare('SELECT AVG(cost_usd_est) AS a, COUNT(*) AS n FROM usage WHERE stage = ? AND cost_usd_est > 0').get(`${SKILL_NAME}:${doc}`) as { a: number | null; n: number };
  return r.n > 0 && r.a !== null ? { usd: r.a, measured: true } : { usd: DEFAULT_DOC_COST_USD[doc], measured: false };
}

/** The docs a save of `answers` would rebuild, and what that costs. Nothing is written. */
export function planRebuild(dir: string, answers: BrandAnswers, db: Db): Plan {
  const build = readBuild(dir);
  const changed = changedSections(answers, build);
  const need = new Map<ClaudeDoc, BrandSection[]>();
  for (const s of changed) for (const d of SECTION_DOCS[s]) need.set(d, [...(need.get(d) ?? []), s]);
  // A doc that is missing is rebuilt too (an interrupted first build), whatever changed.
  for (const d of CLAUDE_DOCS) {
    const missing = d === 'tokens' ? !fs.existsSync(path.join(dir, TOKENS_TEXT_FILE)) : !fs.existsSync(docPath(dir, d));
    if (missing && !need.has(d)) need.set(d, []);
  }
  const edited = new Set(handEditedDocs(dir, build));
  const docs: PlanDoc[] = CLAUDE_DOCS.filter((d) => need.has(d)).map((d) => {
    const c = docCost(db, d);
    return { doc: d, title: DOC_TITLES[d], sections: need.get(d)!, hand_edited: edited.has(d), rebuild: !edited.has(d), est_usd: c.usd };
  });
  const est = docs.filter((d) => d.rebuild).reduce((s, d) => s + d.est_usd, 0);
  const outroHash = outroInputHash(dir, answers, taglineFontFile(dir, answers));
  return {
    first_build: build === null,
    sections: changed.map((id) => ({ id, title: SECTION_TITLES[id] })),
    docs,
    outro: build?.outro_input !== outroHash || !fs.existsSync(path.join(dir, OUTRO_FILE)),
    est_usd: est,
    est_quota_pct: est * QUOTA_PCT_PER_USD,
    measured: docs.every((d) => docCost(db, d.doc).measured),
  };
}

// ───────────────────────────── checks on what Claude wrote

const HEX = /#[0-9A-Fa-f]{6}/g;

/** A written doc is accepted only when it is real text, in Persian, with the palette copied exactly (design and cover systems) and no leftovers. */
export function verifyDoc(doc: Exclude<ClaudeDoc, 'tokens'>, text: string, a: BrandAnswers): string | null {
  const min = doc === 'brand-guide' ? 1500 : 2500;
  if (text.trim().length < min) return `سند خیلی کوتاه است (کمتر از ${min} نویسه)`;
  if (!/[؀-ۿ]/.test(text)) return 'سند فارسی نیست';
  if (/\{\{|\bTODO\b|\bTBD\b|lorem ipsum/i.test(text)) return 'در سند جای‌خالی یا نشانه‌ی ناتمامی مانده است';
  if (!/^#\s+\S/m.test(text) || (text.match(/^##\s+\S/gm) ?? []).length < 3) return 'سند ساختار تیتر ندارد';
  if (doc !== 'brand-guide') {
    const have = new Set((text.match(HEX) ?? []).map((h) => h.toUpperCase()));
    const missing = a.visual.colors.map((c) => c.hex.toUpperCase()).filter((h) => !have.has(h));
    if (missing.length) return `رنگ‌های ${missing.join('، ')} در سند نیامده است`;
  }
  return null;
}

// ───────────────────────────── the builder

export interface BuildStep { id: string; label_fa: string; state: 'waiting' | 'running' | 'done' | 'failed' | 'skipped'; detail_fa?: string }
export interface BuildStatus {
  slug: string;
  state: 'idle' | 'running' | 'done' | 'failed';
  steps: BuildStep[];
  error_fa: string | null;
  started_at: string | null;
  finished_at: string | null;
  version: string | null;
}

export interface BuilderDeps {
  config: LoadedConfig;
  db: Db;
  /** Claude through the one runner (tests pass a fake that writes the docs). */
  run: (o: RunOptions) => Promise<RunResult>;
  /** ffmpeg, node and python for the outro (tests pass a fake). */
  tool: OutroTool;
  /** True while a film runs or waits: a build does not start then (it would share the quota and the lock). */
  filmBusy: () => boolean;
  /** Is the `brand-build` skill installed in runtime/? (It is the owner's asset: not installed until the owner approves its text.) */
  skillReady?: () => boolean;
  now?: () => Date;
}

const idleStatus = (slug: string): BuildStatus => ({ slug, state: 'idle', steps: [], error_fa: null, started_at: null, finished_at: null, version: null });

export class BrandBuilder {
  private status_: BuildStatus | null = null;
  private idle: Promise<void> = Promise.resolve();
  constructor(private readonly d: BuilderDeps) {}

  status(slug?: string): BuildStatus | null { return this.status_ && (!slug || this.status_.slug === slug) ? this.status_ : slug ? idleStatus(slug) : null; }
  running(): boolean { return this.status_?.state === 'running'; }
  whenIdle(): Promise<void> { return this.idle; }

  /**
   * Saves `answers` for a brand folder that already exists (files uploaded, logo in place) and rebuilds what changed.
   * Returns at once; progress is `status()`. Refuses while a film runs or another build is running.
   */
  start(slug: string, answers: BrandAnswers, opts: { includeEdited?: ClaudeDoc[]; kind?: 'create' | 'save' } = {}): BuildStatus {
    if (this.running()) throw new BrandBuildError('یک ساخت برند در حال انجام است؛ تا پایانش صبر کن.');
    if (this.d.filmBusy()) throw new BrandBuildError('یک ویدیو در حال ساخت است؛ بعد از پایان آن سندهای برند را بساز.');
    const dir = brandDir(this.d.config.paths, slug);
    const a = normalizeFonts({ ...BrandAnswers.parse(answers), updated_at: (this.d.now?.() ?? new Date()).toISOString() });
    ensureFiles(dir, a);
    const plan = planRebuild(dir, a, this.d.db);
    const include = new Set(opts.includeEdited ?? []);
    const docs = plan.docs.filter((x) => x.rebuild || include.has(x.doc)).map((x) => x.doc);
    if (docs.length > 0 && this.d.skillReady && !this.d.skillReady()) {
      throw new BrandBuildError('مهارت «ساخت برند» هنوز نصب نشده است؛ بعد از تأیید متن آن توسط مالک نصب می‌شود.');
    }
    try { lockRepo.acquire(this.d.db, BUILD_LOCK_NAME); } catch (e) {
      if (e instanceof LockBusyError) throw new BrandBuildError('برنامه مشغول کار دیگری است؛ کمی بعد دوباره امتحان کن.');
      throw e;
    }
    const steps: BuildStep[] = [
      { id: 'files', label_fa: 'آماده‌سازی فایل‌ها', state: 'waiting' },
      ...docs.map((x): BuildStep => ({ id: x, label_fa: `نوشتن «${DOC_TITLES[x]}»`, state: 'waiting' })),
      ...(plan.outro ? [{ id: 'outro', label_fa: 'ساخت لوگوموشن پایانی', state: 'waiting' } as BuildStep] : []),
      { id: 'save', label_fa: 'ذخیره‌ی نسخه', state: 'waiting' },
    ];
    const status: BuildStatus = { slug, state: 'running', steps, error_fa: null, started_at: new Date().toISOString(), finished_at: null, version: null };
    this.status_ = status;
    this.idle = this.execute(status, dir, slug, a, docs, plan, opts.kind ?? 'save').catch((e: unknown) => {
      status.state = 'failed';
      status.error_fa = e instanceof BrandBuildError || e instanceof AssetError || e instanceof OutroError ? e.message_fa : 'ساخت برند انجام نشد؛ دوباره امتحان کن.';
      if (!(e instanceof BrandBuildError || e instanceof AssetError || e instanceof OutroError)) console.error(e);
    }).finally(() => { status.finished_at = new Date().toISOString(); lockRepo.release(this.d.db); });
    return status;
  }

  private step(s: BuildStatus, id: string, state: BuildStep['state'], detail?: string): void {
    const st = s.steps.find((x) => x.id === id);
    if (st) { st.state = state; if (detail) st.detail_fa = detail; else delete st.detail_fa; }
  }

  private async execute(status: BuildStatus, dir: string, slug: string, a: BrandAnswers, docs: ClaudeDoc[], plan: Plan, kind: 'create' | 'save'): Promise<void> {
    const { config } = this.d;
    const prev = readBuild(dir);
    this.step(status, 'files', 'running');
    writeAnswers(dir, a);
    writeTokens(slug, dir, a);
    const stageDir = path.join(path.dirname(config.paths.db), 'brand-build', slug, (this.d.now?.() ?? new Date()).toISOString().replace(/[:.]/g, '-'));
    const inputs = path.join(stageDir, 'inputs');
    const out = path.join(stageDir, 'out');
    fs.mkdirSync(inputs, { recursive: true });
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(inputs, 'answers.md'), answersToMarkdown(a), 'utf8');
    fs.copyFileSync(path.join(dir, 'tokens.json'), path.join(inputs, 'tokens.json'));
    this.step(status, 'files', 'done');

    const failed: ClaudeDoc[] = [];
    const written: ClaudeDoc[] = [];
    for (const doc of docs) {
      this.step(status, doc, 'running');
      try {
        await this.writeDoc(doc, slug, dir, stageDir, a);
        written.push(doc);
        this.step(status, doc, 'done');
      } catch (e) {
        failed.push(doc);
        this.step(status, doc, 'failed', e instanceof BrandBuildError ? e.message_fa : 'این سند ساخته نشد.');
      }
    }
    // Apply what was written: the docs, then tokens (code + text part).
    for (const doc of written) {
      if (doc === 'tokens') fs.copyFileSync(path.join(out, TOKENS_TEXT_FILE), path.join(dir, TOKENS_TEXT_FILE));
      else fs.copyFileSync(path.join(out, DOC_FILES[doc]), docPath(dir, doc));
    }
    let outroHash = prev?.outro_input;
    let outroFailed = false;
    if (plan.outro) {
      this.step(status, 'outro', 'running');
      try {
        await renderOutro({ dir, answers: a, engineDir: config.paths.engine, fontFile: taglineFontFile(dir, a), tool: this.d.tool });
        outroHash = outroInputHash(dir, a, taglineFontFile(dir, a));
        this.step(status, 'outro', 'done');
      } catch (e) {
        this.step(status, 'outro', 'failed', e instanceof OutroError ? e.message_fa : 'لوگوموشن ساخته نشد.');
        outroFailed = true; // the film needs the outro: the build is reported as not complete
      }
    }
    writeTokens(slug, dir, a);

    // The build record: a section counts as built only when every doc it feeds that was attempted is written.
    const now = sectionHashes(a);
    const changed = new Set(plan.sections.map((s) => s.id));
    const sections: Record<string, string> = { ...(prev?.sections ?? {}) };
    for (const s of BRAND_SECTIONS) {
      const attemptedFail = SECTION_DOCS[s].some((d) => failed.includes(d));
      if (!attemptedFail && (changed.has(s) || sections[s] === undefined)) sections[s] = now[s];
      else if (attemptedFail) delete sections[s];
    }
    const recs: BrandBuild['docs'] = { ...(prev?.docs ?? {}) };
    const stamp = new Date().toISOString();
    for (const doc of CLAUDE_DOCS) {
      if (doc === 'tokens' || !fs.existsSync(docPath(dir, doc))) continue;
      // Written now, or never recorded: the file as it stands. A doc skipped because of a hand edit keeps its old record (it stays "edited").
      if (written.includes(doc) || !recs[doc]) recs[doc] = { sha256: sha(fs.readFileSync(docPath(dir, doc))), built_at: stamp };
    }
    const record: BrandBuild = { built_at: stamp, sections, docs: recs, ...(outroHash ? { outro_input: outroHash } : {}) };
    writeBuild(dir, record);

    this.step(status, 'save', 'running');
    const meta: Omit<VersionMeta, 'id' | 'at'> = { sections: plan.sections.map((s) => s.id), docs: written, kind: kind === 'create' ? 'create' : 'save', restored_from: null };
    status.version = saveVersion(dir, meta, this.d.now?.()).id;
    this.step(status, 'save', 'done');
    status.state = failed.length || outroFailed ? 'failed' : 'done';
    if (failed.length || outroFailed) status.error_fa = 'بعضی بخش‌ها ساخته نشد؛ پاسخ‌هایت ذخیره شد و می‌توانی دوباره «ثبت» را بزنی.';
  }

  /** One Claude call for one doc, checked before it is accepted. */
  private async writeDoc(doc: ClaudeDoc, slug: string, dir: string, stageDir: string, a: BrandAnswers): Promise<void> {
    const { config, db } = this.d;
    const out = path.join(stageDir, 'out');
    const file = doc === 'tokens' ? TOKENS_TEXT_FILE : DOC_FILES[doc];
    const template = path.join(config.paths.brands, config.cfg.brand.default);
    const hasTemplate = slug !== config.cfg.brand.default && fs.existsSync(path.join(template, DOC_FILES[doc === 'tokens' ? 'brand-guide' : doc]));
    const prompt = [
      `/${SKILL_NAME} DOC=${doc} brand=${slug}.`,
      `Inputs (read): ${path.join(stageDir, 'inputs', 'answers.md')} and ${path.join(stageDir, 'inputs', 'tokens.json')} (colours, fonts, logo and outro are decided by code: copy their exact values, never change them).`,
      doc === 'cover-system' ? `Also read ${fs.existsSync(path.join(out, DOC_FILES['design-system'])) ? path.join(out, DOC_FILES['design-system']) : docPath(dir, 'design-system')} if it exists.` : '',
      `Write exactly one file: ${path.join(out, file)}.`,
      hasTemplate ? `Quality template, read only (structure and depth, never its content): ${template}.` : '',
    ].filter(Boolean).join('\n');
    const r = await this.d.run({
      stage: 'brand-build', jobDir: stageDir, prompt, brandDir: dir,
      addDirs: [dir, stageDir, ...(hasTemplate ? [template] : [])],
      maxBudgetUsd: config.cfg.claude.max_budget_usd_per_call.brand,
    });
    usageRepo.insert(db, {
      job_id: null, brand: slug, stage: `${SKILL_NAME}:${doc}`, model: r.model, tokens_in: r.usage.input_tokens, tokens_out: r.usage.output_tokens,
      cache_read: r.usage.cache_read_input_tokens, cache_write: r.usage.cache_creation_input_tokens, cost_usd_est: r.costUsdEst,
    });
    if (!r.ok) throw new BrandBuildError(r.rateLimited ? 'سهمیه تمام شده؛ بعداً دوباره امتحان کن.' : 'این سند نوشته نشد.', r.error);
    const produced = path.join(out, file);
    if (!fs.existsSync(produced)) throw new BrandBuildError('فایل سند نوشته نشد.', file);
    const text = fs.readFileSync(produced, 'utf8');
    if (doc === 'tokens') {
      try { TokensText.parse(JSON.parse(text)); } catch (e) { throw new BrandBuildError('مشخصات برند درست نوشته نشد.', (e as Error).message.slice(0, 200)); }
      return;
    }
    const problem = verifyDoc(doc, text, a);
    if (problem) throw new BrandBuildError(`«${DOC_TITLES[doc]}» پذیرفته نشد: ${problem}.`, problem);
  }
}

