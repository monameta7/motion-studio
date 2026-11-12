// Responsibility: the content-stage contracts of docs/04 (ContentPackage and TruthRound).
import { z } from 'zod';
import { textRole } from './common.js';

/** ava-farsi rejects texts over 3000 characters (docs/10); with D32 the whole voice-over goes in one request. */
export const TTS_MAX_CHARS = 3000;

export const ContentPackage = z
  .strictObject({
    title: z.string().min(1),
    hook_line: z.string().min(1),
    framework: z.string().min(1),
    duration_target_s: z.number().positive(),
    concept: z.string().min(1),
    shotlist: z.array(z.strictObject({ t: z.string(), picture: z.string(), on_screen_text: z.string(), sound: z.string(), reward: z.string() })).min(1),
    voice_lines: z.array(z.strictObject({ id: z.number().int().min(1), text: z.string().min(1).max(TTS_MAX_CHARS), t_hint: z.number().nonnegative() })).min(1),
    on_screen_texts: z.array(z.strictObject({ text: z.string().min(1), voice_line: z.number().int().min(1), role: textRole })),
    claims: z.array(z.strictObject({ text: z.string().min(1), source_url: z.string(), source_date: z.string() })),
    cta: z.string().min(1),
    caption: z.string().min(1),
    hashtags: z.array(z.string().startsWith('#')),
    cover: z.strictObject({ headline: z.string(), subline: z.string(), visual: z.string(), layout_notes: z.string() }),
    alt_hooks: z.array(z.string()),
    assumptions: z.array(z.string()),
    markdown: z.string().min(1),
  })
  .superRefine((p, ctx) => {
    const ids = p.voice_lines.map((l) => l.id);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', path: ['voice_lines'], message: 'voice line ids must be unique' });
    for (const [i, t] of p.on_screen_texts.entries()) {
      if (!ids.includes(t.voice_line)) ctx.addIssue({ code: 'custom', path: ['on_screen_texts', i, 'voice_line'], message: `voice line ${t.voice_line} does not exist` });
    }
    const total = p.voice_lines.reduce((n, l) => n + l.text.length, 0) + p.voice_lines.length - 1;
    if (total > TTS_MAX_CHARS) ctx.addIssue({ code: 'custom', path: ['voice_lines'], message: `voice-over is ${total} characters; one TTS request allows ${TTS_MAX_CHARS} (D32)` });
  });
export type ContentPackage = z.infer<typeof ContentPackage>;

export const TruthRound = z.strictObject({
  round: z.number().int().min(1),
  score: z.number().min(0).max(100),
  caps: z.array(z.string()),
  passed: z.boolean(),
  rubric: z.array(z.strictObject({
    criterion: z.string().min(1),
    weight: z.number().nonnegative(),
    check: z.string().min(1),
    pass: z.boolean(),
    points: z.number().nonnegative(),
    evidence: z.string(),
  })).min(1),
  fixes: z.array(z.string()),
}).refine((r) => !(r.passed && r.caps.length > 0), { message: 'a round cannot pass while a cap is active (D17)', path: ['passed'] });
export type TruthRound = z.infer<typeof TruthRound>;

/**
 * `content/rubric.json`: the per-job rubric truth builds in round 1 and every later round reuses unchanged (docs/05).
 * The file belongs to the truth skill and its layout differs between runs (flat checks, nested checks, `name` or `task`; seen in the first three live
 * jobs), so the app only needs it to be a JSON object with a non-empty `criteria` list. That it stays unchanged is enforced by its hash.
 */
export const RubricFile = z.looseObject({ criteria: z.array(z.unknown()).min(1) });
export type RubricFile = z.infer<typeof RubricFile>;
