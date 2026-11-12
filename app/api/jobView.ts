// Responsibility: read one job folder into the plain JSON the UI shows (request, state, truth rounds, script, plan table, delivery), never writing anything.
import fs from 'node:fs';
import path from 'node:path';
import { ContentPackage, Manifest, ScenePlan, ScriptEdits, VoiceLines, readJson, type JobRequest, type JobState } from '../contracts/index.js';
import { loadRounds } from '../stages/content/index.js';
import { jobDir, listJobSlugs, readRequest, readState } from '../orchestrator/jobFolder.js';
import { revisionPendingFile, type RevisionPending } from '../orchestrator/revision.js';
import { scriptPaths } from '../orchestrator/scriptEdit.js';
import { isRoundsBlock, readDecision } from '../stages/content/decision.js';

/** Reads a contract file, or null when it is missing or invalid (the UI shows what exists; the stages fail loudly on their own). */
function tryRead<T>(read: () => T): T | null {
  try { return read(); } catch { return null; }
}

/** A short title from the owner's input: build directions in `[ ]` removed, first non-empty line, at most `max` characters. */
export function shortTitle(topic: string, max = 70): string {
  const line = topic.replace(/\[[^\]]*\]?/g, ' ').split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).find(Boolean) ?? topic.trim();
  const chars = [...line];
  return chars.length > max ? `${chars.slice(0, max - 1).join('').trimEnd()}…` : line;
}

export interface JobSummary {
  slug: string;
  topic: string;
  /** What the UI shows as the job's name: the content package title, else a short line from the input. */
  title: string;
  format: JobRequest['format'];
  references: string[];
  status: JobState['status'];
  stage: JobState['stage'];
  created_at: string;
  updated_at: string;
  duration: number | null;
  truth_score: number | null;
  /** The job's brand (request.json, Phase 8); `brand_name` is filled by the routes from the brand registry. */
  brand: string;
  /** Who started it: the owner or the schedule (Phase 10: the first scheduled film gets a first-time tip). */
  source: JobRequest['source'];
}

export function jobSummary(jobsRoot: string, slug: string): JobSummary | null {
  const dir = jobDir(jobsRoot, slug);
  const req = tryRead(() => readRequest(dir));
  const state = tryRead(() => readState(dir));
  if (!req || !state) return null;
  const manifest = tryRead(() => readJson(path.join(dir, 'out', 'manifest.json'), Manifest));
  const rounds = tryRead(() => loadRounds(dir)) ?? [];
  const pkgTitle = tryRead(() => readJson(scriptPaths(dir).pkg, ContentPackage).title);
  return {
    slug, topic: req.topic, title: pkgTitle ?? shortTitle(req.topic), format: req.format, references: req.references, status: state.status, stage: state.stage,
    created_at: req.created_at, updated_at: state.updated_at,
    duration: manifest?.duration ?? null,
    truth_score: manifest?.truth_score ?? rounds.at(-1)?.score ?? null,
    brand: req.brand,
    source: req.source,
  };
}

/** Every job folder, newest first. */
export function listJobs(jobsRoot: string): JobSummary[] {
  return listJobSlugs(jobsRoot).map((s) => jobSummary(jobsRoot, s)).filter((j): j is JobSummary => j !== null)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export interface ScriptView {
  /** Voice lines in order, each with the on-screen texts that belong to it (docs/11 §2). */
  lines: { id: number; text: string; changed: boolean; on_screen: { index: number; text: string; role: string; changed: boolean }[] }[];
  /** True once the voice stage has a take: changing a voice line then costs one new TTS request (D32). */
  voice_made: boolean;
  /** The owner's edits so far (content/edits.json). */
  edits: number;
}

export function scriptView(dir: string, state: JobState): ScriptView | null {
  const p = scriptPaths(dir);
  const pkg = tryRead(() => readJson(p.pkg, ContentPackage));
  if (!pkg) return null;
  const edits = fs.existsSync(p.edits) ? tryRead(() => readJson(p.edits, ScriptEdits))?.edits ?? [] : [];
  const changed = new Set(edits.map((e) => e.field.replace(/\.text$/, '')));
  return {
    lines: pkg.voice_lines.map((l, i) => ({
      id: l.id, text: l.text, changed: changed.has(`voice_lines[${i}]`),
      on_screen: pkg.on_screen_texts.map((t, index) => ({ index, text: t.text, role: t.role, voice_line: t.voice_line, changed: changed.has(`on_screen_texts[${index}]`) }))
        .filter((t) => t.voice_line === l.id).map(({ voice_line: _v, ...t }) => t),
    })),
    voice_made: state.stages.voice?.status === 'done',
    edits: edits.length,
  };
}

export interface PlanRow { id: number; start: number; end: number; beat: string; component: string; picture: string; texts: string[] }

export function planView(dir: string): { total_duration: number; reference: string; rows: PlanRow[]; risks: string[] } | null {
  const plan = tryRead(() => readJson(path.join(dir, 'plan', 'scene-plan.json'), ScenePlan));
  if (!plan) return null;
  return {
    total_duration: plan.total_duration, reference: plan.reference.slug, risks: plan.risks,
    rows: plan.scenes.map((s) => ({ id: s.id, start: s.start, end: s.end, beat: s.beat, component: s.component, picture: s.picture, texts: s.texts.map((t) => t.text) })),
  };
}

/** The newest rendered frame image under project/render/ (draft or final capture, docs/03 S6), for the In-progress preview. Bounded walk. */
export function latestFrame(dir: string, maxEntries = 20000): string | null {
  const root = path.join(dir, 'project', 'render');
  if (!fs.existsSync(root)) return null;
  let best: { file: string; t: number } | null = null;
  let seen = 0;
  const walk = (d: string) => {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (++seen > maxEntries) return;
      const full = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules') walk(full); continue; }
      if (!/\.(png|jpe?g|webp)$/i.test(e.name)) continue;
      const t = fs.statSync(full).mtimeMs;
      if (!best || t > best.t) best = { file: full, t };
    }
  };
  walk(root);
  return best ? path.relative(dir, (best as { file: string }).file).split(path.sep).join('/') : null;
}

