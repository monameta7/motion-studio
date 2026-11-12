// Responsibility: pick the tone, turn the approved voice-over into per-line WAVs through ava-farsi in one request (D32), then measure and align them (docs/03 S3).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { LoadedConfig } from '../../config.js';
import { ContentPackage, TONES, VoiceLines, readJson, tone as toneSchema, writeJson } from '../../contracts/index.js';
import { runTool, type RunResult } from '../../proc.js';
import { StageError, type Stage, type StageContext, type StageOutput } from '../../orchestrator/stages.js';
import { AvaClient, TtsError } from './avaClient.js';
import { applyLexiconFile } from './lexicon.js';
import { SplitError, splitTake } from './split.js';
import { encodeWav, parseWav } from './wav.js';

type Tone = z.infer<typeof toneSchema>;

export interface ToneChoice {
  tone: Tone;
  source: 'auto' | 'config';
  scores: Record<Tone, number>;
  reasons: { tone: Tone; points: number; why: string }[];
}

const pad = (n: number) => String(n).padStart(2, '0');
const zeroScores = (): Record<Tone, number> => Object.fromEntries(TONES.map((t) => [t, 0])) as Record<Tone, number>;
const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

/** Optional per-job override: `voice/tone-override.json` = {"tone": "formal"} (docs/10: the owner can override the tone per job). */
export const toneOverrideFile = (dir: string) => path.join(dir, 'voice', 'tone-override.json');

export type Tool = (cmd: string, args: string[], opts?: { cwd?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv }) => Promise<RunResult>;

/** Per-job override, else config tone, else `engine/tone-select.mjs` on the package; one tone for the whole film. */
export async function chooseTone(ctx: StageContext, run: Tool = runTool): Promise<ToneChoice> {
  const { cfg, paths } = ctx.config;
  const fixed = (t: Tone, why: string): ToneChoice => ({ tone: t, source: 'config', scores: zeroScores(), reasons: [{ tone: t, points: 0, why }] });
  const override = toneOverrideFile(ctx.dir);
  if (fs.existsSync(override)) {
    const o = readJson(override, z.strictObject({ tone: toneSchema }));
    return fixed(o.tone, 'per-job override (voice/tone-override.json)');
  }
  if (cfg.tts.tone !== 'auto') return fixed(cfg.tts.tone, 'fixed in config (tts.tone)');
  // The job's brand picks its own `brand_bias` entry (Phase 8).
  const r = await run(process.execPath, [path.join(paths.engine, 'tone-select.mjs'), path.join(ctx.dir, 'content', 'package.json'), paths.toneRules, ctx.req.brand], { cwd: paths.root, timeoutMs: 30000 });
  try {
    if (r.code !== 0) throw new Error(r.stderr || r.error || `exit ${String(r.code)}`);
    const j = z.object({ tone: toneSchema, scores: z.record(z.string(), z.number()), reasons: z.array(z.object({ tone: toneSchema, points: z.number(), why: z.string() })) }).parse(JSON.parse(r.stdout));
    return { tone: j.tone, source: 'auto', scores: { ...zeroScores(), ...j.scores }, reasons: j.reasons };
  } catch (e) {
    return fixed(cfg.tts.tone_fallback, `tone-select failed (${(e as Error).message.slice(0, 120)}); used tts.tone_fallback`);
  }
}

export interface VoiceDeps {
  client: (config: LoadedConfig) => Pick<AvaClient, 'ensureUp' | 'synthesize'>;
  run: Tool;
  /** Runs engine/align.py on lines.json and returns its JSON summary. */
  align: (ctx: StageContext, linesFile: string) => Promise<AlignSummary>;
}

export interface AlignSummary {
  lines: { id: number; source: string; words: number; exact: number; paired: number; interpolated: number }[];
  words: number;
  words_in_aligned_lines_pct: number;
  words_matched_to_speech_pct: number;
}

