// Responsibility: the video workspace's assemble stage (Phase 11.7, D86 f, D89, D92 b): on this PC and at no cost, join the chosen clip attempts, lay the real voice, cut right after it, add the brand's logo outro, mix to −14 LUFS and verify the film.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { brandDir } from '../../brands/index.js';
import {
  AssemblyFile, CLIP_SECONDS, CLIP_SOUND_DB, ClipsFile, FILM_FPS, VOICE_LINE_GAP_S, VideoSound, VoiceLines, VoiceTiming, clipsForVoice, filmSize, readJson, voiceTiming, writeJson,
  type ClipAttempt,
} from '../../contracts/index.js';
import { faNum } from '../../fa.js';
import { StageError, type Stage, type StageContext, type StageOutput } from '../../orchestrator/stages.js';
import { runTool } from '../../proc.js';
import { probeClip } from '../../video/measure.js';
import { judgeFilm, measureFilm, measureVoiceLost, TRUE_PEAK_MAX, LUFS_TARGET, LUFS_TOLERANCE, type FilmMeasure, type Span, type Tool } from '../build/verify.js';
import { bedArgs, loudnessFixArgs, loudnessMeasureArgs, mixArgs, outroFrameSsimArgs, parseLoudnorm, peakFixArgs, pictureArgs, voiceArgs, type BedClip } from './ffmpeg.js';

export interface AssembleDeps {
  /** ffmpeg / ffprobe; tests may wrap it. */
  tool?: Tool;
  /** x264 preset of the picture; tests use a fast one. */
  preset?: string;
  /** A sound revision (Phase 11.7 task 4): keep `video/render/picture.mp4` as it is, so the film's picture stream stays byte for byte the same. */
  reusePicture?: boolean;
}

/** The outro's first frame in the film must be the brand clip's first frame (hard cut, motion-build §9c). */
export const OUTRO_SSIM_MIN = 0.98;
/** Limiter ceilings for the true-peak fix, one per retry (motion-build §9b allows three). */
const PEAK_LIMITS = [0.8, 0.75, 0.7];
const OUTRO_FILE = 'logo-outro.mp4';

const sha = (f: string) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const rel = (dir: string, f: string) => path.relative(dir, f).split(path.sep).join('/');
const r3 = (x: number) => Math.round(x * 1000) / 1000;

export const assemblePaths = (dir: string) => {
  const render = path.join(dir, 'video', 'render');
  return {
    clips: path.join(dir, 'video', 'clips.json'), timing: path.join(dir, 'video', 'voice-timing.json'), sound: path.join(dir, 'video', 'sound.json'),
    assembly: path.join(dir, 'video', 'assembly.json'), render, voice: path.join(render, 'voice.wav'), picture: path.join(render, 'picture.mp4'),
    bed: path.join(render, 'bed.wav'), mix: path.join(render, 'mix.mp4'), verify: path.join(dir, 'logs', 'assemble-verify.json'),
    final: path.join(dir, 'out', 'final.mp4'), qa: path.join(dir, 'out', 'qa.md'),
  };
};

/** The few brand-token fields the assembly reads (tokens.json is brand-owned; everything else is ignored). */
const OutroTokens = z.looseObject({ outro: z.looseObject({ use_audio: z.boolean().optional(), bg: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional() }).optional() });

export interface Chosen { index: number; attempt: ClipAttempt; file: string; seconds: number }

/** The attempt the clips stage chose for every clip; `blocked` while any clip still waits for the owner (stale, unknown, failed, pending). */
export function chosenClips(dir: string, clips: ClipsFile): Chosen[] {
  const waiting = clips.clips.filter((c) => c.status !== 'done' && c.status !== 'flagged');
  if (waiting.length) {
    throw new StageError('blocked', `کلیپ ${waiting.map((c) => faNum(c.index)).join('، ')} هنوز آماده نیست؛ اول تکلیفش را در بخش «کلیپ‌ها» روشن کن، بعد «ادامه» را بزن.`,
      waiting.map((c) => `clip ${c.index} is ${c.status}`).join('; '));
  }
  return clips.clips.map((c) => {
    const a = c.attempts.find((x) => x.n === c.chosen_attempt)!;
    const file = path.join(dir, ...a.file!.split('/'));
    if (!fs.existsSync(file)) throw new StageError('failed', `فایل کلیپ ${faNum(c.index)} پیدا نشد.`, `${a.file} missing`);
    if (a.file_sha256 && sha(file) !== a.file_sha256) throw new StageError('failed', `فایل کلیپ ${faNum(c.index)} بعد از ساخت عوض شده است.`, `${a.file} sha256 differs from clips.json`);
    const m = a.measurements;
    return { index: c.index, attempt: a, file, seconds: m && m.frames > 0 && m.fps > 0 ? m.frames / m.fps : CLIP_SECONDS };
  });
}

