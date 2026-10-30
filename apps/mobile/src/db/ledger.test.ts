/**
 * Runs the real write path and queries against SQLite in Node (better-sqlite3),
 * using the same migration the phone runs. Week 1's "done when": log 20 entries
 * offline and see the right total.
 */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { matchKey, sumAmounts } from '@shagun/shared';
import { eq } from 'drizzle-orm';
import {
  addCashCount,
  addJoinedFamily,
  applyServerFamilies,
  createPerson,
  listLocalFamilies,
  markFamilyRegistered,
  unregisteredFamilies,
  addEntry,
  countPendingChanges,
  findSameName,
  getCashCounts,
  getCashEntries,
  getCashSummary,
  getPeopleIndex,
  getUpcomingForPerson,
  refreshMatchKeys,
  getEntry,
  updateEntry,
  updatePerson,
  createEvent,
  createLocalFamily,
  deleteEntry,
  getEventEntries,
  getEventModeTotals,
  getEventSummary,
  getLastExchange,
  getPeopleSummaries,
  getPersonHistory,
  LedgerError,
  loadLocalSetup,
  searchPeople,
  type LedgerContext,
  type LedgerDb,
} from './ledger';
import * as schema from './schema';

let db: LedgerDb;
let ctx: LedgerContext;
let clock = 1_760_000_000_000;

function freshDb(): LedgerDb {
  const sqlite = new Database(':memory:');
  const d = drizzle(sqlite, { schema });
  migrate(d, { migrationsFolder: path.join(__dirname, '../../drizzle') });
  return d as unknown as LedgerDb;
}

const outboxRows = () => db.select().from(schema.outbox).all();

beforeEach(() => {
  db = freshDb();
  const family = createLocalFamily(db, 'Dubey parivaar', randomUUID, 'local');
  const setup = loadLocalSetup(db, randomUUID, 'local');
  ctx = {
    db,
    familyId: family.id,
    deviceId: setup.deviceId,
    userId: 'local',
    newId: randomUUID,
    now: () => ++clock,
  };
});

const hostedWedding = () =>
  createEvent(ctx, {
    title: "Ananya's Wedding",
    type: 'wedding',
    role: 'hosted',
    hostPersonId: null,
    hostName: null,
    date: '2026-02-14',
    subFunctions: ['haldi', 'sangeet', 'wedding', 'reception'],
    venue: 'Bhopal',
  });

const gift = (eventId: string, over: Record<string, unknown> = {}) => ({
  eventId,
  personId: null,
  newPersonName: null,
  relation: null,
  direction: 'received',
  amount: 1100,
  mode: 'cash',
  itemNote: null,
  subFunction: 'wedding',
  note: null,
  ...over,
});

describe('local setup', () => {
  it('creates a device id once and remembers the family', () => {
    const again = loadLocalSetup(db, randomUUID, 'local');
    expect(again.deviceId).toBe(ctx.deviceId);
    expect(again.family).toEqual({ id: ctx.familyId, name: 'Dubey parivaar', role: 'owner', registered: false });
  });

  it('starts with no family on a new phone', () => {
    const empty = freshDb();
    expect(loadLocalSetup(empty, randomUUID, 'someone').family).toBeNull();
  });
});

