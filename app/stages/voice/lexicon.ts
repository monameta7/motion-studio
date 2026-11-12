// Responsibility: turn Persian-script spellings of English terms back into Latin in the TTS text only, so Gemini says them in English (D25, docs/04 Lexicon).
import { Lexicon, readJson } from '../../contracts/index.js';

export interface Replacement { from: string; to: string }
export interface LexiconResult { text: string; replacements: Replacement[] }

const ZWNJ = '‌';
const isMark = (c: string): boolean => /[ً-ٰٟـ]/.test(c); // fathatan … sukun, dagger alif, tatweel
const isWordChar = (c: string | undefined): boolean => c !== undefined && /[\p{L}\p{N}]/u.test(c);

/** Matching form: marks removed, Arabic ي/ك as Persian ی/ک, ZWNJ read as a space. `map[i]` is the original index of char i. */
function matchForm(s: string): { norm: string; map: number[] } {
  let norm = '';
  const map: number[] = [];
  [...s].forEach((c, idx) => {
    if (isMark(c)) return;
    norm += c === 'ي' ? 'ی' : c === 'ك' ? 'ک' : c === ZWNJ ? ' ' : c;
    map.push(idx);
  });
  return { norm, map };
}

export function loadLexicon(file: string): Lexicon {
  return readJson(file, Lexicon);
}

/**
 * Replaces whole-word matches, longest first. Only the matched words change: marks elsewhere (for example the tanvin of «حتماً»)
 * and every ZWNJ outside a match stay as they were. A word with a Persian suffix attached by ZWNJ (ایجنت‌ها) is a different word and is left alone.
 */
export function applyLexicon(text: string, lex: Lexicon): LexiconResult {
  const chars = [...text];
  const { norm, map } = matchForm(text);
  const entries = lex.entries
    .map((e) => ({ key: matchForm(e.match).norm, say: e.say, match: e.match }))
    .filter((e) => e.key.trim())
    .sort((a, b) => b.key.length - a.key.length);

  const protectedSpans: [number, number][] = [];
  for (const k of lex.keep_persian.map((p) => matchForm(p).norm).filter(Boolean)) {
    for (let i = norm.indexOf(k); i >= 0; i = norm.indexOf(k, i + k.length)) protectedSpans.push([i, i + k.length]);
  }

  const out: string[] = [];
  const replacements: Replacement[] = [];
  let origPos = 0;
  let i = 0;
  while (i < norm.length) {
    const hit = entries.find((e) => {
      if (!norm.startsWith(e.key, i)) return false;
      const end = i + e.key.length;
      if (isWordChar(norm[i - 1]) || isWordChar(norm[end])) return false;
      // A ZWNJ right after the word, followed by a letter, attaches a Persian suffix (ایجنت‌ها): not a word boundary.
      let j = map[end - 1]! + 1;
      while (j < chars.length && isMark(chars[j]!)) j++;
      if (chars[j] === ZWNJ && isWordChar(norm[end + 1])) return false;
      return !protectedSpans.some(([a, b]) => i < b && end > a);
    });
    if (!hit) { i++; continue; }
    const end = i + hit.key.length;
    const from = map[i]!;
    const to = end < norm.length ? map[end]! : chars.length;
    out.push(chars.slice(origPos, from).join(''), hit.say);
    replacements.push({ from: chars.slice(from, to).join(''), to: hit.say });
    origPos = to;
    i = end;
  }
  out.push(chars.slice(origPos).join(''));
  return { text: out.join(''), replacements };
}

export function applyLexiconFile(text: string, file: string): LexiconResult {
  return applyLexicon(text, loadLexicon(file));
}
