// Responsibility: the video workspace's job-file contracts of docs/04 (clip-plan.json, the prompt file names, clips.json) and its config block with the D92 prices and caps.
import { z } from 'zod';
import { isoDate, isoDateTime, sha256, slug } from './common.js';

/** D92: one clip is 10 s; at most 9 clips per film; at most 2 paid retries per clip, and only for a badly broken clip. */
export const CLIP_SECONDS = 10;
export const MAX_CLIPS_PER_FILM = 9;
export const MAX_RETRIES_PER_CLIP = 2;

/** D93: Arabic-script blocks (Persian included). Not one such character may reach a prompt or the picture. */
const ARABIC_SCRIPT = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
export function hasArabicScript(text: string): boolean {
  return ARABIC_SCRIPT.test(text);
}

const englishText = z.string().trim().min(1).refine((t) => !hasArabicScript(t), 'English only: no Persian or Arabic letter (D93)');
/** An on-screen term: 1–3 English words (D93). */
export const onScreenTerm = englishText.refine((t) => t.split(/\s+/).length <= 3, 'an on-screen term is 1 to 3 words (D93)');
const clipIndex = z.number().int().min(1).max(MAX_CLIPS_PER_FILM);
const nonNegInt = z.number().int().nonnegative();

/** `video/prompts/clip-NN.txt`: the prompt the app fills from the skill's template, one per clip, NN from 01. */
export const CLIP_PROMPT_FILE = /^video\/prompts\/clip-(\d{2})\.txt$/;
export function clipPromptFile(index: number): string {
  return `video/prompts/clip-${String(index).padStart(2, '0')}.txt`;
}
/** The clip file of one attempt and the start frame given to a clip (the exact last frame of the clip before it). */
export const CLIP_FILE = /^video\/clips\/clip-(\d{2})-a(\d)\.mp4$/;
export const START_FRAME_FILE = /^video\/frames\/clip-(\d{2})-start\.png$/;

/** Clips needed for a voice: whole 10-second clips covering it (D86 i: from the real voice, never from a words-per-second guess). */
export function clipsForVoice(voiceEndS: number): number {
  return Math.max(1, Math.ceil(voiceEndS / CLIP_SECONDS - 1e-6));
}

/**
 * Silence between two voice lines on the reel: the same fixed gap as the motion path (motion-plan layer L2: «concatenate in order with a
 * fixed gap (0.15 s of silence)»); the 11.1 proof's reel times came from it. The video assembly (11.7) lays the voice with this same gap.
 */
export const VOICE_LINE_GAP_S = 0.15;
const r2 = (x: number) => Math.round(x * 100) / 100;

// ---- video/voice-timing.json: app-owned, strict. The real voice on the reel: every line and word in reel seconds, from voice/lines.json.
export const VoiceTiming = z.strictObject({
  gap_s: z.number().nonnegative(),
  voice_end_s: z.number().positive(),
  lines: z.array(z.strictObject({
    id: z.number().int().min(1),
    text: z.string().min(1),
    start_s: z.number().nonnegative(),
    end_s: z.number().positive(),
    words: z.array(z.strictObject({ w: z.string().min(1), start_s: z.number().nonnegative(), end_s: z.number().nonnegative() })),
  })).min(1),
});
export type VoiceTiming = z.infer<typeof VoiceTiming>;

/** Lays the recorded lines one after another with the fixed gap: the voice end decides the clip count (D86 i, docs/13 V1). */
export function voiceTiming(lines: readonly { id: number; text: string; duration: number; words: readonly { w: string; start: number; end: number }[] }[], gap = VOICE_LINE_GAP_S): VoiceTiming {
  let at = 0;
  const out = lines.map((l, i) => {
    if (i > 0) at += gap;
    const start = at;
    at += l.duration;
    return { id: l.id, text: l.text, start_s: r2(start), end_s: r2(at), words: l.words.map((w) => ({ w: w.w, start_s: r2(start + w.start), end_s: r2(start + w.end) })) };
  });
  return { gap_s: gap, voice_end_s: r2(at), lines: out };
}

