/**
 * Week 5: invite cards as ML Kit reads them (one string per line), in English, Hindi
 * and both, turned into a draft for the new-event form.
 */
import { describe, expect, it } from 'vitest';
import i18n from '@/i18n';
import type { RecognizedLine } from '../../modules/invite-text';
import { draftTitle, mergeReadings, parseInvite } from './parseInvite';

const TODAY = '2026-10-31';
const card = (text: string, today = TODAY) => parseInvite(text.trim().split('\n'), today);
const t = i18n.t.bind(i18n);

describe('Week 5: reading an invite card', () => {
  it('an English wedding card', () => {
    const draft = card(`
|| Shri Ganeshaya Namah ||
Smt. Kamla Devi & Shri Ramesh Chandra Verma
request the pleasure of your company
at the wedding of their daughter
Chi. Ananya (B.Tech)
weds
Chi. Rohan
(S/o Smt. & Shri Anil Dubey, Bhopal)
Haldi: Thursday, 12th February 2026, 10 am
Sangeet: 13th February 2026, 7 pm
Wedding: Saturday, 14th February 2026
Pheras at 9 pm
Venue: Shagun Marriage Garden, Hoshangabad Road, Bhopal
RSVP: Verma Family 98260 12345`);
    expect(draft).toEqual({
      type: 'wedding',
      date: '2026-02-14',
      venue: 'Shagun Marriage Garden, Hoshangabad Road, Bhopal',
      hostName: 'Verma family',
      names: ['Ananya', 'Rohan'],
      subFunctions: ['haldi', 'sangeet', 'wedding'],
    });
    expect(draftTitle(draft, t)).toBe('Ananya weds Rohan');
  });

  it('a Hindi wedding card with Devanagari digits', () => {
    const draft = card(`
॥ श्री गणेशाय नमः ॥
शुभ विवाह
सौ.कां. अनन्या
संग
चि. रोहन
हल्दी - १२ फ़रवरी २०२६
महिला संगीत - १३ फरवरी २०२६
पाणिग्रहण - शनिवार, १४ फरवरी २०२६
प्रीतिभोज - १५ फरवरी २०२६, सायं ७ बजे से
स्थान: होटल लेक व्यू, भोपाल
निवेदक: समस्त वर्मा परिवार`);
    expect(draft).toEqual({
      type: 'wedding',
      date: '2026-02-14',
      venue: 'होटल लेक व्यू, भोपाल',
      hostName: 'वर्मा परिवार',
      names: ['अनन्या', 'रोहन'],
      subFunctions: ['haldi', 'sangeet', 'wedding', 'reception'],
    });
    expect(draftTitle(draft, t)).toBe('अनन्या weds रोहन');
  });

  it('a mixed card: Hindi heading, English names and details', () => {
    const draft = card(`
शुभ विवाह
Together with their families
Sakshi
&
Rohit
Sunday, March 8, 2026
Royal Palace Lawn, Indore
With best compliments from: Shri Suresh Agrawal & family`);
    expect(draft).toMatchObject({
      type: 'wedding',
      date: '2026-03-08',
      venue: 'Royal Palace Lawn, Indore',
      hostName: 'Agrawal family',
      names: ['Sakshi', 'Rohit'],
      subFunctions: [],
    });
  });

  it('a griha pravesh card', () => {
    const draft = card(`
You are cordially invited to the
Griha Pravesh
of our new home
on Sunday, 22nd November 2026 at 11 am
Address: 14, Shanti Nagar, Bhopal
Hosted by: Pandey Parivaar`);
    expect(draft).toEqual({
      type: 'griha_pravesh',
      date: '2026-11-22',
      venue: '14, Shanti Nagar, Bhopal',
      hostName: 'Pandey parivaar',
      names: [],
      subFunctions: [],
    });
    expect(draftTitle(draft, t)).toBe('Griha pravesh · Pandey parivaar');
  });

  it('the host is the surname before "and family", however it is joined', () => {
    const host = (text: string) => card(text).hostName;
    expect(host('Shri Mahesh Gupta and family request your')).toBe('Gupta family');
    expect(host('SHRI MAHESH GUPTA AND FAMILY')).toBe('GUPTA family');
    expect(host('श्री महेश गुप्ता एवं परिवार आपको सादर आमंत्रित करते')).toBe('गुप्ता परिवार');
    expect(host('श्री महेश गुप्ता व परिवार')).toBe('गुप्ता परिवार');
    expect(host('श्री महेश गुप्ता और परिवार')).toBe('गुप्ता परिवार');
  });

  it('"and family" wrapped onto its own line takes the surname from the line above', () => {
    expect(card('Shri Mahesh Gupta\nand family').hostName).toBe('Gupta family');
    expect(card('श्री महेश गुप्ता\nएवं परिवार').hostName).toBe('गुप्ता परिवार');
  });

  it('"and family" with no name to take is no host at all', () => {
    expect(card('and family').hostName).toBeNull();
    expect(card('एवं परिवार').hostName).toBeNull();
  });

  it('a birthday card without a year takes the next time that date comes round', () => {
    const text = `
Join us for
Aarav's 1st Birthday
Saturday, 5th December
7 pm onwards at Hotel Amer Greens
With love, the Khare family`;
    expect(card(text)).toMatchObject({ type: 'birthday', date: '2026-12-05', names: ['Aarav'], hostName: 'Khare family', venue: 'Hotel Amer Greens' });
    expect(card(text, '2026-12-10').date).toBe('2027-12-05');
    expect(draftTitle(card(text), t)).toBe("Aarav's birthday");
  });

  it('a Hindi mundan card with a numeric date', () => {
    const draft = card(`
चि. आरव का मुंडन संस्कार
दिनांक: 14.03.2027, प्रातः 10 बजे
स्थान: श्री राम मंदिर, इंदौर
दर्शनाभिलाषी: शर्मा परिवार`);
    expect(draft).toEqual({
      type: 'mundan',
      date: '2027-03-14',
      venue: 'श्री राम मंदिर, इंदौर',
      hostName: 'शर्मा परिवार',
      names: ['आरव'],
      subFunctions: [],
    });
    expect(draftTitle(draft, t)).toBe("आरव's mundan");
  });

  it('ignores impossible dates and returns nothing it can’t find', () => {
    expect(card('Party on 31/02/2026').date).toBeNull();
    expect(card('See you on 14-2-26').date).toBe('2026-02-14');
    expect(card('Wedding anniversary dinner, 9 Jan 2027').type).toBe('other');
    expect(card('blurry nonsense\nxx')).toEqual({ type: null, date: null, venue: null, hostName: null, names: [], subFunctions: [] });
    expect(draftTitle(card('blurry'), t)).toBe('');
  });
});

