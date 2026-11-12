// Responsibility: the voice-stage contract of docs/04 (VoiceLines in voice/lines.json).
import { z } from 'zod';
import { TONES, tone, voice } from './common.js';

const toneScores = z.strictObject(Object.fromEntries(TONES.map((t) => [t, z.number()])) as Record<(typeof TONES)[number], z.ZodNumber>);

export const VoiceLines = z.strictObject({
  voice,
  tone,
  tone_source: z.enum(['auto', 'config']),
  tone_scores: toneScores,
  tone_reasons: z.array(z.strictObject({ tone, points: z.number(), why: z.string() })),
  sample_rate: z.literal(48000),
  lines: z.array(z.strictObject({
    id: z.number().int().min(1),
    text: z.string().min(1),
    tts_text: z.string().min(1),
    file: z.string().regex(/^voice\/line-\d{2}\.48k\.wav$/),
    duration: z.number().positive(),
    words: z.array(z.strictObject({ w: z.string().min(1), start: z.number().nonnegative(), end: z.number().nonnegative() })),
    words_source: z.enum(['aligned', 'estimated']),
  })).min(1),
});
export type VoiceLines = z.infer<typeof VoiceLines>;
