// Responsibility: the files of one brand's «برند من» state (answers.json, build.json, versions/<time>/): reading and writing them, section hashes, hand-edit detection, saving a version, restoring one and the line diff of a doc between two versions.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { BrandAnswers, BrandBuild, VersionMeta, readJson, writeJson, type BrandSection, BRAND_SECTIONS } from '../contracts/index.js';
import { CLAUDE_DOCS, DOC_FILES, type ClaudeDoc } from './questions.js';

export const ANSWERS_FILE = 'answers.json';
export const BUILD_FILE = 'build.json';
export const VERSIONS_DIR = 'versions';
/** Fields of `visual` that code handles alone (no Claude doc reads them): changing only these rebuilds no doc. */
const CODE_ONLY_VISUAL = ['logo', 'outro_tagline'] as const;

export const sha = (data: string | Buffer) => crypto.createHash('sha256').update(data).digest('hex');

/** Stable JSON: object keys sorted, so a hash does not change with key order. */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

export function readAnswers(dir: string): BrandAnswers | null {
  const f = path.join(dir, ANSWERS_FILE);
  return fs.existsSync(f) ? readJson(f, BrandAnswers) : null;
}
export function writeAnswers(dir: string, a: BrandAnswers): void { writeJson(path.join(dir, ANSWERS_FILE), BrandAnswers, a); }

export function readBuild(dir: string): BrandBuild | null {
  const f = path.join(dir, BUILD_FILE);
  return fs.existsSync(f) ? readJson(f, BrandBuild) : null;
}
export function writeBuild(dir: string, b: BrandBuild): void { writeJson(path.join(dir, BUILD_FILE), BrandBuild, b); }

/** One hash per section; `visual` leaves out the logo file name and the outro tagline (code-only fields). */
export function sectionHashes(a: BrandAnswers): Record<BrandSection, string> {
  const out = {} as Record<BrandSection, string>;
  for (const s of BRAND_SECTIONS) {
    let v: unknown = a[s];
    if (s === 'visual') { const c = { ...a.visual } as Record<string, unknown>; for (const k of CODE_ONLY_VISUAL) delete c[k]; v = c; }
    out[s] = sha(canonical(v));
  }
  return out;
}

/** Sections whose hash differs from the last build (all of them before the first build). */
export function changedSections(a: BrandAnswers, build: BrandBuild | null): BrandSection[] {
  const now = sectionHashes(a);
  return BRAND_SECTIONS.filter((s) => build?.sections[s] !== now[s]);
}

export const docPath = (dir: string, d: ClaudeDoc) => path.join(dir, DOC_FILES[d]);

/** Docs the owner edited by hand after the app wrote them (the file differs from the hash in build.json). `tokens` is never hand-edited. */
export function handEditedDocs(dir: string, build: BrandBuild | null): ClaudeDoc[] {
  if (!build) return [];
  return CLAUDE_DOCS.filter((d) => {
    if (d === 'tokens') return false;
    const rec = build.docs[d];
    const f = docPath(dir, d);
    return !!rec && fs.existsSync(f) && sha(fs.readFileSync(f)) !== rec.sha256;
  });
}

// ───────────────────────────── versions

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace('T', '-').replace(/\.(\d{3})Z$/, '-$1');

/** Files a version keeps: the answers, the build record, the four docs, the logo and the outro. */
function versionFiles(dir: string): string[] {
  const names = [ANSWERS_FILE, BUILD_FILE, 'brand.json', 'tokens-text.json', ...CLAUDE_DOCS.map((d) => DOC_FILES[d]), 'logo-outro.mp4'];
  for (const e of fs.existsSync(dir) ? fs.readdirSync(dir) : []) if (/^logo\.[a-z0-9]+$/i.test(e)) names.push(e);
  return names.filter((n) => fs.existsSync(path.join(dir, n)));
}

