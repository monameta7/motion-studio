// Responsibility: talk to the ava-farsi voice app: health check, start it when it is down with the user's Gemini key in its environment (and stop or restart only what we started), and synthesise one text to a WAV with retries (docs/10).
import type { LoadedConfig } from '../../config.js';
import type { z } from 'zod';
import type { tone as toneSchema, voice as voiceSchema } from '../../contracts/index.js';
import { killTree, startDetached } from '../../proc.js';
import { redactKey, resolveGeminiKey } from '../../secrets/index.js';

type Tone = z.infer<typeof toneSchema>;
type Voice = z.infer<typeof voiceSchema>;

export const NO_KEY_FA = 'کلید Gemini تنظیم نشده؛ در تنظیمات ← «حساب و کلیدها» واردش کن';

export type TtsErrorKind = 'down' | 'no_key' | 'quota' | 'rejected' | 'failed';

export class TtsError extends Error {
  constructor(public readonly kind: TtsErrorKind, public readonly message_fa: string, public readonly detail = '') {
    super(`${kind}: ${message_fa}${detail ? ` (${detail})` : ''}`);
    this.name = 'TtsError';
  }
}

export interface Health { status?: string; hasApiKey?: boolean }

export interface AvaDeps {
  fetch: typeof fetch;
  start: () => number | undefined;
  stop: (pid: number) => Promise<void>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  /** How long to wait for the app after starting it (docs/10: 60 s). */
  startWaitMs: number;
  /** Pauses before retry 1, 2, 3 … (the last value repeats). */
  backoffMs: number[];
  requestTimeoutMs: number;
}

// One pid per app process: the preflight and the voice stage must stop the same child, and never one the owner started.
let startedPid: number | undefined;
export const startedAvaPid = (): number | undefined => startedPid;

export function defaultAvaDeps(config: LoadedConfig, spawnApp: typeof startDetached = startDetached): AvaDeps {
  return {
    fetch: (...a) => fetch(...a),
    start: () => {
      // The user's key goes into the child's environment (D65); ava-farsi's dotenv.config() does not override a variable that is already set.
      const key = resolveGeminiKey(config)?.key;
      const pid = spawnApp('npm', ['run', 'dev'], { cwd: config.paths.avaFarsi, env: { ...process.env, PORT: new URL(config.cfg.tts.base_url).port || '3000' }, ...(key ? { secretEnv: { GEMINI_API_KEY: key } } : {}) });
      if (pid !== undefined) startedPid = pid;
      return pid;
    },
    stop: (pid) => killTree(pid, 5000),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    now: () => Date.now(),
    startWaitMs: 60000,
    backoffMs: [2000, 6000, 18000],
    requestTimeoutMs: 180000,
  };
}

/** Stops ava-farsi only if this process started it (docs/10). Safe to call more than once. */
export async function stopStartedAvaFarsi(stop: (pid: number) => Promise<void> = (pid) => killTree(pid, 5000)): Promise<boolean> {
  const pid = startedPid;
  if (pid === undefined) return false;
  startedPid = undefined;
  await stop(pid);
  return true;
}

/** ava-farsi wraps every Gemini failure in a 500 whose text names the cause. */
export function classifyFailure(status: number, body: string): TtsError {
  const t = body.slice(0, 600);
  if (/RESOURCE_EXHAUSTED|quota|\b429\b|rate.?limit/i.test(t)) {
    const wait = t.match(/retry in ([0-9hms. ]+)/i)?.[1]?.trim();
    return new TtsError('quota', `سهمیه‌ی روزانه‌ی Gemini برای صدا پر شده${wait ? ` (تلاش دوباره: ${wait})` : ''}؛ بعداً دوباره اجرا کن.`, `${status} ${t}`);
  }
  if (/GEMINI_API_KEY|API key|کلید/i.test(t)) return new TtsError('no_key', NO_KEY_FA, `${status} ${t}`);
  if (status === 400) return new TtsError('rejected', 'ava-farsi متن را نپذیرفت.', `${status} ${t}`);
  return new TtsError('failed', 'ava-farsi صدا نساخت.', `${status} ${t}`);
}

export class AvaClient {
  constructor(private readonly config: LoadedConfig, private readonly deps: AvaDeps = defaultAvaDeps(config)) {}

  private url(p: string): string { return new URL(p, this.config.cfg.tts.base_url).toString(); }

