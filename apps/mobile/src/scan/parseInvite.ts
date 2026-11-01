import type { EventType } from '@shagun/shared';
import type { TFunction } from 'i18next';
import type { RecognizedLine, RecognizedText } from '../../modules/invite-text';

/**
 * Turns the text on an invite card into a draft for the new-event form. Cards are
 * written in English, Hindi or both, so every rule has both spellings. Nothing here is
 * trusted blindly: the form opens with the draft filled in for the family to check.
 */
export interface InviteDraft {
  type: EventType | null;
  /** ISO date of the main function. */
  date: string | null;
  venue: string | null;
  /** The family whose function it is: the card's sender. */
  hostName: string | null;
  /** The couple on a wedding card; the child or person on a birthday or mundan card. */
  names: string[];
  /** Functions on the card, in card order: SUB_FUNCTIONS values or a custom name. */
  subFunctions: string[];
}

const DEVANAGARI = /[ऀ-ॿ]/;
const LETTER = '\\p{L}\\p{M}';

/** One regex alternative per keyword list; Devanagari words don't have \b, so use letter lookarounds. */
const words = (list: readonly string[]) =>
  new RegExp(`(?<![${LETTER}])(?:${[...list].sort((a, b) => b.length - a.length).map(escape).join('|')})(?![${LETTER}])`, 'iu');
function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** For matching only: lower case, Devanagari digits → ASCII, nukta dropped (फ़रवरी = फरवरी). */
function fold(text: string): string {
  return text
    .normalize('NFC')
    .replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x0966))
    .replace(/़/g, '')
    .toLowerCase();
}

// ---------------------------------------------------------------------------
// Picking the better reading of each line
// ---------------------------------------------------------------------------

function overlap(a: RecognizedLine, b: RecognizedLine): boolean {
  const v = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
  const h = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
  return v > 0.5 * Math.min(a.height, b.height) && h > 0;
}

/**
 * Both recognizers read the whole card: the Latin one turns Hindi into stray letters and
 * the Devanagari one may read English less well. Where their lines sit on the same spot,
 * the more confident reading wins (Hindi text from the Devanagari reader on a tie); lines
 * only one of them saw are kept. Result: the card's lines, top to bottom.
 */
export function mergeReadings({ latin, devanagari }: RecognizedText): string[] {
  const kept: RecognizedLine[] = [...latin];
  for (const line of devanagari) {
    const rivals = kept.filter((k) => overlap(k, line));
    const best = Math.max(...rivals.map((r) => r.confidence));
    const wins = !rivals.length || line.confidence > best || (line.confidence === best && DEVANAGARI.test(line.text));
    if (!wins) continue;
    for (const r of rivals) kept.splice(kept.indexOf(r), 1);
    kept.push(line);
  }
  return kept
    .sort((a, b) => a.top - b.top || a.left - b.left)
    .map((l) => l.text.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const MONTHS: Record<string, number> = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5, june: 6, jun: 6,
  july: 7, jul: 7, august: 8, aug: 8, september: 9, sept: 9, sep: 9, october: 10, oct: 10,
  november: 11, nov: 11, december: 12, dec: 12,
  जनवरी: 1, फरवरी: 2, मार्च: 3, अप्रैल: 4, अप्रेल: 4, मई: 5, जून: 6, जुलाई: 7, अगस्त: 8,
  सितंबर: 9, सितम्बर: 9, अक्टूबर: 10, अक्तूबर: 10, नवंबर: 11, नवम्बर: 11, दिसंबर: 12, दिसम्बर: 12,
};
const MONTH = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');
const DAY_MONTH = new RegExp(
  `(?<!\\d)(\\d{1,2})(?:st|nd|rd|th)?[\\s.,-]*(?:of\\s+)?(${MONTH})(?![${LETTER}])\\.?(?:[\\s,.-]*(?:(\\d{4})|['’](\\d{2})))?`,
  'gu',
);
const MONTH_DAY = new RegExp(`(?<![${LETTER}])(${MONTH})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?!\\d)(?:,?\\s+(\\d{4}))?`, 'gu');
const NUMERIC = /(?<!\d)(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})(?!\d)/g;