export interface JobDetail extends JobSummary {
  request: JobRequest;
  state: JobState;
  rounds: { round: number; score: number; passed: boolean; caps: string[] }[];
  pass_score: number;
  script: ScriptView | null;
  /** D77: the truth rounds ran out below the gate; the last script is shown with «قبول همین متن» and «یک دور دیگر». */
  script_blocked: boolean;
  /** D77: the owner accepted the script below the gate. */
  script_accepted: boolean;
  plan: ReturnType<typeof planView>;
  manifest: Manifest | null;
  qa_md: string | null;
  caption: string | null;
  voice_file: string | null;
  /** Tone chosen for the voice and its top reasons (voice/lines.json). */
  voice: { voice: string; tone: string; tone_source: string; reasons: { tone: string; points: number; why: string }[] } | null;
  /** The app's own measurement of out/final.mp4 (logs/build-verify.json, written by the build stage). */
  verify: { measure: { duration: number; lufs: number | null; true_peak_dbtp: number | null; w: number | null; h: number | null; fps: number | null } | null; voice_lost: [number, number][] | null; problems: string[] } | null;
  /** The last revisions (logs/revisions.jsonl), newest last. */
  revisions: { at: string; target: string; note?: string; backup: string; unexpected?: string[] }[];
  /** A revision the process was killed in the middle of (its marker file is still there), else null. The routes hide it while the job runs. */
  revision_pending: RevisionPending | null;
}

export function jobDetail(jobsRoot: string, slug: string, passScore: number): JobDetail | null {
  const summary = jobSummary(jobsRoot, slug);
  if (!summary) return null;
  const dir = jobDir(jobsRoot, slug);
  const state = readState(dir);
  const text = (rel: string) => tryRead(() => fs.readFileSync(path.join(dir, rel), 'utf8'));
  const exists = (rel: string) => (fs.existsSync(path.join(dir, rel)) ? rel : null);
  return {
    ...summary,
    request: readRequest(dir),
    state,
    rounds: (tryRead(() => loadRounds(dir)) ?? []).map((r) => ({ round: r.round, score: r.score, passed: r.score >= passScore && r.caps.length === 0, caps: r.caps })),
    pass_score: passScore,
    script: scriptView(dir, state),
    script_blocked: isRoundsBlock(dir, state),
    script_accepted: (tryRead(() => readDecision(dir))?.accepted ?? null) !== null,
    plan: planView(dir),
    manifest: tryRead(() => readJson(path.join(dir, 'out', 'manifest.json'), Manifest)),
    qa_md: text('out/qa.md'),
    caption: text('out/caption.txt'),
    voice_file: exists('plan/voice.wav') ?? exists('voice/take-full.wav'),
    voice: tryRead(() => {
      const v = readJson(path.join(dir, 'voice', 'lines.json'), VoiceLines);
      return { voice: v.voice, tone: v.tone, tone_source: v.tone_source, reasons: [...v.tone_reasons].sort((a, b) => b.points - a.points).slice(0, 3) };
    }),
    verify: tryRead(() => JSON.parse(fs.readFileSync(path.join(dir, 'logs', 'build-verify.json'), 'utf8')) as JobDetail['verify']),
    revisions: (tryRead(() => fs.readFileSync(path.join(dir, 'logs', 'revisions.jsonl'), 'utf8')) ?? '').split('\n').filter(Boolean).slice(-5)
      .map((l) => tryRead(() => JSON.parse(l) as JobDetail['revisions'][number])).filter((r): r is JobDetail['revisions'][number] => r !== null),
    revision_pending: tryRead(() => JSON.parse(fs.readFileSync(revisionPendingFile(dir), 'utf8')) as RevisionPending),
  };
}
