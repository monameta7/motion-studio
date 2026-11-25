// Responsibility: the one door to Google Vertex AI (D90, D91): find the Google Cloud CLI, read its access token through app/proc.ts into memory only, and send the free countTokens / GET / DELETE and the paid interactions request.
import fs from 'node:fs';
import path from 'node:path';
import type { VideoConfig } from '../contracts/index.js';
import { runTool, type RunResult } from '../proc.js';

/** The only place in the app that names the Vertex host (docs/13 V32, `tests/doors.test.ts`). */
export const VERTEX_HOST = 'aiplatform.googleapis.com';

export type VertexErrorKind =
  /** No Google Cloud CLI on this machine (docs/13 V4). */
  | 'no_sdk'
  /** Not signed in, or the sign-in ran out (V5). */
  | 'signin'
  /** 401 twice (V6). */
  | 'unauthorized'
  /** 403 / 404 (API off, no permission, billing closed, model not in that location; V7). */
  | 'denied'
  /** 402 / 429 RESOURCE_EXHAUSTED (credits used up, quota; V8). */
  | 'exhausted'
  /** The model refused the prompt (safety or content; V13): never retried. */
  | 'refused'
  /** Any other 4xx: the request was refused before any work. */
  | 'bad_request'
  /** Sent, but no clear answer (cut off, time limit, 5xx, unreadable answer): Google may have charged (V9, V10). */
  | 'unknown';

export class VertexError extends Error {
  constructor(public readonly kind: VertexErrorKind, message: string, public readonly httpStatus: number | null = null) {
    super(redact(message));
    this.name = 'VertexError';
  }
}

/** D91 b: no access token ever reaches an error, a log or a file. Google tokens start with `ya29.`; a bearer header is cut as well. */
export function redact(text: string): string {
  return text.replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, '$1<removed>').replace(/ya29\.[A-Za-z0-9._~+/=-]+/g, '<token removed>');
}

export interface VertexDeps {
  runTool: (cmd: string, args: string[], opts?: { timeoutMs?: number; env?: NodeJS.ProcessEnv }) => Promise<RunResult>;
  fetch: typeof fetch;
  env: NodeJS.ProcessEnv;
  exists: (p: string) => boolean;
  platform: NodeJS.Platform;
  /** Tests point this at a fake Vertex server; the real URL is built from `VERTEX_HOST`. */
  baseUrl?: string;
  sleep: (ms: number) => Promise<void>;
}

export function defaultVertexDeps(): VertexDeps {
  return {
    runTool: (c, a, o) => runTool(c, a, o),
    fetch: (...a) => fetch(...a),
    env: process.env,
    exists: (p) => fs.existsSync(p),
    platform: process.platform,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  };
}

/** D89: video films are made on the owner's PC; the cloud session (D48, Linux, no Google Cloud CLI) refuses them. */
export function isCloudSession(d: Pick<VertexDeps, 'env' | 'platform'>): boolean {
  return d.platform !== 'win32' || d.env.CLAUDE_CODE_REMOTE === 'true';
}

/** D91 a: config first, then `gcloud.cmd` on PATH, then the known install folders. Returns the SDK root or null. */
export function findGcloudSdk(cfg: VideoConfig, d: Pick<VertexDeps, 'env' | 'exists'>): string | null {
  const isSdk = (root: string) => d.exists(path.join(root, 'lib', 'gcloud.py'));
  if (cfg.vertex.gcloud_sdk) return isSdk(cfg.vertex.gcloud_sdk) ? cfg.vertex.gcloud_sdk : null;
  for (const dir of (d.env.PATH ?? d.env.Path ?? '').split(path.delimiter).filter(Boolean)) {
    if (d.exists(path.join(dir, 'gcloud.cmd'))) {
      const root = path.dirname(dir);
      if (isSdk(root)) return root;
    }
  }
  const local = d.env.LOCALAPPDATA;
  const x86 = d.env['ProgramFiles(x86)'];
  const candidates = [
    local && path.join(local, 'Google', 'CloudSDK-zip', 'google-cloud-sdk'),
    local && path.join(local, 'Google', 'Cloud SDK', 'google-cloud-sdk'),
    x86 && path.join(x86, 'Google', 'Cloud SDK', 'google-cloud-sdk'),
  ].filter((c): c is string => Boolean(c));
  return candidates.find(isSdk) ?? null;
}

const SIGNIN_PATTERN = /reauthentication required|invalid_grant|no credentialed accounts|you do not currently have an active account|gcloud auth login|refresh token has expired|not logged in/i;

