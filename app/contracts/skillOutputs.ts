// Responsibility: zod copies of the three files the motion-plan skill owns (brand-profile.json, audio.json, scene-plan.json); if the skill changes, these change with it.
// Every documented field is required and typed; extra fields the skill adds (Phase 0: texts[].voice_line, key, source, brand-profile font_rules, ...) are kept, not rejected,
// because the skill, not the app, owns these files (decision in phases/reports/PHASE-1-report.md).
import { z } from 'zod';
import { hexColor, textRole } from './common.js';

const nullableNum = z.number().nullable();
const size = z.looseObject({ w: z.number().int().positive(), h: z.number().int().positive() });

const Outro = z.looseObject({
  file: z.string().nullable(),
  duration: z.number().nonnegative(),
  use_audio: z.boolean(),
  bg: hexColor,
  logo_hit: z.number().nonnegative(),
});

export const BrandProfile = z.looseObject({
  brand: z.string().min(1),
  sources: z.array(z.looseObject({ file: z.string().min(1), version: z.string() })),
  colors: z.array(z.looseObject({ name: z.string(), hex: hexColor, role: z.enum(['background', 'surface', 'text', 'accent', 'highlight', 'success', 'error', 'other']) })),
  banned_colors: z.array(z.string()),
  fonts: z.array(z.looseObject({ family: z.string().min(1), weights: z.array(z.number().int()), script: z.enum(['persian', 'latin', 'both']), file: z.string().nullable() })),
  shape: z.looseObject({ radius_px: nullableNum, stroke_px: nullableNum, shadow: z.string().nullable(), grid_px: nullableNum }),
  motion_personality: z.enum(['calm', 'energetic', 'technical', 'editorial', 'playful', 'luxury']).nullable(),
  logo: z.looseObject({ files: z.array(z.string()), placements: z.array(z.string()), min_width_px: nullableNum, clear_space: z.union([z.string(), z.number()]).nullable() }),
  tone: z.looseObject({ summary: z.string(), do: z.array(z.string()), dont: z.array(z.string()) }),
  motion: z.looseObject({
    preferred: z.array(z.string()),
    avoid: z.array(z.string()),
    durations_ms: z.looseObject({ micro: z.tuple([z.number(), z.number()]), ui: z.tuple([z.number(), z.number()]), reveal: z.tuple([z.number(), z.number()]) }),
  }),
  outro: z.looseObject({ file: z.string().nullable(), duration: z.number().nonnegative(), has_audio: z.boolean(), use_audio: z.boolean(), bg: hexColor, logo_hit: z.number().nonnegative() }),
  cover_system: z.looseObject({
    file: z.string().min(1),
    master: size,
    zones: z.array(z.looseObject({ id: z.string().min(1), from: z.number().min(0).max(1), to: z.number().min(0).max(1), use: z.string() })),
    title_words: z.tuple([z.number().int(), z.number().int()]),
    visual_systems: z.array(z.looseObject({ id: z.string().min(1), use: z.string() })),
    modes: z.array(z.looseObject({ id: z.enum(['dark', 'light']), use: z.string() })),
    hard_fails: z.array(z.string()),
  }).nullable(),
  language: z.string().min(2),
});
export type BrandProfile = z.infer<typeof BrandProfile>;

const Word = z.looseObject({ w: z.string().min(1), start: z.number().nonnegative(), end: z.number().nonnegative() });

export const AudioJson = z.looseObject({
  file: z.literal('voice.wav'),
  duration: z.number().positive(),
  lines: z.array(z.looseObject({
    id: z.number().int().min(1),
    text: z.string().min(1),
    start: z.number().nonnegative(),
    end: z.number().nonnegative(),
    words: z.array(Word),
    words_source: z.enum(['aligned', 'estimated']),
  })).min(1),
});
export type AudioJson = z.infer<typeof AudioJson>;

const Scene = z.looseObject({
  id: z.number().int().min(1),
  start: z.number().nonnegative(),
  end: z.number().nonnegative(),
  voice_line: z.number().int().min(1),
  beat: z.enum(['hook', 'problem', 'turn', 'solution', 'proof', 'cta', 'endcard']),
  picture: z.string(),
  action: z.string(),
  camera: z.string(),
  component: z.enum(['title', 'stat', 'compare', 'list', 'quote', 'ui', 'character', 'diagram', 'cta', 'endcard', 'custom']),
  props: z.record(z.string(), z.unknown()),
  texts: z.array(z.looseObject({ text: z.string().min(1), role: textRole, in: z.number().nonnegative(), out: z.number().nonnegative(), zone: z.enum(['upper', 'middle', 'lower']) })),
  transition_out: z.enum(['needle-zoom', 'fly-through', 'morph', 'carry', 'wipe', 'match-shape', 'hard-cut', 'none']),
  continuity: z.string(),
  borrowed_from: z.string().regex(/^(r\d+-s\d+|NEW)$/),
  adaptation: z.enum(['KEEP', 'ADAPT', 'NEW']),
  asset: z.string().nullable(),
  // motion-plan v2 additions (references/schemas.md §D): optional, so a v1 plan still passes
  link: z.number().int().min(1).optional(),
  understand: z.string().optional(),
  purpose: z.enum(['explain', 'connect', 'emphasize', 'reveal']).optional(),
  handoff: z.string().optional(),
  key_frame: z.number().nonnegative().optional(),
});

