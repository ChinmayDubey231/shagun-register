import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import {
  createEventInputSchema,
  hasDevanagari,
  quickEntryInputSchema,
  simpleNameKey,
  type SyncedTable,
} from '@shagun/shared';
import * as schema from './schema';
import { appSettings, entries, events, outbox, people, syncMeta } from './schema';
import type { EntryRow, EventRow, PersonRow } from './schema';

/**
 * Any synchronous Drizzle SQLite database with this schema. On the phone that is
 * expo-sqlite; in tests it is better-sqlite3 running the same migration.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LedgerDb = BaseSQLiteDatabase<'sync', any, typeof schema>;
type Tx = Parameters<Parameters<LedgerDb['transaction']>[0]>[0];
type Writer = LedgerDb | Tx;

export interface LedgerContext {
  db: LedgerDb;
  familyId: string;
  deviceId: string;
  /** "local" until Google sign-in arrives in week 3. */
  userId: string;
  newId: () => string;
  now: () => number;
}

export class LedgerError extends Error {
  constructor(
    readonly code: 'NOT_FOUND' | 'VALIDATION',
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = 'LedgerError';
  }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const SETTING_DEVICE_ID = 'deviceId';
const SETTING_FAMILY_ID = 'currentFamilyId';

function getSetting(db: Writer, key: string): string | undefined {
  return db.select().from(appSettings).where(eq(appSettings.key, key)).get()?.value;
}

function setSetting(db: Writer, key: string, value: string) {
  db.insert(appSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value } })
    .run();
}

export interface LocalSetup {
  deviceId: string;
  family: { id: string; name: string } | null;
}

/** Reads (and on first launch creates) the device id, and returns the current family ledger if there is one. */
export function loadLocalSetup(db: LedgerDb, newId: () => string): LocalSetup {
  let deviceId = getSetting(db, SETTING_DEVICE_ID);
  if (!deviceId) {
    deviceId = newId();
    setSetting(db, SETTING_DEVICE_ID, deviceId);
  }
  const familyId = getSetting(db, SETTING_FAMILY_ID);
  if (!familyId) return { deviceId, family: null };
  const meta = db.select().from(syncMeta).where(eq(syncMeta.familyId, familyId)).get();
  return { deviceId, family: meta ? { id: meta.familyId, name: meta.familyName } : null };
}

/**
 * Creates a family ledger on this phone and makes it current. The id is a UUID made here,
 * so in week 3 `POST /families` can register the same id on the server.
 */
export function createLocalFamily(db: LedgerDb, name: string, newId: () => string) {
  const trimmed = name.trim();
  if (!trimmed) throw new LedgerError('VALIDATION', 'Give the ledger a name', 'name');
  const id = newId();
  db.transaction((tx) => {
    tx.insert(syncMeta).values({ familyId: id, familyName: trimmed, lastPulledSeq: 0 }).run();
    setSetting(tx, SETTING_FAMILY_ID, id);
  });
  return { id, name: trimmed };
}

// ---------------------------------------------------------------------------
// Write path: every change writes the record and an outbox row in one transaction.
// ---------------------------------------------------------------------------

function queue(tx: Writer, table: SyncedTable, record: { id: string }, op: 'upsert' | 'delete', at: number) {
  tx.insert(outbox)
    .values({ tableName: table, recordId: record.id, op, payload: JSON.stringify(record), createdAt: at })
    .run();
}

function insertPerson(
  tx: Writer,
  ctx: LedgerContext,
  input: { displayName: string; relation?: string | null; city?: string | null },
): PersonRow {
  const displayName = input.displayName.trim().replace(/\s+/g, ' ');
  const at = ctx.now();
  const row: PersonRow = {
    id: ctx.newId(),
    familyId: ctx.familyId,
    updatedAt: at,
    deletedAt: null,
    seq: null,
    displayName,
    nameLatin: simpleNameKey(displayName),
    nameDevanagari: hasDevanagari(displayName) ? displayName : null,
    relation: input.relation?.trim() || null,
    city: input.city?.trim() || null,
    phone: null,
    mergedInto: null,
  };
  tx.insert(people).values(row).run();
  queue(tx, 'people', row, 'upsert', at);
  return row;
}

function findPerson(tx: Writer, familyId: string, id: string) {
  return tx
    .select()
    .from(people)
    .where(and(eq(people.id, id), eq(people.familyId, familyId), isNull(people.deletedAt)))
    .get();
}

