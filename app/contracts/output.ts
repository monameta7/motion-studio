// Responsibility: the delivered-job contract of docs/04 (Manifest in out/manifest.json, the file the UI reads).
import { z } from 'zod';
import { format, isoDateTime, slug } from './common.js';

export const Manifest = z.strictObject({
  slug,
  topic: z.string().min(1),
  format,
  duration: z.number().positive(),
  total_duration: z.number().positive(),
  files: z.strictObject({
    video: z.literal('out/final.mp4'),
    cover_4x5: z.literal('out/cover-4x5.png'),
    caption: z.literal('out/caption.txt'),
    package: z.literal('out/package.md'),
    qa: z.literal('out/qa.md'),
  }),
  references: z.array(slug),
  truth_score: z.number().min(0).max(100),
  truth_rounds: z.number().int().min(1),
  qa: z.strictObject({ passed: z.boolean(), flaws: z.array(z.string()) }),
  metrics: z.strictObject({
    wall_minutes: z.number().nonnegative(),
    tokens_in: z.number().int().nonnegative(),
    tokens_out: z.number().int().nonnegative(),
    cost_usd_est: z.number().nonnegative(),
  }),
  created_at: isoDateTime,
}).refine((m) => m.total_duration >= m.duration, { message: 'total_duration must include duration', path: ['total_duration'] });
export type Manifest = z.infer<typeof Manifest>;