function isoDate(day: number, month: number, year: number | null, today: string): string | null {
  const [ty, tm, td] = today.split('-').map(Number) as [number, number, number];
  // No year on the card: the next time that date comes round.
  const y = year ?? (month * 100 + day >= tm * 100 + td ? ty : ty + 1);
  const d = new Date(Date.UTC(y, month - 1, day));
  if (d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day || y < 2000 || y > 2100) return null;
  return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

interface Found {
  iso: string;
  line: number;
}

function findDates(lines: string[], today: string): Found[] {
  const text = lines.map(fold).join('\n');
  const lineAt = (index: number) => text.slice(0, index).split('\n').length - 1;
  const found: (Found & { at: number })[] = [];
  const year = (four?: string, two?: string) => (four ? Number(four) : two ? 2000 + Number(two) : null);
  for (const m of text.matchAll(DAY_MONTH)) {
    const iso = isoDate(Number(m[1]), MONTHS[m[2]!]!, year(m[3], m[4]), today);
    if (iso) found.push({ iso, line: lineAt(m.index), at: m.index });
  }
  for (const m of text.matchAll(MONTH_DAY)) {
    if (found.some((f) => Math.abs(f.at - m.index) < 6)) continue;
    const iso = isoDate(Number(m[2]), MONTHS[m[1]!]!, year(m[3]), today);
    if (iso) found.push({ iso, line: lineAt(m.index), at: m.index });
  }
  for (const m of text.matchAll(NUMERIC)) {
    const iso = isoDate(Number(m[1]), Number(m[2]), year(m[3]!.length === 4 ? m[3] : undefined, m[3]!.length === 2 ? m[3] : undefined), today);
    if (iso) found.push({ iso, line: lineAt(m.index), at: m.index });
  }
  return found.sort((a, b) => a.at - b.at);
}

// ---------------------------------------------------------------------------
// What kind of function, and which functions
// ---------------------------------------------------------------------------

const TYPE_WORDS: Record<Exclude<EventType, 'other'>, RegExp> = {
  wedding: words([
    'wedding', 'marriage', 'weds', 'vivah', 'vivaah', 'shubh vivah', 'shaadi', 'shadi', 'parinay', 'pheras', 'phere',
    'lagan', 'lagna', 'nuptials', 'विवाह', 'शादी', 'परिणय', 'पाणिग्रहण', 'फेरे', 'लग्न', 'शुभ विवाह',
  ]),
  griha_pravesh: words(['griha pravesh', 'grih pravesh', 'graha pravesh', 'grihapravesh', 'housewarming', 'house warming', 'गृह प्रवेश', 'गृहप्रवेश']),
  birthday: words(['birthday', 'janmdin', 'janamdin', 'जन्मदिन', 'जन्मदिवस', 'जन्म दिवस']),
  mundan: words(['mundan', 'mundan sanskar', 'मुंडन', 'मुण्डन']),
};
const ANNIVERSARY = words(['anniversary', 'सालगिरह', 'वर्षगांठ', 'वैवाहिक वर्षगाँठ']);

/** Functions a card can list, in the order they usually happen, with the name the event form uses. */
const FUNCTION_WORDS: [string, RegExp][] = [
  ['Sagai', words(['sagai', 'engagement', 'ring ceremony', 'सगाई'])],
  ['Tilak', words(['tilak', 'तिलक'])],
  ['haldi', words(['haldi', 'haldi ceremony', 'हल्दी', 'हलदी', 'tel baan', 'तेल बान'])],
  ['mehendi', words(['mehendi', 'mehndi', 'mehandi', 'मेहंदी', 'मेंहदी', 'मेहन्दी'])],
  ['sangeet', words(['sangeet', 'sangit', 'संगीत', 'महिला संगीत'])],
  ['Mayra', words(['mayra', 'bhaat', 'मायरा', 'भात'])],
  ['wedding', words(['pheras', 'phere', 'shubh vivah', 'vivah', 'wedding ceremony', 'lagna', 'फेरे', 'पाणिग्रहण', 'शुभ विवाह', 'विवाह संस्कार', 'लग्न'])],
  ['reception', words(['reception', 'ashirwad samaroh', 'aashirwad samaroh', 'प्रीतिभोज', 'प्रीति भोज', 'स्वागत समारोह', 'आशीर्वाद समारोह'])],
];

function detectType(text: string): EventType | null {
  if (ANNIVERSARY.test(text)) return 'other';
  const order = ['wedding', 'griha_pravesh', 'mundan', 'birthday'] as const;
  const hits = order.map((type) => ({ type, n: (text.match(new RegExp(TYPE_WORDS[type].source, 'giu')) ?? []).length }));
  const best = hits.reduce((a, b) => (b.n > a.n ? b : a));
  return best.n > 0 ? best.type : null;
}

function detectFunctions(text: string, type: EventType | null): string[] {
  if (type !== 'wedding') return [];
  const seen = FUNCTION_WORDS.filter(([, re]) => re.test(text)).map(([name]) => name);
  // "Wedding" on its own is the card's subject, not a list of functions.
  return seen.some((name) => name !== 'wedding') ? seen : [];
}

// ---------------------------------------------------------------------------
// Names, host, venue
// ---------------------------------------------------------------------------

const NAME_PREFIX = words([
  'chi', 'chi. sau', 'sau', 'ku', 'kumari', 'ayu', 'ayushmati', 'ayushman', 'chiranjeev', 'saubhagyakankshini',
  'चि', 'सौ', 'कु', 'आयु', 'आयुष्मती', 'आयुष्मान', 'चिरंजीव', 'सौभाग्यकांक्षिणी', 'सौ.कां', 'कुमारी',
]);
const HONORIFIC = /(?<![\p{L}\p{M}])(?:smt|shri|shree|sri|mr|mrs|dr|श्री|श्रीमती|डॉ)(?![\p{L}\p{M}])/iu;
/** "weds" and "संग" are sure signs of a couple; "&" and "and" count only when nothing surer is on the card. */
const STRONG_JOIN = '(?:weds?|संग|सँग|वेड्स|विद|❤️?|♥|💕)';
const WEAK_JOIN = '(?:&|and)';
const NOT_NAMES = new Set([
  'together', 'their', 'families', 'family', 'dinner', 'lunch', 'dance', 'cocktail', 'cocktails', 'blessings', 'love',
  'request', 'pleasure', 'company', 'presence', 'invite', 'you', 'your', 'our', 'the', 'with', 'for', 'of', 'parivar',
  'parivaar', 'परिवार', 'drinks', 'music', 'join', 'us',
]);

/** "Chi. Ananya (B.Tech)" → "Ananya". Null if what's left doesn't look like a name. */
function cleanName(raw: string): string | null {
  let s = raw.replace(/\(.*?\)/g, ' ').replace(/[,:;।|]+.*$/u, '');
  for (let i = 0; i < 3; i++) s = s.replace(new RegExp(`^\\s*${NAME_PREFIX.source}\\.?\\s*`, 'iu'), '');
  s = s.replace(/[^\p{L}\p{M}\s.'-]/gu, ' ').replace(/\s+/g, ' ').trim();
  const parts = s.split(' ').filter(Boolean);
  if (!parts.length || parts.length > 3 || s.length < 2 || s.length > 30) return null;
  if (Object.values(TYPE_WORDS).some((re) => re.test(s)) || HONORIFIC.test(s)) return null;
  if (parts.some((w) => NOT_NAMES.has(w.toLowerCase()))) return null;
  return parts.join(' ');
}

function findCouple(lines: string[]): string[] {
  for (const join of [STRONG_JOIN, WEAK_JOIN]) {
    const inline = new RegExp(`\\s+${join}\\s+`, 'iu');
    const alone = new RegExp(`^${join}$`, 'iu');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (HONORIFIC.test(line)) continue;
      const parts = line.split(inline);
      if (parts.length === 2) {
        const [a, b] = parts.map(cleanName);
        if (a && b) return [a, b];
      }
      if (alone.test(line) && i > 0 && i + 1 < lines.length) {
        const a = cleanName(lines[i - 1]!);
        const b = cleanName(lines[i + 1]!);
        if (a && b) return [a, b];
      }
    }
  }
  return [];
}

function findHonoree(lines: string[]): string[] {
  const patterns = [
    /([\p{L}\p{M}]+)['’]s\s+(?:(?:\d+\w*|first|second|third)\s+)?(?:birthday|mundan)/iu,
    /(?:birthday|mundan(?:\s+sanskar)?)\s+of\s+(?:(?:chi|master|baby)\.?\s*)?([\p{L}\p{M}]+)/iu,
    /([\p{L}\p{M}]+)\s+(?:का|की)\s+(?:[\p{L}\p{M}]+\s+)?(?:जन्मदिन|मुंडन|मुण्डन)/u,
  ];
  for (const line of lines) {
    for (const re of patterns) {
      const name = re.exec(line)?.[1];
      const clean = name ? cleanName(name) : null;
      if (clean && !/^(?:our|my|your|the|first|1st)$/i.test(clean)) return [clean];
    }
  }
  return [];
}

/** "The Verma Family", "समस्त वर्मा परिवार": the word before family / parivaar is the surname. */
const FAMILY = /([\p{L}\p{M}]+)\s+(?:&\s+)?(family|parivar|parivaar|परिवार)(?![\p{L}\p{M}])/iu;
const HOST_LABEL = words([
  'निवेदक', 'विनीत', 'दर्शनाभिलाषी', 'स्वागतोत्सुक', 'स्वागतकर्ता', 'rsvp', 'best compliments from', 'with best compliments',
  'compliments from', 'hosted by', 'invited by', 'with love from',
]);

function findHost(lines: string[]): string | null {
  for (const line of lines) {
    const m = FAMILY.exec(line);
    if (m && !NOT_NAMES.has(m[1]!.toLowerCase()) && !/^(?:समस्त|सकल|the|our|your)$/iu.test(m[1]!)) {
      const surname = m[1]![0]!.toUpperCase() + m[1]!.slice(1);
      const word = /परिवार/.test(m[2]!) ? 'परिवार' : /parivaa?r/i.test(m[2]!) ? 'parivaar' : 'family';
      return `${surname} ${word}`;
    }
  }
  for (let i = 0; i < lines.length; i++) {
    const label = HOST_LABEL.exec(lines[i]!);
    if (!label) continue;
    const rest = lines[i]!.slice(label.index + label[0].length).replace(/^[\s:–—-]*(?:from(?![\p{L}]))?[\s:–—-]*/iu, '').trim();
    const candidate = rest || lines[i + 1] || '';
    const name = candidate.replace(/^(?:smt\.?\s*(?:&|and)\s*)?/i, '').replace(/[,;].*$/, '').replace(/\+?\d[\d\s-]{6,}/g, '').trim();
    if (name.length >= 3 && name.length <= 60 && !/\d{3}/.test(name)) return name;
  }
  return null;
}

const VENUE_LABEL = words(['venue', 'स्थान', 'स्थल', 'आयोजन स्थल', 'कार्यक्रम स्थल', 'address', 'पता']);
const VENUE_WORDS = words([
  'garden', 'gardens', 'lawn', 'lawns', 'palace', 'hotel', 'resort', 'banquet', 'hall', 'bhawan', 'bhavan', 'vatika',
  'mandapam', 'farm house', 'farmhouse', 'club', 'dharamshala', 'mangal bhawan', 'marriage garden',
  'गार्डन', 'होटल', 'रिसॉर्ट', 'पैलेस', 'भवन', 'वाटिका', 'धर्मशाला', 'लॉन', 'मैरिज गार्डन', 'मंगल भवन',
]);

function findVenue(lines: string[]): string | null {
  const tidy = (s: string) => s.replace(/^[\s:–—-]+|[\s,–—-]+$/g, '').replace(/\s+/g, ' ').slice(0, 120) || null;
  for (let i = 0; i < lines.length; i++) {
    const m = VENUE_LABEL.exec(lines[i]!);
    if (!m || m.index > 2) continue;
    const rest = tidy(lines[i]!.slice(m.index + m[0].length));
    if (rest && rest.length > 2) return rest;
    if (lines[i + 1]) return tidy(lines[i + 1]!);
  }
  const line = lines.find((l) => VENUE_WORDS.test(l));
  if (!line) return null;
  // "7 pm onwards at Hotel Amer Greens" → "Hotel Amer Greens"
  const after = line.split(/\s+at\s+/i).pop()!;
  return tidy(VENUE_WORDS.test(after) ? after : line);
}

// ---------------------------------------------------------------------------

const MAIN_FUNCTION = words([
  'wedding', 'vivah', 'shubh vivah', 'pheras', 'phere', 'lagna', 'griha pravesh', 'housewarming', 'birthday', 'mundan',
  'विवाह', 'शुभ विवाह', 'फेरे', 'पाणिग्रहण', 'लग्न', 'गृह प्रवेश', 'जन्मदिन', 'मुंडन',
]);

/** Reads a draft event from the lines of an invite card. `today` (ISO) dates cards that leave out the year. */
export function parseInvite(lines: string[], today: string): InviteDraft {
  const clean = lines.map((l) => l.normalize('NFC').trim()).filter(Boolean);
  const text = fold(clean.join('\n'));
  const type = detectType(text);

  // The main function's date: the one closest to a line naming it, else the first on the card.
  const dates = findDates(clean, today);
  const mains = clean.map((l, i) => (MAIN_FUNCTION.test(fold(l)) ? i : -1)).filter((i) => i >= 0);
  const distance = (d: Found) => Math.min(...mains.map((m) => Math.abs(m - d.line)), Infinity);
  const date = [...dates].sort((a, b) => distance(a) - distance(b))[0]?.iso ?? null;

  return {
    type,
    date,
    venue: findVenue(clean),
    hostName: findHost(clean),
    names: type === 'wedding' ? findCouple(clean) : type === 'birthday' || type === 'mundan' ? findHonoree(clean) : [],
    subFunctions: detectFunctions(text, type),
  };
}

/** A title for the form, in the app's language: "Ananya weds Rohan", "Aarav's mundan", "Griha pravesh · Verma parivaar". */
export function draftTitle(draft: InviteDraft, t: TFunction): string {
  const [a, b] = draft.names;
  if (draft.type === 'wedding' && a && b) return t('scan.titleWedding', { a, b });
  if ((draft.type === 'birthday' || draft.type === 'mundan') && a) return t('scan.titleOf', { name: a, type: t(`eventType.${draft.type}`).toLowerCase() });
  if (draft.type && draft.hostName) return t('scan.titleWithHost', { type: t(`eventType.${draft.type}`), host: draft.hostName });
  return '';
}
