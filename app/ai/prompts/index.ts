// Responsibility: load the stage prompt templates (app/ai/prompts/*.md) and fill their {{placeholders}}, failing loudly on a missing or unused value.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PROMPT_NAMES = ['content-hook', 'content-truth', 'content-hook-revise', 'content-hook-structure', 'reference', 'suggest', 'name-reference', 'plan', 'build', 'revise'] as const;
export type PromptName = (typeof PROMPT_NAMES)[number];

const HERE = path.dirname(fileURLToPath(import.meta.url));

export function loadTemplate(name: PromptName): string {
  return fs.readFileSync(path.join(HERE, `${name}.md`), 'utf8').replace(/\r\n/g, '\n').trimEnd();
}

/** Replaces every {{key}}; a placeholder without a value, or a value without a placeholder, is a bug in the caller. */
export function renderPrompt(name: PromptName, values: Record<string, string>): string {
  const tpl = loadTemplate(name);
  const used = new Set<string>();
  const out = tpl.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    if (!(key in values)) throw new Error(`prompt ${name}: no value for {{${key}}}`);
    used.add(key);
    return values[key]!;
  });
  const extra = Object.keys(values).filter((k) => !used.has(k));
  if (extra.length) throw new Error(`prompt ${name}: values not used by the template: ${extra.join(', ')}`);
  return out.replace(/ +\n/g, '\n');
}
