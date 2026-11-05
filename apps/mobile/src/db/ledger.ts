import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import {
  cashCountInputSchema,
  createEventInputSchema,
  createPersonSearch,
  exactKeyMatches,
  findDuplicatePairs,
  hasDevanagari,
  LANGUAGES,
  matchKey,
  MATCH_KEY_VERSION,
  pairKey,
  personEditSchema,
  quickEntryInputSchema,
  type DuplicatePair,
  type FamilySummary,
  type Language,
  type MemberRole,
  type SyncedTable,
} from '@shagun/shared';
import * as schema from './schema';
import { appSettings, cashCounts, entries, events, outbox, people, syncMeta, type SyncMetaRow } from './schema';
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
  /** The signed-in account's id ("local" in tests and before sign-in). Stored as createdBy. */
  userId: string;
  /** Viewers can read but not write. Defaults to owner. */
  role?: MemberRole;
  newId: () => string;
  now: () => number;
}

/** First zod issue as a LedgerError. Structural type: the zod instance lives in @shagun/shared. */
function validationError(error: { issues: readonly { message: string; path: readonly PropertyKey[] }[] }): LedgerError {
  const issue = error.issues[0];
  return new LedgerError('VALIDATION', issue?.message ?? 'Check the form', String(issue?.path[0] ?? ''));
}

export class LedgerError extends Error {
  constructor(
    readonly code: 'NOT_FOUND' | 'VALIDATION' | 'FORBIDDEN',
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
const SETTING_MATCH_KEY_VERSION = 'matchKeyVersion';

function getSetting(db: Writer, key: string): string | undefined {
  return db.select().from(appSettings).where(eq(appSettings.key, key)).get()?.value;
}

function setSetting(db: Writer, key: string, value: string) {
  db.insert(appSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value } })
    .run();
}

export interface LocalFamily {
  id: string;
  name: string;
  role: MemberRole;
  /** False until the server has accepted this ledger (POST /families). */
  registered: boolean;
}

export interface LocalSetup {
  deviceId: string;
  family: LocalFamily | null;
}

const toLocalFamily = (m: SyncMetaRow): LocalFamily => ({
  id: m.familyId,
  name: m.familyName,
  role: m.role,
  registered: m.registeredAt !== null,
});

/**
 * Reads (and on first launch creates) the device id and returns the current ledger for
 * this account. Ledgers made before sign-in existed are claimed by the first account.
 */
export function loadLocalSetup(db: LedgerDb, newId: () => string, userId: string | null = null): LocalSetup {
  let deviceId = getSetting(db, SETTING_DEVICE_ID);
  if (!deviceId) {
    deviceId = newId();
    setSetting(db, SETTING_DEVICE_ID, deviceId);
  }
  refreshMatchKeys(db);
  if (!userId) return { deviceId, family: null };
  db.update(syncMeta).set({ userId }).where(isNull(syncMeta.userId)).run();
  const mine = listLocalFamilies(db, userId);
  const currentId = getSetting(db, SETTING_FAMILY_ID);
  const current = mine.find((f) => f.id === currentId) ?? mine[0] ?? null;
  if (current && current.id !== currentId) setSetting(db, SETTING_FAMILY_ID, current.id);
  return { deviceId, family: current };
}

/** Ledgers on this phone that belong to the signed-in account. */
export function listLocalFamilies(db: LedgerDb, userId: string): LocalFamily[] {
  return db.select().from(syncMeta).where(eq(syncMeta.userId, userId)).orderBy(syncMeta.familyName).all().map(toLocalFamily);
}

export function setCurrentFamily(db: LedgerDb, familyId: string) {
  setSetting(db, SETTING_FAMILY_ID, familyId);
}

const SETTING_LANGUAGE = 'language';
const SETTING_LANGUAGE_PENDING = 'languagePending';
const SETTING_APP_LOCK = 'appLock';

export interface PhonePreferences {
  /** Null until a language is chosen on this phone or an account brings one. */
  language: Language | null;
  /** Chosen on this phone and not yet saved to the account. */
  languagePending: boolean;
  appLock: boolean;
}

