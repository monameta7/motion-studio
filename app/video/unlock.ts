// Responsibility: whether the video workspace is open on this install (Phase 11.9, D91, docs/13 V42): it opens once the Google Cloud CLI is found, the user is signed in to their own project and a free countTokens passes (Vertex AI on, billing open); kept in settings `video_unlock`.
import type { Db } from '../db/db.js';
import { settingsRepo } from '../db/repositories.js';
import type { VideoConfig } from '../contracts/index.js';
import { VertexError, checkVertex, isCloudSession, type VertexDeps } from './vertexClient.js';

export const VIDEO_UNLOCK_KEY = 'video_unlock';

/** Which of the four set-up steps is missing (the lock's explanation lights that one), or the cloud session (D89). */
export type VideoLockStep = 'cloud' | 'sdk' | 'signin' | 'project' | 'vertex';
export type VideoUnlock = { ok: true } | { ok: false; step: VideoLockStep; message_fa: string; detail: string };
export type VideoCheck = () => Promise<VideoUnlock>;

const MESSAGES: Record<VideoLockStep, string> = {
  cloud: 'فضای ویدیو فقط روی کامپیوتر خودت کار می‌کند؛ در نشست ابری Google Cloud CLI نیست.',
  sdk: 'Google Cloud CLI روی این کامپیوتر پیدا نشد.',
  signin: 'هنوز با حساب Google خودت در Google Cloud CLI وارد نشده‌ای، یا ورودت تمام شده است.',
  project: 'در Google Cloud CLI هنوز پروژه‌ای انتخاب نشده است.',
  vertex: 'Google اجازه‌ی ساخت ویدیو را نداد: Vertex AI در پروژه‌ات روشن نیست، صورت‌حساب بسته است، یا اعتبار تمام شده است.',
};

/** A refusal for one step, with its Persian message (also used by the stub server's fake check). */
export const videoLock = (step: VideoLockStep, detail: string): VideoUnlock => ({ ok: false, step, message_fa: MESSAGES[step], detail: detail.slice(0, 400) });
const lock = videoLock;

/** The free check (no clip is bought): the SDK, a token, the project and countTokens, through the one Vertex door (rule 3). */
export async function checkVideoSetup(cfg: VideoConfig, d: VertexDeps): Promise<VideoUnlock> {
  if (isCloudSession(d)) return lock('cloud', 'cloud session');
  try {
    await checkVertex(cfg, d);
    return { ok: true };
  } catch (e) {
    if (!(e instanceof VertexError)) return lock('vertex', (e as Error).message);
    if (e.kind === 'no_sdk') return lock('sdk', e.message);
    if (e.kind === 'signin') return lock(/no project set/i.test(e.message) ? 'project' : 'signin', e.message);
    if (e.kind === 'unauthorized') return lock('signin', e.message);
    return lock('vertex', e.message);
  }
}

/** Open once the check has passed here, or once this install has made a video film (the owner's PC before Phase 11.9). */
export function isVideoUnlocked(db: Db): boolean {
  if (settingsRepo.get<{ ok?: boolean }>(db, VIDEO_UNLOCK_KEY)?.ok === true) return true;
  return db.prepare("SELECT 1 FROM jobs WHERE workspace = 'video' LIMIT 1").get() !== undefined;
}

/** Opens the video workspace when it is not open yet: runs the check, and keeps a pass. A later lapse of the sign-in is preflight's job (V5), not the lock's. */
export async function openVideo(db: Db, check: VideoCheck, now: () => Date = () => new Date()): Promise<VideoUnlock> {
  if (isVideoUnlocked(db)) return { ok: true };
  const r = await check();
  if (r.ok) settingsRepo.set(db, VIDEO_UNLOCK_KEY, { ok: true, at: now().toISOString() });
  return r;
}
