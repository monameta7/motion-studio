// Responsibility: the first-run wizard's data: whether onboarding is done (settings.onboarding_done), and the system check of the tools a film needs, each missing one with a plain Persian fix.
import fs from 'node:fs';
import path from 'node:path';
import type { Db } from '../db/db.js';
import { settingsRepo } from '../db/repositories.js';
import { checkTools, type CheckResult } from '../preflight/index.js';
import type { RunResult } from '../proc.js';

export const ONBOARDING_KEY = 'onboarding_done';

export const onboardingDone = (db: Db): boolean => settingsRepo.get<boolean>(db, ONBOARDING_KEY) === true;
export const setOnboardingDone = (db: Db, done: boolean): void => settingsRepo.set(db, ONBOARDING_KEY, done);

export type CheckId = 'claude_cli' | 'ffmpeg' | 'python' | 'playwright' | 'ava_farsi';

export interface SystemItem { id: CheckId; label_fa: string; ok: boolean; fix_fa: string | null; command: string | null }

const ALL_IN_ONE_OWNER = 'یا یک بار فایل scripts\\prepare-all.cmd را در پوشه‌ی برنامه باز کن تا همه را با هم نصب کند.';
/** An installed package (Phase 11) has no prepare-all.cmd: its one fix for everything is the install line, which skips what is already there. */
const ALL_IN_ONE_PACKAGED = 'یا خط نصب برنامه را دوباره در PowerShell اجرا کن؛ هرچه نصب شده باشد دوباره نصب نمی‌شود.';
const DEPS_COMMAND = 'powershell -ExecutionPolicy Bypass -File .\\scripts\\install-deps.ps1';

/** For each tool: its name and, when missing, what to do (one plain step, a command to copy, and the all-in-one script). */
const itemsFor = (packaged: boolean): Record<CheckId, { label_fa: string; fix_fa: string; command: string | null }> => {
  const ALL_IN_ONE = packaged ? ALL_IN_ONE_PACKAGED : ALL_IN_ONE_OWNER;
  return {
  claude_cli: {
    label_fa: 'Claude Code (ساخت متن و موشن)',
    fix_fa: `Claude Code نصب نیست. PowerShell را باز کن، این دستور را بچسبان و Enter بزن؛ بعد برنامه را ببند و دوباره باز کن. ${ALL_IN_ONE}`,
    command: packaged ? 'irm https://claude.ai/install.ps1 | iex' : 'npm install -g @anthropic-ai/claude-code',
  },
  ffmpeg: {
    label_fa: 'ffmpeg (ساخت فایل ویدیو و صدا)',
    fix_fa: `ffmpeg نسخه‌ی ۶ یا بالاتر پیدا نشد. PowerShell را باز کن، این دستور را بزن و بعد کامپیوتر را یک بار از نو باز کن. ${ALL_IN_ONE}`,
    command: 'winget install --id Gyan.FFmpeg -e',
  },
  python: {
    label_fa: 'Python و بسته‌هایش (هم‌زمانی صدا و متن)',
    fix_fa: `Python 3 یا بسته‌های numpy، scipy و faster-whisper نیستند. اگر Python نداری اول winget install --id Python.Python.3.12 -e را بزن؛ بعد این دستور را. ${ALL_IN_ONE}`,
    command: 'python -m pip install numpy scipy faster-whisper',
  },
  playwright: {
    label_fa: 'موتور رندر (Chromium)',
    fix_fa: `موتور رندر نصب نیست. در پوشه‌ی برنامه PowerShell را باز کن و این دستور را بزن. ${ALL_IN_ONE}`,
    command: packaged ? DEPS_COMMAND : 'powershell -ExecutionPolicy Bypass -File .\\scripts\\setup.ps1',
  },
  ava_farsi: {
    label_fa: 'اپ صدا (ava-farsi)',
    fix_fa: packaged ? `اپ صدا کامل نصب نیست. در پوشه‌ی برنامه PowerShell را باز کن و این دستور را بزن. ${ALL_IN_ONE}` : `اپ صدا کامل نصب نیست. در پوشه‌ی ava-farsi\\avafarsi یک بار npm install را بزن. ${ALL_IN_ONE}`,
    command: packaged ? DEPS_COMMAND : 'npm install',
  },
  };
};

export interface SystemCheckDeps {
  runTool: (cmd: string, args: string[], opts?: { timeoutMs?: number }) => Promise<RunResult>;
  claudeVersion: () => Promise<string | null>;
  exists: (p: string) => boolean;
  engineDir: string;
  avaFarsiDir: string;
  /** True in a copy installed from the package (it has a starter/ folder): the fixes then name the installer's own scripts. */
  packaged?: boolean;
}

const item = (id: CheckId, ok: boolean, packaged = false): SystemItem => { const t = itemsFor(packaged)[id]; return { id, label_fa: t.label_fa, ok, fix_fa: ok ? null : t.fix_fa, command: ok ? null : t.command }; };

/** The wizard's check: nothing is started and nothing costs quota (Claude Code is asked only for its version). */
export async function systemCheck(d: SystemCheckDeps): Promise<{ ok: boolean; items: SystemItem[] }> {
  const tools: CheckResult[] = await checkTools({ runTool: d.runTool, exists: d.exists, config: { paths: { engine: d.engineDir } } });
  const okOf = (...ids: string[]) => ids.every((id) => tools.find((t) => t.id === id)?.ok === true);
  const avaInstalled = d.exists(path.join(d.avaFarsiDir, 'package.json')) && d.exists(path.join(d.avaFarsiDir, 'node_modules'));
  const items = [
    item('claude_cli', (await d.claudeVersion()) !== null, d.packaged === true),
    item('ffmpeg', okOf('ffmpeg', 'ffprobe'), d.packaged === true),
    item('python', okOf('python'), d.packaged === true),
    item('playwright', okOf('playwright'), d.packaged === true),
    item('ava_farsi', avaInstalled, d.packaged === true),
  ];
  return { ok: items.every((i) => i.ok), items };
}

export const defaultExists = (p: string): boolean => fs.existsSync(p);