export function createPerson(
  ctx: LedgerContext,
  input: { displayName: string; relation?: string | null; city?: string | null },
): PersonRow {
  if (!input.displayName.trim()) throw new LedgerError('VALIDATION', 'Enter a name', 'displayName');
  return ctx.db.transaction((tx) => insertPerson(tx, ctx, input));
}

export function createEvent(ctx: LedgerContext, raw: unknown): EventRow {
  const parsed = createEventInputSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new LedgerError('VALIDATION', issue?.message ?? 'Check the form', String(issue?.path[0] ?? ''));
  }
  const input = parsed.data;
  return ctx.db.transaction((tx) => {
    let hostPersonId: string | null = null;
    if (input.role === 'attended') {
      if (input.hostPersonId) {
        if (!findPerson(tx, ctx.familyId, input.hostPersonId)) {
          throw new LedgerError('NOT_FOUND', 'That person is no longer in the ledger', 'hostName');
        }
        hostPersonId = input.hostPersonId;
      } else {
        hostPersonId = insertPerson(tx, ctx, { displayName: input.hostName ?? '' }).id;
      }
    }
    const at = ctx.now();
    const row: EventRow = {
      id: ctx.newId(),
      familyId: ctx.familyId,
      updatedAt: at,
      deletedAt: null,
      seq: null,
      title: input.title,
      type: input.type,
      role: input.role,
      hostPersonId,
      date: input.date,
      subFunctions: input.subFunctions,
      venue: input.venue?.trim() || null,
    };
    tx.insert(events).values(row).run();
    queue(tx, 'events', row, 'upsert', at);
    return row;
  });
}

export interface AddEntryResult {
  entry: EntryRow;
  person: PersonRow;
  createdPerson: boolean;
}

/** Quick Entry's save. Creates the person if new, updates their relation if it changed, logs the gift. */
export function addEntry(ctx: LedgerContext, raw: unknown): AddEntryResult {
  const parsed = quickEntryInputSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new LedgerError('VALIDATION', issue?.message ?? 'Check the form', String(issue?.path[0] ?? ''));
  }
  const input = parsed.data;

  return ctx.db.transaction((tx) => {
    const event = tx
      .select({ id: events.id })
      .from(events)
      .where(and(eq(events.id, input.eventId), eq(events.familyId, ctx.familyId), isNull(events.deletedAt)))
      .get();
    if (!event) throw new LedgerError('NOT_FOUND', 'This event is no longer in the ledger', 'eventId');

    let person: PersonRow;
    let createdPerson = false;
    if (input.personId) {
      const existing = findPerson(tx, ctx.familyId, input.personId);
      if (!existing) throw new LedgerError('NOT_FOUND', 'That person is no longer in the ledger', 'personId');
      person = existing;
      const relation = input.relation?.trim() || null;
      if (relation && relation !== person.relation) {
        person = { ...person, relation, updatedAt: ctx.now() };
        tx.update(people).set({ relation, updatedAt: person.updatedAt }).where(eq(people.id, person.id)).run();
        queue(tx, 'people', person, 'upsert', person.updatedAt);
      }
    } else {
      person = insertPerson(tx, ctx, { displayName: input.newPersonName ?? '', relation: input.relation });
      createdPerson = true;
    }

    const at = ctx.now();
    const entry: EntryRow = {
      id: ctx.newId(),
      familyId: ctx.familyId,
      updatedAt: at,
      deletedAt: null,
      seq: null,
      eventId: input.eventId,
      personId: person.id,
      direction: input.direction,
      amount: input.amount,
      mode: input.mode,
      itemNote: input.itemNote?.trim() || null,
      subFunction: input.subFunction || null,
      note: input.note?.trim() || null,
      photoKey: null,
      createdBy: ctx.userId,
      deviceId: ctx.deviceId,
      createdAt: at,
    };
    tx.insert(entries).values(entry).run();
    queue(tx, 'entries', entry, 'upsert', at);
    return { entry, person, createdPerson };
  });
}