describe('Week 1: 20 entries offline', () => {
  it('logs 20 gifts and shows the right total, count and outbox', () => {
    const event = hostedWedding();
    const amounts = [101, 501, 1100, 2100, 5100, 1100, 501, 2100, 11000, 1100, 501, 251, 2100, 1100, 5100, 501, 1100, 2100, 1100, 21000];
    const modes = ['cash', 'upi'] as const;

    // First 15 are new people; last 5 come back as existing people (e.g. a second function).
    const created: string[] = [];
    amounts.forEach((amount, i) => {
      const existing = i >= 15 ? created[i - 15] : undefined;
      const res = addEntry(
        ctx,
        gift(event.id, {
          amount,
          mode: modes[i % 2],
          personId: existing ?? null,
          newPersonName: existing ? null : `Guest ${i + 1}`,
          relation: i % 3 === 0 ? 'relative' : null,
        }),
      );
      if (!existing) created.push(res.person.id);
    });

    const summary = getEventSummary(db, ctx.familyId, event.id)!;
    expect(summary.entryCount).toBe(20);
    expect(summary.received).toBe(sumAmounts(amounts));
    expect(summary.received).toBe(59_556);
    expect(summary.given).toBe(0);

    const byMode = Object.fromEntries(getEventModeTotals(db, event.id).map((m) => [m.mode, m]));
    expect(byMode.cash!.count + byMode.upi!.count).toBe(20);
    expect(byMode.cash!.total + byMode.upi!.total).toBe(59_556);

    // 1 event + 15 people + 20 entries, each with its own outbox row…
    expect(outboxRows()).toHaveLength(36);
    // …but the phone shows 21 changes: each new guest rides along with their gift.
    expect(countPendingChanges(db)).toBe(21);
    const list = getEventEntries(db, event.id);
    expect(list).toHaveLength(20);
    expect(list.every((e) => e.pending)).toBe(true);
    expect(list[0]!.amount).toBe(21000); // newest first
  });

  it('filters entries by function', () => {
    const event = hostedWedding();
    addEntry(ctx, gift(event.id, { newPersonName: 'A', subFunction: 'haldi', amount: 501 }));
    addEntry(ctx, gift(event.id, { newPersonName: 'B', subFunction: 'reception', amount: 2100 }));
    expect(getEventEntries(db, event.id, 'haldi').map((e) => e.personName)).toEqual(['A']);
    expect(getEventEntries(db, event.id)).toHaveLength(2);
  });
});

describe('write path is atomic', () => {
  it('rolls back everything when a save fails part-way', () => {
    const event = hostedWedding();
    const before = outboxRows().length;
    expect(() =>
      addEntry(ctx, gift(event.id, { personId: randomUUID(), relation: 'friend' })),
    ).toThrow(LedgerError);
    expect(outboxRows().length).toBe(before);
    expect(db.select().from(schema.entries).all()).toHaveLength(0);
  });

  it('rejects invalid input before touching the database', () => {
    const event = hostedWedding();
    expect(() => addEntry(ctx, gift(event.id, { newPersonName: 'X', amount: 0 }))).toThrow('Enter an amount');
    expect(() => addEntry(ctx, gift(event.id, { newPersonName: 'X', amount: 10.5 }))).toThrow(LedgerError);
    expect(() => addEntry(ctx, gift(event.id, { newPersonName: '' }))).toThrow('Pick a person or type a new name');
    expect(() => addEntry(ctx, gift(randomUUID(), { newPersonName: 'X' }))).toThrow('no longer in the ledger');
  });

  it('accepts an item gift without an amount', () => {
    const event = hostedWedding();
    const res = addEntry(ctx, gift(event.id, { newPersonName: 'Tiwari parivaar', mode: 'item', amount: 0, itemNote: 'Silver dinner set' }));
    expect(res.entry.itemNote).toBe('Silver dinner set');
    expect(getEventSummary(db, ctx.familyId, event.id)!.received).toBe(0);
  });
});