/** The voice on the reel, as the prompts stage laid it: recomputed from voice/lines.json and compared with video/voice-timing.json. */
export function reelVoice(dir: string): { timing: VoiceTiming; files: string[] } {
  const lines = readJson(path.join(dir, 'voice', 'lines.json'), VoiceLines);
  const timing = voiceTiming(lines.lines, VOICE_LINE_GAP_S);
  const saved = assemblePaths(dir).timing;
  if (fs.existsSync(saved)) {
    const t = readJson(saved, VoiceTiming);
    const same = t.voice_end_s === timing.voice_end_s && t.lines.length === timing.lines.length && t.lines.every((l, i) => l.start_s === timing.lines[i]!.start_s && l.end_s === timing.lines[i]!.end_s);
    if (!same) throw new StageError('failed', 'صدای این کار با زمان‌بندی‌ای که پرامپت‌ها با آن ساخته شدند یکی نیست؛ کلیپ‌ها برای صدای دیگری ساخته شده‌اند.', `voice end ${timing.voice_end_s} s, voice-timing.json says ${t.voice_end_s} s`);
  }
  return { timing, files: lines.lines.map((l) => path.join(dir, ...l.file.split('/'))) };
}

/** The sound of each clip in the bed (D102; D87 d: a clip that speaks over 1 s loses its own sound). */
export function clipSound(a: ClipAttempt, bedOn: boolean, speechMax: number): AssemblyFile['clips'][number]['sound'] {
  if (!bedOn) return 'off';
  if (a.flags.includes('speech') || (a.measurements?.speech_s ?? 0) > speechMax) return 'muted_speech';
  if (a.measurements && !a.measurements.has_audio) return 'no_audio';
  return 'bed';
}

export interface Verify {
  problems: string[];
  measure: FilmMeasure;
  expected: { duration: number; fps: number; w: number; h: number };
  voice_lost: Span[];
  outro_ssim: { film_frame: number; outro_frame: number; ssim: number | null }[];
  corrections: string[];
}