/**
 * The Python that runs `lib\gcloud.py`, in the order `gcloud.cmd` itself uses: `CLOUDSDK_PYTHON`, then the SDK's bundled
 * Python, then the first real Python on PATH. Some installs (e.g. Windows on ARM) ship no bundled Python. The Microsoft
 * Store stubs in `WindowsApps` are skipped: they only open the Store. Returns null when there is none.
 */
export function findGcloudPython(sdk: string, d: Pick<VertexDeps, 'env' | 'exists' | 'platform'>): string | null {
  const win = d.platform === 'win32';
  const fromEnv = d.env.CLOUDSDK_PYTHON?.trim();
  if (fromEnv && d.exists(fromEnv)) return fromEnv;
  const bundled = path.join(sdk, 'platform', 'bundledpython', win ? 'python.exe' : 'python3');
  if (d.exists(bundled)) return bundled;
  const names = win ? ['python.exe', 'python3.exe'] : ['python3', 'python'];
  for (const dir of (d.env.PATH ?? d.env.Path ?? '').split(path.delimiter).filter(Boolean)) {
    if (/[\\/]WindowsApps[\\/]?$/i.test(dir)) continue;
    for (const n of names) {
      const p = path.join(dir, n);
      if (d.exists(p)) return p;
    }
  }
  return null;
}

/** Runs gcloud as Python with `lib\gcloud.py` (no shell, D91 a). */
async function gcloud(sdk: string, args: string[], d: VertexDeps, timeoutMs = 90000): Promise<RunResult> {
  const py = findGcloudPython(sdk, d);
  if (!py) throw new VertexError('no_sdk', `the Google Cloud CLI has no bundled Python in ${path.join(sdk, 'platform', 'bundledpython')} and no Python was found in CLOUDSDK_PYTHON or on PATH`);
  return d.runTool(py, [path.join(sdk, 'lib', 'gcloud.py'), ...args], { timeoutMs, env: { ...d.env, CLOUDSDK_CORE_DISABLE_PROMPTS: '1' } });
}

export interface VertexSession {
  sdk: string;
  project: string;
  cfg: VideoConfig;
  d: VertexDeps;
}

/** Finds the SDK and the project (D91 d). No token is read here; every request reads its own. */
export async function openSession(cfg: VideoConfig, d: VertexDeps = defaultVertexDeps()): Promise<VertexSession> {
  const sdk = findGcloudSdk(cfg, d);
  if (!sdk) throw new VertexError('no_sdk', 'Google Cloud CLI not found (config video.vertex.gcloud_sdk, PATH, %LOCALAPPDATA%\\Google)');
  let project = cfg.vertex.project;
  if (!project) {
    const r = await gcloud(sdk, ['config', 'get-value', 'project'], d);
    project = r.code === 0 ? r.stdout.trim().split(/\r?\n/).pop()?.trim() ?? '' : '';
    if (!project || project === '(unset)') throw new VertexError('signin', `gcloud has no project set (gcloud config set project …): ${(r.stderr || r.error || '').slice(-300)}`);
  }
  return { sdk, project, cfg, d };
}

/** D91 b, c: the token, asked from gcloud right before each request (gcloud keeps and refreshes it). Lives only in the caller's stack. */
async function accessToken(s: VertexSession): Promise<string> {
  const r = await gcloud(s.sdk, ['auth', 'print-access-token'], s.d);
  const token = r.stdout.trim().split(/\r?\n/).pop()?.trim() ?? '';
  if (r.code !== 0 || !token) {
    const why = redact(`${r.stderr} ${r.error ?? ''}`).trim().slice(-400);
    throw new VertexError(SIGNIN_PATTERN.test(why) || r.code !== 0 ? 'signin' : 'unknown', `gcloud auth print-access-token failed (exit ${String(r.code)}): ${why}`);
  }
  return token;
}

const base = (s: VertexSession) => s.d.baseUrl ?? `https://${VERTEX_HOST}`;
const root = (s: VertexSession) => `${base(s)}/${s.cfg.vertex.api_version}/projects/${encodeURIComponent(s.project)}/locations/${s.cfg.vertex.location}`;

interface Answer { status: number; json: unknown; text: string }

/** `beforeSend` runs after the token is read and right before the bytes leave (the paid request saves its `sending` attempt there, D92 f). */
async function send(s: VertexSession, method: 'GET' | 'POST' | 'DELETE', url: string, body: unknown, timeoutMs: number, beforeSend?: () => void): Promise<Answer> {
  const token = await accessToken(s);
  beforeSend?.();
  const res = await s.d.fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'x-goog-user-project': s.project, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* kept as text */ }
  return { status: res.status, json, text };
}