// ---- video/clip-plan.json: written by runtime Claude with the video-prompts skill (11.4, step 7 of the skill). Skill-owned, so documented
// fields are checked and extra fields are kept. App code fills the skill's template from it (app/stages/prompts/template.ts).
const ClipPlanTerm = z.looseObject({
  text: onScreenTerm,
  at_s: z.number().min(0).max(CLIP_SECONDS),
  // The package text the term stands for (may be Persian); never copied into a prompt.
  stands_for: z.string().min(1),
});
const ClipPlanClip = z.looseObject({
  index: clipIndex,
  start_s: z.number().nonnegative(),
  end_s: z.number().positive(),
  voice_line_ids: z.array(z.number().int().min(1)),
  /** The concept of this clip as it goes into the prompt: what must become clear, the «should be able to say» sentence, the lettering list. */
  concept: englishText,
  /** This clip's one line of FULL NARRATION (beat notes only, no tag, no clip number). */
  beat_line: englishText,
  /** The lines of THIS CLIP'S NARRATION («0–4 s: …»). */
  beat_notes: z.array(englishText).min(1),
  terms: z.array(ClipPlanTerm),
});
export const ClipPlan = z.looseObject({
  style: slug,
  on_screen_text: z.enum(['on', 'off']),
  style_lock: englishText,
  // D87 e: one fixed character description repeated word for word in every clip; null when the film has no person.
  character: englishText.nullable(),
  /** The concept of the whole reel, its four parts, the same in every clip prompt. */
  reel_concept: englishText,
  voice_end_s: z.number().positive(),
  clips: z.array(ClipPlanClip).min(1).max(MAX_CLIPS_PER_FILM),
  /** The editing list (terms, numbers, logo, CTA with reel seconds and place); for the edit, never in a prompt. */
  editing_list: z.array(z.looseObject({})),
  /** Package texts cut or dropped from the screen, numbers that cannot be shown without text, sheet disagreements. */
  notes: z.array(z.string()).default([]),
}).superRefine((p, ctx) => {
  const need = clipsForVoice(p.voice_end_s);
  if (p.clips.length !== need) ctx.addIssue({ code: 'custom', path: ['clips'], message: `the voice ends at ${p.voice_end_s} s, so the film needs ${need} clips, not ${p.clips.length} (docs/13 V1)` });
  p.clips.forEach((c, i) => {
    if (c.index !== i + 1) ctx.addIssue({ code: 'custom', path: ['clips', i, 'index'], message: `clip ${i + 1} has index ${c.index}` });
    const start = i * CLIP_SECONDS;
    if (Math.abs(c.start_s - start) > 1e-6) ctx.addIssue({ code: 'custom', path: ['clips', i, 'start_s'], message: `clip ${i + 1} starts at ${start} s on the film` });
    if (c.end_s <= c.start_s || c.end_s - c.start_s > CLIP_SECONDS + 1e-6) ctx.addIssue({ code: 'custom', path: ['clips', i, 'end_s'], message: `clip ${i + 1} lasts more than ${CLIP_SECONDS} s or nothing` });
  });
});
export type ClipPlan = z.infer<typeof ClipPlan>;

// ---- video/clips.json: app-owned, strict. One entry per clip, every paid attempt recorded (D92: never bought twice by itself).
export const RESOLUTIONS = ['360p', '720p', '1080p'] as const;
export const resolution = z.enum(RESOLUTIONS);
export type Resolution = z.infer<typeof resolution>;

export const ClipMeasurements = z.strictObject({
  duration_s: z.number().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: z.number().positive(),
  frames: z.number().int().positive(),
  has_audio: z.boolean(),
  /** SSIM of the given start image against the clip's first frame; null for clip 1. */
  seam_ssim: z.number().min(0).max(1).nullable(),
  /** Seconds of speech the voice detector finds in the clip's own audio (its words are not trusted, 11.1). */
  speech_s: z.number().nonnegative().nullable(),
  audio_mean_db: z.number().nullable(),
  audio_max_db: z.number().nullable(),
  /** Colour-histogram correlation with the clip before (recorded only, no threshold yet; docs/13 V18). */
  drift: z.number().min(-1).max(1).nullable(),
});
export type ClipMeasurements = z.infer<typeof ClipMeasurements>;

export const CLIP_FLAGS = ['no_video', 'unreadable', 'wrong_length', 'wrong_size', 'seam_low', 'speech', 'drift', 'refused'] as const;

