// Responsibility: keep the user's Gemini key (D65): find it by precedence (environment → data/secrets.json → the owner's legacy ava-farsi .env, read only), save or remove it in data/secrets.json, and show it only masked.
import fs from 'node:fs';
import path from 'node:path';
import type { LoadedConfig } from '../config.js';
import { Secrets, geminiKey, writeJson } from '../contracts/index.js';

/** Some Windows editors save with a byte-order mark; JSON.parse rejects it. */
const BOM = new RegExp('^' + String.fromCharCode(0xfeff));

export type KeySource = 'env' | 'secrets' | 'legacy_env';

export interface ResolvedKey { key: string; source: KeySource }

export const secretsFile = (config: LoadedConfig): string => path.join(path.dirname(config.paths.db), 'secrets.json');
export const legacyEnvFile = (config: LoadedConfig): string => path.join(config.paths.avaFarsi, '.env');

/** Persian names of the sources for the Settings card. */
export const SOURCE_FA: Record<KeySource, string> = {
  env: 'از متغیر محیطی (GEMINI_API_KEY)',
  secrets: 'ذخیره‌شده در همین برنامه',
  legacy_env: 'از فایل قدیمی ava-farsi/.env',
};

/** `••••abcd`: the last four characters only; nothing for a missing key. */
export function maskKey(key: string | null | undefined): string | null {
  if (!key) return null;
  return `••••${key.slice(-4)}`;
}

/** Reads data/secrets.json; a missing file is an empty store. A broken file is an error with no key text in it. */
export function readSecrets(config: LoadedConfig): Secrets | null {
  const file = secretsFile(config);
  let raw: string;
  try { raw = fs.readFileSync(file, 'utf8'); } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new SecretsError('فایل کلیدها (data/secrets.json) خوانده نشد.');
  }
  let parsed: unknown;
  try { parsed = JSON.parse(raw.replace(BOM, '')); } catch { throw new SecretsError('فایل کلیدها (data/secrets.json) خراب است؛ کلید را دوباره در تنظیمات وارد کن.'); }
  const r = Secrets.safeParse(parsed);
  // The zod message could quote the value: never pass it on.
  if (!r.success) throw new SecretsError('فایل کلیدها (data/secrets.json) نامعتبر است؛ کلید را دوباره در تنظیمات وارد کن.');
  return r.data;
}

/** The key's value in a `.env` file (`GEMINI_API_KEY=...`, optional quotes), or null. The file is only read, never written. */
export function readEnvFileKey(file: string): string | null {
  let text: string;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return null; }
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?GEMINI_API_KEY\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    const v = m[1]!.trim().replace(/^(['"])(.*)\1$/, '$2').trim();
    return v || null;
  }
  return null;
}

/** Precedence of D65: the environment (cloud session, D48) → data/secrets.json → the legacy ava-farsi `.env`. */
export function resolveGeminiKey(config: LoadedConfig, env: NodeJS.ProcessEnv = process.env): ResolvedKey | null {
  const fromEnv = env.GEMINI_API_KEY?.trim();
  if (fromEnv) return { key: fromEnv, source: 'env' };
  const stored = readSecrets(config)?.gemini_api_key;
  if (stored) return { key: stored, source: 'secrets' };
  const legacy = readEnvFileKey(legacyEnvFile(config));
  if (legacy) return { key: legacy, source: 'legacy_env' };
  return null;
}

export class SecretsError extends Error {
  constructor(public readonly message_fa: string) {
    super(message_fa);
    this.name = 'SecretsError';
  }
}

/** Saves the key in data/secrets.json (validated, atomic). The error never contains the key. */
export function saveGeminiKey(config: LoadedConfig, key: string, now: () => Date = () => new Date()): void {
  const v = geminiKey.safeParse(key);
  if (!v.success) throw new SecretsError('این کلید درست به نظر نمی‌رسد: باید حدود ۴۰ حرف و عدد لاتین بدون فاصله باشد (از Google AI Studio کپی کن).');
  writeJson(secretsFile(config), Secrets, { ...(readSecrets(config) ?? {}), gemini_api_key: v.data, updated_at: now().toISOString() });
}

/** Removes the saved key; the environment and the legacy `.env` are not touched. */
export function removeGeminiKey(config: LoadedConfig, now: () => Date = () => new Date()): void {
  const cur = readSecrets(config);
  if (!cur?.gemini_api_key) return;
  const { gemini_api_key: _drop, ...rest } = cur;
  writeJson(secretsFile(config), Secrets, { ...rest, updated_at: now().toISOString() });
}

/** What the Settings card may show: masked key and its source, never the key. */
export function keyView(config: LoadedConfig, env: NodeJS.ProcessEnv = process.env): { set: boolean; masked: string | null; source: KeySource | null; source_fa: string | null; env_locked: boolean } {
  const r = resolveGeminiKey(config, env);
  return { set: r !== null, masked: maskKey(r?.key), source: r?.source ?? null, source_fa: r ? SOURCE_FA[r.source] : null, env_locked: r?.source === 'env' };
}

/** Replaces every occurrence of the current key in a text (error details from ava-farsi), so it cannot reach a log or an answer. */
export function redactKey(text: string, key: string | null | undefined): string {
  if (!key || key.length < 8) return text;
  return text.split(key).join(maskKey(key) ?? '');
}