/** Google's reason from an error answer, short and without a token. */
function reasonOf(a: Answer): string {
  const err = (a.json as { error?: { message?: string; status?: string } } | null)?.error;
  return redact(err ? `${err.status ?? ''} ${err.message ?? ''}`.trim() : a.text.slice(0, 400));
}

const REFUSAL = /safety|blocked|prohibited|policy|responsible ai|not allowed|sensitive|harm/i;

/** Maps an error answer to a kind. `paid` = the request was a purchase (a 5xx there may have been charged). */
function kindOf(a: Answer, paid: boolean): VertexErrorKind {
  if (a.status === 401) return 'unauthorized';
  if (a.status === 403 || a.status === 404) return 'denied';
  if (a.status === 402 || a.status === 429) return 'exhausted';
  if (a.status === 400 && REFUSAL.test(reasonOf(a))) return 'refused';
  if (a.status >= 400 && a.status < 500) return 'bad_request';
  return paid ? 'unknown' : 'bad_request';
}

/** A free call (countTokens, GET, DELETE): one new token after a 401, then the error (D91 e, docs/13 V6). */
async function freeCall(s: VertexSession, method: 'GET' | 'POST' | 'DELETE', url: string, body?: unknown): Promise<Answer> {
  let a: Answer | null = null;
  for (let i = 0; i < 2; i++) {
    try { a = await send(s, method, url, body, 120000); } catch (e) {
      if (e instanceof VertexError) throw e;
      throw new VertexError('bad_request', `Vertex could not be reached: ${(e as Error).message}`);
    }
    if (a.status !== 401) break;
  }
  if (a!.status >= 400) throw new VertexError(kindOf(a!, false), `Vertex ${method} answered ${a!.status}: ${reasonOf(a!)}`, a!.status);
  return a!;
}

export interface ClipRequest {
  /** The prompt file's bytes as text, word for word (docs/13 V11). */
  text: string;
  /** PNG of the exact last frame of the clip before; none for clip 1. */
  startImage: Buffer | null;
  aspect: '9:16' | '16:9';
  resolution: '360p' | '720p' | '1080p';
  seconds: number;
}

/** The request body, as 11.1 sent it (`phase-11.1/scripts/vx-clip.mjs`), plus the store/background switch of D92 f. */
export function clipBody(cfg: VideoConfig, r: ClipRequest): Record<string, unknown> {
  const background = cfg.vertex.mode === 'background';
  return {
    model: cfg.vertex.model,
    store: background,
    ...(background ? { background: true } : {}),
    input: r.startImage ? [{ type: 'image', data: r.startImage.toString('base64'), mime_type: 'image/png' }, { type: 'text', text: r.text }] : r.text,
    response_format: { type: 'video', aspect_ratio: r.aspect, resolution: r.resolution, duration: `${r.seconds}s` },
    ...(r.startImage ? { generation_config: { video_config: { task: 'image_to_video' } } } : {}),
  };
}

/** The text that went out in a body (for the byte-for-byte check, docs/13 V11). */
export function bodyText(body: Record<string, unknown>): string {
  const input = body.input as string | { type: string; text?: string }[];
  return typeof input === 'string' ? input : input.find((p) => p.type === 'text')?.text ?? '';
}

/** Free (D90): the input tokens of one clip request; 11.1 measured ≈ 6.7–8 k for a 32 k-character prompt (docs/13 V12). */
export async function countTokens(s: VertexSession, r: Pick<ClipRequest, 'text' | 'startImage'>): Promise<number> {
  const parts: Record<string, unknown>[] = [{ text: r.text }];
  if (r.startImage) parts.unshift({ inlineData: { mimeType: 'image/png', data: r.startImage.toString('base64') } });
  const a = await freeCall(s, 'POST', `${root(s)}/publishers/google/models/${s.cfg.vertex.model}:countTokens`, { contents: [{ role: 'user', parts }] });
  const n = (a.json as { totalTokens?: number } | null)?.totalTokens;
  if (typeof n !== 'number') throw new VertexError('bad_request', `countTokens gave no totalTokens: ${a.text.slice(0, 200)}`);
  return n;
}

export interface Interaction {
  id: string | null;
  status: string;
  video: Buffer | null;
  tokens: { input: number; output: number; thought: number } | null;
  /** Google's own words when there is no video (a refusal, a finish reason). */
  note: string | null;
}

