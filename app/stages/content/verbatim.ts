// Responsibility: prove that every text field of a structured content package is copied verbatim from the package.md hook wrote (docs/05, Phase 2 exit criterion).
import type { ContentPackage } from '../../contracts/index.js';

/** Markdown decoration is not text: list markers, quote marks, emphasis and code ticks are removed from both sides before comparing. */
function plainLines(s: string): string[] {
  return s
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l
      .replace(/^\s*(?:[-*+>]+|\d+[.)])\s+/, '')
      .replace(/[*`]/g, '')
      .replace(/[  ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim())
    .filter(Boolean);
}

/**
 * Every non-empty line of `value` must occur inside the plain text of the markdown; returns the pieces that do not.
 * A line is split at « · » first, because hook joins the separate cells of a shot-list table row with that mark.
 */
export function missingLines(value: string, haystack: string): string[] {
  return plainLines(value).flatMap((l) => l.split(' · ')).map((l) => l.trim()).filter((l) => l && !haystack.includes(l));
}

/** The (field path, text) pairs the app checks. `framework` and `duration_target_s` are labels hook may normalise, so they are not compared. */
export function textFields(p: ContentPackage): [string, string][] {
  const f: [string, string][] = [
    ['title', p.title], ['hook_line', p.hook_line], ['concept', p.concept], ['cta', p.cta], ['caption', p.caption],
    ['cover.headline', p.cover.headline], ['cover.subline', p.cover.subline], ['cover.visual', p.cover.visual], ['cover.layout_notes', p.cover.layout_notes],
  ];
  p.voice_lines.forEach((l, i) => f.push([`voice_lines[${i}].text`, l.text]));
  p.on_screen_texts.forEach((t, i) => f.push([`on_screen_texts[${i}].text`, t.text]));
  p.shotlist.forEach((s, i) => { f.push([`shotlist[${i}].picture`, s.picture], [`shotlist[${i}].on_screen_text`, s.on_screen_text], [`shotlist[${i}].sound`, s.sound], [`shotlist[${i}].reward`, s.reward]); });
  // Only the claim text: hook's research gives the source link and date, and package.md does not always list them (seen in the first live run).
  p.claims.forEach((c, i) => f.push([`claims[${i}].text`, c.text]));
  p.hashtags.forEach((h, i) => f.push([`hashtags[${i}]`, h]));
  p.alt_hooks.forEach((h, i) => f.push([`alt_hooks[${i}]`, h]));
  p.assumptions.forEach((a, i) => f.push([`assumptions[${i}]`, a]));
  return f;
}

/** Returns one message per field that is not verbatim in the markdown (empty array = all good). */
export function checkVerbatim(p: ContentPackage, markdown: string): string[] {
  const haystack = plainLines(markdown).join('\n');
  const problems: string[] = [];
  for (const [path, value] of textFields(p)) {
    const miss = missingLines(value, haystack);
    if (miss.length) problems.push(`${path} is not verbatim from package.md: «${miss[0]!.slice(0, 80)}»`);
  }
  return problems;
}