export function saveVersion(dir: string, meta: Omit<VersionMeta, 'id' | 'at'>, now: Date = new Date()): VersionMeta {
  let id = stamp(now);
  while (fs.existsSync(path.join(dir, VERSIONS_DIR, id))) id += 'x';
  const full: VersionMeta = { ...meta, id, at: now.toISOString() };
  const vdir = path.join(dir, VERSIONS_DIR, id);
  fs.mkdirSync(vdir, { recursive: true });
  for (const n of versionFiles(dir)) fs.copyFileSync(path.join(dir, n), path.join(vdir, n));
  writeJson(path.join(vdir, 'meta.json'), VersionMeta, full);
  return full;
}

/** Newest first. */
export function listVersions(dir: string): VersionMeta[] {
  const root = path.join(dir, VERSIONS_DIR);
  if (!fs.existsSync(root)) return [];
  const out: VersionMeta[] = [];
  for (const e of fs.readdirSync(root, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    try { out.push(readJson(path.join(root, e.name, 'meta.json'), VersionMeta)); } catch { /* a half-written folder is skipped */ }
  }
  return out.sort((a, b) => b.id.localeCompare(a.id));
}

export const versionDir = (dir: string, id: string): string => {
  if (!/^[0-9]{8}-[0-9]{6}-[0-9]{3}x*$/.test(id)) throw new Error('نسخه‌ی نامعتبر');
  return path.join(dir, VERSIONS_DIR, id);
};

/** Copies a version back over the brand folder (answers, build record, docs, logo, outro). The caller saves the new current state as a version afterwards. */
export function restoreFiles(dir: string, id: string): void {
  const v = versionDir(dir, id);
  if (!fs.existsSync(path.join(v, 'meta.json'))) throw new Error('این نسخه پیدا نشد.');
  for (const n of fs.readdirSync(v)) if (n !== 'meta.json') fs.copyFileSync(path.join(v, n), path.join(dir, n));
}

export interface DocDiff { doc: ClaudeDoc; changed: boolean; added: number; removed: number; lines: { t: '=' | '+' | '-'; s: string }[] }

/** Line diff (longest common subsequence) of one doc's text between two states; `a` or `b` empty text means the doc did not exist. */
export function lineDiff(a: string, b: string): { t: '=' | '+' | '-'; s: string }[] {
  const x = a === '' ? [] : a.split(/\r?\n/);
  const y = b === '' ? [] : b.split(/\r?\n/);
  const m = x.length; const n = y.length;
  // Large docs: a quadratic table is fine up to a few thousand lines each (the Mahdiyar docs are ~1000).
  const dp: Uint32Array[] = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1));
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) dp[i]![j] = x[i] === y[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
  const out: { t: '=' | '+' | '-'; s: string }[] = [];
  let i = 0; let j = 0;
  while (i < m && j < n) {
    if (x[i] === y[j]) { out.push({ t: '=', s: x[i]! }); i++; j++; } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) out.push({ t: '-', s: x[i++]! }); else out.push({ t: '+', s: y[j++]! });
  }
  while (i < m) out.push({ t: '-', s: x[i++]! });
  while (j < n) out.push({ t: '+', s: y[j++]! });
  return out;
}

const readText = (f: string) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '');

/** What a version changed in each doc, against the version saved just before it (the first version: against nothing). */
export function versionDiff(dir: string, id: string): DocDiff[] {
  const all = listVersions(dir).sort((p, q) => p.id.localeCompare(q.id));
  const idx = all.findIndex((v) => v.id === id);
  if (idx < 0) throw new Error('این نسخه پیدا نشد.');
  const cur = versionDir(dir, id);
  const prev = idx > 0 ? versionDir(dir, all[idx - 1]!.id) : null;
  return CLAUDE_DOCS.filter((d) => d !== 'tokens').map((doc) => {
    const lines = lineDiff(prev ? readText(path.join(prev, DOC_FILES[doc])) : '', readText(path.join(cur, DOC_FILES[doc])));
    const added = lines.filter((l) => l.t === '+').length;
    const removed = lines.filter((l) => l.t === '-').length;
    return { doc, changed: added + removed > 0, added, removed, lines: added + removed > 0 ? lines : [] };
  });
}
