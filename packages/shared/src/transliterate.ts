/**
 * Devanagari → Latin, tuned for how Hindi names are spelled in English
 * (रमेश → "ramesh", कमला → "kamla"), not for scholarly accuracy.
 *
 * Sanskrit-oriented schemes keep every inherent "a" (कमला → "kamalā"), which
 * never matches how people type Hindi names. This applies Hindi schwa deletion:
 * the inherent vowel is dropped at the end of a word and in the pattern
 * vowel–consonant–(a)–consonant–vowel.
 */

const INDEPENDENT_VOWELS: Record<string, string> = {
  अ: 'a', आ: 'aa', इ: 'i', ई: 'ee', उ: 'u', ऊ: 'oo', ऋ: 'ri',
  ए: 'e', ऐ: 'ai', ओ: 'o', औ: 'au', ऑ: 'o', ऍ: 'e',
};

const VOWEL_SIGNS: Record<string, string> = {
  'ा': 'aa', 'ि': 'i', 'ी': 'ee', 'ु': 'u', 'ू': 'oo', 'ृ': 'ri',
  'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ॉ': 'o', 'ॅ': 'e',
};

const CONSONANTS: Record<string, string> = {
  क: 'k', ख: 'kh', ग: 'g', घ: 'gh', ङ: 'n',
  च: 'ch', छ: 'chh', ज: 'j', झ: 'jh', ञ: 'n',
  ट: 't', ठ: 'th', ड: 'd', ढ: 'dh', ण: 'n',
  त: 't', थ: 'th', द: 'd', ध: 'dh', न: 'n',
  प: 'p', फ: 'ph', ब: 'b', भ: 'bh', म: 'm',
  य: 'y', र: 'r', ल: 'l', ळ: 'l', व: 'v',
  श: 'sh', ष: 'sh', स: 's', ह: 'h',
};

/** Consonant + nukta (़). NFD splits precomposed forms like क़ into क + ़. */
const NUKTA_FORMS: Record<string, string> = {
  क: 'q', ख: 'kh', ग: 'g', ज: 'z', ड: 'r', ढ: 'rh', फ: 'f', य: 'y',
};

const VIRAMA = '्';
const NUKTA = '़';
const NASAL = new Set(['ं', 'ँ']);
const VISARGA = 'ः';
const DIGITS = '०१२३४५६७८९';

interface Unit {
  /** Latin for the consonant, or '' for an independent vowel. */
  cons: string;
  /** Explicit vowel (matra or independent vowel); null means only the inherent schwa. */
  vowel: string | null;
  halant: boolean;
  /** Text appended after the vowel: nasal "n" or visarga "h". */
  tail: string;
}

export function isDevanagariChar(ch: string): boolean {
  const c = ch.codePointAt(0) ?? 0;
  return c >= 0x0900 && c <= 0x097f;
}

/** Transliterates one word (no spaces). Non-Devanagari characters pass through. */
function transliterateWord(word: string): string {
  const chars = Array.from(word.normalize('NFD'));
  const units: Unit[] = [];
  let passthrough = '';
  const out: string[] = [];

  const flush = () => {
    if (units.length) out.push(renderUnits(units.splice(0)));
    if (passthrough) {
      out.push(passthrough);
      passthrough = '';
    }
  };

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]!;
    const last = units[units.length - 1];
    if (CONSONANTS[ch] !== undefined) {
      if (passthrough) flush();
      let latin = CONSONANTS[ch]!;
      if (chars[i + 1] === NUKTA) {
        latin = NUKTA_FORMS[ch] ?? latin;
        i++;
      }
      // ज्ञ is spoken "gy" in Hindi (ज्ञान → gyan).
      if (ch === 'ज' && chars[i + 1] === VIRAMA && chars[i + 2] === 'ञ') {
        units.push({ cons: 'g', vowel: null, halant: true, tail: '' });
        latin = 'y';
        i += 2;
      }
      units.push({ cons: latin, vowel: null, halant: false, tail: '' });
    } else if (INDEPENDENT_VOWELS[ch] !== undefined) {
      if (passthrough) flush();
      units.push({ cons: '', vowel: INDEPENDENT_VOWELS[ch]!, halant: false, tail: '' });
    } else if (VOWEL_SIGNS[ch] !== undefined && last && last.cons) {
      last.vowel = VOWEL_SIGNS[ch]!;
    } else if (ch === VIRAMA && last) {
      last.halant = true;
    } else if (NASAL.has(ch) && last) {
      last.tail += 'n';
    } else if (ch === VISARGA && last) {
      last.tail += 'h';
    } else if (ch === NUKTA || ch === 'ऽ') {
      // stray nukta / avagraha: ignore
    } else if (DIGITS.includes(ch)) {
      flush();
      passthrough += String(DIGITS.indexOf(ch));
    } else {
      flush();
      passthrough += ch;
    }
  }
  flush();
  return out.join('');
}

/** Decides which inherent schwas are spoken, right to left, then renders. */
function renderUnits(units: Unit[]): string {
  const hasVowel: boolean[] = new Array(units.length).fill(false);
  const tentative = (u: Unit) => !u.halant;

  for (let i = units.length - 1; i >= 0; i--) {
    const u = units[i]!;
    if (u.vowel !== null) {
      hasVowel[i] = true;
      continue;
    }
    if (u.halant) continue;
    // A nasal or visarga on a bare consonant means its "a" is spoken: आनंद → anand.
    if (u.tail) {
      hasVowel[i] = true;
      continue;
    }
    const isLast = i === units.length - 1;
    if (isLast) {
      // Word-final schwa is silent, except in a one-letter word (न → "na").
      hasVowel[i] = units.length === 1;
      continue;
    }
    const prev = units[i - 1];
    const next = units[i + 1]!;
    const deletable = i > 0 && prev !== undefined && tentative(prev) && next.cons !== '' && hasVowel[i + 1];
    hasVowel[i] = !deletable;
  }

  return units
    .map((u, i) => u.cons + (u.vowel ?? (hasVowel[i] && !u.halant ? 'a' : '')) + u.tail)
    .join('');
}

/** Transliterates Devanagari in a string to Latin, word by word. Latin text is left as is. */
export function devanagariToLatin(text: string): string {
  return text
    .split(/(\s+)/)
    .map((part) => (/\s/.test(part) || !Array.from(part).some(isDevanagariChar) ? part : transliterateWord(part)))
    .join('');
}
