// Responsibility: the «حساب و کلیدها» API: the Gemini key (masked view, save, remove, then restart only an app-started voice app) and the Claude account (how it signs in, D106: the user's own subscription or own API key; status, sign-in, sign-out, re-check).
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AuthStatus } from '../ai/claudeRunner.js';
import { KEY_CHANGE_FA } from '../stages/voice/avaClient.js';
import { claudeKeyView, keyView, removeAnthropicKey, removeGeminiKey, saveAnthropicKey, saveGeminiKey, setClaudeAuthMode } from '../secrets/index.js';
import { fail, sendError, type ApiContext } from './context.js';

const KeyBody = z.strictObject({ key: z.string().max(400) });
const ModeBody = z.strictObject({ mode: z.enum(['subscription', 'api_key']) });
const LoginBody = z.strictObject({ email: z.union([z.literal(''), z.string().trim().max(200).regex(/^[^\s@]+@[^\s@]+$/)]).optional() });

/**
 * What the account card shows (D106). With the subscription, `ok` means a subscription login the runner accepts; a CLI signed in some
 * other way is not used. With the user's own API key, `ok` means a key is saved. The key itself never leaves the server.
 */
export function claudeView(s: AuthStatus, k: ReturnType<typeof claudeKeyView>) {
  const otherLogin = k.mode === 'subscription' && s.loggedIn === true && !s.ok;
  return {
    mode: k.mode,
    key_set: k.key_set,
    key_masked: k.key_masked,
    logged_in: s.loggedIn === true,
    ok: s.ok,
    email: s.ok ? (s.email ?? null) : null,
    plan: s.ok ? (s.plan ?? null) : null,
    message_fa: s.ok
      ? null
      : k.mode === 'api_key'
        ? 'کلید API خودت را وارد کن، یا به «اشتراک خودم» برگرد.'
        : otherLogin
          ? 'Claude Code با اشتراک وارد نشده است. «ورود با حساب دیگر» را بزن و با اشتراک Claude خودت وارد شو، یا پایین‌تر «کلید API خودم» را انتخاب کن.'
          : 'هنوز وارد Claude نشده‌ای. با اشتراک Claude خودت وارد شو، یا پایین‌تر «کلید API خودم» را انتخاب کن.',
  };
}

const CLAUDE_BUSY_FA = 'یک ویدیو در حال ساخت است؛ بعد از تمام شدنش روش ورود Claude را عوض کن.';

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

  app.get('/api/account/claude', async () => claudeView(await ctx.claudeAccount.status(false), claudeKeyView(ctx.config)));

  /** The user's own Anthropic API key (D106): saving it also switches Claude to it. Never while a film runs. */
  app.put('/api/account/claude/key', async (request, reply) => {
    const body = KeyBody.safeParse(request.body);
    if (!body.success) return fail(reply, 400, 'کلید فرستاده نشد.');
    if (ctx.runner.running()) return fail(reply, 409, CLAUDE_BUSY_FA);
    try { saveAnthropicKey(ctx.config, body.data.key); } catch (e) { return sendError(reply, e); }
    return claudeView(await ctx.claudeAccount.status(true), claudeKeyView(ctx.config));
  });

  app.delete('/api/account/claude/key', async (_request, reply) => {
    if (ctx.runner.running()) return fail(reply, 409, CLAUDE_BUSY_FA);
    try { removeAnthropicKey(ctx.config); } catch (e) { return sendError(reply, e); }
    return claudeView(await ctx.claudeAccount.status(true), claudeKeyView(ctx.config));
  });

  app.put('/api/account/claude/mode', async (request, reply) => {
    const body = ModeBody.safeParse(request.body);
    if (!body.success) return fail(reply, 400, 'روش ورود نامعتبر است.');
    if (ctx.runner.running()) return fail(reply, 409, CLAUDE_BUSY_FA);
    try { setClaudeAuthMode(ctx.config, body.data.mode); } catch (e) { return sendError(reply, e); }
    return claudeView(await ctx.claudeAccount.status(true), claudeKeyView(ctx.config));
  });

  /** «دوباره بررسی کن»: the runner's cached check is cleared and asked again. */
  app.post('/api/account/claude/recheck', async () => claudeView(await ctx.claudeAccount.status(true), claudeKeyView(ctx.config)));

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
      const view = claudeView(r.status, claudeKeyView(ctx.config));
      if (view.ok) return view;
      const why = r.error === 'timeout' ? 'ورود در ۵ دقیقه تمام نشد.' : 'ورود تمام نشد.';
      return reply.code(409).send({ ...view, error_fa: `${why} دوباره «ورود به Claude» را بزن؛ اگر مرورگر باز نشد، راهنمای ورود دستی را ببین.` });
    } catch (e) { return sendError(reply, e); } finally { signing = false; }
  });

  app.post('/api/account/claude/logout', async (_request, reply) => {
    if (ctx.runner.running()) return fail(reply, 409, 'یک ویدیو در حال ساخت است؛ بعد از تمام شدنش از حساب خارج شو.');
    try { return claudeView((await ctx.claudeAccount.logout()).status, claudeKeyView(ctx.config)); } catch (e) { return sendError(reply, e); }
  });
}
