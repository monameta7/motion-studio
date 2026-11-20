// Responsibility: the video-prompts skill's own measurable rules, checked in code on clip-plan.json and the filled prompts (CLAUDE.md rule 4, D87 e, D92 a, D93; docs/13 V1–V3); it reports problems and never changes a prompt.
import { CLIP_SECONDS, clipsForVoice, hasArabicScript, type ClipPlan, type VoiceTiming } from '../../contracts/index.js';
import { COLOUR_CODE } from './brandSheet.js';
import { CHARACTER_PREFIX, fixedTextProblems } from './template.js';

/** Rule ids of this project's docs (D93, Q38, R18, V19 …): never in a prompt, the model would draw them (seed row 27). */
const RULE_ID = /\b[DQRV]\d{1,3}\b/;

/**
 * D87 e / the skill's step 4: the description fixes gender, rough age, skin tone, hair, clothes and one distinctive detail, plus the
 * closed mouth. Each is looked for by its plain words; the skill names its own examples (glasses, a scarf).
 */
const CHARACTER_PARTS: [string, RegExp][] = [
  ['gender', /\b(woman|man|female|male|girl|boy|lady|gentleman)\b/i],
  // The live call of 11.4 wrote «a man of about 35», a clear rough age this pattern first missed (one paid repeat): a number after «of/about/around/aged» counts.
  ['rough age', /\b(\d{1,2}s|\d{1,2}[- ]year[- ]old|years old|(of|about|around|roughly|approximately|aged?)\s+(about\s+|around\s+)?\d{1,2}|young|middle-aged|older|elderly|teen(age)?|in (his|her|their) (early |mid-|late )?(twenties|thirties|forties|fifties|sixties|seventies))\b/i],
  ['skin tone', /\bskin\b/i],
  ['hair', /\b(hair|bald|shaved head)\b/i],
  ['clothes', /\b(wear(s|ing)?|shirt|t-shirt|blouse|sweater|jumper|jacket|coat|apron|dress|trousers|jeans|skirt|hoodie|uniform|suit|vest|cardigan)\b/i],
  ['one distinctive detail', /\b(glasses|spectacles|scarf|headscarf|earrings?|necklace|watch|bracelet|ring|hat|cap|beanie|beard|moustache|mustache|freckles|badge|pin|brooch|bow tie|tie|headband|hair clip|tattoo|pencil behind)\b/i],
  ['the closed mouth', /\bmouth\b[^.;]*\bclosed\b|\bnever talks\b/i],
];

export function characterProblems(character: string): string[] {
  return CHARACTER_PARTS.filter(([, re]) => !re.test(character)).map(([what]) => `the recurring character description does not name ${what} (the skill's step 4: gender, rough age, skin tone, hair, clothes with colours, one distinctive detail and the closed mouth, so the model draws the same person in every clip)`);
}

/**
 * Phase 11.5: the same prompt rules applied to a style text before any job uses it (it is copied word for word into every prompt, so a
 * text that breaks one would make every prompt of a paid run fail): English only (D93), no colour code, no rule id, and, when a brand
 * is known, none of its tokens.json colour names. Persian reasons for the owner.
 */
export function styleTextProblems(text: string, colourNames: string[] = []): string[] {
  const out: string[] = [];
  if (hasArabicScript(text)) out.push('متن سبک فقط انگلیسی باشد؛ این متن کلمه‌به‌کلمه در پرامپت ویدیو می‌رود و تصویر فقط متن انگلیسی دارد.');
  const code = COLOUR_CODE.exec(text);
  if (code) out.push(`کد رنگ «${code[0]}» در متن سبک است؛ رنگ را با کلمه‌ی ساده بنویس (مثل soft blue).`);
  const rule = RULE_ID.exec(text);
  if (rule) out.push(`«${rule[0]}» در متن سبک شبیه شماره‌ی یک قانون است و مدل آن را روی تصویر می‌کشد؛ برش دار.`);
  for (const name of colourNames) if (text.includes(name)) out.push(`نام رنگ برند «${name}» در متن سبک است؛ رنگ را با کلمه‌ی ساده بنویس.`);
  return out;
}

export const continuityLine =(prev: number) => `The uploaded image is the last frame of clip ${prev}; continue the same picture and the same visual idea that is already in it, do not start a new one.`;

