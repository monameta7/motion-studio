// Responsibility: the ffmpeg argument lists of the video assembly (Phase 11.7): the voice laid with the fixed gap, the silent picture (clips joined, cut after the voice, then the brand outro), the clips' own sound as a bed, the mix at −14 LUFS and its two correction passes.

/** The film's colour, as the motion path (D37, motion-build §9c): limited-range BT.709, tagged. */
export const COLOUR_TAGS = ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv'];
const AUDIO_FMT = 'aformat=sample_rates=48000:channel_layouts=stereo';
const AAC = ['-c:a', 'aac', '-b:a', '192k', '-ar', '48000'];
const s3 = (x: number) => x.toFixed(3);

/** The motion path's loudness targets (motion-build §9b): voice −16 LUFS, film −14 LUFS; the film is aimed at −2.5 dBTP so the AAC encode stays under −1.5 (measured 2026-11-18 on the Q38 examples: −2.0). */
export const VOICE_LUFS = -16;
export const FILM_LUFS = -14;
export const FILM_TP_AIM = -2.5;
/** The outro's own sound, as motion-build §9b mixes it. */
export const OUTRO_SOUND_DB = -3;

/** Every voice line one after another with `gap` seconds of silence between them (VOICE_LINE_GAP_S, as voice-timing.json lays them). */
export function voiceArgs(lineFiles: readonly string[], gap: number, out: string): string[] {
  const ins = lineFiles.flatMap((f) => ['-i', f]);
  const pads = lineFiles.map((_, i) => (i < lineFiles.length - 1 ? `[${i}:a]apad=pad_dur=${gap}[l${i}]` : `[${i}:a]anull[l${i}]`));
  const graph = `${pads.join(';')};${lineFiles.map((_, i) => `[l${i}]`).join('')}concat=n=${lineFiles.length}:v=0:a=1[v]`;
  return ['-v', 'error', '-y', ...ins, '-filter_complex', graph, '-map', '[v]', '-c:a', 'pcm_s16le', out];
}

/** Scales any picture into the film frame without stretching it (a clip kept with a size flag is padded, never distorted). */
function fit(w: number, h: number, fps: number, inMatrix: 'auto' | 'bt601', padColour: string): string {
  return `fps=${fps},scale=${w}:${h}:force_original_aspect_ratio=decrease:flags=lanczos:in_range=tv:in_color_matrix=${inMatrix}:out_range=tv:out_color_matrix=bt709,`
    + `pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=${padColour},format=yuv420p,setsar=1`;
}

export interface PictureOpts {
  clips: readonly string[];
  outro: string;
  w: number;
  h: number;
  fps: number;
  bodyFrames: number;
  /** The colour around the vertical outro on a 16:9 film (motion-build §9c `outro.bg`). */
  outroBg: string;
  preset: string;
  out: string;
}

/**
 * The silent picture: the clips joined in order, cut right after the voice (`bodyFrames`; the last frame is held if flagged clips run short),
 * then the brand's outro unchanged, re-encoded once to the film's fps, size and colour (the brand clip is untagged BT.601, motion-build §9c).
 */
export function pictureArgs(o: PictureOpts): string[] {
  const n = o.clips.length;
  const ins = [...o.clips, o.outro].flatMap((f) => ['-i', f]);
  const clips = o.clips.map((_, i) => `[${i}:v]${fit(o.w, o.h, o.fps, 'auto', 'black')}[c${i}]`).join(';');
  const body = `${o.clips.map((_, i) => `[c${i}]`).join('')}concat=n=${n}:v=1:a=0,tpad=stop_mode=clone:stop_duration=${o.bodyFrames / o.fps + 1},trim=end_frame=${o.bodyFrames},setpts=PTS-STARTPTS[body]`;
  const outro = `[${n}:v]${fit(o.w, o.h, o.fps, 'bt601', o.outroBg)},setpts=PTS-STARTPTS[o]`;
  return ['-v', 'error', '-y', ...ins, '-filter_complex', `${clips};${body};${outro};[body][o]concat=n=2:v=1:a=0[v]`,
    '-map', '[v]', '-an', '-c:v', 'libx264', '-preset', o.preset, '-crf', '18', '-pix_fmt', 'yuv420p', ...COLOUR_TAGS, '-movflags', '+faststart', o.out];
}

export interface BedClip { file: string; seconds: number; withSound: boolean }

/** The clips' own sound in reel time: a clip that keeps its sound plays it, a muted one is silence of its length; cut at the body and lowered by `db`. */
export function bedArgs(clips: readonly BedClip[], bodyS: number, db: number, out: string): string[] {
  const ins: string[] = [];
  const parts: string[] = [];
  clips.forEach((c, i) => {
    if (c.withSound) {
      const k = ins.length / 2;
      ins.push('-i', c.file);
      parts.push(`[${k}:a]atrim=end=${s3(c.seconds)},asetpts=PTS-STARTPTS,${AUDIO_FMT},apad=whole_dur=${s3(c.seconds)}[b${i}]`);
    } else {
      parts.push(`aevalsrc=exprs=0|0:s=48000:d=${s3(c.seconds)},${AUDIO_FMT}[b${i}]`);
    }
  });
  const graph = `${parts.join(';')};${clips.map((_, i) => `[b${i}]`).join('')}concat=n=${clips.length}:v=0:a=1,apad=whole_dur=${s3(bodyS)},atrim=end=${s3(bodyS)},volume=${db}dB[bed]`;
  return ['-v', 'error', '-y', ...ins, '-filter_complex', graph, '-map', '[bed]', '-c:a', 'pcm_s16le', out];
}

