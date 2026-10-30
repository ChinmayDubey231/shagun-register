import { and, asc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import {
  SYNC_PULL_LIMIT,
  SYNC_PUSH_LIMIT,
  type SyncChange,
  type SyncedRecord,
  type SyncedTable,
  type SyncPullResponse,
  type SyncPushRequest,
  type SyncPushResponse,
} from '@shagun/shared';
import type { LedgerDb } from '@/db/ledger';
import { cashCounts, entries, events, outbox, people, syncMeta } from '@/db/schema';

/**
 * The phone side of sync, from the build guide:
 *  1. Push: send outbox rows (≤100 at a time); delete the accepted ones, mark rejected ones.
 *  2. Pull: fetch records with seq above lastPulledSeq, upsert each one unless it still has
 *     a pending outbox change, save the new lastPulledSeq in the same transaction.
 * No Expo imports here: the transport is injected, so the same code runs in Node tests
 * against the real API.
 */
export interface SyncTransport {
  push(body: SyncPushRequest): Promise<SyncPushResponse>;
  pull(familyId: string, since: number, limit: number): Promise<SyncPullResponse>;
}

export interface FamilySyncResult {
  pushed: number;
  rejected: number;
  pulled: number;
}

const TABLES = { people, events, entries, cashCounts } as const;
type Tx = Parameters<Parameters<LedgerDb['transaction']>[0]>[0];
type Writer = LedgerDb | Tx;

/** Outbox rows that still need pushing for this family (rejected rows are parked, not retried). */
export function nextOutboxBatch(db: LedgerDb, familyId: string, limit = SYNC_PUSH_LIMIT) {
  return db
    .select()
    .from(outbox)
    .where(and(isNull(outbox.lastError), sql`json_extract(${outbox.payload}, '$.familyId') = ${familyId}`))
    .orderBy(asc(outbox.id))
    .limit(limit)
    .all();
}

/** Changes the server refused for good. Shown as "not saved to server". */
export function countRejected(db: LedgerDb): number {
  return db.select({ n: sql<number>`count(*)` }).from(outbox).where(isNotNull(outbox.lastError)).get()?.n ?? 0;
}

/** Changes waiting to be pushed (excludes rejected ones). */
export function countUnsynced(db: LedgerDb): number {
  return db.select({ n: sql<number>`count(*)` }).from(outbox).where(isNull(outbox.lastError)).get()?.n ?? 0;
}

/**
 * Parks every queued change for a family the server will refuse as a whole (this account
 * became a viewer while the phone was offline). They stay visible as "not saved to server".
 */
export function parkFamilyOutbox(db: LedgerDb, familyId: string, reason: string) {
  db.update(outbox)
    .set({ lastError: reason, attempts: sql`${outbox.attempts} + 1` })
    .where(and(isNull(outbox.lastError), sql`json_extract(${outbox.payload}, '$.familyId') = ${familyId}`))
    .run();
}

function hasPending(tx: Writer, recordId: string): boolean {
  return !!tx
    .select({ id: outbox.id })
    .from(outbox)
    .where(and(eq(outbox.recordId, recordId), isNull(outbox.lastError)))
    .limit(1)
    .get();
}

/** Writes a server record into the local table. Never touches the outbox. */
function upsertLocal(tx: Writer, item: SyncedRecord) {
  const table = TABLES[item.table as SyncedTable];
  if (!table) return;
  const values = item.record as never;
  tx.insert(table).values(values).onConflictDoUpdate({ target: table.id, set: values }).run();
}

function applyServerRecords(tx: Writer, records: SyncedRecord[]) {
  let applied = 0;
  for (const item of records) {
    if (hasPending(tx, item.record.id)) continue; // our newer change goes up first
    upsertLocal(tx, item);
    applied++;
  }
  return applied;
}

export async function pushFamily(db: LedgerDb, t: SyncTransport, familyId: string) {
  let pushed = 0;
  let rejected = 0;
  for (;;) {
    const batch = nextOutboxBatch(db, familyId);
    if (batch.length === 0) break;
    const changes: SyncChange[] = batch.map((row) => ({
      changeId: row.id,
      table: row.tableName,
      op: row.op,
      record: JSON.parse(row.payload) as Record<string, unknown>,
    }));
    const res = await t.push({ familyId, changes });
    db.transaction((tx) => {
      if (res.accepted.length) tx.delete(outbox).where(inArray(outbox.id, res.accepted)).run();
      for (const r of res.rejected) {
        tx.update(outbox)
          .set({ lastError: `${r.code}: ${r.message}`, attempts: sql`${outbox.attempts} + 1` })
          .where(eq(outbox.id, r.changeId))
          .run();
      }
      applyServerRecords(tx, res.records);
    });
    pushed += res.accepted.length;
    rejected += res.rejected.length;
    // Guard against a server that answers without settling anything: stop instead of looping.
    if (res.accepted.length + res.rejected.length === 0) break;
  }
  return { pushed, rejected };
}

export async function pullFamily(db: LedgerDb, t: SyncTransport, familyId: string, limit = SYNC_PULL_LIMIT) {
  let pulled = 0;
  let since = db.select({ s: syncMeta.lastPulledSeq }).from(syncMeta).where(eq(syncMeta.familyId, familyId)).get()?.s ?? 0;
  for (;;) {
    const res = await t.pull(familyId, since, limit);
    db.transaction((tx) => {
      pulled += applyServerRecords(tx, res.records);
      tx.update(syncMeta).set({ lastPulledSeq: res.maxSeq, lastSyncAt: Date.now() }).where(eq(syncMeta.familyId, familyId)).run();
    });
    since = res.maxSeq;
    if (!res.hasMore) break;
  }
  return pulled;
}

/** Push, then pull. Safe to interrupt at any point: nothing is lost or doubled. */
export async function syncFamily(db: LedgerDb, t: SyncTransport, familyId: string): Promise<FamilySyncResult> {
  const { pushed, rejected } = await pushFamily(db, t, familyId);
  const pulled = await pullFamily(db, t, familyId);
  return { pushed, rejected, pulled };
}