/** Language and app lock. They belong to the phone, so they outlast sign-out. */
export function getPreferences(db: LedgerDb): PhonePreferences {
  const language = getSetting(db, SETTING_LANGUAGE);
  return {
    language: (LANGUAGES as readonly string[]).includes(language ?? '') ? (language as Language) : null,
    languagePending: getSetting(db, SETTING_LANGUAGE_PENDING) === '1',
    appLock: getSetting(db, SETTING_APP_LOCK) === '1',
  };
}

/** `pending`: chosen here, so the account should hear of it; false when the account sent it. */
export function setLanguagePreference(db: LedgerDb, language: Language, pending: boolean) {
  db.transaction((tx) => {
    setSetting(tx, SETTING_LANGUAGE, language);
    setSetting(tx, SETTING_LANGUAGE_PENDING, pending ? '1' : '0');
  });
}

/** The account has this language now. A newer choice made meanwhile stays pending. */
export function markLanguageSaved(db: LedgerDb, language: Language) {
  if (getSetting(db, SETTING_LANGUAGE) === language) setSetting(db, SETTING_LANGUAGE_PENDING, '0');
}

export function setAppLockPreference(db: LedgerDb, on: boolean) {
  setSetting(db, SETTING_APP_LOCK, on ? '1' : '0');
}

/**
 * Recomputes every person's match key when matchKey() has changed since they were stored.
 * The key is derived data (the server computes its own), so this does not queue sync changes.
 */
export function refreshMatchKeys(db: LedgerDb): number {
  if (getSetting(db, SETTING_MATCH_KEY_VERSION) === String(MATCH_KEY_VERSION)) return 0;
  let changed = 0;
  db.transaction((tx) => {
    for (const p of tx.select({ id: people.id, displayName: people.displayName, nameLatin: people.nameLatin }).from(people).all()) {
      const key = matchKey(p.displayName);
      if (key !== p.nameLatin) {
        tx.update(people).set({ nameLatin: key }).where(eq(people.id, p.id)).run();
        changed++;
      }
    }
    setSetting(tx, SETTING_MATCH_KEY_VERSION, String(MATCH_KEY_VERSION));
  });
  return changed;
}

/**
 * Creates a family ledger on this phone and makes it current. The id is a UUID made here;
 * `POST /families` registers the same id when the phone is online (see registerPendingFamilies).
 */
export function createLocalFamily(db: LedgerDb, name: string, newId: () => string, userId: string | null = null): LocalFamily {
  const trimmed = name.trim();
  if (!trimmed) throw new LedgerError('VALIDATION', 'Give the ledger a name', 'name');
  const id = newId();
  db.transaction((tx) => {
    tx.insert(syncMeta).values({ familyId: id, familyName: trimmed, lastPulledSeq: 0, userId, role: 'owner' }).run();
    setSetting(tx, SETTING_FAMILY_ID, id);
  });
  return { id, name: trimmed, role: 'owner', registered: false };
}

/** Ledgers this account owns that the server hasn't accepted yet. */
export function unregisteredFamilies(db: LedgerDb, userId: string): LocalFamily[] {
  return db
    .select()
    .from(syncMeta)
    .where(and(eq(syncMeta.userId, userId), isNull(syncMeta.registeredAt)))
    .all()
    .map(toLocalFamily);
}

export function markFamilyRegistered(db: LedgerDb, familyId: string, at: number) {
  db.update(syncMeta).set({ registeredAt: at }).where(eq(syncMeta.familyId, familyId)).run();
}

/** After joining with an invite code: add the ledger (its records arrive with sync) and make it current. */
export function addJoinedFamily(db: LedgerDb, family: FamilySummary, userId: string, at: number): LocalFamily {
  db.transaction((tx) => {
    tx.insert(syncMeta)
      .values({ familyId: family.id, familyName: family.name, userId, role: family.role, registeredAt: at, lastPulledSeq: 0 })
      .onConflictDoUpdate({
        target: syncMeta.familyId,
        set: { familyName: family.name, userId, role: family.role, registeredAt: at },
      })
      .run();
    setSetting(tx, SETTING_FAMILY_ID, family.id);
  });
  return { id: family.id, name: family.name, role: family.role, registered: true };
}

