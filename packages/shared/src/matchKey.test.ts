import { describe, expect, it } from 'vitest';
import { createPersonSearch, devanagariToLatin, exactKeyMatches, isHonorific, matchKey } from './index';

describe('matchKey: the build guide examples', () => {
  it.each([
    ['Shri Ramesh Sharma ji', 'ramesh sharm'],
    ['रमेश शर्मा', 'ramesh sharm'],
    ['Ramesh Sharmaa', 'ramesh sharm'],
    ['Verma parivaar', 'verm parivar'],
  ])('%s → %s', (input, key) => {
    expect(matchKey(input)).toBe(key);
  });

  it('keeps the city out of the key (city is stored separately)', () => {
    expect(matchKey('Verma parivaar, Bhopal')).toBe('verm parivar bhopal');
    expect(matchKey('Verma parivaar')).toBe('verm parivar');
  });
});

describe('matchKey: Hindi and English spellings meet', () => {
  it.each([
    ['कमला', 'Kamla'],
    ['सुनीता मिश्रा', 'Sunita Mishra'],
    ['श्रीमती सुनीता मिश्रा', 'Smt. Sunita Mishra'],
    ['डॉ. अनिल खरे', 'Dr Anil Khare'],
    ['अग्रवाल', 'Agrawal'],
    ['पांडेय', 'Pandey'],
    ['पाण्डे', 'Pande'],
    ['दुबे', 'Dubey'],
    ['राजेश', 'Rajesh'],
    ['आनंद', 'Anand'],
    ['सक्सेना', 'Saxena'],
    ['नेहा', 'Neha'],
    ['चौहान', 'Chauhan'],
    ['प्रिया', 'Priya'],
    ['मनोज', 'Manoj'],
    ['फूल चंद', 'Phool Chand'],
  ])('%s = %s', (hindi, english) => {
    expect(matchKey(hindi)).toBe(matchKey(english));
  });

  it('folds common English spelling variants', () => {
    expect(matchKey('Sharmaa')).toBe(matchKey('Sharma'));
    expect(matchKey('Deepak')).toBe(matchKey('Dipak'));
    expect(matchKey('Pooja')).toBe(matchKey('Puja'));
    expect(matchKey('Shweta')).toBe(matchKey('Shveta'));
    expect(matchKey('Phool')).toBe(matchKey('Fool'));
    expect(matchKey('Aggarwal')).toBe(matchKey('Agarwal'));
  });

  it('removes honorifics but never empties a name', () => {
    expect(matchKey('Mr. & Mrs. Gupta')).toBe('gupt');
    expect(matchKey('Rakesh bhaiya')).toBe('rakesh');
    expect(matchKey('Shri')).toBe('shri');
    expect(matchKey('  ')).toBe('');
  });

  it('recognises honorific words', () => {
    expect(['Shri', 'ji', 'Dr.', 'श्रीमती', 'डॉ.', 'Smt.'].every(isHonorific)).toBe(true);
    expect(['Ramesh', 'शर्मा', 'Bua'].some(isHonorific)).toBe(false);
  });

  it('keeps names that differ in more than spelling apart', () => {
    expect(matchKey('Ramesh Sharma')).not.toBe(matchKey('Rakesh Sharma'));
    expect(matchKey('Sunita')).not.toBe(matchKey('Sunil'));
  });
});

describe('devanagariToLatin', () => {
  it('drops the silent schwa the way Hindi speakers spell names', () => {
    expect(devanagariToLatin('कमला')).toBe('kamlaa');
    expect(devanagariToLatin('रमेश')).toBe('ramesh');
    expect(devanagariToLatin('परिवार')).toBe('parivaar');
    expect(devanagariToLatin('अग्रवाल')).toBe('agravaal');
  });
  it('handles nukta, conjuncts, nasals and digits', () => {
    expect(devanagariToLatin('ज़रीना')).toBe('zareenaa');
    expect(devanagariToLatin('ज्ञान')).toBe('gyaan');
    expect(devanagariToLatin('क्षमा')).toBe('kshamaa');
    expect(devanagariToLatin('सिंह')).toBe('sinh');
    expect(devanagariToLatin('२०२६')).toBe('2026');
    expect(devanagariToLatin('न')).toBe('na');
  });
  it('leaves Latin text alone', () => {
    expect(devanagariToLatin('Ramesh रमेश')).toBe('Ramesh ramesh');
  });
});

describe('person search', () => {
  const people = [
    'Ramesh Sharma',
    'रमेश शर्मा',
    'Rakesh Jain',
    'Sunita Mishra',
    'Verma parivaar',
    'Tiwari parivaar',
    'Rameshwar Prasad',
    'Kamla Bua',
  ].map((displayName, i) => ({
    id: String(i),
    displayName,
    nameLatin: matchKey(displayName),
    city: i === 1 ? 'Indore' : 'Bhopal',
  }));
  const search = createPersonSearch(people);
  const names = (q: string) => search(q).map((p) => p.displayName);

  it('finds both scripts from either script', () => {
    expect(names('ramesh sharma').slice(0, 2).sort()).toEqual(['Ramesh Sharma', 'रमेश शर्मा'].sort());
    expect(names('रमेश').slice(0, 2).sort()).toEqual(['Ramesh Sharma', 'रमेश शर्मा'].sort());
  });
  it('tolerates typos and spelling variants', () => {
    expect(names('Ramesh Sharmaa')).toContain('Ramesh Sharma');
    expect(names('Ramsh')).toContain('Ramesh Sharma');
    expect(names('वर्मा')[0]).toBe('Verma parivaar');
    expect(names('kamala')[0]).toBe('Kamla Bua');
  });
  it('ranks prefix matches first and uses prefix matching for 1–2 letters', () => {
    expect(names('ra').every((n) => /^(Ra|र)/.test(n) || matchKey(n).startsWith('ra'))).toBe(true);
    expect(names('Tiw')[0]).toBe('Tiwari parivaar');
  });
  it('finds exact key matches for reuse', () => {
    expect(exactKeyMatches(people, 'Shri Ramesh Sharma ji').map((p) => p.id).sort()).toEqual(['0', '1']);
    expect(exactKeyMatches(people, 'Sunita Mishraa').map((p) => p.id)).toEqual(['3']);
    expect(exactKeyMatches(people, 'Nobody')).toEqual([]);
  });
});