export const ClipAttempt = z.strictObject({
  n: z.number().int().min(1),
  /** first = the first purchase; broken_retry = automatic, only for a badly broken clip (D92 b); owner_rebuild = «دوباره بساز». */
  reason: z.enum(['first', 'broken_retry', 'owner_rebuild']),
  /** Written as `sending` before the request leaves (D92 f); `unknown` = cut off after sending, never re-sent by itself. */
  status: z.enum(['sending', 'done', 'failed', 'unknown']),
  sent_at: isoDateTime,
  ended_at: isoDateTime.nullable(),
  /** What this attempt sent (Phase 11.6): the SHA-256 of the request body's text (= the prompt file's bytes, docs/13 V11) and of its start image. */
  prompt_sha256: sha256,
  start_image_sha256: sha256.nullable(),
  /** Vertex returns none with `store: false` (11.1); with `background: true` it comes back at once and a free GET asks about it (11.6). */
  interaction_id: z.string().min(1).nullable(),
  http_status: z.number().int().nullable(),
  /** Google's reason, never the access token (D91 b). */
  error: z.string().refine((e) => !/ya29\./.test(e), 'an error must never hold an access token (D91)').nullable(),
  tokens: z.strictObject({ input: nonNegInt, output: nonNegInt, thought: nonNegInt }).nullable(),
  cost_usd_est: z.number().nonnegative().nullable(),
  file: z.string().regex(CLIP_FILE).nullable(),
  file_sha256: sha256.nullable(),
  measurements: ClipMeasurements.nullable(),
  /** ok; flawed = small flaws accepted with a flag; broken = may be retried (D92 b). */
  verdict: z.enum(['ok', 'flawed', 'broken']).nullable(),
  flags: z.array(z.enum(CLIP_FLAGS)),
});
export type ClipAttempt = z.infer<typeof ClipAttempt>;

export const ClipEntry = z.strictObject({
  index: clipIndex,
  prompt_file: z.string().regex(CLIP_PROMPT_FILE),
  prompt_sha256: sha256,
  start_image: z.string().regex(START_FRAME_FILE).nullable(),
  start_image_sha256: sha256.nullable(),
  /** stale = made from a start frame that no longer exists (an earlier clip was made again, docs/13 V20). */
  status: z.enum(['pending', 'sending', 'done', 'flagged', 'unknown', 'failed', 'stale']),
  chosen_attempt: z.number().int().min(1).nullable(),
  attempts: z.array(ClipAttempt),
});
export type ClipEntry = z.infer<typeof ClipEntry>;

export const ClipsFile = z.strictObject({
  version: z.literal(1),
  model: z.string().min(1),
  location: z.string().min(1),
  resolution,
  aspect: z.enum(['9:16', '16:9']),
  clip_seconds: z.literal(CLIP_SECONDS),
  clips: z.array(ClipEntry).min(1).max(MAX_CLIPS_PER_FILM),
}).superRefine((f, ctx) => {
  f.clips.forEach((c, i) => {
    const at = (k: string | number, ...rest: (string | number)[]) => ['clips', i, k, ...rest];
    if (c.index !== i + 1) ctx.addIssue({ code: 'custom', path: at('index'), message: `clip ${i + 1} has index ${c.index}` });
    if (c.prompt_file !== clipPromptFile(c.index)) ctx.addIssue({ code: 'custom', path: at('prompt_file'), message: `clip ${c.index}'s prompt is ${clipPromptFile(c.index)}` });
    const first = c.index === 1;
    // The hash is known once the start frame is cut from the clip before (null until then).
    if (first !== (c.start_image === null) || (first && c.start_image_sha256 !== null)) {
      ctx.addIssue({ code: 'custom', path: at('start_image'), message: 'clip 1 has no start image; every later clip has one' });
    }
    const retries = c.attempts.filter((a) => a.reason === 'broken_retry').length;
    if (retries > MAX_RETRIES_PER_CLIP) ctx.addIssue({ code: 'custom', path: at('attempts'), message: `at most ${MAX_RETRIES_PER_CLIP} automatic retries per clip (D92 b)` });
    c.attempts.forEach((a, j) => {
      if (a.n !== j + 1) ctx.addIssue({ code: 'custom', path: at('attempts', j, 'n'), message: `attempt ${j + 1} has n ${a.n}` });
      if (a.status === 'sending' && j !== c.attempts.length - 1) ctx.addIssue({ code: 'custom', path: at('attempts', j, 'status'), message: 'only the last attempt may still be sending' });
      if (a.file !== null && a.file !== `video/clips/clip-${String(c.index).padStart(2, '0')}-a${a.n}.mp4`) ctx.addIssue({ code: 'custom', path: at('attempts', j, 'file'), message: 'attempt file name does not match its clip and attempt' });
    });
    if ((c.status === 'sending') !== (c.attempts.at(-1)?.status === 'sending')) ctx.addIssue({ code: 'custom', path: at('status'), message: 'a clip is sending exactly when its last attempt is' });
    if (c.status === 'done' || c.status === 'flagged') {
      const chosen = c.attempts.find((a) => a.n === c.chosen_attempt);
      if (!chosen || chosen.status !== 'done' || chosen.file === null) ctx.addIssue({ code: 'custom', path: at('chosen_attempt'), message: 'a finished clip names a done attempt with a file' });
    } else if (c.chosen_attempt !== null && c.status !== 'stale') {
      ctx.addIssue({ code: 'custom', path: at('chosen_attempt'), message: `a ${c.status} clip has no chosen attempt` });
    }
  });
});
export type ClipsFile = z.infer<typeof ClipsFile>;

