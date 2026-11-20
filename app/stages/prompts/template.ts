// Responsibility: read the video-prompts skill's own template and fill its slots, word for word, from clip-plan.json, the brand sheet and the style text (CLAUDE.md rule 4: the app only fills the template, it never adds or rewrites a line).
import fs from 'node:fs';
import path from 'node:path';
import { CLIP_SECONDS, type ClipPlan } from '../../contracts/index.js';
import type { BrandSheet } from './brandSheet.js';

/** The skill file the app installs (rule 5: the owner's asset; read only). */
export const skillFile = (runtimeDir: string) => path.join(runtimeDir, '.claude', 'skills', 'video-prompts', 'SKILL.md');

/** The template block of the skill: the four-backtick fence after «## Template», line ends as LF. */
export function readTemplate(runtimeDir: string): string {
  const text = fs.readFileSync(skillFile(runtimeDir), 'utf8').replace(/\r\n/g, '\n');
  const m = /\n## Template\n\n````\n([\s\S]*?)\n````/.exec(text);
  if (!m) throw new Error('video-prompts skill: no «## Template» block in a four-backtick fence');
  return m[1]!;
}

/** Every slot of the template, exactly as the skill writes it. A slot that holds a whole line (or a leading space) is removed with it when empty. */
export const SLOTS = {
  brandName: '[BRAND NAME]',
  brandAudience: '[BRAND AND AUDIENCE]',
  total10: '[TOTAL x 10]',
  total: '[TOTAL]',
  colours: '[BRAND COLOURS IN PLAIN WORDS]',
  accent: '[MAIN ACCENT]',
  banned: '[BANNED COLOURS]',
  work: "[HOW THE BRAND'S WORK IS SHOWN]",
  look: ' [LOOK AND LIGHT RULE]',
  lettering: '[LETTERING LOOK]',
  words: '[WORDS TO AVOID]',
  onOff: '[OFF or ON]',
  style: '[PASTE YOUR VISUAL STYLE DESCRIPTION HERE]',
  n: '[N]',
  start: '[start]',
  end: '[end]',
  upload: '[none: design the opening state | the last frame of clip N-1: it is frame 1 of this clip. Continue from it exactly: same camera position, framing and lens, same objects in the same places, same colours, lighting and character pose. No cut, jump, zoom pop, fade, flash or new element in the first half second; motion starts from rest and eases in]',
  lock: '[GLOBAL STYLE LOCK, 60-90 words, identical in every clip prompt]',
  characterLine: 'Recurring character (canonical, repeat verbatim whenever it appears): [CHARACTER DESCRIPTION, or delete this line]\n',
  reel: '[REEL CONCEPT: what the viewer believes before watching; what is actually true; what the viewer should be able to say after the whole reel with the sound off; readings that would be wrong]',
  clip: '[CLIP CONCEPT: what must become clear in this clip; "After this clip the viewer should be able to say: …"; the on-screen English lettering list]',
  full: '[FULL NARRATION: "Clip k (a–b s) [already generated | THIS CLIP | later, not shown]: beat notes", one line for every clip of the reel]',
  thisNarration: '[THIS CLIP NARRATION]',
} as const;

/** The two options of the upload slot, as the skill writes them (the second with N-1 filled). */
const UPLOAD_NONE = 'none: design the opening state';
const uploadAfter = (prev: number) => `the last frame of clip ${prev}: it is frame 1 of this clip. Continue from it exactly: same camera position, framing and lens, same objects in the same places, same colours, lighting and character pose. No cut, jump, zoom pop, fade, flash or new element in the first half second; motion starts from rest and eases in`;
/** The skill's step 5: both narration fields start with this line. */
export const BEAT_HEADER = 'Silent beat notes (not a script, never spoken):';
/** The character line's fixed beginning, kept when a character exists. */
export const CHARACTER_PREFIX = 'Recurring character (canonical, repeat verbatim whenever it appears): ';

const SLOT_LIST = Object.values(SLOTS).sort((a, b) => b.length - a.length);
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SLOT_RE = new RegExp(SLOT_LIST.map(escape).join('|'), 'g');

/** The fixed text between the slots, in order: every prompt must hold each part byte for byte, in this order. */
export function fixedParts(template: string): string[] {
  return template.split(SLOT_RE);
}

const seconds = (s: number) => String(Math.round(s * 100) / 100);
const TAGS = { before: '[already generated]', this: '[THIS CLIP]', later: '[later, not shown]' } as const;

/** Fills the template for one clip. Every value comes from the plan, the brand sheet or the style; nothing else is written. */
export function fillClip(template: string, plan: ClipPlan, sheet: BrandSheet, styleText: string, index: number): string {
  const total = plan.clips.length;
  const c = plan.clips[index - 1];
  if (!c) throw new Error(`clip ${index} is not in the plan`);
  const start = (index - 1) * CLIP_SECONDS;
  const full = [BEAT_HEADER, ...plan.clips.map((k) => {
    const tag = k.index < index ? TAGS.before : k.index === index ? TAGS.this : TAGS.later;
    return `Clip ${k.index} (${seconds((k.index - 1) * CLIP_SECONDS)}–${seconds(k.index * CLIP_SECONDS)} s) ${tag}: ${k.beat_line}`;
  })].join('\n');
  const values: Record<string, string> = {
    [SLOTS.brandName]: sheet.name,
    [SLOTS.brandAudience]: sheet.brand_and_audience,
    [SLOTS.total10]: String(total * CLIP_SECONDS),
    [SLOTS.total]: String(total),
    [SLOTS.colours]: sheet.colours,
    [SLOTS.accent]: sheet.main_accent,
    [SLOTS.banned]: sheet.banned_colours,
    [SLOTS.work]: sheet.work_shown,
    [SLOTS.look]: sheet.look_and_light ? ` ${sheet.look_and_light}` : '',
    [SLOTS.lettering]: sheet.lettering,
    [SLOTS.words]: sheet.words_to_avoid,
    [SLOTS.onOff]: plan.on_screen_text.toUpperCase(),
    [SLOTS.style]: styleText,
    [SLOTS.n]: String(index),
    [SLOTS.start]: seconds(start),
    [SLOTS.end]: seconds(start + CLIP_SECONDS),
    [SLOTS.upload]: index === 1 ? UPLOAD_NONE : uploadAfter(index - 1),
    [SLOTS.lock]: plan.style_lock,
    [SLOTS.characterLine]: plan.character ? `${CHARACTER_PREFIX}${plan.character}\n` : '',
    [SLOTS.reel]: plan.reel_concept,
    [SLOTS.clip]: c.concept,
    [SLOTS.full]: full,
    [SLOTS.thisNarration]: [BEAT_HEADER, ...c.beat_notes].join('\n'),
  };
  return template.replace(SLOT_RE, (s) => {
    const v = values[s];
    if (v === undefined) throw new Error(`no value for template slot ${s}`);
    return v;
  });
}

/** The fixed parts of the template that are missing or out of order in a prompt (empty = byte-identical fixed text). */
export function fixedTextProblems(template: string, prompt: string): string[] {
  const out: string[] = [];
  let at = 0;
  fixedParts(template).forEach((part, i) => {
    if (!part) return;
    const j = prompt.indexOf(part, at);
    if (j < 0) { out.push(`fixed template text part ${i + 1} («${part.slice(0, 50).replace(/\n/g, ' ')}…») is missing or changed`); return; }
    at = j + part.length;
  });
  return out;
}
