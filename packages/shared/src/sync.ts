import { z } from 'zod';
import { SYNCED_TABLES, type SyncedTable } from './constants';
import { cashCountSchema, entrySchema, eventSchema, personSchema } from './schemas';

/**
 * The sync contract (week 4). The phone pushes its outbox in batches, then pulls every
 * record with a server sequence number above the last one it saw. Sequence numbers come
 * from the server (families.lastSeq), never from phone clocks.
 */
export const SYNC_PUSH_LIMIT = 100;
export const SYNC_PULL_LIMIT = 500;

/** Validates one record of each synced table. Used by the server on push and by tests. */
export const recordSchemas = {
  people: personSchema,
  events: eventSchema,
  entries: entrySchema,
  cashCounts: cashCountSchema,
} as const satisfies Record<SyncedTable, z.ZodType>;

export const syncChangeSchema = z.object({
  /** The phone's outbox row id, so the reply can say which rows to delete. */
  changeId: z.number().int().nonnegative(),
  table: z.enum(SYNCED_TABLES),
  op: z.enum(['upsert', 'delete']),
  record: z.record(z.string(), z.unknown()),
});
export type SyncChange = z.infer<typeof syncChangeSchema>;

export const syncPushSchema = z.object({
  familyId: z.uuid(),
  changes: z.array(syncChangeSchema).min(1).max(SYNC_PUSH_LIMIT),
});
export type SyncPushRequest = z.infer<typeof syncPushSchema>;

export const syncPullQuerySchema = z.object({
  familyId: z.uuid(),
  since: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().min(1).max(SYNC_PULL_LIMIT).default(SYNC_PULL_LIMIT),
});

/** A record as stored on the server and on phones: camelCase fields, `id`, sync fields, `seq` set. */
export type SyncRecord = Record<string, unknown> & { id: string; familyId: string; seq: number | null };

export interface SyncedRecord {
  table: SyncedTable;
  record: SyncRecord;
}

export interface SyncPushResponse {
  /** Outbox row ids the phone can delete. */
  accepted: number[];
  /** Rows the server refused for good (bad data). The phone keeps them and shows "not saved". */
  rejected: { changeId: number; code: string; message: string }[];
  /**
   * The server's copy of every record touched, after the write. The phone applies these,
   * so a change that lost (e.g. an edit to an entry deleted elsewhere) is corrected at once.
   */
  records: SyncedRecord[];
}

export interface SyncPullResponse {
  records: SyncedRecord[];
  /** The highest seq returned (or `since` when nothing was). Save it as lastPulledSeq. */
  maxSeq: number;
  hasMore: boolean;
}

export interface EntryHistoryItem {
  /** The entry as it was before the change. */
  version: SyncRecord;
  replacedAt: number;
  replacedBy: string;
}
