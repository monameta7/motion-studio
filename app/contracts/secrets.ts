// Responsibility: the contract of data/secrets.json, the user's own keys (D65); the file is git-ignored and its values never leave the app unmasked.
import { z } from 'zod';

/** A Gemini API key as Google AI Studio shows it: printable ASCII, no spaces. Checked loosely: Google may change the format. */
export const geminiKey = z.string().trim().min(20, 'key too short').max(200, 'key too long').regex(/^[\x21-\x7E]+$/, 'key has spaces or non-Latin characters');

export const Secrets = z.strictObject({
  gemini_api_key: geminiKey.optional(),
  updated_at: z.iso.datetime({ offset: true }),
});
export type Secrets = z.infer<typeof Secrets>;