// ---- video/assembly.json: app-owned, strict. How the finished reel was put together (Phase 11.7): the attempt of each clip, its own sound,
// the cut after the voice and the brand's outro. Everything here is made on the PC (D89).
/** The finished film's frame rate and size, the same as a motion film (docs/13 film acceptance 1). */
export const FILM_FPS = 30;
export const filmSize = (format: '9x16' | '16x9'): { w: number; h: number } => (format === '9x16' ? { w: 1080, h: 1920 } : { w: 1920, h: 1080 });
/** D102 (owner 2026-11-18, Q38): the clips' own music and effects stay under the voice, 12 dB down, as in the 11.1 proof film. */
export const CLIP_SOUND_DB = -12;
/**
 * The sound of one clip in the bed: `bed` = its own sound at `clip_sound_db`; `muted_speech` = it speaks over 1 s (D87 d, D92 b), so its own
 * sound is left out; `no_audio` = the clip has none; `off` = the clips' own sound is off for this film (a sound revision).
 */
export const CLIP_SOUNDS = ['bed', 'muted_speech', 'no_audio', 'off'] as const;

export const AssemblyFile = z.strictObject({
  version: z.literal(1),
  fps: z.literal(FILM_FPS),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  /** The real voice end (`voice-timing.json`), lines laid with VOICE_LINE_GAP_S. */
  voice_end_s: z.number().positive(),
  /** The reel up to the cut right after the voice: ⌈voice_end × fps⌉ frames (docs/13 V23). */
  body_frames: z.number().int().positive(),
  outro_frames: z.number().int().positive(),
  total_frames: z.number().int().positive(),
  total_s: z.number().positive(),
  outro: z.strictObject({ file: z.string().min(1), sha256, audio: z.boolean() }),
  /** Level of the clips' own sound under the voice in dB; null = off for this film. */
  clip_sound_db: z.number().max(0).nullable(),
  clips: z.array(z.strictObject({
    index: clipIndex,
    attempt: z.number().int().min(1),
    file: z.string().regex(CLIP_FILE),
    file_sha256: sha256,
    /** Seconds of this clip inside the reel, after the cut. */
    used_s: z.number().nonnegative(),
    sound: z.enum(CLIP_SOUNDS),
    flags: z.array(z.enum(CLIP_FLAGS)),
  })).min(1).max(MAX_CLIPS_PER_FILM),
  /** Clips kept with a flag (D92 b): joined like the others and named in the result. */
  flagged: z.array(clipIndex),
  created_at: isoDateTime,
}).superRefine((a, ctx) => {
  if (a.total_frames !== a.body_frames + a.outro_frames) ctx.addIssue({ code: 'custom', path: ['total_frames'], message: 'total = body + outro frames' });
  a.clips.forEach((c, i) => { if (c.index !== i + 1) ctx.addIssue({ code: 'custom', path: ['clips', i, 'index'], message: `clip ${i + 1} has index ${c.index}` }); });
});
export type AssemblyFile = z.infer<typeof AssemblyFile>;

/** `video/sound.json`: the owner's sound revision for this film (Phase 11.7); missing = D102, the clips' own sound kept 12 dB under the voice. */
export const VideoSound = z.strictObject({ clip_sound: z.enum(['keep', 'off']), at: isoDateTime });
export type VideoSound = z.infer<typeof VideoSound>;

