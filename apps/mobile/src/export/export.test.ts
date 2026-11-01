/**
 * Week 5 exports: the Excel workbook of the whole ledger and an event's PDF register,
 * built from a real SQLite ledger with the app's own write path.
 */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { strFromU8, unzipSync } from 'fflate';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '@/i18n';
import {
  addCashCount,
  addEntry,
  createEvent,
  createLocalFamily,
  getAllGifts,
  getEventEntries,
  getEventModeTotals,
  getEventSummaries,
  getEventSummary,
  getPeopleSummaries,
  loadLocalSetup,
  type LedgerContext,
  type LedgerDb,
} from '@/db/ledger';
import * as schema from '@/db/schema';
import { ledgerSheets, ledgerWorkbook } from './ledgerWorkbook';
import { registerHtml } from './registerHtml';
import { buildWorkbook, columnName, excelDate, excelDateTime } from './xlsx';

const t = i18n.t.bind(i18n);
let db: LedgerDb;
let ctx: LedgerContext;
let clock = Date.UTC(2026, 1, 14, 14, 30);

beforeEach(() => {
  const d = drizzle(new Database(':memory:'), { schema });
  migrate(d, { migrationsFolder: path.join(__dirname, '../../drizzle') });
  db = d as unknown as LedgerDb;
  const family = createLocalFamily(db, 'Dubey parivaar', randomUUID, 'local');
  ctx = { db, familyId: family.id, deviceId: loadLocalSetup(db, randomUUID, 'local').deviceId, userId: 'local', newId: randomUUID, now: () => (clock += 60_000) };
});

const gift = (eventId: string, over: Record<string, unknown>) =>
  addEntry(ctx, {
    eventId, personId: null, newPersonName: null, relation: null, direction: 'received', amount: 1100,
    mode: 'cash', itemNote: null, subFunction: null, note: null, ...over,
  });

function wedding() {
  const event = createEvent(ctx, {
    title: "Ananya's Wedding", type: 'wedding', role: 'hosted', hostPersonId: null, hostName: null,
    date: '2026-02-14', subFunctions: ['haldi', 'wedding'], venue: 'Bhopal',
  });
  gift(event.id, { newPersonName: 'Ramesh Sharma', newPersonCity: 'Indore', relation: 'mama_ji', amount: 2100, subFunction: 'haldi' });
  gift(event.id, { newPersonName: 'रमेश <वर्मा> & "परिवार"', amount: 150000, mode: 'upi', subFunction: 'wedding', note: 'Sent on GPay' });
  gift(event.id, { newPersonName: 'Sunita Mishra', mode: 'item', amount: 0, itemNote: 'Silver dinner set', subFunction: 'wedding' });
  gift(event.id, { newPersonName: 'Joshi ji', amount: 501, subFunction: null });
  return event;
}

const unzip = (bytes: Uint8Array) => Object.fromEntries(Object.entries(unzipSync(bytes)).map(([k, v]) => [k, strFromU8(v)]));

describe('xlsx writer', () => {
  it('writes the parts Excel needs, with a frozen, filtered header and Indian-grouped amounts', () => {
    const parts = unzip(
      buildWorkbook([
        { name: 'Gifts', columns: [{ header: 'Name', kind: 'text', width: 20 }, { header: 'Amount', kind: 'amount', width: 10 }], rows: [['A & B <x>', 377500], [null, 0]] },
        { name: 'A/B:C*D?[E]', columns: [{ header: 'Date', kind: 'date', width: 12 }], rows: [] },
      ]),
    );
    expect(Object.keys(parts).sort()).toEqual([
      '[Content_Types].xml', '_rels/.rels', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/workbook.xml',
      'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml',
    ]);
    const sheet = parts['xl/worksheets/sheet1.xml']!;
    expect(sheet).toContain('<c r="A2" t="inlineStr"><is><t xml:space="preserve">A &amp; B &lt;x&gt;</t></is></c>');
    expect(sheet).toContain('<c r="B2" s="2"><v>377500</v></c>');
    expect(sheet).toContain('<c r="B3" s="2"><v>0</v></c>');
    expect(sheet).toContain('<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>');
    expect(sheet).toContain('<autoFilter ref="A1:B3"/>');
    expect(parts['xl/workbook.xml']).toContain('<sheet name="A B C D  E" sheetId="2" r:id="rId2"/>');
    expect(parts['xl/styles.xml']).toContain('[&gt;=100000]##\\,##\\,##0');
  });

  it('converts dates without shifting a day', () => {
    expect(excelDate('1900-03-01')).toBe(61);
    expect(excelDate('2026-02-14')).toBe(46067);
    // 8:30 pm in India (UTC+5:30) is 20:30 on the sheet.
    const serial = excelDateTime(Date.UTC(2026, 1, 14, 15, 0), -330);
    expect(serial - 46067).toBeCloseTo(20.5 / 24, 6);
    expect([0, 25, 26, 51, 701].map(columnName)).toEqual(['A', 'Z', 'AA', 'AZ', 'ZZ']);
  });
});

