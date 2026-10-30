import { randomUUID } from 'node:crypto';
import mongoose, { type mongo } from 'mongoose';
import {
  matchKey,
  recordSchemas,
  SYNCED_TABLES,
  type EntryHistoryItem,
  type SyncChange,
  type SyncedRecord,
  type SyncedTable,
  type SyncPullResponse,
  type SyncPushResponse,
  type SyncRecord,
} from '@shagun/shared';
import { Family } from './models.js';

type ClientSession = mongo.ClientSession;
type Document = mongo.Document;
type Collection<T extends Document> = mongo.Collection<T>;

/**
 * Ledger records live in plain collections (one per synced table) with `_id` = the
 * phone-made UUID. Every write gets the family's next sequence number, allocated in the
 * same transaction as the write: a pull can therefore never see seq 11 while seq 10 is
 * still uncommitted, because the second writer can't get 11 until the first commits.
 */
const COLLECTION: Record<SyncedTable, string> = {
  people: 'people',
  events: 'events',
  entries: 'entries',
  cashCounts: 'cashCounts',
};
const HISTORY = 'entryHistory';

const db = () => mongoose.connection.db!;
const coll = (table: SyncedTable): Collection<Document> => db().collection(COLLECTION[table]);

export async function ensureSyncIndexes() {
  for (const table of SYNCED_TABLES) {
    await coll(table).createIndex({ familyId: 1, seq: 1 });
  }
  await coll('people').createIndex({ familyId: 1, nameLatin: 1 });
  await coll('entries').createIndex({ familyId: 1, personId: 1 });
  await coll('entries').createIndex({ familyId: 1, eventId: 1 });
  await coll('events').createIndex({ familyId: 1, date: 1 });
  await db().collection(HISTORY).createIndex({ familyId: 1, entryId: 1, replacedAt: -1 });
}

/** Stored document → wire record. */
function toRecord(doc: Document): SyncRecord {
  const { _id, ...rest } = doc;
  return { id: _id as string, ...rest } as SyncRecord;
}

/** Compares everything the phone controls; `seq` is the server's. */
function sameContent(a: Document, b: Document): boolean {
  const strip = ({ seq: _s, _id: _i, ...rest }: Document) => rest;
  const norm = (d: Document) => JSON.stringify(Object.entries(strip(d)).sort(([x], [y]) => x.localeCompare(y)));
  return norm(a) === norm(b);
}

type Validated = { change: SyncChange; doc: Document };

/** Validates every change before the transaction, so one bad record doesn't sink the batch. */
function validate(familyId: string, changes: SyncChange[]) {
  const ok: Validated[] = [];
  const rejected: SyncPushResponse['rejected'] = [];
  for (const change of changes) {
    const parsed = recordSchemas[change.table].safeParse(change.record);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      rejected.push({
        changeId: change.changeId,
        code: 'VALIDATION',
        message: `${issue?.path.join('.') || change.table}: ${issue?.message ?? 'invalid'}`,
      });
      continue;
    }
    const record = parsed.data as SyncRecord;
    if (record.familyId !== familyId) {
      rejected.push({ changeId: change.changeId, code: 'VALIDATION', message: 'Record belongs to another family' });
      continue;
    }
    if (change.op === 'delete' && !record.deletedAt) {
      rejected.push({ changeId: change.changeId, code: 'VALIDATION', message: 'A delete must set deletedAt' });
      continue;
    }
    const { id, ...fields } = record;
    const doc: Document = { _id: id, ...fields };
    // The server computes its own match key so duplicate checks never trust a phone's.
    if (change.table === 'people') doc.nameLatin = matchKey(String(doc.displayName));
    ok.push({ change, doc });
  }
  return { ok, rejected };
}

async function nextSeq(familyId: string, session: ClientSession): Promise<number> {
  const family = await Family.findOneAndUpdate(
    { _id: familyId },
    { $inc: { lastSeq: 1 } },
    { session, returnDocument: 'after', projection: { lastSeq: 1 } },
  ).lean<{ lastSeq: number }>();
  if (!family) throw new Error('family vanished during sync');
  return family.lastSeq;
}

