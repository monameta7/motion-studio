// Responsibility: the `npm run ledger` command: write and print one job's token ledger, or print one line per job for every job (reads the logs only; no Claude call).
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { loadConfig } from '../config.js';
import { buildLedger, ledgerFile, ledgerLines, writeLedger } from './tokenLedger.js';

const USAGE = `استفاده:
  npm run ledger -- <slug> [--jobs-dir <پوشه>]     دفتر توکن یک ویدیو را می‌نویسد (logs/token-ledger.json) و نشان می‌دهد
  npm run ledger -- --all [--jobs-dir <پوشه>]      برای هر ویدیو یک خط نشان می‌دهد؛ چیزی نمی‌نویسد`;

const { values, positionals } = parseArgs({ allowPositionals: true, options: { all: { type: 'boolean', default: false }, 'jobs-dir': { type: 'string' } } });
const jobsDir = values['jobs-dir'] ? path.resolve(values['jobs-dir']) : loadConfig().paths.jobs;

if (values.all) {
  const slugs = fs.readdirSync(jobsDir, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('_')).map((e) => e.name).sort();
  const pad = (n: number, w = 4) => String(n).padStart(w);
  let shown = 0;
  for (const slug of slugs) {
    const l = buildLedger(path.join(jobsDir, slug), slug);
    if (!l.calls.length) continue;
    shown++;
    const st = (s: string) => pad(l.stages[s]?.points ?? 0);
    console.log(`${slug.slice(0, 44).padEnd(44)} window${pad(l.totals.points)}  content${st('content')} plan${st('plan')} build${st('build')}  weekly${pad(l.totals.weekly_points, 3)}  after rejection${pad(l.totals.points_after_rejection, 3)}  after owner stop${pad(l.totals.points_after_owner_stop, 3)}  after quota stop${pad(l.totals.points_after_quota_stop, 3)}  calls${pad(l.totals.calls, 3)}  $${l.totals.cost_usd_est.toFixed(2)}`);
  }
  console.log(`${shown} job(s) with Claude logs in ${jobsDir}`);
} else if (positionals.length === 1) {
  const dir = path.join(jobsDir, positionals[0]!);
  if (!fs.existsSync(dir)) { console.error(`این ویدیو پیدا نشد: ${dir}`); process.exitCode = 2; }
  else {
    const l = writeLedger(dir, positionals[0]);
    for (const line of ledgerLines(l)) console.log(line);
    console.log(`نوشته شد: ${ledgerFile(dir)}`);
  }
} else {
  console.error(USAGE);
  process.exitCode = 2;
}