  async health(): Promise<Health | null> {
    try {
      const res = await this.deps.fetch(this.url('/api/health'), { signal: AbortSignal.timeout(3000) });
      return res.ok ? ((await res.json()) as Health) : null;
    } catch { return null; }
  }

  /** Health check; if the app is down and autostart is on, start it and poll every second for `startWaitMs`. Throws TtsError when it cannot be used. */
  async ensureUp(): Promise<void> {
    let h = await this.health();
    if (!h && this.config.cfg.tts.autostart) {
      this.deps.start();
      const until = this.deps.now() + this.deps.startWaitMs;
      while (!h && this.deps.now() < until) { await this.deps.sleep(1000); h = await this.health(); }
    }
    if (!h) throw new TtsError('down', 'اپ صدا اجرا نشد', this.url('/api/health'));
    if (h.hasApiKey !== true) throw new TtsError('no_key', NO_KEY_FA, this.url('/api/health'));
  }

  /** One request: text → WAV bytes (24 kHz). Retries network errors and 5xx answers with backoff; never retries a quota, key or rejected-text error. */
  async synthesize(text: string, voice: Voice, tone: Tone): Promise<Buffer> {
    const retries = this.config.cfg.tts.max_retries;
    let last: TtsError = new TtsError('failed', 'ava-farsi صدا نساخت.');
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt > 0) {
        const wait = this.deps.backoffMs[Math.min(attempt - 1, this.deps.backoffMs.length - 1)] ?? 0;
        await this.deps.sleep(wait);
        // The app may have died between attempts.
        if (!(await this.health())) { try { await this.ensureUp(); } catch (e) { last = e as TtsError; continue; } }
      }
      let res: Response;
      try {
        res = await this.deps.fetch(this.url('/api/tts'), {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, voice, tone }),
          signal: AbortSignal.timeout(this.deps.requestTimeoutMs),
        });
      } catch (e) {
        last = new TtsError('down', 'ارتباط با اپ صدا قطع شد.', (e as Error).message);
        continue;
      }
      const raw = await res.text();
      if (!res.ok) {
        let msg = raw;
        try { msg = (JSON.parse(raw) as { error?: string }).error ?? raw; } catch { /* keep the raw text */ }
        // An error text could quote the key: mask it before it can reach a log, a state file or an answer.
        last = classifyFailure(res.status, redactKey(msg, resolveGeminiKey(this.config)?.key));
        if (last.kind !== 'failed') throw last;
        continue;
      }
      let audio: string | undefined;
      try { audio = (JSON.parse(raw) as { audioBase64?: string }).audioBase64; } catch { /* handled below */ }
      if (!audio) { last = new TtsError('failed', 'ava-farsi صدایی برنگرداند.', raw.slice(0, 200)); continue; }
      return Buffer.from(audio, 'base64');
    }
    throw last;
  }
}

export type KeyChangeOutcome = 'restarted' | 'user_started' | 'not_running' | 'restart_failed';

/** Plain Persian for each outcome of a key change. */
export const KEY_CHANGE_FA: Record<KeyChangeOutcome, string> = {
  restarted: 'کلید ذخیره شد و اپ صدا با کلید تازه دوباره باز شد.',
  user_started: 'کلید ذخیره شد. اپ صدا را خودت باز کرده‌ای، پس برنامه آن را نمی‌بندد؛ آن را ببند تا برنامه دفعه‌ی بعد با کلید تازه بازش کند.',
  not_running: 'کلید ذخیره شد؛ اپ صدا دفعه‌ی بعد با همین کلید باز می‌شود.',
  restart_failed: 'کلید ذخیره شد، ولی اپ صدا دوباره باز نشد؛ دفعه‌ی بعد که صدا لازم شود دوباره امتحان می‌کند.',
};

/**
 * After a key change: an ava-farsi this app started is stopped and started again (it reads the key only when it starts);
 * one the user started is left alone; when none runs, the next start uses the new key.
 */
export async function restartForKeyChange(config: LoadedConfig, deps: AvaDeps = defaultAvaDeps(config)): Promise<KeyChangeOutcome> {
  const client = new AvaClient(config, deps);
  const pid = startedPid;
  if (pid === undefined) return (await client.health()) ? 'user_started' : 'not_running';
  startedPid = undefined;
  await deps.stop(pid);
  // Wait until the old process has let go of the port, so the health check below is the new one.
  const until = deps.now() + 15000;
  while ((await client.health()) && deps.now() < until) await deps.sleep(500);
  try {
    await client.ensureUp();
    return 'restarted';
  } catch { return 'restart_failed'; }
}