export const ScenePlan = z.looseObject({
  slug: z.string().min(1),
  status: z.enum(['ready', 'awaiting_review', 'blocked']),
  mode: z.enum(['REEL', 'EXPLAINER', 'RECREATE', 'BLEND', 'UI', 'PRODUCT', 'JOURNEY']),
  format: z.looseObject({ w: z.number().int().positive(), h: z.number().int().positive(), fps: z.number().int().positive() }),
  duration: z.number().positive(),
  total_duration: z.number().positive(),
  timing: z.enum(['measured', 'estimated']),
  brand: z.string().min(1),
  language: z.string().min(2),
  hero_element: z.string(),
  reference: z.looseObject({ slug: z.string(), visual_language: z.string() }),
  safe_zone: z.looseObject({ top: z.number(), bottom: z.number(), sides: z.number(), right_rail: z.number(), right_rail_from: z.number() }),
  cast: z.array(z.looseObject({ id: z.string().regex(/^c\d+$/), role: z.string(), look: z.string(), colors: z.array(hexColor), first_scene: z.number().int().min(1) })),
  // motion-plan v2 additions (references/schemas.md §D): optional, shape left to the skill
  version: z.number().int().optional(),
  style_lock: z.string().optional(),
  chain: z.array(z.looseObject({ id: z.number().int().min(1), understand: z.string(), scenes: z.array(z.number().int().min(1)) })).optional(),
  world: z.looseObject({ w: z.number().positive(), h: z.number().positive(), regions: z.array(z.looseObject({ id: z.string() })) }).optional(),
  actors: z.array(z.looseObject({ id: z.string() })).optional(),
  camera: z.array(z.looseObject({ at: z.number().nonnegative() })).optional(),
  // D42: where each owner image appears (docs/04); optional like the other v2 fields, checked against the request by the plan stage.
  owner_assets: z.array(z.looseObject({ file: z.string().min(1), scenes: z.array(z.number().int().min(1)), how: z.string() })).optional(),
  scenes: z.array(Scene).min(1),
  outro: Outro,
  sound: z.looseObject({
    music: z.looseObject({ bpm: z.number().positive(), root_midi: z.number().int(), minor: z.boolean(), progression: z.array(z.number().int()), file: z.string().nullable() }),
    cues: z.array(z.looseObject({ type: z.enum(['whoosh', 'pop', 'click', 'riser', 'impact']), at: z.number().nonnegative(), gain: z.number().nonnegative() })),
    seed: z.number().int(),
  }),
  cover: z.looseObject({
    status: z.enum(['ready', 'missing']),
    headline: z.string(), subline: z.string(), visual: z.string(), layout_notes: z.string(),
    hero_scene: z.number().int().min(1).nullable(),
    format: size,
    grid_safe: size,
    system: z.string().nullable(),
    mode: z.enum(['dark', 'light']).nullable(),
    master: size.nullable(),
  }),
  risks: z.array(z.string()),
});
export type ScenePlan = z.infer<typeof ScenePlan>;

const EPS = 1 / 60;

/** Cuts that hand a world or shape over to the next scene (motion-plan L8), so an element may stay on screen through them. */
const HANDOFF_CUTS: ReadonlySet<string> = new Set(['carry', 'morph', 'fly-through', 'needle-zoom', 'match-shape']);

/** Structural re-checks on a plan (docs/03 S5): continuous scene times, total_duration, CTA last, every text inside its scene. The per-line word-span check needs audio.json and belongs to the plan stage (Phase 3). */
export function checkScenePlan(p: ScenePlan): string[] {
  const out: string[] = [];
  const s = [...p.scenes].sort((a, b) => a.start - b.start);
  if (Math.abs((s[0]?.start ?? 0) - 0) > EPS) out.push('first scene does not start at 0');
  for (let i = 1; i < s.length; i++) {
    const prev = s[i - 1]!; const cur = s[i]!;
    if (Math.abs(cur.start - prev.end) > EPS) out.push(`gap or overlap between scene ${prev.id} and ${cur.id}`);
  }
  const last = s[s.length - 1]!;
  if (Math.abs(last.end - p.duration) > EPS) out.push(`last scene ends at ${last.end}, duration is ${p.duration}`);
  if (Math.abs(p.total_duration - (p.duration + p.outro.duration)) > EPS) out.push(`total_duration ${p.total_duration} ≠ duration ${p.duration} + outro ${p.outro.duration}`);
  if (last.beat !== 'cta' && p.outro.file) out.push('the last scene before the outro is not the CTA');
  for (const sc of s) for (const t of sc.texts) {
    // A text may carry across the cut into the next scene: when the skill says so (`carries_into: <scene id>`), or when the cut out of
    // this scene is a handoff (motion-plan v2 designs the film as one continuous explanation; its handoff cuts carry elements over).
    const next = s[s.indexOf(sc) + 1];
    const into = typeof t.carries_into === 'number' ? s.find((x) => x.id === t.carries_into) : HANDOFF_CUTS.has(sc.transition_out) ? next : undefined;
    const until = into ? into.end : sc.end;
    if (t.in < sc.start - EPS || t.out > until + EPS || t.out < t.in) out.push(`text «${t.text}» (${t.in}–${t.out}) is outside scene ${sc.id} (${sc.start}–${until})`);
  }
  return out;
}
