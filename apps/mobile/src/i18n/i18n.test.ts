/**
 * Week 6's "done when" for Hindi: every English string has a Hindi one, with the same
 * placeholders, and plurals cover the forms Hindi needs.
 */
import { describe, expect, it } from 'vitest';
import en from './en.json';
import hi from './hi.json';

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out.set(path, value);
    else for (const [k, v] of flatten(value, path)) out.set(k, v);
  }
  return out;
}

const placeholders = (s: string) => [...s.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort();

const english = flatten(en);
const hindi = flatten(hi);

describe('hi.json', () => {
  it('has exactly the keys en.json has', () => {
    expect([...hindi.keys()].sort()).toEqual([...english.keys()].sort());
  });

  it('keeps every placeholder', () => {
    const mismatched = [...english].filter(([key, text]) => {
      const other = hindi.get(key);
      return other !== undefined && placeholders(other).join() !== placeholders(text).join();
    });
    expect(mismatched.map(([key]) => key)).toEqual([]);
  });

  it('has a form for each Hindi plural category', () => {
    const categories = new Intl.PluralRules('hi').resolvedOptions().pluralCategories;
    const bases = new Set([...english.keys()].filter((k) => /_(one|other)$/.test(k)).map((k) => k.replace(/_(one|other)$/, '')));
    const missing = [...bases].flatMap((base) => categories.filter((c) => !hindi.has(`${base}_${c}`)).map((c) => `${base}_${c}`));
    expect(missing).toEqual([]);
  });

  it('is actually in Hindi', () => {
    // Codes, names and brand words may stay in Latin script; real sentences may not.
    const words = (text: string) => text.replace(/\{\{\s*\w+\s*\}\}/g, '');
    const latinOnly = [...hindi].filter(([, text]) => /[a-z]{4,}/i.test(words(text)) && !/[ऀ-ॿ]/.test(text));
    expect(latinOnly.map(([key]) => key)).toEqual(['signIn.switchLanguage']);
  });
});
