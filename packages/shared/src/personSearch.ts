import Fuse from 'fuse.js';
import { matchKey } from './matchKey';

export interface SearchablePerson {
  id: string;
  displayName: string;
  /** Stored match key (matchKey(displayName)). */
  nameLatin: string;
  city: string | null;
}

/**
 * Consonant skeleton of a key, keeping each word's first letter: "verm parivar" → "vrm prvr".
 * Vowels are where Hindi and English spellings of a name disagree most (वर्मा → "varm", Verma → "verm").
 */
export function consonantSkeleton(key: string): string {
  return key
    .split(' ')
    .map((w) => (w[0] ?? '') + w.slice(1).replace(/[aeiou]/g, ''))
    .join(' ');
}

/**
 * Fuzzy person search over match keys. Typing "रमेश", "Ramesh" or "ramesh sharmaa"
 * all find the same people. Build once per list of people; search on every keystroke.
 */
export function createPersonSearch<T extends SearchablePerson>(people: readonly T[]) {
  const skeletons = new Map(people.map((p) => [p.id, consonantSkeleton(p.nameLatin)]));
  const fuse = new Fuse(people as T[], {
    keys: [
      { name: 'nameLatin', weight: 0.8 },
      { name: 'city', weight: 0.2 },
    ],
    includeScore: true,
    ignoreLocation: true,
    threshold: 0.34,
    minMatchCharLength: 1,
  });

  return function search(query: string, limit = 5): T[] {
    const key = matchKey(query);
    if (!key) return [];
    // One or two letters: plain prefix match on any word, Fuse is too noisy that short.
    if (key.replace(/\s/g, '').length < 3) {
      return people
        .filter((p) => p.nameLatin.split(' ').some((w) => w.startsWith(key)))
        .slice(0, limit);
    }
    const skel = consonantSkeleton(key);
    const rank = (p: T) => {
      const s = skeletons.get(p.id) ?? '';
      if (p.nameLatin.startsWith(key) || p.nameLatin.includes(' ' + key)) return 2;
      if (s.startsWith(skel) || s.includes(' ' + skel)) return 1;
      return 0;
    };
    return fuse
      .search(key, { limit: limit * 3 })
      .sort((a, b) => rank(b.item) - rank(a.item) || (a.score ?? 1) - (b.score ?? 1))
      .slice(0, limit)
      .map((r) => r.item);
  };
}

/** People whose key equals the query's key: used to reuse a person when a name is typed without picking. */
export function exactKeyMatches<T extends SearchablePerson>(people: readonly T[], name: string): T[] {
  const key = matchKey(name);
  return key ? people.filter((p) => p.nameLatin === key) : [];
}
