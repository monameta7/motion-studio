// Responsibility: pick the ava-farsi tone (narrative | friendly | formal | energetic | meditative) for one film from its content package, deterministically, with scores and reasons.
// Usage: node engine/tone-select.mjs <content/package.json> [config/tone-rules.json] [brand-slug]  → prints {tone, scores, reasons, features} as JSON
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_RULES = path.join(HERE, '..', 'config', 'tone-rules.json');

/** Normalise Arabic letter forms and digits so counting is stable. */
export function normalizeFa(s) {
  return String(s ?? '')
    .replace(/ي/g, 'ی').replace(/ك/g, 'ک')
    .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

const WORD = /[\p{L}\p{N}‌]+/gu;
const words = s => s.match(WORD) ?? [];

/** Count occurrences of lexicon phrases as whole words (multi-word phrases allowed). */
function countPhrases(text, phrases) {
  let n = 0;
  for (const p of phrases) {
    const esc = normalizeFa(p).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?<![\\p{L}\\u200c])${esc}(?![\\p{L}\\u200c])`, 'gu');
    n += (text.match(re) ?? []).length;
  }
  return n;
}

/** Measure the signals of a content package. Pure; no I/O. */
export function extractFeatures(pkg, rules) {
  const lines = (pkg.voice_lines ?? []).map(l => normalizeFa(l.text));
  const text = lines.join(' \n ');
  const w = words(text);
  const nWords = Math.max(w.length, 1);
  const per100 = n => +(100 * n / nWords).toFixed(2);
  const nLines = Math.max(lines.length, 1);
  const numbers = (text.match(/\d+(?:[.,/٫]\d+)?%?|درصد|میلیون|میلیارد|هزار/g) ?? []).length;
  const lx = rules.lexicon;
  return {
    framework: normalizeFa(pkg.framework ?? '').toLowerCase(),
    words: w.length,
    lines: lines.length,
    numbers_per_100_words: per100(numbers),
    claims_count: (pkg.claims ?? []).length,
    questions_per_line: +((text.match(/[?؟]/g) ?? []).length / nLines).toFixed(2),
    exclamations_per_line: +((text.match(/!/g) ?? []).length / nLines).toFixed(2),
    second_person_per_100_words: per100(countPhrases(text, lx.second_person)),
    story_markers_per_100_words: per100(countPhrases(text, lx.story)),
    energy_markers_per_100_words: per100(countPhrases(text, lx.energy)),
    calm_markers_per_100_words: per100(countPhrases(text, lx.calm)),
    words_per_second: pkg.duration_target_s ? +(w.length / pkg.duration_target_s).toFixed(2) : null,
  };
}

/** Score every tone and choose one; `brand` (a folder slug) picks that brand's `brand_bias` entry (Phase 8). Returns {tone, scores, reasons, features}. */
export function selectTone(pkg, rules, brand = null) {
  const f = extractFeatures(pkg, rules);
  const scores = Object.fromEntries(rules.tones.map(t => [t, rules.base[t] ?? 0]));
  const reasons = [];
  const add = (tone, pts, why) => { if (!pts) return; scores[tone] += pts; reasons.push({ tone, points: pts, why }); };

  const bias = brand ? rules.brand_bias?.[brand] : null;
  for (const [tone, pts] of Object.entries(bias && typeof bias === 'object' ? bias : {})) if (tone in scores && typeof pts === 'number') add(tone, pts, 'brand bias');

  if (f.framework) {
    for (const tone of rules.tones) {
      const hit = (rules.framework[tone] ?? []).find(k => f.framework.includes(normalizeFa(k).toLowerCase()));
      if (hit) add(tone, rules.framework.points, `framework "${pkg.framework}" matches "${hit}"`);
    }
  }

  for (const [sig, cfg] of Object.entries(rules.signals)) {
    const v = f[sig];
    if (v == null) continue;
    let level = -1;
    cfg.thresholds.forEach((th, i) => { if (v >= th) level = i; });
    if (level < 0) continue;
    for (const [tone, arr] of Object.entries(cfg.points)) add(tone, arr[level], `${sig}=${v} ≥ ${cfg.thresholds[level]}`);
  }

  for (const t of rules.tones) scores[t] = +scores[t].toFixed(2);
  const tone = [...rules.tones].sort((a, b) => scores[b] - scores[a] || rules.tie_order.indexOf(a) - rules.tie_order.indexOf(b))[0];
  return { tone, scores, reasons, features: f };
}

export function loadRules(file = DEFAULT_RULES) { return JSON.parse(readFileSync(file, 'utf8')); }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [, , pkgFile, rulesFile, brand] = process.argv;
  if (!pkgFile) { console.error('usage: node engine/tone-select.mjs <package.json> [tone-rules.json] [brand-slug]'); process.exit(2); }
  const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'));
  console.log(JSON.stringify(selectTone(pkg, loadRules(rulesFile), brand ?? null), null, 2));
}