export interface MixOpts {
  picture: string;
  voice: string;
  /** The bed from `bedArgs`, already at its level; null = no clip sound. */
  bed: string | null;
  /** The outro file when its own sound is used (brand tokens `outro.use_audio`). */
  outroSound: string | null;
  bodyS: number;
  totalS: number;
  out: string;
}

/**
 * The mix, in one pass (motion-build §9b): the voice normalised to −16 LUFS and padded to the film length (so the end is never cut, D49), the
 * bed under it, the outro's own sound from the cut, then a limiter and the film loudness. The picture stream is copied.
 */
export function mixArgs(o: MixOpts): string[] {
  const ins = ['-i', o.picture, '-i', o.voice];
  const labels = ['[vo]'];
  const parts = [`[1:a]${AUDIO_FMT},loudnorm=I=${VOICE_LUFS}:TP=-2:LRA=11,apad=whole_dur=${s3(o.totalS)}[vo]`];
  if (o.bed) { ins.push('-i', o.bed); parts.push(`[${ins.length / 2 - 1}:a]${AUDIO_FMT}[bd]`); labels.push('[bd]'); }
  if (o.outroSound) {
    ins.push('-i', o.outroSound);
    const ms = Math.round(o.bodyS * 1000);
    parts.push(`[${ins.length / 2 - 1}:a]adelay=${ms}|${ms},${AUDIO_FMT},volume=${OUTRO_SOUND_DB}dB[oa]`);
    labels.push('[oa]');
  }
  const graph = `${parts.join(';')};${labels.join('')}amix=inputs=${labels.length}:normalize=0,alimiter=limit=0.89,loudnorm=I=${FILM_LUFS}:TP=${FILM_TP_AIM}:LRA=11,aresample=48000,apad[mix]`;
  return ['-v', 'error', '-y', ...ins, '-filter_complex', graph, '-map', '0:v', '-map', '[mix]', '-c:v', 'copy', ...AAC, '-t', s3(o.totalS), '-movflags', '+faststart', o.out];
}

/** First half of the loudness correction (motion-build §9b): measure the film with loudnorm's JSON report (stderr). */
export const loudnessMeasureArgs = (film: string): string[] => ['-hide_banner', '-nostats', '-i', film, '-vn', '-af', `loudnorm=I=${FILM_LUFS}:TP=${FILM_TP_AIM}:LRA=11:print_format=json`, '-f', 'null', '-'];

export interface LoudnormReport { input_i: string; input_tp: string; input_lra: string; input_thresh: string; target_offset: string }

/** The last JSON object in loudnorm's stderr report; null when there is none. */
export function parseLoudnorm(stderr: string): LoudnormReport | null {
  const start = stderr.lastIndexOf('{');
  const end = stderr.lastIndexOf('}');
  if (start < 0 || end < start) return null;
  try {
    const j = JSON.parse(stderr.slice(start, end + 1)) as Partial<LoudnormReport>;
    return j.input_i && j.input_tp && j.input_lra && j.input_thresh && j.target_offset ? (j as LoudnormReport) : null;
  } catch { return null; }
}

/** Second half: the audio again through loudnorm with the measured values (linear), the picture copied. */
export function loudnessFixArgs(film: string, m: LoudnormReport, totalS: number, out: string): string[] {
  const af = `loudnorm=I=${FILM_LUFS}:TP=${FILM_TP_AIM}:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true,aresample=48000`;
  return ['-v', 'error', '-y', '-i', film, '-map', '0:v', '-map', '0:a', '-c:v', 'copy', '-af', af, ...AAC, '-t', s3(totalS), '-movflags', '+faststart', out];
}

/** The true-peak fix (motion-build §9b): only the audio again through a limiter at `limit`, the picture copied. */
export function peakFixArgs(film: string, limit: number, totalS: number, out: string): string[] {
  return ['-v', 'error', '-y', '-i', film, '-map', '0:v', '-map', '0:a', '-c:v', 'copy', '-af', `alimiter=limit=${limit}:attack=3:release=40:level=disabled,aresample=48000`, ...AAC, '-t', s3(totalS), '-movflags', '+faststart', out];
}

/** SSIM of one frame of the film against one frame of the brand outro, scaled the same way (the hard cut of motion-build §9c). */
export function outroFrameSsimArgs(film: string, frame: number, outro: string, outroFrame: number, w: number, h: number, outroBg: string): string[] {
  const graph = `[0:v]select=eq(n\\,${frame}),format=rgb24[a];[1:v]${fit(w, h, 30, 'bt601', outroBg)},select=eq(n\\,${outroFrame}),format=rgb24[b];[a][b]ssim`;
  return ['-v', 'info', '-i', film, '-i', outro, '-filter_complex', graph, '-frames:v', '1', '-f', 'null', '-'];
}
