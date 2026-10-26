/**
 * Week 1 placeholder for the person match key: lowercase, strip punctuation,
 * collapse spaces. Week 2 replaces this with the full match-key function
 * (honorific removal, Devanagari transliteration, spelling simplification)
 * from the build guide, so keep every caller going through this one export.
 */
export function simpleNameKey(name: string): string {
  return name
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when the string contains Devanagari characters. */
export function hasDevanagari(text: string): boolean {
  return /[ऀ-ॿ]/.test(text);
}