/** Reads an interaction object (the 11.1 answer shape: `steps[].content[]` with `type: video`, `usage.total_*_tokens`). */
export function readInteraction(json: unknown): Interaction {
  const j = (json ?? {}) as Record<string, unknown>;
  const videos: { data?: string }[] = [];
  const texts: string[] = [];
  const walk = (o: unknown) => {
    if (!o || typeof o !== 'object') return;
    const r = o as Record<string, unknown>;
    if (r.type === 'video' && typeof r.data === 'string') videos.push(r as { data: string });
    if (r.type === 'text' && typeof r.text === 'string' && texts.length < 3) texts.push(r.text);
    for (const v of Object.values(r)) walk(v);
  };
  // The model's own thought summary (a `thought` step, first in every 11.1 answer) is not Google's answer: a word like «cannot» in it
  // must not look like a refusal, so only the other steps are read.
  const steps = Array.isArray(j.steps) ? (j.steps as Record<string, unknown>[]).filter((x) => x?.type !== 'thought') : (j.outputs ?? j);
  walk(steps);
  const u = j.usage as Record<string, unknown> | undefined;
  const num = (v: unknown) => (typeof v === 'number' ? v : 0);
  return {
    id: typeof j.id === 'string' && j.id ? j.id : null,
    status: typeof j.status === 'string' ? j.status : 'unknown',
    video: videos[0]?.data ? Buffer.from(videos[0].data, 'base64') : null,
    tokens: u ? { input: num(u.total_input_tokens), output: num(u.total_output_tokens), thought: num(u.total_thought_tokens) } : null,
    note: texts.length ? redact(texts.join(' ').slice(0, 400)) : null,
  };
}

/**
 * PAID (D90): one clip. `beforeSend` saves the attempt as `sending` before the request leaves; `onId` is called as soon as an
 * interaction id is known (background mode), so the caller can save it before waiting. A 401 is never followed by a second paid send (V6); any send that ends without a clear answer is `unknown` (V9, V10).
 */
export async function createClip(s: VertexSession, body: Record<string, unknown>, hooks: { beforeSend: () => void; onId: (id: string) => void }): Promise<Interaction> {
  let a: Answer;
  let sent = false;
  try {
    a = await send(s, 'POST', `${root(s)}/interactions`, body, s.cfg.vertex.request_timeout_min * 60000, () => { hooks.beforeSend(); sent = true; });
  } catch (e) {
    // Before the bytes left (no SDK, sign-in, token): nothing was bought. After: Google may have charged.
    if (!sent) throw e instanceof VertexError ? e : new VertexError('bad_request', `the clip request did not leave: ${(e as Error).message}`);
    if (e instanceof VertexError) throw e;
    throw new VertexError('unknown', `the clip request was cut off after sending: ${(e as Error).message}`);
  }
  if (a.status >= 400) throw new VertexError(kindOf(a, true), `Vertex answered ${a.status}: ${reasonOf(a)}`, a.status);
  if (a.json === null) throw new VertexError('unknown', `Vertex answered ${a.status} with no readable body`, a.status);
  const first = readInteraction(a.json);
  if (first.id) hooks.onId(first.id);
  if (s.cfg.vertex.mode !== 'background' || first.status === 'completed' || first.status === 'failed' || first.video) return first;
  if (!first.id) throw new VertexError('unknown', 'a background request came back without an id', a.status);
  return waitClip(s, first.id);
}

/** Free: asks about an interaction until it is finished (background mode; also after a resume). */
export async function waitClip(s: VertexSession, id: string): Promise<Interaction> {
  const until = Date.now() + s.cfg.vertex.request_timeout_min * 60000;
  for (;;) {
    const got = readInteraction((await freeCall(s, 'GET', `${root(s)}/interactions/${encodeURIComponent(id)}`)).json);
    if (got.status !== 'in_progress' && got.status !== 'pending' && got.status !== 'unknown') return { ...got, id: got.id ?? id };
    if (Date.now() > until) throw new VertexError('unknown', `interaction ${id} still ${got.status} after ${s.cfg.vertex.request_timeout_min} min`);
    await s.d.sleep(s.cfg.vertex.poll_s * 1000);
  }
}

/** Free: removes a stored interaction after its clip is saved (background mode keeps the prompt and the clip at Google otherwise). */
export async function deleteInteraction(s: VertexSession, id: string): Promise<void> {
  await freeCall(s, 'DELETE', `${root(s)}/interactions/${encodeURIComponent(id)}`);
}

/** Free preflight (D91 e, docs/13 V4, V5, V7): SDK, project, a token, and countTokens on a short text (project, API, permission, model in its location). */
export async function checkVertex(cfg: VideoConfig, d: VertexDeps = defaultVertexDeps(), probe = 'A calm ten-second shot of morning light on a desk.'): Promise<{ project: string; tokens: number }> {
  const s = await openSession(cfg, d);
  const tokens = await countTokens(s, { text: probe, startImage: null });
  return { project: s.project, tokens };
}
