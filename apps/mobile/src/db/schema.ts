import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type {
  Direction,
  EventRole,
  EventType,
  PaymentMode,
  SyncedTable,
} from '@shagun/shared';

/**
 * Local SQLite schema. The phone is the source of truth for the UI: screens read and
 * write only these tables, and the sync engine (week 4) moves rows to and from MongoDB.
 *
 * Every synced table carries the same five sync fields. A fresh set of column builders
 * is made per table, because Drizzle column builders must not be shared between tables.
 */
const syncColumns = () => ({
  /** UUID made on the phone; becomes `_id` on the server. */
  id: text('id').primaryKey(),
  familyId: text('family_id').notNull(),
  /** Epoch ms of the last local or server write. */
  updatedAt: integer('updated_at').notNull(),
  /** Soft delete: rows are never hard-deleted, so deletes can sync. */
  deletedAt: integer('deleted_at'),
  /** Server sequence number. Null until the server accepts the row. */
  seq: integer('seq'),
});

export const people = sqliteTable(
  'people',
  {
    ...syncColumns(),
    displayName: text('display_name').notNull(),
    /** Match key used for search and duplicate detection. */
    nameLatin: text('name_latin').notNull(),
    nameDevanagari: text('name_devanagari'),
    relation: text('relation'),
    city: text('city'),
    phone: text('phone'),
    /** After a merge, points to the person that was kept. */
    mergedInto: text('merged_into'),
  },
  (t) => [index('people_family_name_idx').on(t.familyId, t.nameLatin)],
);

export const events = sqliteTable(
  'events',
  {
    ...syncColumns(),
    title: text('title').notNull(),
    type: text('type').$type<EventType>().notNull(),
    /** hosted = our function (gifts received); attended = theirs (gifts given). */
    role: text('role').$type<EventRole>().notNull(),
    hostPersonId: text('host_person_id'),
    /** ISO calendar date, e.g. "2026-02-14". */
    date: text('date').notNull(),
    subFunctions: text('sub_functions', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
    venue: text('venue'),
  },
  (t) => [index('events_family_date_idx').on(t.familyId, t.date)],
);

export const entries = sqliteTable(
  'entries',
  {
    ...syncColumns(),
    eventId: text('event_id').notNull(),
    personId: text('person_id').notNull(),
    direction: text('direction').$type<Direction>().notNull(),
    /** Whole rupees, integer. Never a float. */
    amount: integer('amount').notNull(),
    mode: text('mode').$type<PaymentMode>().notNull(),
    itemNote: text('item_note'),
    subFunction: text('sub_function'),
    note: text('note'),
    photoKey: text('photo_key'),
    createdBy: text('created_by').notNull(),
    deviceId: text('device_id').notNull(),
    /** When the gift was logged (shown as the entry time). updatedAt changes on edits; this does not. */
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    index('entries_family_person_idx').on(t.familyId, t.personId),
    index('entries_family_event_idx').on(t.familyId, t.eventId),
    index('entries_family_seq_idx').on(t.familyId, t.seq),
  ],
);

export const cashCounts = sqliteTable(
  'cash_counts',
  {
    ...syncColumns(),
    eventId: text('event_id').notNull(),
    countedAmount: integer('counted_amount').notNull(),
    countedBy: text('counted_by').notNull(),
    countedAt: integer('counted_at').notNull(),
  },
  (t) => [index('cash_counts_event_idx').on(t.familyId, t.eventId)],
);

/** Phone-only: one row per local change waiting to be pushed. Written in the same transaction as the change. */
export const outbox = sqliteTable(
  'outbox',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    tableName: text('table_name').$type<SyncedTable>().notNull(),
    recordId: text('record_id').notNull(),
    op: text('op').$type<'upsert' | 'delete'>().notNull(),
    /** The full record as JSON at the time of the change. */
    payload: text('payload').notNull(),
    createdAt: integer('created_at').notNull(),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
  },
  (t) => [index('outbox_record_idx').on(t.recordId)],
);

/** Phone-only: sync position per family ledger. Also holds the ledger name for display. */
export const syncMeta = sqliteTable('sync_meta', {
  familyId: text('family_id').primaryKey(),
  familyName: text('family_name').notNull(),
  lastPulledSeq: integer('last_pulled_seq').notNull().default(0),
  lastSyncAt: integer('last_sync_at'),
});

/** Phone-only key/value settings: device id, current family, language. */
export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export type PersonRow = typeof people.$inferSelect;
export type EventRow = typeof events.$inferSelect;
export type EntryRow = typeof entries.$inferSelect;
export type OutboxRow = typeof outbox.$inferSelect;

/** Table name (as SQLite sees it) for each synced table key. Used by the outbox and change listeners. */
export const SQL_TABLE_NAMES = {
  people: 'people',
  events: 'events',
  entries: 'entries',
  cashCounts: 'cash_counts',
  outbox: 'outbox',
  syncMeta: 'sync_meta',
} as const;
