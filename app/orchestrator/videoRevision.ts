// Responsibility: revisions of a finished video film (Phase 11.7 task 4): back up the delivery, reopen the film from its clips for one clip made again (paid, after the owner's priced confirm), or change the clips' own sound on the PC (free), proving that a sound revision leaves the picture, cover and caption as they were.
import fs from 'node:fs';
import path from 'node:path';
import type { LoadedConfig } from '../config.js';
import { VideoCoverOptions, VideoSound, writeJson, type JobState } from '../contracts/index.js';
import type { Db } from '../db/db.js';
import { lockRepo } from '../db/repositories.js';
import { coverOptionsFile, videoPackageStage } from '../package/video.js';
import { runTool } from '../proc.js';
import { assembleStage } from '../stages/assemble/index.js';
import type { Tool } from '../stages/build/verify.js';
import { jobDir, readRequest, readState, writeState } from './jobFolder.js';
import { backupDelivery, fingerprint, revisionPendingFile, unexpectedChanges, type Fingerprint, type RevisionPending } from './revision.js';
import { StageError } from './stages.js';
import { stageOrder } from './state.js';

/** The video files a backup keeps next to out/: how the film was put together and which clips it used. */
const VIDEO_RECORDS = ['video/assembly.json', 'video/clips.json', 'video/sound.json', 'video/cover.json'];

function finishedVideo(dir: string): JobState {
  if (readRequest(dir).workspace !== 'video') throw new StageError('blocked', 'این کار ویدیو نیست.', 'not a video job');
  const state = readState(dir);
  if (state.status !== 'done') throw new StageError('blocked', 'فقط کار تمام‌شده را می‌شود اصلاح کرد.', `status ${state.status}`);
  return state;
}

/** Backs up out/ (backupDelivery) and the video records of a finished video film; returns the backup folder's name. */
export function backupVideo(dir: string): string {
  const backup = backupDelivery(dir);
  for (const rel of VIDEO_RECORDS) {
    const f = path.join(dir, ...rel.split('/'));
    if (fs.existsSync(f)) { fs.mkdirSync(path.join(dir, backup, 'video'), { recursive: true }); fs.copyFileSync(f, path.join(dir, backup, ...rel.split('/'))); }
  }
  return backup;
}

/**
 * After the owner's priced confirm of «دوباره بساز» on a finished film (the clip already marked by `rebuildClip`): the stages from `clips`
 * on run again as a new run, the way a script revision restarts a finished job. Nothing is bought here; the clips stage buys the one clip.
 */
