// Responsibility: the owner's script edit while a job is held (D45): write the editable content/script-edit.json, and apply it to package.json and package.md (originals kept once, every change logged in edits.json), reporting what kind of change it was.
import fs from 'node:fs';
import path from 'node:path';
import { ContentPackage, ScriptEditFile, ScriptEdits, readJson, writeJson } from '../contracts/index.js';
import { checkVerbatim } from '../stages/content/verbatim.js';

export const scriptPaths = (dir: string) => {
  const c = path.join(dir, 'content');
  return {
    pkg: path.join(c, 'package.json'), md: path.join(c, 'package.md'), hookPkg: path.join(c, 'package.hook.json'), hookMd: path.join(c, 'package.hook.md'),
    edits: path.join(c, 'edits.json'), editFile: path.join(c, 'script-edit.json'),
  };
};

export class ScriptEditError extends Error {
  constructor(public readonly message_fa: string, detail = '') { super(`${message_fa}${detail ? ` (${detail})` : ''}`); this.name = 'ScriptEditError'; }
}

/** Writes content/script-edit.json from the current package (an existing, unapplied file is kept so the owner's work is never lost). */
export function writeScriptEditFile(dir: string): { file: string; created: boolean } {
  const p = scriptPaths(dir);
  if (fs.existsSync(p.editFile)) return { file: p.editFile, created: false };
  const pkg = readJson(p.pkg, ContentPackage);
  writeJson(p.editFile, ScriptEditFile, {
    voice_lines: pkg.voice_lines.map((l) => ({ id: l.id, text: l.text })),
    on_screen_texts: pkg.on_screen_texts.map((t, index) => ({ index, text: t.text })),
  });
  return { file: p.editFile, created: true };
}

/** Replaces `from` with `to` in every string of a JSON-like value. */
function replaceInStrings<T>(value: T, from: string, to: string): T {
  if (typeof value === 'string') return value.split(from).join(to) as T;
  if (Array.isArray(value)) return value.map((v: unknown) => replaceInStrings(v, from, to)) as T;
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, replaceInStrings(v, from, to)])) as T;
  return value;
}

export interface EditOutcome { voiceChanged: boolean; screenChanged: boolean; changes: number }

/**
 * Applies content/script-edit.json (if any). Each changed string replaces the old one in package.json and everywhere in package.md,
 * so the verbatim rule still holds; originals are saved once as package.hook.*; owner edits are final (no truth re-run).
 */
export function applyScriptEdits(dir: string, nowIso: string = new Date().toISOString()): EditOutcome {
  const p = scriptPaths(dir);
  const none: EditOutcome = { voiceChanged: false, screenChanged: false, changes: 0 };
  if (!fs.existsSync(p.editFile)) return none;
  let edit: ScriptEditFile;
  try { edit = readJson(p.editFile, ScriptEditFile); } catch (e) { throw new ScriptEditError('متن ذخیره نشد. یک بار دیگر «ادامه با این متن» را بزن؛ اگر باز نشد، خبر بده.', `script-edit.json: ${(e as Error).message}`); }
  const pkg = readJson(p.pkg, ContentPackage);
  let md = fs.readFileSync(p.md, 'utf8');
  // Fields that were already not verbatim before the edit (hook's own wording differences) must not block the owner's edit;
  // only a mismatch the edit itself creates does.
  const fieldOf = (msg: string) => msg.split(' ')[0]!;
  const before = new Set(checkVerbatim(pkg, md).map(fieldOf));
  const changes: ScriptEdits['edits'] = [];

  for (const e of edit.voice_lines) {
    const i = pkg.voice_lines.findIndex((l) => l.id === e.id);
    if (i < 0) throw new ScriptEditError(`جمله‌ی گوینده‌ی شماره‌ی ${e.id} وجود ندارد؛ فقط متن را عوض کن، جمله اضافه یا کم نکن.`);
    const old = pkg.voice_lines[i]!.text;
    if (old !== e.text) changes.push({ at: nowIso, field: `voice_lines[${i}].text`, old, new: e.text });
  }
  if (edit.voice_lines.length !== pkg.voice_lines.length) throw new ScriptEditError('تعداد جمله‌های گوینده نباید عوض شود.');
  for (const e of edit.on_screen_texts) {
    const t = pkg.on_screen_texts[e.index];
    if (!t) throw new ScriptEditError(`متن روی صفحه‌ی شماره‌ی ${e.index} وجود ندارد.`);
    if (t.text !== e.text) changes.push({ at: nowIso, field: `on_screen_texts[${e.index}].text`, old: t.text, new: e.text });
  }
  if (changes.length === 0) { fs.rmSync(p.editFile); return none; }
  for (const c of changes) if (/[[\]]/.test(c.new)) throw new ScriptEditError('متن گوینده یا روی صفحه نباید «[» یا «]» داشته باشد؛ کروشه فقط برای توضیح ساخت است.', c.field);

  let next: ContentPackage = pkg;
  for (const c of changes) {
    if (!md.includes(c.old)) throw new ScriptEditError('متن ذخیره نشد. یک بار دیگر «ادامه با این متن» را بزن؛ اگر باز نشد، خبر بده.', `old text not found in package.md: ${c.field}`);
    md = md.split(c.old).join(c.new);
    // The edited field still holds the old text here, so one replacement changes it and the same words elsewhere in the package
    // (hook_line, a shot's on-screen text). Setting the field first made a new text that contains the old one get the addition twice.
    next = replaceInStrings(next, c.old, c.new);
  }
  next = { ...next, markdown: md };
  const bad = checkVerbatim(next, md).filter((b) => !before.has(fieldOf(b)));
  if (bad.length) throw new ScriptEditError('متن ذخیره نشد. یک بار دیگر «ادامه با این متن» را بزن؛ اگر باز نشد، خبر بده.', `package.json and package.md differ after the edit: ${bad.slice(0, 3).join('; ')}`);

  // Hook's originals are kept once and never overwritten again.
  if (!fs.existsSync(p.hookPkg)) fs.copyFileSync(p.pkg, p.hookPkg);
  if (!fs.existsSync(p.hookMd)) fs.copyFileSync(p.md, p.hookMd);
  const log = fs.existsSync(p.edits) ? readJson(p.edits, ScriptEdits) : { edits: [] };
  writeJson(p.edits, ScriptEdits, { edits: [...log.edits, ...changes] });
  fs.writeFileSync(p.md, md, 'utf8');
  writeJson(p.pkg, ContentPackage, next);
  fs.renameSync(p.editFile, path.join(path.dirname(p.editFile), `script-edit.applied-${nowIso.replace(/[:.]/g, '-')}.json`));
  return { voiceChanged: changes.some((c) => c.field.startsWith('voice_lines')), screenChanged: changes.some((c) => c.field.startsWith('on_screen_texts')), changes: changes.length };
}