/** Soft delete: the row stays with deletedAt set, so the delete can sync to other phones. */
export function deleteEntry(ctx: LedgerContext, entryId: string) {
  ctx.db.transaction((tx) => {
    const row = tx
      .select()
      .from(entries)
      .where(and(eq(entries.id, entryId), eq(entries.familyId, ctx.familyId)))
      .get();
    if (!row || row.deletedAt !== null) return;
    const at = ctx.now();
    const deleted = { ...row, deletedAt: at, updatedAt: at };
    tx.update(entries).set({ deletedAt: at, updatedAt: at }).where(eq(entries.id, entryId)).run();
    queue(tx, 'entries', deleted, 'delete', at);
  });
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

const liveEntryJoin = and(eq(entries.eventId, events.id), isNull(entries.deletedAt));

export interface EventSummary extends EventRow {
  hostName: string | null;
  received: number;
  given: number;
  entryCount: number;
}

export function getEventSummaries(db: LedgerDb, familyId: string): EventSummary[] {
  const host = db.select({ id: people.id, name: people.displayName }).from(people).as('host');
  return db
    .select({
      ...eventColumns(),
      hostName: sql<string | null>`${host.name}`,
      received: sql<number>`coalesce(sum(case when ${entries.direction} = 'received' then ${entries.amount} end), 0)`,
      given: sql<number>`coalesce(sum(case when ${entries.direction} = 'given' then ${entries.amount} end), 0)`,
      entryCount: sql<number>`count(${entries.id})`,
    })
    .from(events)
    .leftJoin(entries, liveEntryJoin)
    .leftJoin(host, eq(host.id, events.hostPersonId))
    .where(and(eq(events.familyId, familyId), isNull(events.deletedAt)))
    .groupBy(events.id)
    .orderBy(desc(events.date), desc(events.updatedAt))
    .all();
}

export function getEventSummary(db: LedgerDb, familyId: string, eventId: string): EventSummary | undefined {
  return getEventSummaries(db, familyId).find((e) => e.id === eventId);
}

export interface ModeTotal {
  mode: EntryRow['mode'];
  total: number;
  count: number;
}

export function getEventModeTotals(db: LedgerDb, eventId: string): ModeTotal[] {
  return db
    .select({
      mode: entries.mode,
      total: sql<number>`coalesce(sum(${entries.amount}), 0)`,
      count: sql<number>`count(*)`,
    })
    .from(entries)
    .where(and(eq(entries.eventId, eventId), isNull(entries.deletedAt)))
    .groupBy(entries.mode)
    .all();
}

export interface EntryListItem {
  id: string;
  personId: string;
  personName: string;
  relation: string | null;
  city: string | null;
  direction: EntryRow['direction'];
  amount: number;
  mode: EntryRow['mode'];
  itemNote: string | null;
  subFunction: string | null;
  createdAt: number;
  pending: boolean;
}

const pendingFlag = sql<number>`exists(select 1 from ${outbox} where ${outbox.recordId} = ${entries.id})`;

function entryListColumns() {
  return {
    id: entries.id,
    personId: entries.personId,
    personName: people.displayName,
    relation: people.relation,
    city: people.city,
    direction: entries.direction,
    amount: entries.amount,
    mode: entries.mode,
    itemNote: entries.itemNote,
    subFunction: entries.subFunction,
    createdAt: entries.createdAt,
    pending: pendingFlag,
  };
}

export function getEventEntries(db: LedgerDb, eventId: string, subFunction?: string | null): EntryListItem[] {
  return db
    .select(entryListColumns())
    .from(entries)
    .innerJoin(people, eq(people.id, entries.personId))
    .where(
      and(
        eq(entries.eventId, eventId),
        isNull(entries.deletedAt),
        subFunction ? eq(entries.subFunction, subFunction) : undefined,
      ),
    )
    .orderBy(desc(entries.createdAt))
    .all()
    .map((r) => ({ ...r, pending: Boolean(r.pending) }));
}

export interface PersonMatch extends PersonRow {
  lastAmount: number | null;
  lastDirection: EntryRow['direction'] | null;
}

/** Name search for Quick Entry. Week 2 swaps this for Fuse.js on the full match key. */
export function searchPeople(db: LedgerDb, familyId: string, query: string, limit = 5): PersonMatch[] {
  const key = simpleNameKey(query);
  if (!key) return [];
  const pattern = `%${key.replace(/[%_\\]/g, (c) => '\\' + c)}%`;
  const rows = db
    .select()
    .from(people)
    .where(
      and(
        eq(people.familyId, familyId),
        isNull(people.deletedAt),
        isNull(people.mergedInto),
        or(
          sql`${people.nameLatin} like ${pattern} escape '\\'`,
          sql`lower(${people.displayName}) like ${pattern} escape '\\'`,
        ),
      ),
    )
    .orderBy(people.displayName)
    .limit(limit)
    .all();
  return rows.map((p) => {
    const last = getLastExchange(db, p.id);
    return { ...p, lastAmount: last?.amount ?? null, lastDirection: last?.direction ?? null };
  });
}

export interface LastExchange {
  amount: number;
  direction: EntryRow['direction'];
  mode: EntryRow['mode'];
  eventTitle: string;
  eventDate: string;
}

/** Most recent gift either way with this person, optionally ignoring one event (e.g. the upcoming one being shown). */
export function getLastExchange(db: LedgerDb, personId: string, excludeEventId?: string): LastExchange | undefined {
  return db
    .select({
      amount: entries.amount,
      direction: entries.direction,
      mode: entries.mode,
      eventTitle: events.title,
      eventDate: events.date,
    })
    .from(entries)
    .innerJoin(events, eq(events.id, entries.eventId))
    .where(
      and(
        eq(entries.personId, personId),
        isNull(entries.deletedAt),
        excludeEventId ? sql`${entries.eventId} <> ${excludeEventId}` : undefined,
      ),
    )
    .orderBy(desc(events.date), desc(entries.createdAt))
    .limit(1)
    .get();
}

export interface PersonSummary extends PersonRow {
  given: number;
  received: number;
  exchanges: number;
}

export function getPeopleSummaries(db: LedgerDb, familyId: string): PersonSummary[] {
  return db
    .select({
      ...personColumns(),
      given: sql<number>`coalesce(sum(case when ${entries.direction} = 'given' then ${entries.amount} end), 0)`,
      received: sql<number>`coalesce(sum(case when ${entries.direction} = 'received' then ${entries.amount} end), 0)`,
      exchanges: sql<number>`count(${entries.id})`,
    })
    .from(people)
    .leftJoin(entries, and(eq(entries.personId, people.id), isNull(entries.deletedAt)))
    .where(and(eq(people.familyId, familyId), isNull(people.deletedAt), isNull(people.mergedInto)))
    .groupBy(people.id)
    .orderBy(people.displayName)
    .all();
}

export function getPerson(db: LedgerDb, familyId: string, personId: string) {
  return findPerson(db, familyId, personId);
}

export interface PersonHistoryItem {
  id: string;
  eventId: string;
  eventTitle: string;
  eventDate: string;
  eventRole: EventRow['role'];
  direction: EntryRow['direction'];
  amount: number;
  mode: EntryRow['mode'];
  itemNote: string | null;
  subFunction: string | null;
}

export function getPersonHistory(db: LedgerDb, personId: string): PersonHistoryItem[] {
  return db
    .select({
      id: entries.id,
      eventId: events.id,
      eventTitle: events.title,
      eventDate: events.date,
      eventRole: events.role,
      direction: entries.direction,
      amount: entries.amount,
      mode: entries.mode,
      itemNote: entries.itemNote,
      subFunction: entries.subFunction,
    })
    .from(entries)
    .innerJoin(events, eq(events.id, entries.eventId))
    .where(and(eq(entries.personId, personId), isNull(entries.deletedAt), isNull(events.deletedAt)))
    .orderBy(desc(events.date), desc(entries.createdAt))
    .all();
}

export function countPendingChanges(db: LedgerDb): number {
  return db.select({ n: sql<number>`count(*)` }).from(outbox).get()?.n ?? 0;
}

function eventColumns() {
  return {
    id: events.id,
    familyId: events.familyId,
    updatedAt: events.updatedAt,
    deletedAt: events.deletedAt,
    seq: events.seq,
    title: events.title,
    type: events.type,
    role: events.role,
    hostPersonId: events.hostPersonId,
    date: events.date,
    subFunctions: events.subFunctions,
    venue: events.venue,
  };
}

function personColumns() {
  return {
    id: people.id,
    familyId: people.familyId,
    updatedAt: people.updatedAt,
    deletedAt: people.deletedAt,
    seq: people.seq,
    displayName: people.displayName,
    nameLatin: people.nameLatin,
    nameDevanagari: people.nameDevanagari,
    relation: people.relation,
    city: people.city,
    phone: people.phone,
    mergedInto: people.mergedInto,
  };
}