async function step(tool: Tool, dir: string, name: string, args: string[], timeoutMs = 20 * 60000): Promise<string> {
  const t0 = Date.now();
  const r = await tool('ffmpeg', args, { timeoutMs });
  fs.appendFileSync(path.join(dir, 'logs', 'assemble.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), step: name, code: r.code, ms: Date.now() - t0, args })}\n`, 'utf8');
  if (r.code !== 0) throw new StageError('failed', 'سرهم کردن ویدیو با خطای ffmpeg متوقف شد.', `${name}: ${(r.stderr || r.error || '').slice(-600)}`);
  return r.stderr;
}

const levelOk = (m: FilmMeasure) => m.lufs !== null && Math.abs(m.lufs - LUFS_TARGET) <= LUFS_TOLERANCE;
const peakOk = (m: FilmMeasure) => m.true_peak_dbtp === null || m.true_peak_dbtp <= TRUE_PEAK_MAX;

export function assembleStage(deps: AssembleDeps = {}): Stage {
  const tool: Tool = deps.tool ?? ((c, a, o) => runTool(c, a, o));
  const preset = deps.preset ?? 'medium';
  return {
    name: 'assemble',
    async run(ctx: StageContext): Promise<StageOutput> {
      if (ctx.req.workspace !== 'video') throw new StageError('failed', 'مرحله‌ی سرهم کردن فقط برای کار ویدیو است.', `workspace ${ctx.req.workspace}`);
      const p = assemblePaths(ctx.dir);
      if (!fs.existsSync(p.clips)) throw new StageError('blocked', 'کلیپ‌های این کار هنوز ساخته نشده‌اند.', 'video/clips.json missing');
      const clipsFile = readJson(p.clips, ClipsFile);
      const chosen = chosenClips(ctx.dir, clipsFile);
      const voice = reelVoice(ctx.dir);
      const need = clipsForVoice(voice.timing.voice_end_s);
      if (chosen.length !== need) throw new StageError('failed', `صدا ${faNum(need)} کلیپ لازم دارد ولی ${faNum(chosen.length)} کلیپ ساخته شده است.`, `voice end ${voice.timing.voice_end_s} s needs ${need} clips, clips.json has ${chosen.length}`);

      const brand = brandDir(ctx.config.paths, ctx.req.brand);
      const outro = path.join(brand, OUTRO_FILE);
      if (!fs.existsSync(outro)) throw new StageError('blocked', 'لوگوموشن پایانی برند پیدا نشد؛ اول در «برند من» آن را بساز.', `${outro} missing`);
      const tokensFile = path.join(brand, 'tokens.json');
      const tokens = fs.existsSync(tokensFile) ? OutroTokens.safeParse(JSON.parse(fs.readFileSync(tokensFile, 'utf8'))) : null;
      const outroProbe = await probeClip(outro, tool);
      if (!outroProbe) throw new StageError('failed', 'فایل لوگوموشن پایانی برند خوانده نشد.', outro);
      const outroBg = (tokens?.success ? tokens.data.outro?.bg : undefined) ?? '#FFFFFF';
      const outroSound = outroProbe.has_audio && (tokens?.success ? tokens.data.outro?.use_audio : undefined) !== false;

      const { w, h } = filmSize(ctx.req.format);
      const bodyFrames = Math.ceil(voice.timing.voice_end_s * FILM_FPS - 1e-6);
      const bodyS = bodyFrames / FILM_FPS;
      const outroFrames = Math.round(outroProbe.duration_s * FILM_FPS);
      const totalFrames = bodyFrames + outroFrames;
      const totalS = totalFrames / FILM_FPS;
      const choice = fs.existsSync(p.sound) ? readJson(p.sound, VideoSound).clip_sound : 'keep';
      const bedOn = choice === 'keep';
      const speechMax = ctx.config.cfg.video.thresholds.speech_s_max;

      fs.mkdirSync(p.render, { recursive: true });
      fs.mkdirSync(path.join(ctx.dir, 'out'), { recursive: true });
      fs.mkdirSync(path.join(ctx.dir, 'logs'), { recursive: true });

      await step(tool, ctx.dir, 'voice', voiceArgs(voice.files, VOICE_LINE_GAP_S, p.voice));
      const voiceLen = Number((await tool('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p.voice])).stdout.trim());
      if (!(voiceLen > 0)) throw new StageError('failed', 'صدای گوینده سرهم نشد.', 'voice.wav unreadable');
      if (Math.abs(voiceLen - voice.timing.voice_end_s) > 0.05) throw new StageError('failed', 'طول صدای سرهم‌شده با زمان‌بندی صدا یکی نیست.', `voice.wav ${voiceLen} s, timing ${voice.timing.voice_end_s} s`);

      if (!(deps.reusePicture && fs.existsSync(p.picture))) {
        await step(tool, ctx.dir, 'picture', pictureArgs({ clips: chosen.map((c) => c.file), outro, w, h, fps: FILM_FPS, bodyFrames, outroBg, preset, out: p.picture }));
      }

      let at = 0;
      const sounds = chosen.map((c) => {
        const used = Math.max(0, Math.min(c.seconds, bodyS - at));
        at += c.seconds;
        return { c, used, sound: clipSound(c.attempt, bedOn, speechMax) };
      });
      const withBed = sounds.some((s) => s.sound === 'bed');
      fs.rmSync(p.bed, { force: true });
      if (withBed) {
        const bed: BedClip[] = sounds.map((s) => ({ file: s.c.file, seconds: s.c.seconds, withSound: s.sound === 'bed' }));
        await step(tool, ctx.dir, 'bed', bedArgs(bed, bodyS, CLIP_SOUND_DB, p.bed));
      }

      await step(tool, ctx.dir, 'mix', mixArgs({ picture: p.picture, voice: p.voice, bed: withBed ? p.bed : null, outroSound: outroSound ? outro : null, bodyS, totalS, out: p.mix }));
      const corrections: string[] = [];
      let film = p.mix;
      let m = await measureFilm(film, tool);
      if (!levelOk(m)) {
        const rep = parseLoudnorm((await tool('ffmpeg', loudnessMeasureArgs(film), { timeoutMs: 10 * 60000 })).stderr);
        if (rep) {
          const next = path.join(p.render, 'mix-level.mp4');
          await step(tool, ctx.dir, 'loudness-fix', loudnessFixArgs(film, rep, totalS, next));
          film = next; m = await measureFilm(film, tool); corrections.push(`loudness second pass → ${String(m.lufs)} LUFS`);
        }
      }
      for (let i = 0; i < PEAK_LIMITS.length && !peakOk(m); i++) {
        const next = path.join(p.render, `mix-peak-${i + 1}.mp4`);
        await step(tool, ctx.dir, `peak-fix-${i + 1}`, peakFixArgs(film, PEAK_LIMITS[i]!, totalS, next));
        film = next; m = await measureFilm(film, tool); corrections.push(`true-peak limiter ${PEAK_LIMITS[i]} → ${String(m.true_peak_dbtp)} dBTP`);
      }
      fs.copyFileSync(film, p.final);

      const expected = { duration: totalS, fps: FILM_FPS, w, h };
      const problems = judgeFilm(m, expected);
      const lost = await measureVoiceLost(p.final, p.voice, tool);
      for (const [a, b] of lost) problems.push(`voice lost ${a}–${b} s`);
      // The cut frame and the middle of the outro (its first frame is a plain background, so it alone proves little).
      const outroSsim: Verify['outro_ssim'] = [];
      for (const k of [0, Math.floor(outroFrames / 2)]) {
        const ss = await tool('ffmpeg', outroFrameSsimArgs(p.final, bodyFrames + k, outro, k, w, h, outroBg), { timeoutMs: 120000 });
        const sm = /All:([0-9.]+)/.exec(ss.stderr);
        const v = sm ? Number(sm[1]) : null;
        outroSsim.push({ film_frame: bodyFrames + k, outro_frame: k, ssim: v });
        if (v === null || v < OUTRO_SSIM_MIN) problems.push(`film frame ${bodyFrames + k} is not outro frame ${k} (SSIM ${String(v)}, at least ${OUTRO_SSIM_MIN})`);
      }
      const verify: Verify = { problems, measure: m, expected, voice_lost: lost, outro_ssim: outroSsim, corrections };
      fs.writeFileSync(p.verify, `${JSON.stringify(verify, null, 2)}\n`, 'utf8');

      const assembly = writeJson(p.assembly, AssemblyFile, {
        version: 1, fps: FILM_FPS, width: w, height: h, voice_end_s: voice.timing.voice_end_s, body_frames: bodyFrames, outro_frames: outroFrames,
        total_frames: totalFrames, total_s: r3(totalS), outro: { file: rel(ctx.config.paths.root, outro), sha256: sha(outro), audio: outroSound },
        clip_sound_db: bedOn ? CLIP_SOUND_DB : null,
        clips: sounds.map((s) => ({ index: s.c.index, attempt: s.c.attempt.n, file: s.c.attempt.file!, file_sha256: s.c.attempt.file_sha256 ?? sha(s.c.file), used_s: r3(s.used), sound: s.sound, flags: s.c.attempt.flags })),
        flagged: clipsFile.clips.filter((c) => c.status === 'flagged').map((c) => c.index),
        created_at: new Date().toISOString(),
      });
      fs.writeFileSync(p.qa, qaText(assembly, verify), 'utf8');
      if (problems.length) throw new StageError('failed', 'ویدیوی سرهم‌شده بررسی خودکار را رد نکرد.', problems.join('; '));
      return { outputs: ['out/final.mp4', 'out/qa.md', 'video/assembly.json', 'logs/assemble-verify.json'] };
    },
  };
}

const SOUND_EN: Record<AssemblyFile['clips'][number]['sound'], string> = {
  bed: 'own sound under the voice', muted_speech: 'own sound left out (speech over 1 s)', no_audio: 'no own sound', off: 'own sound off for this film',
};

/** out/qa.md of a video film: the automatic checks of docs/13 (film acceptance 1, 2, 6, 10) and the clips kept with a flag. */
export function qaText(a: AssemblyFile, v: Verify): string {
  const m = v.measure;
  const lines = [
    '# QA (video film, assemble stage)', '',
    `- duration ${m.duration.toFixed(3)} s, expected ${v.expected.duration.toFixed(3)} s (voice ${a.voice_end_s} s cut at frame ${a.body_frames}, outro ${a.outro_frames} frames)`,
    `- ${m.video_streams} video / ${m.audio_streams} audio stream; ${String(m.fps)} fps; ${String(m.w)}x${String(m.h)}`,
    `- loudness ${String(m.lufs)} LUFS, true peak ${String(m.true_peak_dbtp)} dBTP${v.corrections.length ? ` (${v.corrections.join('; ')})` : ''}`,
    `- voice heard to the end: ${v.voice_lost.length ? `no (${v.voice_lost.map(([x, y]) => `${x}–${y} s`).join(', ')})` : 'yes'}`,
    `- brand outro from frame ${a.body_frames} (hard cut): ${v.outro_ssim.map((o) => `film frame ${o.film_frame} vs outro frame ${o.outro_frame} SSIM ${String(o.ssim)}`).join('; ')}`,
    `- clips' own sound: ${a.clip_sound_db === null ? 'off' : `${a.clip_sound_db} dB under the voice`}`,
    '', '## Clips', '',
    ...a.clips.map((c) => `- clip ${c.index}: attempt ${c.attempt}, ${c.used_s} s in the reel, ${SOUND_EN[c.sound]}${c.flags.length ? `, flags: ${c.flags.join(', ')}` : ''}`),
    '', '## Remaining flaws', '',
    ...(v.problems.length || a.flagged.length
      ? [...v.problems.map((x) => `- ${x}`), ...a.flagged.map((k) => `- clip ${k} kept with a flag (${a.clips[k - 1]!.flags.join(', ') || 'flagged'})`)]
      : ['- none']),
    '',
  ];
  return lines.join('\n');
}