describe('giving mode and people', () => {
  it('creates the host person for an attended event and logs what we gave', () => {
    const event = createEvent(ctx, {
      title: 'Sakshi weds Rohit',
      type: 'wedding',
      role: 'attended',
      hostPersonId: null,
      hostName: 'Verma parivaar',
      date: '2026-12-12',
      subFunctions: [],
      venue: null,
    });
    expect(event.hostPersonId).not.toBeNull();
    addEntry(ctx, gift(event.id, { personId: event.hostPersonId, direction: 'given', amount: 2100 }));

    const summary = getEventSummary(db, ctx.familyId, event.id)!;
    expect(summary.hostName).toBe('Verma parivaar');
    expect(summary.given).toBe(2100);

    const verma = getPeopleSummaries(db, ctx.familyId).find((p) => p.id === event.hostPersonId)!;
    expect(verma.given).toBe(2100);
    expect(verma.received).toBe(0);
    expect(getPersonHistory(db, verma.id)[0]!.eventTitle).toBe('Sakshi weds Rohit');
    // The upcoming card ignores gifts already logged at the event it is showing.
    expect(getLastExchange(db, verma.id)?.eventTitle).toBe('Sakshi weds Rohit');
    expect(getLastExchange(db, verma.id, event.id)).toBeUndefined();
  });

  it('updates a person’s relation from Quick Entry and queues the change', () => {
    const event = hostedWedding();
    const first = addEntry(ctx, gift(event.id, { newPersonName: 'Ramesh Sharma' }));
    const second = addEntry(ctx, gift(event.id, { personId: first.person.id, relation: 'mama_ji' }));
    expect(second.person.relation).toBe('mama_ji');
    const personChanges = outboxRows().filter((r) => r.recordId === first.person.id);
    expect(personChanges).toHaveLength(2);
    expect(JSON.parse(personChanges[1]!.payload).relation).toBe('mama_ji');
  });

  it('searches names ignoring case and punctuation, in Hindi too, with the last exchange', () => {
    const event = hostedWedding();
    addEntry(ctx, gift(event.id, { newPersonName: 'Ramesh Sharma', amount: 2100 }));
    addEntry(ctx, gift(event.id, { newPersonName: 'रमेश शर्मा', amount: 1100 }));
    addEntry(ctx, gift(event.id, { newPersonName: 'Sunita Mishra' }));

    // Since week 2, both spellings of the same name match from either script.
    const hits = searchPeople(db, ctx.familyId, 'RAME');
    expect(hits.map((h) => h.displayName).sort()).toEqual(['Ramesh Sharma', 'रमेश शर्मा'].sort());
    const english = hits.find((h) => h.displayName === 'Ramesh Sharma')!;
    expect(english.lastAmount).toBe(2100);
    expect(english.lastDirection).toBe('received');

    expect(searchPeople(db, ctx.familyId, 'रमेश').map((h) => h.displayName).sort()).toEqual(['Ramesh Sharma', 'रमेश शर्मा'].sort());
    expect(searchPeople(db, ctx.familyId, 'Sunita')[0]!.displayName).toBe('Sunita Mishra');
    expect(searchPeople(db, ctx.familyId, '100%')).toEqual([]);
    expect(searchPeople(db, ctx.familyId, '  ')).toEqual([]);
  });
});

describe('deletes', () => {
  it('soft-deletes, drops the entry from totals and queues a delete', () => {
    const event = hostedWedding();
    const a = addEntry(ctx, gift(event.id, { newPersonName: 'A', amount: 501 }));
    addEntry(ctx, gift(event.id, { newPersonName: 'B', amount: 2100 }));
    deleteEntry(ctx, a.entry.id);
    deleteEntry(ctx, a.entry.id); // second delete is a no-op

    const summary = getEventSummary(db, ctx.familyId, event.id)!;
    expect(summary.received).toBe(2100);
    expect(summary.entryCount).toBe(1);

    const row = db.select().from(schema.entries).all().find((e) => e.id === a.entry.id)!;
    expect(row.deletedAt).not.toBeNull();
    const deletes = outboxRows().filter((r) => r.op === 'delete');
    expect(deletes).toHaveLength(1);
    expect(deletes[0]!.recordId).toBe(a.entry.id);
  });
});

