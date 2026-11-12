// Responsibility: the revision command line: `npm run revise -- <slug> --target video|cover|sound|caption --note "…"` or `--target script`, printing the result in Persian.
import { parseArgs } from 'node:util';
import { ConfigError, loadConfig } from './config.js';
import { openDb } from './db/db.js';
import { LockBusyError } from './db/repositories.js';
import { makeOrchestrator } from './cli.js';
import { REVISION_TARGETS, reviseJob, reviseScript, type RevisionTarget } from './orchestrator/revision.js';
import { StageError } from './orchestrator/stages.js';
import { preferPythonForThisProcess } from './pythonPath.js';

const USAGE = `استفاده:
  npm run revise -- <slug> --target ${REVISION_TARGETS.join('|')} --note "چه چیزی عوض شود"
  npm run revise -- <slug> --target script      (ویرایش متن گوینده / روی صفحه؛ دو بار اجرا: ساخت فایل، اعمال)`;

export async function main(argv: string[], print: (s: string) => void = (s) => console.log(s)): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, options: { target: { type: 'string' }, note: { type: 'string' } }, allowPositionals: true, strict: true });
  } catch (e) { print(`${(e as Error).message}\n${USAGE}`); return 64; }
  const slug = parsed.positionals[0];
  const target = parsed.values.target;
  const isScript = target === 'script';
  if (!slug || !target || !(isScript || (REVISION_TARGETS as readonly string[]).includes(target)) || (!isScript && !parsed.values.note)) { print(USAGE); return 64; }

  let config;
  try { config = loadConfig(); } catch (e) {
    if (e instanceof ConfigError) { print(`خطای تنظیمات: ${e.message_fa}`); return 78; }
    throw e;
  }
  const db = openDb(config.paths.db);
  try {
    if (isScript) {
      const s = await reviseScript(makeOrchestrator(config, db, print), slug);
      if (s.needsEdit) print(`فایل ویرایش سناریو: ${s.file}\nمتن‌ها را عوض کن (جمله اضافه یا کم نکن)، بعد همین دستور را دوباره اجرا کن.`);
      else if (s.outcome.changes === 0) print('در فایل ویرایش تغییری نبود؛ کاری انجام نشد.');
      else print(`سناریو عوض شد (${s.outcome.changes} تغییر${s.outcome.voiceChanged ? '، صدا دوباره ساخته شد' : ''}). نسخه‌ی قبلی: ${s.backup}. وضعیت: ${s.state.status}`);
      return s.needsEdit || s.state.status === 'done' ? 0 : 1;
    }
    const r = await reviseJob({ config, db }, slug, target as RevisionTarget, parsed.values.note ?? '');
    const changed = Object.entries(r.changed).filter(([, v]) => v).map(([k]) => k);
    print(`بازبینی «${target}» انجام شد. نسخه‌ی قبلی: ${r.backup}. تغییر کرد: ${changed.join('، ') || 'هیچ'}`);
    return 0;
  } catch (e) {
    if (e instanceof StageError) { print(`${e.message_fa}\n${e.detail}`); return e.kind === 'blocked' ? 2 : 1; }
    if (e instanceof LockBusyError) { print(`کار دیگری («${e.holder}») در حال اجراست؛ هر بار فقط یک کار.`); return 75; }
    throw e;
  } finally {
    db.close();
  }
}

const isEntry = process.argv[1] && /revise\.(ts|js)$/.test(process.argv[1]);
if (isEntry) {
  // Before anything starts python (alignment, sound, Claude's Bash): see app/pythonPath.ts.
  preferPythonForThisProcess().catch(() => undefined).then(() => main(process.argv.slice(2))).then((code) => { process.exitCode = code; }, (e: unknown) => { console.error(e); process.exitCode = 1; });
}