/**
 * Brings local ledgers in line with GET /me: new names and roles, ledgers joined on another
 * phone, and ledgers this account was removed from (their local data is deleted).
 * Ledgers not yet registered are left alone: the server doesn't know them yet.
 */
export function applyServerFamilies(db: LedgerDb, userId: string, server: FamilySummary[], at: number) {
  const known = new Set(server.map((f) => f.id));
  db.transaction((tx) => {
    for (const f of server) {
      tx.insert(syncMeta)
        .values({ familyId: f.id, familyName: f.name, userId, role: f.role, registeredAt: at, lastPulledSeq: 0 })
        .onConflictDoUpdate({ target: syncMeta.familyId, set: { familyName: f.name, role: f.role, userId, registeredAt: at } })
        .run();
    }
    const gone = tx
      .select({ id: syncMeta.familyId })
      .from(syncMeta)
      .where(and(eq(syncMeta.userId, userId), isNotNull(syncMeta.registeredAt)))
      .all()
      .filter((f) => !known.has(f.id))
      .map((f) => f.id);
    if (gone.length) forgetFamilies(tx, gone);
  });
}

/** After deleting an account: removes all its ledgers from this phone, including ones never sent to the server. */
export function forgetAccount(db: LedgerDb, userId: string) {
  db.transaction((tx) => {
    const ids = tx.select({ id: syncMeta.familyId }).from(syncMeta).where(eq(syncMeta.userId, userId)).all().map((f) => f.id);
    if (ids.length) forgetFamilies(tx, ids);
  });
}

/** Deletes every local record of these ledgers, including changes still waiting to sync. */
function forgetFamilies(tx: Writer, familyIds: string[]) {
  for (const table of [entries, events, people, cashCounts]) {
    tx.delete(table).where(inArray(table.familyId, familyIds)).run();
  }
  const ids = new Set(familyIds);
  const queued = tx.select({ id: outbox.id, payload: outbox.payload }).from(outbox).all();
  const drop = queued.filter((q) => ids.has((JSON.parse(q.payload) as { familyId?: string }).familyId ?? '')).map((q) => q.id);
  if (drop.length) tx.delete(outbox).where(inArray(outbox.id, drop)).run();
  tx.delete(syncMeta).where(inArray(syncMeta.familyId, familyIds)).run();
  if (ids.has(getSetting(tx, SETTING_FAMILY_ID) ?? '')) tx.delete(appSettings).where(eq(appSettings.key, SETTING_FAMILY_ID)).run();
}

