import { devanagariToLatin } from './transliterate';

/**
 * Honorifics and kinship words that people add or drop when writing the same name.
 * Devanagari forms are removed before transliteration (डॉ would otherwise become "do").
 */
const DEVANAGARI_HONORIFICS = new Set(['श्री', 'श्रीमती', 'श्रीमति', 'श्रीमान', 'सुश्री', 'जी', 'डॉ', 'डॉक्टर', 'डा']);
const LATIN_HONORIFICS = new Set([
  'shri', 'sri', 'shree', 'shrimati', 'shriman', 'smt', 'sushri',
  'ji', 'jee', 'mr', 'mrs', 'ms', 'dr', 'bhaiya', 'uncle', 'aunty', 'auntie',
]);

/** True for words like "Shri", "ji", "Dr.", "श्रीमती" that are not part of the name itself. */
export function isHonorific(word: string): boolean {
  const w = clean(word);
  return DEVANAGARI_HONORIFICS.has(w) || LATIN_HONORIFICS.has(w);
}

/** Strip punctuation (keep letters, combining marks, digits), lowercase, collapse spaces. */
function clean(text: string): string {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function dropWords(words: string[], set: Set<string>): string[] {
  const kept = words.filter((w) => !set.has(w));
  // Never reduce a name to nothing ("Shri" alone stays "shri").
  return kept.length ? kept : words;
}

/**
 * Spelling folds so variant spellings meet:
 * aa→a, ee→i, oo→u, w→v, ph→f, x→ks, double letters→single,
 * word-final "ey"→"e" (Dubey/Dube, Pandey/पांडेय), then drop a trailing "a" on each word.
 */
function fold(word: string): string {
  let w = word
    .replace(/ee/g, 'i')
    .replace(/oo/g, 'u')
    .replace(/w/g, 'v')
    .replace(/ph/g, 'f')
    .replace(/x/g, 'ks')
    .replace(/(.)\1+/g, '$1');
  w = w.replace(/ey$/, 'e');
  if (w.length > 1) w = w.replace(/a$/, '');
  return w;
}

/**
 * The match key used for search and duplicate detection. Hindi and English
 * spellings of the same name produce the same key:
 *
 *   "Shri Ramesh Sharma ji" → "ramesh sharm"
 *   "रमेश शर्मा"            → "ramesh sharm"
 *   "Ramesh Sharmaa"        → "ramesh sharm"
 *
 * City is not part of the key; it is stored separately on the person.
 * Keep phone and server on this one function so their keys always agree.
 */
export function matchKey(name: string): string {
  const devWords = dropWords(clean(name).split(' ').filter(Boolean), DEVANAGARI_HONORIFICS);
  const latinWords = dropWords(
    devWords.flatMap((w) => clean(devanagariToLatin(w)).split(' ')).filter(Boolean),
    LATIN_HONORIFICS,
  );
  return latinWords.map(fold).filter(Boolean).join(' ');
}

/** Bumped whenever matchKey's output changes, so stored keys can be recomputed. */
export const MATCH_KEY_VERSION = 2;