describe('Week 5: Excel export of the whole ledger', () => {
  it('has every gift, each person both ways, and each function', () => {
    wedding();
    const theirs = createEvent(ctx, {
      title: 'Verma griha pravesh', type: 'griha_pravesh', role: 'attended', hostPersonId: null, hostName: 'Verma parivaar',
      date: '2026-03-01', subFunctions: [], venue: null,
    });
    gift(theirs.id, { personId: theirs.hostPersonId, direction: 'given', amount: 5100 });

    const data = { gifts: getAllGifts(db, ctx.familyId), people: getPeopleSummaries(db, ctx.familyId), events: getEventSummaries(db, ctx.familyId) };
    const [gifts, people, events] = ledgerSheets(data, t);

    expect(gifts!.name).toBe('Gifts');
    expect(gifts!.rows).toHaveLength(5);
    expect(gifts!.rows[0]!.slice(0, 10)).toEqual([46067, "Ananya's Wedding", 'Haldi', 'Received', 'Ramesh Sharma', 'Indore', 'Mama ji', 'Cash', 2100, null]);
    expect(gifts!.rows[2]!.slice(7, 10)).toEqual(['Item', null, 'Silver dinner set']); // an item without a value has no amount
    expect(gifts!.rows[4]!.slice(1, 5)).toEqual(['Verma griha pravesh', null, 'Given', 'Verma parivaar']);

    const verma = people!.rows.find((r) => r[0] === 'Verma parivaar')!;
    expect(verma.slice(5)).toEqual([5100, 0, 1, excelDate('2026-03-01')]);
    expect(events!.rows.map((r) => [r[1], r[3], r[6], r[7], r[8], r[9]])).toEqual([
      ["Ananya's Wedding", 'Ours', 'Haldi, Wedding', 152601, 0, 4],
      ['Verma griha pravesh', 'Another family', null, 0, 5100, 1],
    ]);

    const parts = unzip(ledgerWorkbook(data, t));
    expect(parts['xl/workbook.xml']).toContain('<sheet name="People" sheetId="2" r:id="rId2"/>');
    expect(parts['xl/worksheets/sheet1.xml']).toContain('रमेश &lt;वर्मा&gt; &amp; &quot;परिवार&quot;');
  });
});

describe('Week 5: PDF register of an event', () => {
  const build = (eventId: string, cash: Parameters<typeof registerHtml>[0]['cash'] = null) =>
    registerHtml(
      {
        ledgerName: 'Dubey parivaar',
        event: getEventSummary(db, ctx.familyId, eventId)!,
        entries: getEventEntries(db, eventId),
        modes: getEventModeTotals(db, eventId),
        cash,
        exportedAt: clock,
      },
      t,
    );

  it('lists gifts as logged, grouped by function with subtotals, and escapes names', () => {
    const html = build(wedding().id);
    expect(html).toContain('Ananya&#39;s Wedding<span class="dot">.</span>');
    expect(html).toContain('Hosted · 14 Feb 2026 · Bhopal');
    expect(html).toContain('रमेश &lt;वर्मा&gt; &amp; &quot;परिवार&quot;');
    expect(html).not.toContain('<वर्मा>');
    // Function order follows the event; gifts without a function come last.
    const order = ['Haldi', 'Wedding', 'No function set'].map((fn) => html.indexOf(`<td colspan="4">${fn}<span`));
    expect(order.every((i, k) => i > 0 && (k === 0 || i > order[k - 1]!))).toBe(true);
    expect(html).toContain('Wedding total</td><td class="amount">₹1,50,000</td>');
    expect(html).toContain('Total</td><td class="amount">₹1,52,601</td>');
    expect(html).toContain('<td>Silver dinner set</td><td class="amount ">Item</td>');
    expect(html).toContain('<div class="label">Total received</div><div class="value">₹1,52,601</div>');
  });

  it('shows the latest cash count against the cash logged', () => {
    const event = wedding();
    addCashCount(ctx, { eventId: event.id, countedAmount: 2000 });
    const html = build(event.id, { logged: 2601, counted: 2000, countedAt: clock });
    expect(html).toContain('₹2,000 against ₹2,601 logged.');
    expect(html).toContain('<strong class="off">₹601 short</strong>');
  });

  it('marks direction with arrows when an event has gifts both ways', () => {
    const event = wedding();
    gift(event.id, { newPersonName: 'Shagun to the band', direction: 'given', amount: 1100 });
    const html = build(event.id);
    expect(html).toContain('<td class="amount given">↗ ₹1,100</td>');
    expect(html).toContain('↙ ₹1,52,601 · ↗ ₹1,100');
    expect(html).toContain('↗ given by you · ↙ received from them');
  });
});