function assertCanWrite(ctx: LedgerContext) {
  if (ctx.role === 'viewer') throw new LedgerError('FORBIDDEN', 'Viewers can’t change the ledger', 'role');
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
  input: { displayName: string; relation?: string | null; city?: string | null; phone?: string | null },
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
    nameLatin: matchKey(displayName),
    nameDevanagari: hasDevanagari(displayName) ? displayName : null,
    relation: input.relation?.trim() || null,
    city: input.city?.trim() || null,
    phone: input.phone?.trim() || null,
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

/** Like findPerson, but follows a merge to the person that was kept (a screen may still hold the old id). */
function findKeptPerson(tx: Writer, familyId: string, id: string) {
  let person = findPerson(tx, familyId, id);
  for (let hops = 0; person?.mergedInto && hops < 10; hops++) person = findPerson(tx, familyId, person.mergedInto);
  return person;
}

export function createPerson(
  ctx: LedgerContext,
  input: { displayName: string; relation?: string | null; city?: string | null },
): PersonRow {
  assertCanWrite(ctx);
  if (!input.displayName.trim()) throw new LedgerError('VALIDATION', 'Enter a name', 'displayName');
  return ctx.db.transaction((tx) => insertPerson(tx, ctx, input));
}

export function createEvent(ctx: LedgerContext, raw: unknown): EventRow {
  assertCanWrite(ctx);
  const parsed = createEventInputSchema.safeParse(raw);
  if (!parsed.success) throw validationError(parsed.error);
  const input = parsed.data;
  return ctx.db.transaction((tx) => {
    let hostPersonId: string | null = null;
    if (input.role === 'attended') {
      if (input.hostPersonId) {
        const host = findKeptPerson(tx, ctx.familyId, input.hostPersonId);
        if (!host) throw new LedgerError('NOT_FOUND', 'That person is no longer in the ledger', 'hostName');
        hostPersonId = host.id;
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
  assertCanWrite(ctx);
  const parsed = quickEntryInputSchema.safeParse(raw);
  if (!parsed.success) throw validationError(parsed.error);
  const input = parsed.data;

  return ctx.db.transaction((tx) => {
    assertEvent(tx, ctx, input.eventId);
    const { person, createdPerson } = resolvePerson(tx, ctx, input);
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

type QuickEntryData = ReturnType<typeof quickEntryInputSchema.parse>;

function assertEvent(tx: Writer, ctx: LedgerContext, eventId: string) {
  const event = tx
    .select({ id: events.id })
    .from(events)
    .where(and(eq(events.id, eventId), eq(events.familyId, ctx.familyId), isNull(events.deletedAt)))
    .get();
  if (!event) throw new LedgerError('NOT_FOUND', 'This event is no longer in the ledger', 'eventId');
}

/** The existing person (relation updated if it changed) or a newly created one. */
function resolvePerson(tx: Writer, ctx: LedgerContext, input: QuickEntryData) {
  if (input.personId) {
    let person = findKeptPerson(tx, ctx.familyId, input.personId);
    if (!person) throw new LedgerError('NOT_FOUND', 'That person is no longer in the ledger', 'personId');
    const relation = input.relation?.trim() || null;
    if (relation && relation !== person.relation) {
      person = { ...person, relation, updatedAt: ctx.now() };
      tx.update(people).set({ relation, updatedAt: person.updatedAt }).where(eq(people.id, person.id)).run();
      queue(tx, 'people', person, 'upsert', person.updatedAt);
    }
    return { person, createdPerson: false };
  }
  const person = insertPerson(tx, ctx, {
    displayName: input.newPersonName ?? '',
    relation: input.relation,
    city: input.newPersonCity,
    phone: input.newPersonPhone,
  });
  return { person, createdPerson: true };
}

/**
 * Fixes an entry (wrong amount, wrong person, wrong function). Keeps its id and createdAt.
 * The server keeps the previous version in entryHistory when this syncs (week 4).
 */
export function updateEntry(ctx: LedgerContext, entryId: string, raw: unknown): AddEntryResult {
  assertCanWrite(ctx);
  const parsed = quickEntryInputSchema.safeParse(raw);
  if (!parsed.success) throw validationError(parsed.error);
  const input = parsed.data;
  return ctx.db.transaction((tx) => {
    const current = tx
      .select()
      .from(entries)
      .where(and(eq(entries.id, entryId), eq(entries.familyId, ctx.familyId), isNull(entries.deletedAt)))
      .get();
    if (!current) throw new LedgerError('NOT_FOUND', 'This entry is no longer in the ledger', 'entryId');
    assertEvent(tx, ctx, input.eventId);
    const { person, createdPerson } = resolvePerson(tx, ctx, input);
    const at = ctx.now();
    const entry: EntryRow = {
      ...current,
      eventId: input.eventId,
      personId: person.id,
      direction: input.direction,
      amount: input.amount,
      mode: input.mode,
      itemNote: input.mode === 'item' ? input.itemNote?.trim() || null : null,
      subFunction: input.subFunction || null,
      note: input.note?.trim() || null,
      updatedAt: at,
    };
    tx.update(entries).set(entry).where(eq(entries.id, entryId)).run();
    queue(tx, 'entries', entry, 'upsert', at);
    return { entry, person, createdPerson };
  });
}

export function getEntry(db: LedgerDb, familyId: string, entryId: string) {
  return db
    .select()
    .from(entries)
    .where(and(eq(entries.id, entryId), eq(entries.familyId, familyId), isNull(entries.deletedAt)))
    .get();
}

/** Soft delete: the row stays with deletedAt set, so the delete can sync to other phones. */
export function deleteEntry(ctx: LedgerContext, entryId: string) {
  assertCanWrite(ctx);
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

const lastEntry = (column: string) =>
  sql.raw(
    `(select e.${column} from entries e join events ev on ev.id = e.event_id
      where e.person_id = "people"."id" and e.deleted_at is null and ev.deleted_at is null
      order by ev.date desc, e.created_at desc limit 1)`,
  );

/**
 * Every live person with their last exchange, in one query. The UI builds a Fuse.js
 * index from this (createPersonSearch) and searches it on each keystroke.
 */
export function getPeopleIndex(db: LedgerDb, familyId: string): PersonMatch[] {
  return db
    .select({
      ...personColumns(),
      lastAmount: sql<number | null>`${lastEntry('amount')}`,
      lastDirection: sql<EntryRow['direction'] | null>`${lastEntry('direction')}`,
    })
    .from(people)
    .where(and(eq(people.familyId, familyId), isNull(people.deletedAt), isNull(people.mergedInto)))
    .orderBy(people.displayName)
    .all();
}

/** Fuzzy name search across Hindi and English spellings. Screens memoize the index; this is the one-off form. */
export function searchPeople(db: LedgerDb, familyId: string, query: string, limit = 5): PersonMatch[] {
  return createPersonSearch(getPeopleIndex(db, familyId))(query, limit);
}

/** People whose match key equals this name's key ("Shri Ramesh Sharma ji" = "रमेश शर्मा"). */
export function findSameName(db: LedgerDb, familyId: string, name: string): PersonMatch[] {
  return exactKeyMatches(getPeopleIndex(db, familyId), name);
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

/** The person, or the one they were merged into: a link to a merged duplicate opens the kept person. */
export function getKeptPerson(db: LedgerDb, familyId: string, personId: string) {
  return findKeptPerson(db, familyId, personId);
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

export interface LedgerGift {
  id: string;
  eventId: string;
  eventTitle: string;
  eventDate: string;
  personId: string;
  personName: string;
  city: string | null;
  relation: string | null;
  direction: EntryRow['direction'];
  amount: number;
  mode: EntryRow['mode'];
  itemNote: string | null;
  subFunction: string | null;
  note: string | null;
  createdAt: number;
}

/** Every live gift in the ledger, oldest function first: the rows of the Excel export. */
export function getAllGifts(db: LedgerDb, familyId: string): LedgerGift[] {
  return db
    .select({
      id: entries.id,
      eventId: events.id,
      eventTitle: events.title,
      eventDate: events.date,
      personId: people.id,
      personName: people.displayName,
      city: people.city,
      relation: people.relation,
      direction: entries.direction,
      amount: entries.amount,
      mode: entries.mode,
      itemNote: entries.itemNote,
      subFunction: entries.subFunction,
      note: entries.note,
      createdAt: entries.createdAt,
    })
    .from(entries)
    .innerJoin(events, eq(events.id, entries.eventId))
    .innerJoin(people, eq(people.id, entries.personId))
    .where(and(eq(entries.familyId, familyId), isNull(entries.deletedAt), isNull(events.deletedAt)))
    .orderBy(asc(events.date), asc(entries.createdAt))
    .all();
}

/**
 * Changes on this phone still waiting to go up, counted the way the family thinks of them:
 * a gift to a new guest is one change, not two (the new person rides along with the entry).
 * Refused changes are counted separately.
 */
export function countPendingChanges(db: LedgerDb): number {
  return (
    db
      .select({ n: sql<number>`count(distinct ${outbox.recordId})` })
      .from(outbox)
      .where(
        sql`${outbox.lastError} is null and not (${outbox.tableName} = 'people' and exists (
          select 1 from outbox e where e.table_name = 'entries' and e.last_error is null
            and json_extract(e.payload, '$.personId') = ${outbox.recordId}))`,
      )
      .get()?.n ?? 0
  );
}

export function updatePerson(ctx: LedgerContext, personId: string, raw: unknown): PersonRow {
  assertCanWrite(ctx);
  const parsed = personEditSchema.safeParse(raw);
  if (!parsed.success) throw validationError(parsed.error);
  const input = parsed.data;
  return ctx.db.transaction((tx) => {
    const current = findPerson(tx, ctx.familyId, personId);
    if (!current) throw new LedgerError('NOT_FOUND', 'That person is no longer in the ledger', 'personId');
    const displayName = input.displayName.replace(/\s+/g, ' ');
    const next: PersonRow = {
      ...current,
      displayName,
      nameLatin: matchKey(displayName),
      nameDevanagari: hasDevanagari(displayName) ? displayName : current.nameDevanagari,
      relation: input.relation?.trim() || null,
      city: input.city?.trim() || null,
      phone: input.phone?.trim() || null,
      updatedAt: ctx.now(),
    };
    tx.update(people).set(next).where(eq(people.id, personId)).run();
    queue(tx, 'people', next, 'upsert', next.updatedAt);
    return next;
  });
}

/** Upcoming functions hosted by this person (invites we have, gifts not yet given). */
export function getUpcomingForPerson(db: LedgerDb, familyId: string, personId: string, today: string) {
  return db
    .select({ id: events.id, title: events.title, date: events.date, type: events.type, venue: events.venue })
    .from(events)
    .where(
      and(
        eq(events.familyId, familyId),
        eq(events.hostPersonId, personId),
        eq(events.role, 'attended'),
        isNull(events.deletedAt),
        gte(events.date, today),
      ),
    )
    .orderBy(asc(events.date))
    .all();
}

// ---------------------------------------------------------------------------
// Duplicate merge
// ---------------------------------------------------------------------------

const SETTING_NOT_DUPLICATES = 'notDuplicates';

function notDuplicates(db: Writer): Set<string> {
  const raw = getSetting(db, SETTING_NOT_DUPLICATES);
  return new Set(raw ? (JSON.parse(raw) as string[]) : []);
}

/**
 * People who are probably the same (same match key and no conflicting city, or the same
 * phone number), minus pairs the family said are different. Merges are only suggested.
 */
export function getDuplicateSuggestions(db: LedgerDb, familyId: string): DuplicatePair<PersonSummary>[] {
  const dismissed = notDuplicates(db);
  return findDuplicatePairs(getPeopleSummaries(db, familyId)).filter((p) => !dismissed.has(pairKey(p.a.id, p.b.id)));
}

/** "Not the same person": stops suggesting this pair. Kept on this phone only. */
export function markNotDuplicates(db: LedgerDb, a: string, b: string) {
  const dismissed = notDuplicates(db);
  dismissed.add(pairKey(a, b));
  setSetting(db, SETTING_NOT_DUPLICATES, JSON.stringify([...dismissed]));
}

/** Functions this person hosted (they move with a merge). */
export function countHostedEvents(db: LedgerDb, familyId: string, personId: string): number {
  return (
    db
      .select({ n: sql<number>`count(*)` })
      .from(events)
      .where(and(eq(events.familyId, familyId), eq(events.hostPersonId, personId), isNull(events.deletedAt)))
      .get()?.n ?? 0
  );
}

/**
 * Merges a duplicate into the person kept. Their gifts and the functions they hosted move
 * across, blanks on the kept person (city, phone, relation, Hindi name) are filled from the
 * duplicate, and the duplicate stays with mergedInto set instead of being deleted. Every
 * change is queued, so the merge syncs like any other edit; the server also moves anything
 * other phones log against the duplicate before they hear of the merge.
 */
export function mergePeople(ctx: LedgerContext, keepId: string, mergeId: string): PersonRow {
  assertCanWrite(ctx);
  if (keepId === mergeId) throw new LedgerError('VALIDATION', 'Pick two different people', 'personId');
  return ctx.db.transaction((tx) => {
    const keep = findPerson(tx, ctx.familyId, keepId);
    const dup = findPerson(tx, ctx.familyId, mergeId);
    if (!keep || !dup || keep.mergedInto || dup.mergedInto) {
      throw new LedgerError('NOT_FOUND', 'That person is no longer in the ledger', 'personId');
    }
    const at = ctx.now();
    const gifts = tx
      .select()
      .from(entries)
      .where(and(eq(entries.familyId, ctx.familyId), eq(entries.personId, mergeId), isNull(entries.deletedAt)))
      .all();
    for (const entry of gifts) {
      const moved: EntryRow = { ...entry, personId: keepId, updatedAt: at };
      tx.update(entries).set({ personId: keepId, updatedAt: at }).where(eq(entries.id, entry.id)).run();
      queue(tx, 'entries', moved, 'upsert', at);
    }
    const hosted = tx
      .select()
      .from(events)
      .where(and(eq(events.familyId, ctx.familyId), eq(events.hostPersonId, mergeId), isNull(events.deletedAt)))
      .all();
    for (const event of hosted) {
      const moved: EventRow = { ...event, hostPersonId: keepId, updatedAt: at };
      tx.update(events).set({ hostPersonId: keepId, updatedAt: at }).where(eq(events.id, event.id)).run();
      queue(tx, 'events', moved, 'upsert', at);
    }

    let kept = keep;
    const filled = {
      city: keep.city ?? dup.city,
      phone: keep.phone ?? dup.phone,
      relation: keep.relation ?? dup.relation,
      nameDevanagari: keep.nameDevanagari ?? dup.nameDevanagari,
    };
    if ((Object.keys(filled) as (keyof typeof filled)[]).some((k) => filled[k] !== keep[k])) {
      kept = { ...keep, ...filled, updatedAt: at };
      tx.update(people).set({ ...filled, updatedAt: at }).where(eq(people.id, keepId)).run();
      queue(tx, 'people', kept, 'upsert', at);
    }
    const merged: PersonRow = { ...dup, mergedInto: keepId, updatedAt: at };
    tx.update(people).set({ mergedInto: keepId, updatedAt: at }).where(eq(people.id, mergeId)).run();
    queue(tx, 'people', merged, 'upsert', at);
    return kept;
  });
}

// ---------------------------------------------------------------------------
// Cash reconciliation
// ---------------------------------------------------------------------------

export interface CashSummary {
  loggedCash: number;
  cashEntries: number;
}

/** Cash received at this event, as logged. */
export function getCashSummary(db: LedgerDb, eventId: string): CashSummary {
  const row = db
    .select({
      loggedCash: sql<number>`coalesce(sum(${entries.amount}), 0)`,
      cashEntries: sql<number>`count(*)`,
    })
    .from(entries)
    .where(
      and(eq(entries.eventId, eventId), eq(entries.mode, 'cash'), eq(entries.direction, 'received'), isNull(entries.deletedAt)),
    )
    .get();
  return { loggedCash: row?.loggedCash ?? 0, cashEntries: row?.cashEntries ?? 0 };
}

/** Cash entries for checking against envelopes, largest first. */
export function getCashEntries(db: LedgerDb, eventId: string): EntryListItem[] {
  return db
    .select(entryListColumns())
    .from(entries)
    .innerJoin(people, eq(people.id, entries.personId))
    .where(
      and(eq(entries.eventId, eventId), eq(entries.mode, 'cash'), eq(entries.direction, 'received'), isNull(entries.deletedAt)),
    )
    .orderBy(desc(entries.amount), desc(entries.createdAt))
    .all()
    .map((r) => ({ ...r, pending: Boolean(r.pending) }));
}

/** Saves one count. Every count is kept (an audit trail), never overwritten. */
export function addCashCount(ctx: LedgerContext, raw: unknown) {
  assertCanWrite(ctx);
  const parsed = cashCountInputSchema.safeParse(raw);
  if (!parsed.success) throw validationError(parsed.error);
  const { eventId, countedAmount } = parsed.data;
  return ctx.db.transaction((tx) => {
    const event = tx
      .select({ id: events.id })
      .from(events)
      .where(and(eq(events.id, eventId), eq(events.familyId, ctx.familyId), isNull(events.deletedAt)))
      .get();
    if (!event) throw new LedgerError('NOT_FOUND', 'This event is no longer in the ledger', 'eventId');
    const at = ctx.now();
    const row = {
      id: ctx.newId(),
      familyId: ctx.familyId,
      updatedAt: at,
      deletedAt: null,
      seq: null,
      eventId,
      countedAmount,
      countedBy: ctx.userId,
      countedAt: at,
    };
    tx.insert(cashCounts).values(row).run();
    queue(tx, 'cashCounts', row, 'upsert', at);
    return row;
  });
}

export function getCashCounts(db: LedgerDb, eventId: string) {
  return db
    .select()
    .from(cashCounts)
    .where(and(eq(cashCounts.eventId, eventId), isNull(cashCounts.deletedAt)))
    .orderBy(desc(cashCounts.countedAt))
    .all();
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