/**
 * Applies a batch of outbox changes. Rules:
 * - new records are inserted (two phones' new entries never conflict: different UUIDs);
 * - an edit replaces the record — the last write to reach the server wins — and for
 *   entries the previous version is kept in entryHistory;
 * - deletes are soft and win: an edit arriving for a deleted record is ignored;
 * - a retry of an identical record changes nothing and gets no new seq.
 */
export async function applyPush(familyId: string, userId: string, changes: SyncChange[]): Promise<SyncPushResponse> {
  const { ok, rejected } = validate(familyId, changes);
  let accepted: number[] = [];
  let touched = new Map<string, SyncedRecord>();

  if (ok.length) {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        // withTransaction may retry this callback after a write conflict: start clean.
        accepted = [];
        touched = new Map();
        const late: SyncPushResponse['rejected'] = [];
        for (const { change, doc } of ok) {
          const c = coll(change.table);
          const existing = await c.findOne({ _id: doc._id }, { session });
          if (existing && existing.familyId !== familyId) {
            late.push({ changeId: change.changeId, code: 'CONFLICT', message: 'Record id belongs to another family' });
            continue;
          }
          let stored: Document;
          if (!existing) {
            if (change.table === 'entries') doc.createdBy = userId;
            stored = { ...doc, seq: await nextSeq(familyId, session) };
            await c.insertOne(stored, { session });
          } else if (existing.deletedAt) {
            stored = existing; // deletes win
          } else {
            if (change.table === 'entries') doc.createdBy = existing.createdBy;
            if (sameContent(existing, doc)) {
              stored = existing; // a retry
            } else {
              stored = { ...doc, seq: await nextSeq(familyId, session) };
              if (change.table === 'entries') {
                await db()
                  .collection(HISTORY)
                  .insertOne(
                    { _id: randomUUID() as never, familyId, entryId: existing._id, version: toRecord(existing), replacedAt: Date.now(), replacedBy: userId },
                    { session },
                  );
              }
              await c.replaceOne({ _id: doc._id }, stored, { session });
            }
          }
          accepted.push(change.changeId);
          touched.set(`${change.table}:${String(doc._id)}`, { table: change.table, record: toRecord(stored) });
        }
        rejected.push(...late.filter((l) => !rejected.some((r) => r.changeId === l.changeId)));
      });
    } finally {
      await session.endSession();
    }
  }
  return { accepted, rejected, records: [...touched.values()] };
}

/** Every record with seq above `since`, in seq order, at most `limit`. */
export async function readPull(familyId: string, since: number, limit: number): Promise<SyncPullResponse> {
  const pages = await Promise.all(
    SYNCED_TABLES.map(async (table) => {
      const docs = await coll(table)
        .find({ familyId, seq: { $gt: since } })
        .sort({ seq: 1 })
        .limit(limit + 1)
        .toArray();
      return docs.map((d: Document) => ({ table, record: toRecord(d) }) as SyncedRecord);
    }),
  );
  const merged = pages.flat().sort((a: SyncedRecord, b: SyncedRecord) => (a.record.seq as number) - (b.record.seq as number));
  const records = merged.slice(0, limit);
  return {
    records,
    maxSeq: records.length ? (records[records.length - 1]!.record.seq as number) : since,
    hasMore: merged.length > limit,
  };
}

export async function readEntryHistory(familyId: string, entryId: string): Promise<EntryHistoryItem[]> {
  const docs = await db()
    .collection(HISTORY)
    .find({ familyId, entryId })
    .sort({ replacedAt: -1 })
    .limit(50)
    .toArray();
  return docs.map((d: Document) => ({ version: d.version as SyncRecord, replacedAt: d.replacedAt as number, replacedBy: d.replacedBy as string }));
}
