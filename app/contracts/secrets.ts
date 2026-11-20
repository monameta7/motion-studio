// Responsibility: the contract of data/secrets.json, the user's own keys (D65); the file is git-ignored and its values never leave the app unmasked.
import { z } from 'zod';

/** A Gemini API key as Google AI Studio shows it: printable ASCII, no spaces. Checked loosely: Google may change the format. */
export const geminiKey = z.string().trim().min(20, 'key too short').max(200, 'key too long').regex(/^[\x21-\x7E]+$/, 'key has spaces or non-Latin characters');

/** The user's own Anthropic API key (Claude Console): `sk-ant-…`, printable ASCII, no spaces (D106). */
export const anthropicKey = z.string().trim().regex(/^sk-ant-[!-~]{20,300}$/, 'not an Anthropic API key');

/** How Claude Code signs in for this user (D106): their own subscription (default) or their own API key. */
export const ClaudeAuthMode = z.enum(['subscription', 'api_key']);
export type ClaudeAuthMode = z.infer<typeof ClaudeAuthMode>;

export const Secrets = z.strictObject({
  gemini_api_key: geminiKey.optional(),
  anthropic_api_key: anthropicKey.optional(),
  claude_auth: ClaudeAuthMode.optional(),
  updated_at: z.iso.datetime({ offset: true }),
});
export type Secrets = z.infer<typeof Secrets>;