describe('Week 2: Hindi and English names', () => {
  it('stores the match key and finds people across scripts and spellings', () => {
    const event = hostedWedding();
    addEntry(ctx, gift(event.id, { newPersonName: 'Shri Ramesh Sharma ji', newPersonCity: 'Indore', amount: 2100 }));
    addEntry(ctx, gift(event.id, { newPersonName: 'कमला बुआ', amount: 5100 }));
    addEntry(ctx, gift(event.id, { newPersonName: 'Sunita Mishra', amount: 1100 }));

    const ramesh = searchPeople(db, ctx.familyId, 'रमेश शर्मा')[0]!;
    expect(ramesh.displayName).toBe('Shri Ramesh Sharma ji');
    expect(ramesh.nameLatin).toBe('ramesh sharm');
    expect(ramesh.city).toBe('Indore');
    expect(ramesh.lastAmount).toBe(2100);
    expect(searchPeople(db, ctx.familyId, 'Kamla')[0]!.displayName).toBe('कमला बुआ');
    expect(searchPeople(db, ctx.familyId, 'sunitaa mishra')[0]!.displayName).toBe('Sunita Mishra');
    expect(findSameName(db, ctx.familyId, 'Ramesh Sharmaa').map((p) => p.id)).toEqual([ramesh.id]);
  });

  it('re-keys people stored with an older match key, once, without queuing sync changes', () => {
    const event = hostedWedding();
    const { person } = addEntry(ctx, gift(event.id, { newPersonName: 'रमेश शर्मा' }));
    db.update(schema.people).set({ nameLatin: 'रमेश शर्मा' }).where(eq(schema.people.id, person.id)).run();
    db.delete(schema.appSettings).where(eq(schema.appSettings.key, 'matchKeyVersion')).run();
    const before = outboxRows().length;

    expect(refreshMatchKeys(db)).toBe(1);
    expect(refreshMatchKeys(db)).toBe(0);
    expect(getPeopleIndex(db, ctx.familyId)[0]!.nameLatin).toBe(matchKey('Ramesh Sharma'));
    expect(outboxRows().length).toBe(before);
  });

  it('edits a person, recomputes the key and queues the change', () => {
    const event = hostedWedding();
    const { person } = addEntry(ctx, gift(event.id, { newPersonName: 'Ramesh' }));
    const edited = updatePerson(ctx, person.id, { displayName: 'Ramesh Sharma', relation: 'mama_ji', city: 'Indore', phone: null });
    expect(edited.nameLatin).toBe('ramesh sharm');
    expect(searchPeople(db, ctx.familyId, 'sharma')[0]!.city).toBe('Indore');
    expect(JSON.parse(outboxRows().at(-1)!.payload).displayName).toBe('Ramesh Sharma');
    expect(() => updatePerson(ctx, person.id, { displayName: ' ', relation: null, city: null, phone: null })).toThrow('Enter a name');
  });

  it('lists upcoming functions hosted by a person', () => {
    const upcoming = createEvent(ctx, {
      title: 'Sakshi weds Rohit', type: 'wedding', role: 'attended', hostPersonId: null,
      hostName: 'Verma parivaar', date: '2026-12-12', subFunctions: [], venue: null,
    });
    createEvent(ctx, {
      title: 'Old griha pravesh', type: 'griha_pravesh', role: 'attended', hostPersonId: upcoming.hostPersonId,
      hostName: null, date: '2024-01-23', subFunctions: [], venue: null,
    });
    const list = getUpcomingForPerson(db, ctx.familyId, upcoming.hostPersonId!, '2026-10-29');
    expect(list.map((e) => e.title)).toEqual(['Sakshi weds Rohit']);
  });
});

describe('Week 2: cash reconciliation', () => {
  it('compares counted cash with logged cash and keeps every count', () => {
    const event = hostedWedding();
    addEntry(ctx, gift(event.id, { newPersonName: 'A', amount: 11000 }));
    addEntry(ctx, gift(event.id, { newPersonName: 'B', amount: 2100 }));
    addEntry(ctx, gift(event.id, { newPersonName: 'C', amount: 501, mode: 'upi' }));
    addEntry(ctx, gift(event.id, { newPersonName: 'D', amount: 0, mode: 'item', itemNote: 'Silver set' }));
    const d = addEntry(ctx, gift(event.id, { newPersonName: 'E', amount: 5100 }));
    deleteEntry(ctx, d.entry.id);

    expect(getCashSummary(db, event.id)).toEqual({ loggedCash: 13100, cashEntries: 2 });
    expect(getCashEntries(db, event.id).map((e) => e.amount)).toEqual([11000, 2100]);

    addCashCount(ctx, { eventId: event.id, countedAmount: 11000 });
    addCashCount(ctx, { eventId: event.id, countedAmount: 13100 });
    const counts = getCashCounts(db, event.id);
    expect(counts.map((c) => c.countedAmount)).toEqual([13100, 11000]);
    expect(outboxRows().filter((r) => r.tableName === 'cashCounts')).toHaveLength(2);
    expect(() => addCashCount(ctx, { eventId: event.id, countedAmount: 10.5 })).toThrow(LedgerError);
  });
});

describe('Week 2: fixing an entry', () => {
  it('updates amount, mode and person in place and queues the change', () => {
    const event = hostedWedding();
    const { entry, person } = addEntry(ctx, gift(event.id, { newPersonName: 'Anil Khare', amount: 2100 }));
    const before = getEntry(db, ctx.familyId, entry.id)!;
    updateEntry(ctx, entry.id, gift(event.id, { personId: person.id, amount: 1100, mode: 'upi', note: 'typo fixed' }));

    const after = getEntry(db, ctx.familyId, entry.id)!;
    expect(after.amount).toBe(1100);
    expect(after.mode).toBe('upi');
    expect(after.createdAt).toBe(before.createdAt);
    expect(after.updatedAt).toBeGreaterThan(before.updatedAt);
    expect(getEventSummary(db, ctx.familyId, event.id)!.received).toBe(1100);
    expect(getEventSummary(db, ctx.familyId, event.id)!.entryCount).toBe(1);
    const changes = outboxRows().filter((r) => r.recordId === entry.id);
    expect(changes).toHaveLength(2);
    expect(JSON.parse(changes[1]!.payload).amount).toBe(1100);

    deleteEntry(ctx, entry.id);
    expect(() => updateEntry(ctx, entry.id, gift(event.id, { personId: person.id }))).toThrow('no longer in the ledger');
  });
});