export async function runAlign(ctx: StageContext, linesFile: string, run: Tool = runTool): Promise<AlignSummary> {
  const { cfg, paths } = ctx.config;
  const r = await run('python', [
    path.join(paths.engine, 'align.py'), linesFile,
    '--model', cfg.align.model, '--language', cfg.align.language, '--device', cfg.align.device, '--compute-type', cfg.align.compute_type,
  ], { cwd: paths.root, timeoutMs: 20 * 60000, env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' } });
  if (r.code !== 0) throw new StageError('failed', 'هم‌زمان‌سازی کلمه‌ها با صدا (align.py) خطا داد.', (r.stderr || r.error || '').slice(-1500));
  try { return JSON.parse(r.stdout.trim().split(/\r?\n/).at(-1) ?? '') as AlignSummary; } catch {
    throw new StageError('failed', 'خروجی align.py خوانده نشد.', r.stdout.slice(-500));
  }
}

const toStageError = (e: TtsError): StageError => (e.kind === 'failed' || e.kind === 'rejected' ? new StageError('failed', e.message_fa, e.detail) : new StageError('blocked', e.message_fa, e.detail));

export function voiceStage(overrides: Partial<VoiceDeps> = {}): Stage {
  const deps: VoiceDeps = {
    client: (c) => new AvaClient(c),
    run: runTool,
    align: (ctx, f) => runAlign(ctx, f, overrides.run ?? runTool),
    ...overrides,
  };
  return {
    name: 'voice',
    async run(ctx: StageContext): Promise<StageOutput> {
      const { cfg, paths } = ctx.config;
      const voiceDir = path.join(ctx.dir, 'voice');
      fs.mkdirSync(voiceDir, { recursive: true });
      const pkg = readJson(path.join(ctx.dir, 'content', 'package.json'), ContentPackage);

      const choice = await chooseTone(ctx, deps.run);
      const lexFile = paths.lexicon;
      const lines = pkg.voice_lines.map((l) => ({ id: l.id, text: l.text, tts_text: applyLexiconFile(l.text, lexFile).text }));
      const fullText = lines.map((l) => l.tts_text).join('\n');

      // One request per film (D32). The take is kept, so a failure further down never costs a second request (Gemini free tier: 10 a day).
      const takeFile = path.join(voiceDir, 'take-full.wav');
      const takeMeta = path.join(voiceDir, 'take.json');
      const key = sha(JSON.stringify({ text: fullText, voice: cfg.tts.voice, tone: choice.tone }));
      const reuse = (() => {
        try { return fs.existsSync(takeFile) && (JSON.parse(fs.readFileSync(takeMeta, 'utf8')) as { key?: string }).key === key; } catch { return false; }
      })();
      if (!reuse) {
        const client = deps.client(ctx.config);
        try {
          await client.ensureUp();
          const wav = await client.synthesize(fullText, cfg.tts.voice, choice.tone);
          fs.writeFileSync(takeFile, wav);
          fs.writeFileSync(takeMeta, JSON.stringify({ key, voice: cfg.tts.voice, tone: choice.tone, chars: fullText.length, at: new Date().toISOString() }, null, 2) + '\n', 'utf8');
        } catch (e) {
          if (e instanceof TtsError) throw toStageError(e);
          throw e;
        }
      }

      let pcm;
      try { pcm = parseWav(fs.readFileSync(takeFile)); } catch (e) {
        throw new StageError('failed', 'فایل صدای دریافتی خراب است. برای ساخت دوباره، فایل voice/take.json را پاک کن.', (e as Error).message);
      }
      let split;
      try { split = splitTake(pcm, lines.map((l) => l.tts_text.length)); } catch (e) {
        if (e instanceof SplitError) {
          throw new StageError('failed', 'نتوانستم صدا را به جمله‌های متن تقسیم کنم (مکث کافی بین جمله‌ها نبود). صدای کامل در voice/take-full.wav مانده است.', e.message);
        }
        throw e;
      }

      const outLines: VoiceLines['lines'] = [];
      const files: string[] = ['voice/take-full.wav', 'voice/take.json'];
      for (const [i, seg] of split.segments.entries()) {
        const n = pad(i + 1);
        const raw = path.join(voiceDir, `line-${n}.wav`);
        const f48 = path.join(voiceDir, `line-${n}.48k.wav`);
        fs.writeFileSync(raw, encodeWav(seg.pcm));
        const ff = await deps.run('ffmpeg', ['-y', '-v', 'error', '-i', raw, '-ar', '48000', '-ac', '1', f48], { timeoutMs: 60000 });
        if (ff.code !== 0) throw new StageError('failed', 'ffmpeg نتوانست صدای جمله را به ۴۸ کیلوهرتز ببرد.', (ff.stderr || ff.error || '').slice(-500));
        const pr = await deps.run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f48], { timeoutMs: 30000 });
        const duration = Number(pr.stdout.trim());
        if (pr.code !== 0 || !Number.isFinite(duration) || duration <= 0) throw new StageError('failed', 'ffprobe طول صدای جمله را نخواند.', pr.stderr || pr.error || pr.stdout);
        const l = lines[i]!;
        outLines.push({ id: l.id, text: l.text, tts_text: l.tts_text, file: `voice/line-${n}.48k.wav`, duration: Math.round(duration * 1000) / 1000, words: [], words_source: 'estimated' });
        files.push(`voice/line-${n}.wav`, `voice/line-${n}.48k.wav`);
      }

      const linesFile = path.join(voiceDir, 'lines.json');
      writeJson(linesFile, VoiceLines, {
        voice: cfg.tts.voice, tone: choice.tone, tone_source: choice.source, tone_scores: choice.scores, tone_reasons: choice.reasons, sample_rate: 48000, lines: outLines,
      });
      const summary = await deps.align(ctx, linesFile);
      // Re-read through the contract: align.py wrote this file.
      const final = readJson(linesFile, VoiceLines);
      fs.mkdirSync(path.join(ctx.dir, 'logs'), { recursive: true });
      fs.writeFileSync(path.join(ctx.dir, 'logs', 'voice-align.json'), JSON.stringify({ ...summary, split: { candidates: split.candidates, cuts: split.cuts.length, threshold_db: split.thresholdDb, min_gap_s: split.minGapS }, line_durations: final.lines.map((l) => l.duration) }, null, 2) + '\n', 'utf8');
      return { outputs: ['voice/lines.json', ...files, 'logs/voice-align.json'] };
    },
  };
}