/** The owner's cover choices for one film (`video/cover.json`): the moment of the reel behind the cover (default: the middle of the first clip) and where the logo sits. */
export const COVER_LOGO_PLACES = ['under', 'bottom'] as const;
export const VideoCoverOptions = z.strictObject({ frame_s: z.number().min(0).max(600).nullable(), logo: z.enum(COVER_LOGO_PLACES), at: isoDateTime });
export type VideoCoverOptions = z.infer<typeof VideoCoverOptions>;

/**
 * `control/unattended.json` (Phase 11.8, D108): written by the scheduler when it queues a calendar day's video film. While `attended_at` is
 * null nobody has touched the film, and its clips count against the daily cap for unattended films; the owner's first action on the job
 * (continue, accept the script, one more round, «دوباره بساز», keep) sets it, and from then on only the per-film cap applies.
 */
export const UnattendedMark = z.strictObject({ started_at: isoDateTime, attended_at: isoDateTime.nullable() });
export type UnattendedMark = z.infer<typeof UnattendedMark>;

// ---- The `video` block of config/app.config.json (D91, D92). Schema in 11.2; part of AppConfig since the clips stage (11.6).
export const VideoConfig = z.strictObject({
  vertex: z.strictObject({
    /** Empty = find it (D91 a). */
    gcloud_sdk: z.string().min(1).nullable().default(null),
    /** Empty = gcloud's own project (D91 d); the owner's project id stays out of git. */
    project: z.string().min(1).nullable().default(null),
    location: z.string().min(1).default('global'),
    model: z.string().min(1).default('gemini-omni-1.2-flash'),
    api_version: z.string().min(1).default('v1beta1'),
    request_timeout_min: z.number().int().min(1).max(60).default(20),
    /**
     * Phase 11.6, D92 f: `sync` = one request that waits for the clip (`store: false`, proven in 11.1; a cut-off request leaves no id);
     * `background` = `store: true` + `background: true`: the id comes back at once and is saved, and the clip is fetched with free GETs.
     */
    mode: z.enum(['sync', 'background']).default('sync'),
    poll_s: z.number().min(1).max(120).default(10),
  }).prefault({}),
  resolution: resolution.default('720p'),
  max_clips_per_film: z.number().int().min(1).max(MAX_CLIPS_PER_FILM).default(MAX_CLIPS_PER_FILM),
  max_retries_per_clip: z.number().int().min(0).max(MAX_RETRIES_PER_CLIP).default(MAX_RETRIES_PER_CLIP),
  max_usd_per_film: z.number().positive().default(10),
  /**
   * Phase 11.8 (D108, owner 2026-11-19): the most the app's ledger may spend in one day (the app's clock) on video films the scheduler
   * started and nobody has touched since, all brands together. A film the owner continues or rebuilds himself has only the per-film cap.
   */
  max_usd_per_day_unattended: z.number().positive().default(5),
  /** Vertex pricing page, read on `checked_on` (D92). */
  price: z.strictObject({
    checked_on: isoDate.default('2026-11-16'),
    input_usd_per_mtok: z.number().positive().default(1.5),
    video_output_usd_per_mtok: z.number().positive().default(12),
    video_tokens_per_s: z.strictObject({
      '360p': z.number().positive().default(1931),
      '720p': z.number().positive().default(5792),
      '1080p': z.number().positive().default(8670),
    }).prefault({}),
  }).prefault({}),
  /** D87 d, from one 11.1 sample each; reviewed after the first live film (docs/13 V41). */
  thresholds: z.strictObject({
    seam_ssim_min: z.number().min(0).max(1).default(0.7),
    speech_s_max: z.number().nonnegative().default(1),
    duration_tolerance_s: z.number().nonnegative().default(0.5),
  }).prefault({}),
});
export type VideoConfig = z.infer<typeof VideoConfig>;

/** Estimated price of one clip (D92): its prompt's input tokens plus the video tokens of its resolution. */
export function estimateClipUsd(cfg: VideoConfig, res: Resolution, inputTokens: number, seconds: number = CLIP_SECONDS): number {
  const p = cfg.price;
  return (inputTokens * p.input_usd_per_mtok + p.video_tokens_per_s[res] * seconds * p.video_output_usd_per_mtok) / 1e6;
}