describe('Week 3: accounts on this phone', () => {
  it('claims ledgers made before sign-in for the first account, and scopes ledgers per account', () => {
    const fresh = freshDb();
    const before = createLocalFamily(fresh, 'Dubey parivaar', randomUUID);
    expect(loadLocalSetup(fresh, randomUUID, null).family).toBeNull();

    const chinmay = loadLocalSetup(fresh, randomUUID, 'user-chinmay');
    expect(chinmay.family).toEqual({ id: before.id, name: 'Dubey parivaar', role: 'owner', registered: false });

    // Someone else signs in on the same phone: they don't see Chinmay's ledger.
    expect(loadLocalSetup(fresh, randomUUID, 'user-other').family).toBeNull();
    expect(listLocalFamilies(fresh, 'user-other')).toEqual([]);
    expect(unregisteredFamilies(fresh, 'user-chinmay').map((f) => f.id)).toEqual([before.id]);
    markFamilyRegistered(fresh, before.id, 1);
    expect(unregisteredFamilies(fresh, 'user-chinmay')).toEqual([]);
  });

  it('adds a joined ledger, follows server role changes, and forgets ledgers the account was removed from', () => {
    const fresh = freshDb();
    const mine = createLocalFamily(fresh, 'Dubey parivaar', randomUUID, 'u1');
    markFamilyRegistered(fresh, mine.id, 1);
    const joined = addJoinedFamily(fresh, { id: randomUUID(), name: 'Verma parivaar', role: 'editor' }, 'u1', 2);
    expect(loadLocalSetup(fresh, randomUUID, 'u1').family?.id).toBe(joined.id);

    // A record in the joined ledger, plus one queued change for it.
    const jctx = { db: fresh, familyId: joined.id, deviceId: 'd', userId: 'u1', role: 'editor' as const, newId: randomUUID, now: () => ++clock };
    createPerson(jctx, { displayName: 'Sakshi' });

    applyServerFamilies(fresh, 'u1', [
      { id: mine.id, name: 'Dubey family', role: 'owner' },
      { id: joined.id, name: 'Verma parivaar', role: 'viewer' },
    ], 3);
    expect(listLocalFamilies(fresh, 'u1').map((f) => [f.name, f.role])).toEqual([
      ['Dubey family', 'owner'],
      ['Verma parivaar', 'viewer'],
    ]);

    // Removed from the Verma ledger: its local data goes too.
    applyServerFamilies(fresh, 'u1', [{ id: mine.id, name: 'Dubey family', role: 'owner' }], 4);
    expect(listLocalFamilies(fresh, 'u1').map((f) => f.id)).toEqual([mine.id]);
    expect(fresh.select().from(schema.people).all()).toHaveLength(0);
    expect(fresh.select().from(schema.outbox).all()).toHaveLength(0);
    expect(loadLocalSetup(fresh, randomUUID, 'u1').family?.id).toBe(mine.id);
  });

  it('keeps an unregistered ledger even if the server does not know it yet', () => {
    const fresh = freshDb();
    const offline = createLocalFamily(fresh, 'Made offline', randomUUID, 'u1');
    applyServerFamilies(fresh, 'u1', [], 1);
    expect(listLocalFamilies(fresh, 'u1').map((f) => f.id)).toEqual([offline.id]);
  });

  it('refuses writes from a viewer', () => {
    const viewer = { ...ctx, role: 'viewer' as const };
    const event = hostedWedding();
    expect(() => addEntry(viewer, gift(event.id, { newPersonName: 'X' }))).toThrow(LedgerError);
    expect(() => createPerson(viewer, { displayName: 'X' })).toThrow('Viewers');
    expect(getEventSummary(db, ctx.familyId, event.id)!.entryCount).toBe(0);
  });
});