describe('Week 5: keeping the better reading of each line', () => {
  const line = (text: string, top: number, confidence: number, left = 40): RecognizedLine => ({ text, top, left, width: 300, height: 40, confidence });

  it('takes Hindi from the Devanagari reader and English from the Latin one', () => {
    const lines = mergeReadings({
      latin: [line('Ananya weds Rohan', 100, 0.95), line('ofoft 12 werdt', 200, 0.41), line('Venue: Hotel Lake View', 400, 0.9)],
      devanagari: [line('अननय वेड्स रोहन', 102, 0.52), line('हल्दी 12 फरवरी', 198, 0.86), line('निवेदक: वर्मा परिवार', 300, 0.9)],
    });
    expect(lines).toEqual(['Ananya weds Rohan', 'हल्दी 12 फरवरी', 'निवेदक: वर्मा परिवार', 'Venue: Hotel Lake View']);
  });

  it('prefers the Hindi reading on a tie, and keeps lines only one reader saw', () => {
    const lines = mergeReadings({
      latin: [line('Ser', 100, 0.5), line('RSVP 98260 12345', 500, 0.9, 400)],
      devanagari: [line('शुभ विवाह', 100, 0.5), line('Hotel', 600, 0.3)],
    });
    expect(lines).toEqual(['शुभ विवाह', 'RSVP 98260 12345', 'Hotel']);
  });
});
