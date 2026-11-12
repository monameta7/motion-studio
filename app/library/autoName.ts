// Responsibility: give a newly read reference its Persian name, one-sentence use, group and tags with one small Claude call, so an upload asks the owner nothing; a failed or odd answer leaves the reference as it is.
import { z } from 'zod';
import type { RunOptions, RunResult } from '../ai/claudeRunner.js';
import { renderPrompt } from '../ai/prompts/index.js';
import type { LoadedConfig } from '../config.js';
import { ReferenceMeta, ReferenceReading, readJson, writeJson } from '../contracts/index.js';
import type { Db } from '../db/db.js';
import { referencesRepo, usageRepo } from '../db/repositories.js';
import { activeBrandDir, activeBrandSlug } from '../brands/index.js';
import { decodedCandidates } from '../suggest/index.js';
import { refPaths } from '../stages/reference/index.js';

export const NameAnswer = z.object({
  name_fa: z.string().trim().min(2).max(80),
  use_fa: z.string().trim().min(2).max(300),
  group: ReferenceMeta.shape.group,
  tags: z.array(z.string().trim().toLowerCase().min(1).max(30)).min(1).max(8),
});

export interface AutoNameDeps {
  config: LoadedConfig;
  db: Db;
  run: (o: RunOptions) => Promise<RunResult>;
}

/** A reference saved from an upload that has no use sentence yet: the app names it after the read. */
export const needsName = (meta: ReferenceMeta): boolean => meta.source === 'library' && meta.use_fa === '';

/** Names one read reference. Returns true when the name, use, group and tags were saved. Never throws: the owner can still edit it by hand. */
export async function autoNameReference(slug: string, d: AutoNameDeps): Promise<boolean> {
  const refs = d.config.paths.refs;
  const p = refPaths(refs, slug);
  try {
    const meta = readJson(p.meta, ReferenceMeta);
    const reading = readJson(p.reading, ReferenceReading) as Record<string, unknown>;
    const text = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').slice(0, n) : 'not stated');
    const examples = decodedCandidates(refs).filter((c) => c.slug !== slug).slice(0, 4)
      .map((c) => `- ${c.name_fa} | ${c.use_fa} | ${c.group}`).join('\n') || '- (the library has no other reference yet)';
    const r = await d.run({
      stage: 'suggest',
      brandDir: activeBrandDir(d.db, d.config),
      prompt: renderPrompt('name-reference', { duration: String(meta.duration), format: meta.format, look: text(reading.look, 500), visual: text(reading.visual_language, 900), examples }),
      jsonSchema: z.toJSONSchema(NameAnswer, { io: 'input' }),
    });
    usageRepo.insert(d.db, {
      job_id: null, brand: activeBrandSlug(d.db, d.config), stage: 'suggest', model: r.model, tokens_in: r.usage.input_tokens, tokens_out: r.usage.output_tokens,
      cache_read: r.usage.cache_read_input_tokens, cache_write: r.usage.cache_creation_input_tokens, cost_usd_est: r.costUsdEst,
    });
    if (!r.ok) return false;
    const a = NameAnswer.safeParse(r.structured);
    if (!a.success) return false;
    const next = { ...meta, name_fa: a.data.name_fa, use_fa: a.data.use_fa, group: a.data.group, tags: [...new Set(a.data.tags)] };
    writeJson(p.meta, ReferenceMeta, next);
    referencesRepo.upsert(d.db, next, meta.sha256);
    return true;
  } catch { return false; }
}
