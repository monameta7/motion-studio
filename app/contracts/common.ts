// Responsibility: small zod building blocks shared by every contract (timestamps, slugs, enums used in more than one file).
import { z } from 'zod';

export const isoDateTime = z.iso.datetime({ offset: true });
export const isoDate = z.iso.date();
export const slug = z.string().regex(/^[a-z0-9][a-z0-9._-]*$/, 'slug: lowercase Latin letters, digits, dot, dash or underscore');
export const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
export const sha256 = z.string().regex(/^[0-9a-f]{64}$/);

export const format = z.enum(['9x16', '16x9']);
export const automationLevel = z.enum(['full', 'review']);
export const styleSource = z.enum(['manual', 'day_override', 'suggest', 'weekday', 'rotate', 'fixed']);

export const STAGE_NAMES = ['preflight', 'content', 'voice', 'reference', 'plan', 'build', 'package'] as const;
export const stageName = z.enum(STAGE_NAMES);
export type StageName = z.infer<typeof stageName>;

export const TONES = ['formal', 'narrative', 'friendly', 'meditative', 'energetic'] as const;
export const tone = z.enum(TONES);
export const VOICES = ['Kore', 'Puck', 'Charon', 'Fenrir', 'Zephyr'] as const;
export const voice = z.enum(VOICES);

export const textRole = z.enum(['hook', 'key', 'stat', 'label', 'cta']);
