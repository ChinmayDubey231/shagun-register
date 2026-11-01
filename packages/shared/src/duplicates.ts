import { matchKey } from './matchKey';
import { consonantSkeleton } from './personSearch';

export interface DuplicateCandidate {
  id: string;
  displayName: string;
  /** Stored match key (matchKey(displayName)). */
  nameLatin: string;
  city: string | null;
  phone: string | null;
}

/** sameName: the match keys are equal and the cities don't disagree. samePhone: the same mobile number. */
export type DuplicateReason = 'sameName' | 'samePhone';

export interface DuplicatePair<T extends DuplicateCandidate> {
  a: T;
  b: T;
  reason: DuplicateReason;
}

/** Order-independent id for a pair, used to remember "not the same person". */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/**
 * The last 10 digits of a phone number, so "+91 98260 12345", "098260-12345" and
 * "9826012345" agree. Shorter numbers are too ambiguous to suggest a merge on.
 */
export function phoneKey(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : null;
}

/**
 * Cities agree when either is missing or both have the same consonant skeleton.
 * Vowels are where Hindi and English spellings disagree most: इंदौर → "indaur", Indore → "indore", both "indr".
 */
export function citiesAgree(a: string | null, b: string | null): boolean {
  const ka = a ? consonantSkeleton(matchKey(a)) : '';
  const kb = b ? consonantSkeleton(matchKey(b)) : '';
  return !ka || !kb || ka === kb;
}

function groupBy<T>(items: readonly T[], key: (item: T) => string | null): T[][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    if (!k) continue;
    const g = groups.get(k);
    if (g) g.push(item);
    else groups.set(k, [item]);
  }
  return [...groups.values()].filter((g) => g.length > 1);
}

/**
 * People who are probably the same person or household, as pairs. Only ever suggested:
 * the family confirms each merge. "Ramesh Sharma (Indore)" and "Ramesh Sharma (Bhopal)"
 * are never paired on the name alone, but are when they share a phone number.
 */
export function findDuplicatePairs<T extends DuplicateCandidate>(people: readonly T[]): DuplicatePair<T>[] {
  const pairs: DuplicatePair<T>[] = [];
  const seen = new Set<string>();
  const add = (a: T, b: T, reason: DuplicateReason) => {
    const key = pairKey(a.id, b.id);
    if (seen.has(key)) return;
    seen.add(key);
    pairs.push({ a, b, reason });
  };
  for (const group of groupBy(people, (p) => p.nameLatin || null)) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        if (citiesAgree(group[i]!.city, group[j]!.city)) add(group[i]!, group[j]!, 'sameName');
      }
    }
  }
  for (const group of groupBy(people, (p) => phoneKey(p.phone))) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) add(group[i]!, group[j]!, 'samePhone');
    }
  }
  return pairs;
}
