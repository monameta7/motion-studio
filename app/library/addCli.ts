// Responsibility: command line that adds the owner's list of videos to the reference library one by one (npm run lib:add -- <list.json> [--allow-long]), never while a film job holds the lock.
import fs from 'node:fs';
import { z } from 'zod';
import { runClaude } from '../ai/claudeRunner.js';
import { loadConfig } from '../config.js';
import { ReferenceMeta } from '../contracts/index.js';
import { slug } from '../contracts/common.js';
import { openDb } from '../db/db.js';
import { lockRepo } from '../db/repositories.js';
import { StageError } from '../orchestrator/stages.js';
import { pidAlive, runTool } from '../proc.js';
import { MAX_DURATION_S, addToLibrary, probeVideo, readLimits } from './ingest.js';

const Item = z.strictObject({
  file: z.string().min(1), slug, name_fa: z.string().min(1), use_fa: z.string(), tags: z.array(z.string()),
  group: ReferenceMeta.shape.group, rights_note: z.string().min(1),
});
const List = z.array(Item).min(1);

const args = process.argv.slice(2);
const listFile = args.find((a) => !a.startsWith('--'));
if (!listFile) { console.error('usage: npm run lib:add -- <list.json> [--allow-long]'); process.exit(2); }
const allowLong = args.includes('--allow-long');
const items = List.parse(JSON.parse(fs.readFileSync(listFile, 'utf8').replace(new RegExp('^' + String.fromCharCode(0xfeff)), '')));

const config = loadConfig();
const db = openDb(config.paths.db);
const filmRunning = (): string | null => { const h = lockRepo.holder(db); return h && pidAlive(h.pid) ? h.job_slug : null; };

// Every Claude call is counted, including one whose reading the app then rejects.
let total = 0;
let failed = 0;
// A lost connection fails every item at once; stop after two failures in a row instead of failing the rest of the list.
let inARow = 0;
for (const [i, item] of items.entries()) {
  const busy = filmRunning();
  if (busy) { console.log(`STOP: film job ${busy} is running; run again later (finished items are skipped)`); process.exitCode = 3; break; }
  const t0 = Date.now();
  const spentBefore = total;
  const spent = () => `$${(total - spentBefore).toFixed(2)}`;
  try {
    const { duration } = await probeVideo(item.file, runTool);
    const { timeoutMs, budgetUsd: budget } = readLimits(config, duration);
    const r = await addToLibrary(item, {
      config, db, tool: runTool, maxDurationS: allowLong ? Infinity : MAX_DURATION_S,
      runFn: async (o, c) => { const res = await runClaude({ ...o, maxBudgetUsd: budget }, { config: c, timeoutMs }); total += res.costUsdEst; return res; },
    });
    inARow = 0;
    const min = ((Date.now() - t0) / 60000).toFixed(1);
    if (r.kind === 'duplicate') console.log(`[${i + 1}/${items.length}] ${item.slug}: duplicate of ${r.of}, skipped`);
    else {
      console.log(`[${i + 1}/${items.length}] ${item.slug}: ${r.result.cached ? 'cached' : 'read'} ${r.duration.toFixed(1)} s, buildable ${r.result.code_buildable_pct ?? '?'}%, ${spent()}, ${min} min${r.result.warnings_fa.length ? ' (low buildable)' : ''}`);
    }
  } catch (e) {
    failed++;
    inARow++;
    console.log(`[${i + 1}/${items.length}] ${item.slug}: FAILED after ${spent()}: ${(e as Error).message.slice(0, 400)}`);
    if (e instanceof StageError && e.kind === 'paused_quota') { console.log(`STOP: Claude quota full until ${e.resumeAt ?? '?'}; run again later`); process.exitCode = 4; break; }
    if (inARow >= 2) { console.log('STOP: two failures in a row (connection?); run again later (finished items are skipped)'); process.exitCode = 5; break; }
  }
}
console.log(`done: $${total.toFixed(2)} est., ${failed} failed`);
if (failed > 0 && !process.exitCode) process.exitCode = 1;
db.close();