export function restartFinishedVideo(dir: string, backup: string, record: Record<string, unknown>): JobState {
  const state = finishedVideo(dir);
  const order = stageOrder('video');
  const stages = { ...state.stages };
  for (const s of order.slice(order.indexOf('clips'))) delete stages[s];
  const next: JobState = { ...state, status: 'queued', stage: null, stages, error: null, hold: null, resume_at: null };
  writeState(dir, next);
  fs.appendFileSync(path.join(dir, 'logs', 'revisions.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), target: 'clip', backup, ...record })}\n`, 'utf8');
  return next;
}

export interface VideoCoverResult { backup: string; options: { frame_s: number | null; logo: VideoCoverOptions['logo'] }; changed: Partial<Record<keyof Fingerprint, boolean>> }

/**
 * The cover revision of a video film: the moment of the reel behind the cover and the logo's place. Local and free (the cover is code,
 * D102 c): the cover is drawn again from the finished film; the picture, the sound and the caption must not change.
 */
export async function reviseVideoCover(deps: VideoSoundDeps, slug: string, options: { frame_s: number | null; logo: VideoCoverOptions['logo'] }): Promise<VideoCoverResult> {
  const { config, db } = deps;
  const tool = deps.tool ?? ((c, a, o) => runTool(c, a, o));
  const dir = jobDir(config.paths.jobs, slug);
  const state = finishedVideo(dir);
  const req = readRequest(dir);
  lockRepo.acquire(db, slug);
  try {
    const before = await fingerprint(dir, tool);
    const backup = backupVideo(dir);
    const pending: RevisionPending = { at: new Date().toISOString(), target: 'cover', note: JSON.stringify(options), backup };
    fs.writeFileSync(revisionPendingFile(dir), `${JSON.stringify(pending)}\n`, 'utf8');
    writeJson(coverOptionsFile(dir), VideoCoverOptions, { ...options, at: new Date().toISOString() });
    await videoPackageStage({ tool }).run({ config, db, req, dir, state, attempt: 1 });
    const after = await fingerprint(dir, tool);
    const wrong = unexpectedChanges('cover', before, after);
    const changed = Object.fromEntries((Object.keys(before) as (keyof Fingerprint)[]).map((k) => [k, before[k] !== after[k]]));
    const note = `${options.frame_s === null ? 'لحظه‌ی پیش‌فرض' : `ثانیه ${options.frame_s}`}، لوگو ${options.logo === 'under' ? 'زیر متن' : 'پایین وسط'}`;
    fs.appendFileSync(path.join(dir, 'logs', 'revisions.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), target: 'cover', note, backup, changed, unexpected: wrong })}\n`, 'utf8');
    if (wrong.length) throw new StageError('failed', 'اصلاح کاور چیزی غیر از کاور را هم عوض کرد؛ نسخه‌ی قبلی در پوشه‌ی پشتیبان است.', `${backup}: ${wrong.join('; ')}`);
    return { backup, options, changed };
  } finally {
    fs.rmSync(revisionPendingFile(dir), { force: true });
    lockRepo.release(db);
  }
}

export interface VideoSoundDeps { config: LoadedConfig; db: Db; tool?: Tool; preset?: string }
export interface VideoSoundResult { backup: string; clip_sound: 'keep' | 'off'; changed: Partial<Record<keyof Fingerprint, boolean>> }

/**
 * The sound revision of a video film: the clips' own sound kept (D102) or off for this film. Local and free: the mix again on the kept
 * picture (its stream is copied), then the video package; the picture, the cover and the caption must not change.
 */
export async function reviseVideoSound(deps: VideoSoundDeps, slug: string, clipSound: 'keep' | 'off'): Promise<VideoSoundResult> {
  const { config, db } = deps;
  const tool = deps.tool ?? ((c, a, o) => runTool(c, a, o));
  const dir = jobDir(config.paths.jobs, slug);
  const state = finishedVideo(dir);
  const req = readRequest(dir);
  lockRepo.acquire(db, slug);
  try {
    const before = await fingerprint(dir, tool);
    const backup = backupVideo(dir);
    const pending: RevisionPending = { at: new Date().toISOString(), target: 'sound', note: clipSound, backup };
    fs.writeFileSync(revisionPendingFile(dir), `${JSON.stringify(pending)}\n`, 'utf8');
    writeJson(path.join(dir, 'video', 'sound.json'), VideoSound, { clip_sound: clipSound, at: new Date().toISOString() });
    const ctx = { config, db, req, dir, state, attempt: 1 };
    await assembleStage({ tool, preset: deps.preset, reusePicture: true }).run(ctx);
    // Phase 11.9: the film's own cover stays (a later cover design must not make this revision fail).
    await videoPackageStage({ tool, keepCover: true }).run(ctx);
    const after = await fingerprint(dir, tool);
    const wrong = unexpectedChanges('sound', before, after);
    const changed = Object.fromEntries((Object.keys(before) as (keyof Fingerprint)[]).map((k) => [k, before[k] !== after[k]]));
    fs.appendFileSync(path.join(dir, 'logs', 'revisions.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), target: 'sound', note: clipSound === 'off' ? 'صدای کلیپ‌ها حذف' : 'صدای کلیپ‌ها زیر صدا', backup, changed, unexpected: wrong })}\n`, 'utf8');
    if (wrong.length) throw new StageError('failed', 'اصلاح صدا چیزی غیر از صدا را هم عوض کرد؛ نسخه‌ی قبلی در پوشه‌ی پشتیبان است.', `${backup}: ${wrong.join('; ')}`);
    return { backup, clip_sound: clipSound, changed };
  } finally {
    fs.rmSync(revisionPendingFile(dir), { force: true });
    lockRepo.release(db);
  }
}
