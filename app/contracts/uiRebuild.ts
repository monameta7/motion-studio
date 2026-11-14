// Responsibility: the app-owned files of the product-screen rebuild (D84): plan/ui-source/NN.json (pixel measurements of an owner image) and the input and output of engine/ui-verify.mjs (logs/ui-qa.json).
import { z } from 'zod';
import { hexColor } from './common.js';

/** Written by engine/ui-measure.py: the page background and the boxes found on it, with their main colours. */
export const UiSource = z.strictObject({
  source: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  background: hexColor,
  boxes: z.array(z.strictObject({ x: z.number().int().min(0), y: z.number().int().min(0), w: z.number().int().positive(), h: z.number().int().positive(), colours: z.array(hexColor).min(1) })),
});
export type UiSource = z.infer<typeof UiSource>;

/** What the app asks engine/ui-verify.mjs to check on the built project page. */
export const UiChecks = z.strictObject({
  w: z.number().int().positive(),
  h: z.number().int().positive(),
  screens: z.array(z.strictObject({
    id: z.string().min(1),
    states: z.array(z.strictObject({ id: z.string().min(1), at: z.number().nonnegative(), texts: z.array(z.string()) })),
    clicks: z.array(z.strictObject({ id: z.string().min(1), at: z.number().nonnegative(), target: z.string().min(1) })),
    elements: z.array(z.strictObject({ name: z.string().min(1), at: z.number().nonnegative() })),
  })),
});
export type UiChecks = z.infer<typeof UiChecks>;

const box = z.tuple([z.number(), z.number(), z.number(), z.number()]);

/** Written by engine/ui-verify.mjs; the app adds `ssim` (report only) and `problems`. */
export const UiQa = z.strictObject({
  page_errors: z.array(z.string()),
  screens: z.array(z.strictObject({
    id: z.string().min(1),
    states: z.array(z.strictObject({ id: z.string().min(1), at: z.number(), found: z.boolean(), missing: z.array(z.string()), cut: z.array(z.string()), still: z.string() })),
    clicks: z.array(z.strictObject({ id: z.string().min(1), at: z.number(), target: z.string(), cursor: z.tuple([z.number(), z.number()]).nullable(), target_box: box.nullable(), on_target: z.boolean() })),
    elements: z.array(z.strictObject({ name: z.string().min(1), file: z.string().nullable(), ssim: z.number().nullable().optional() })),
  })),
  problems: z.array(z.string()).optional(),
});
export type UiQa = z.infer<typeof UiQa>;