/** Checks on the plan alone (before the prompts are filled): clip count from the real voice, the request's style, the character, continuity, terms. */
export function planProblems(plan: ClipPlan, timing: VoiceTiming, style: string): string[] {
  const out: string[] = [];
  if (Math.abs(plan.voice_end_s - timing.voice_end_s) > 0.05) out.push(`voice_end_s is ${plan.voice_end_s}, but the recorded voice ends at ${timing.voice_end_s} s (video/voice-timing.json)`);
  const need = clipsForVoice(timing.voice_end_s);
  if (plan.clips.length !== need) out.push(`the recorded voice ends at ${timing.voice_end_s} s, so the reel needs ${need} clips of ${CLIP_SECONDS} s, not ${plan.clips.length} (docs/13 V1)`);
  if (plan.style !== style) out.push(`style is «${plan.style}», but the job's style is «${style}»`);
  if (plan.character) out.push(...characterProblems(plan.character));
  const ids = new Set(timing.lines.map((l) => l.id));
  for (const c of plan.clips) {
    const first = c.concept.split('\n')[0]!.trim();
    if (c.index > 1 && first !== continuityLine(c.index - 1)) out.push(`clip ${c.index}: the concept's first line must be exactly «${continuityLine(c.index - 1)}»`);
    if (c.index === 1 && /uploaded image is the last frame/i.test(c.concept)) out.push('clip 1 has no uploaded image; its concept must not say it continues a previous clip');
    for (const id of c.voice_line_ids) if (!ids.has(id)) out.push(`clip ${c.index} names voice line ${id}, which does not exist`);
    for (const t of c.terms) if (!c.concept.includes(t.text)) out.push(`clip ${c.index}: the term «${t.text}» is not in the clip's lettering list (its concept)`);
  }
  const covered = new Set(plan.clips.flatMap((c) => c.voice_line_ids));
  for (const l of timing.lines) if (!covered.has(l.id)) out.push(`voice line ${l.id} (${l.start_s}–${l.end_s} s) is in no clip; the clips must cover the whole voice`);
  return out;
}

export interface PromptCheckInput {
  template: string;
  plan: ClipPlan;
  prompts: string[];
  timing: VoiceTiming;
  /** The brand's colour names as its tokens write them (`tokens.json` colors[].name): never in a prompt. */
  colourNames: string[];
}

/** Checks on the filled prompts; empty = every rule kept. */
export function promptProblems(i: PromptCheckInput): string[] {
  const out: string[] = [];
  if (i.prompts.length !== i.plan.clips.length) out.push(`${i.prompts.length} prompts for ${i.plan.clips.length} clips`);
  const voiceLines = i.timing.lines.map((l) => l.text.trim()).filter((t) => t.length >= 12);
  i.prompts.forEach((p, k) => {
    const n = k + 1;
    const at = (m: string) => out.push(`clip ${n}: ${m}`);
    for (const x of fixedTextProblems(i.template, p)) at(x);
    if (!p.startsWith('AUDIO RULE, READ FIRST:')) at('the AUDIO RULE block is not at the very start');
    if (!p.trimEnd().split('\n').at(-1)!.startsWith('FINAL AUDIO REMINDER:')) at('the FINAL AUDIO REMINDER block is not at the very end');
    const arabic = [...p].filter((ch) => hasArabicScript(ch)).length;
    if (arabic) at(`${arabic} Persian or Arabic letters; the prompt is English only (D93)`);
    const code = COLOUR_CODE.exec(p);
    if (code) at(`colour code «${code[0]}»; colours are plain words`);
    for (const name of i.colourNames) if (p.includes(name)) at(`brand colour name «${name}»; colours are plain words`);
    const rule = RULE_ID.exec(p);
    if (rule) at(`rule id «${rule[0]}»; the model would draw it`);
    for (const line of voiceLines) if (p.includes(line)) at('a sentence of the voice-over text; only silent English beat notes go into a prompt');
    if (i.plan.character && !p.includes(`${CHARACTER_PREFIX}${i.plan.character}\n`)) at('the recurring character description is missing or changed');
    if (!p.includes(i.plan.style_lock)) at('the global style lock is missing or changed');
  });
  return out;
}

/** The colour names of a brand's tokens.json as written there (Title Case, for example «Mahdiyar Teal», «Deep Navy»): the sheet writes colours in plain lower-case words, so such a name in a prompt is a label the model would draw. */
export function colourNamesOf(tokens: unknown): string[] {
  const colors = (tokens as { colors?: { name?: unknown }[] } | null)?.colors ?? [];
  return [...new Set(colors.map((c) => (typeof c.name === 'string' ? c.name.trim() : '')).filter(Boolean))];
}
