import { describe, expect, it } from 'vitest';
import { citiesAgree, findDuplicatePairs, matchKey, pairKey, phoneKey } from './index';

let n = 0;
const person = (displayName: string, city: string | null = null, phone: string | null = null) => ({
  id: `p${++n}`,
  displayName,
  nameLatin: matchKey(displayName),
  city,
  phone,
});
const names = (pairs: ReturnType<typeof findDuplicatePairs>) =>
  pairs.map((p) => [p.a.displayName, p.b.displayName, p.reason]);

describe('Week 5: duplicate suggestions', () => {
  it('pairs Hindi and English spellings of the same name', () => {
    const people = [person('Shri Ramesh Sharma ji'), person('रमेश शर्मा'), person('Sunita Mishra')];
    expect(names(findDuplicatePairs(people))).toEqual([['Shri Ramesh Sharma ji', 'रमेश शर्मा', 'sameName']]);
  });

  it('keeps the same name in different cities apart, but not when one city is missing', () => {
    const indore = person('Ramesh Sharma', 'Indore');
    const bhopal = person('Ramesh Sharma', 'Bhopal');
    const noCity = person('Ramesh Sharmaa');
    const pairs = findDuplicatePairs([indore, bhopal, noCity]);
    expect(names(pairs)).toEqual([
      ['Ramesh Sharma', 'Ramesh Sharmaa', 'sameName'],
      ['Ramesh Sharma', 'Ramesh Sharmaa', 'sameName'],
    ]);
    expect(pairs.some((p) => [p.a.id, p.b.id].includes(indore.id) && [p.a.id, p.b.id].includes(bhopal.id))).toBe(false);
  });

  it('treats a city written in Hindi and English as the same city', () => {
    expect(citiesAgree('Indore', 'इंदौर')).toBe(true);
    expect(citiesAgree('भोपाल', 'Bhopal')).toBe(true);
    expect(citiesAgree('Indore', 'Bhopal')).toBe(false);
    expect(citiesAgree(null, 'Bhopal')).toBe(true);
  });

  it('pairs different names that share a phone number, once', () => {
    const a = person('Pappu Bhaiya', 'Indore', '+91 98260 12345');
    const b = person('Rajesh Agrawal', 'Indore', '098260-12345');
    const c = person('Rajesh Agrawal', null, '9826012345');
    expect(names(findDuplicatePairs([a, b, c]))).toEqual([
      ['Rajesh Agrawal', 'Rajesh Agrawal', 'sameName'],
      ['Pappu Bhaiya', 'Rajesh Agrawal', 'samePhone'],
      ['Pappu Bhaiya', 'Rajesh Agrawal', 'samePhone'],
    ]);
  });

  it('ignores short phone numbers and empty keys', () => {
    expect(phoneKey('2541')).toBeNull();
    expect(phoneKey(null)).toBeNull();
    expect(phoneKey('+91-98260-12345')).toBe('9826012345');
    const empty = { id: 'x', displayName: '!!', nameLatin: '', city: null, phone: null };
    expect(findDuplicatePairs([empty, { ...empty, id: 'y' }])).toEqual([]);
  });

  it('gives a pair the same key in either order', () => {
    expect(pairKey('b', 'a')).toBe(pairKey('a', 'b'));
  });
});
