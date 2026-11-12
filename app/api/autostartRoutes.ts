// Responsibility: the «start with Windows» switch of Settings (docs/08): ask whether the Task Scheduler entry exists, install it (at logon, and daily 30 minutes before the film starts) or remove it, by running the two scripts in scripts/.
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { listSchedules } from '../calendar/schedule.js';
import { startMoment } from '../calendar/timing.js';
import { settingsRepo, stageRunsRepo } from '../db/repositories.js';
import { fail, type ApiContext } from './context.js';

export const TASK_NAME = 'MahdiyarMotionStudio';
/** The app opens this long before a scheduled film starts (docs/08). */
export const OPEN_BEFORE_MIN = 30;

const Body = z.strictObject({ on: z.boolean() });
const pad = (n: number) => String(n).padStart(2, '0');

/**
 * The clock times the app should be opened at daily: each brand's film start minus 30 minutes (Phase 8: each brand has its own
 * schedule), sorted and joined by commas ("05:30,16:45"); null while every brand's automation is off.
 */
export function openAt(ctx: ApiContext): string | null {
  const avg = stageRunsRepo.avgJobMinutes(ctx.db, 5);
  const times = new Set<string>();
  for (const s of listSchedules(ctx.db).filter((x) => x.enabled)) {
    const start = startMoment('2030-06-15', s, avg).time;
    const total = (Number(start.slice(0, 2)) * 60 + Number(start.slice(3, 5)) - OPEN_BEFORE_MIN + 1440) % 1440;
    times.add(`${pad(Math.floor(total / 60))}:${pad(total % 60)}`);
  }
  return times.size ? [...times].sort().join(',') : null;
}

const supported = (): boolean => process.platform === 'win32';

export function autostartRoutes(app: FastifyInstance, ctx: ApiContext): void {
  const script = (name: string) => path.join(ctx.config.paths.root, 'scripts', name);
  const ps = (file: string, extra: string[] = []) => ctx.systemTool('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script(file), ...extra], { timeoutMs: 60000 });
  const installed = async (): Promise<boolean> => supported() && (await ctx.systemTool('schtasks.exe', ['/Query', '/TN', TASK_NAME], { timeoutMs: 15000 })).code === 0;
  const view = async () => ({ supported: supported(), installed: await installed(), at: settingsRepo.get<{ at: string | null }>(ctx.db, 'autostart')?.at ?? null });

  /** Writes the entry with the current open time. */
  const install = async (): Promise<boolean> => {
    const at = openAt(ctx);
    const r = await ps('install-autostart.ps1', at ? ['-At', at] : []);
    if (r.code === 0) settingsRepo.set(ctx.db, 'autostart', { at });
    return r.code === 0;
  };
  ctx.refreshAutostart = async () => { if (await installed()) await install(); };

  app.get('/api/autostart', async () => view());

  app.post('/api/autostart', async (request, reply) => {
    const b = Body.safeParse(request.body);
    if (!b.success) return fail(reply, 400, 'درخواست نامعتبر است.');
    if (!supported()) return fail(reply, 400, 'اجرای خودکار فقط روی ویندوز ممکن است.');
    const done = b.data.on ? await install() : (await ps('uninstall-autostart.ps1')).code === 0;
    if (!done) return fail(reply, 500, b.data.on ? 'روشن کردن اجرای خودکار انجام نشد.' : 'خاموش کردن اجرای خودکار انجام نشد.');
    if (!b.data.on) settingsRepo.set(ctx.db, 'autostart', { at: null });
    return view();
  });
}
