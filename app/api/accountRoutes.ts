// Responsibility: the «حساب و کلیدها» API: the Gemini key (masked view, save, remove, then restart only an app-started voice app) and the Claude account (status, sign-in, sign-out, re-check).
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AuthStatus } from '../ai/claudeRunner.js';
import { KEY_CHANGE_FA } from '../stages/voice/avaClient.js';
import { keyView, removeGeminiKey, saveGeminiKey } from '../secrets/index.js';
import { fail, sendError, type ApiContext } from './context.js';

const KeyBody = z.strictObject({ key: z.string().max(400) });
const LoginBody = z.strictObject({ email: z.union([z.literal(''), z.string().trim().max(200).regex(/^[^\s@]+@[^\s@]+$/)]).optional() });

/** What the account card shows; `ok` means a subscription login the runner accepts (API keys are refused, docs/05). */
export function claudeView(s: AuthStatus) {
  const apiKey = s.loggedIn === true && !s.ok;
  return {
    logged_in: s.loggedIn === true,
    ok: s.ok,
    email: s.ok ? (s.email ?? null) : null,
    plan: s.ok ? (s.plan ?? null) : null,
    message_fa: s.ok
      ? null
      : apiKey
        ? 'Claude با کلید API وارد شده، نه با اشتراک؛ برنامه آن را نمی‌پذیرد. «ورود با حساب دیگر» را بزن و با اشتراک Pro یا Max وارد شو.'
        : 'هنوز وارد Claude نشده‌ای. اشتراک Pro یا Max لازم است.',
  };
}

let signing = false;

const KEY_BUSY_FA = 'یک ویدیو در حال ساخت است؛ بعد از تمام شدنش کلید را عوض کن (عوض کردنش اپ صدا را دوباره باز می‌کند).';

/** The answer to a key change: the masked view and what happened to the voice app. Never the key. */
async function afterKeyChange(ctx: ApiContext) {
  const outcome = await ctx.restartVoice().catch(() => 'restart_failed' as const);
  const view = keyView(ctx.config);
  const envNote = view.env_locked ? ' توجه: متغیر محیطی GEMINI_API_KEY روی این کامپیوتر هست و همان استفاده می‌شود.' : '';
  return { ...view, outcome, message_fa: KEY_CHANGE_FA[outcome] + envNote };
}

export function accountRoutes(app: FastifyInstance, ctx: ApiContext): void {
  app.get('/api/keys', async (_request, reply) => {
    try { return keyView(ctx.config); } catch (e) { return sendError(reply, e); }
  });

  app.put('/api/keys/gemini', async (request, reply) => {
    const body = KeyBody.safeParse(request.body);
    if (!body.success) return fail(reply, 400, 'کلید فرستاده نشد.');
    // Restarting the voice app mid-film could cut a Gemini request that already counted (D32).
    if (ctx.runner.running()) return fail(reply, 409, KEY_BUSY_FA);
    try { saveGeminiKey(ctx.config, body.data.key); } catch (e) { return sendError(reply, e); }
    return afterKeyChange(ctx);
  });

  app.delete('/api/keys/gemini', async (_request, reply) => {
    if (ctx.runner.running()) return fail(reply, 409, KEY_BUSY_FA);
    try { removeGeminiKey(ctx.config); } catch (e) { return sendError(reply, e); }
    return afterKeyChange(ctx);
  });

  app.get('/api/account/claude', async () => claudeView(await ctx.claudeAccount.status(false)));

  /** «دوباره بررسی کن»: the runner's cached check is cleared and asked again. */
  app.post('/api/account/claude/recheck', async () => claudeView(await ctx.claudeAccount.status(true)));

  /**
   * Sign-in: the CLI opens the browser and this answer waits until the user finishes there (or 5 minutes pass). One at a time,
   * and never while a film runs: the film's next call would meet another account.
   */
  app.post('/api/account/claude/login', async (request, reply) => {
    const body = LoginBody.safeParse(request.body ?? {});
    if (!body.success) return fail(reply, 400, 'ایمیل نامعتبر است.');
    if (ctx.runner.running()) return fail(reply, 409, 'یک ویدیو در حال ساخت است؛ بعد از تمام شدنش وارد شو.');
    if (signing) return fail(reply, 409, 'صفحه‌ی ورود همین الان باز است؛ ورود را در مرورگر تمام کن.');
    signing = true;
    try {
      const r = await ctx.claudeAccount.login(body.data.email || undefined);
      const view = claudeView(r.status);
      if (view.ok) return view;
      const why = r.error === 'timeout' ? 'ورود در ۵ دقیقه تمام نشد.' : 'ورود تمام نشد.';
      return reply.code(409).send({ ...view, error_fa: `${why} دوباره «ورود به Claude» را بزن؛ اگر مرورگر باز نشد، راهنمای ورود دستی را ببین.` });
    } catch (e) { return sendError(reply, e); } finally { signing = false; }
  });

  app.post('/api/account/claude/logout', async (_request, reply) => {
    if (ctx.runner.running()) return fail(reply, 409, 'یک ویدیو در حال ساخت است؛ بعد از تمام شدنش از حساب خارج شو.');
    try { return claudeView((await ctx.claudeAccount.logout()).status); } catch (e) { return sendError(reply, e); }
  });
}
