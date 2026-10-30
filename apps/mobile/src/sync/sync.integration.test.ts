/**
 * Week 4 "done when": two phones log entries offline at the same time and both end up
 * with every entry. This is the build guide's manual offline test, automated:
 * two phones are two real SQLite databases running the app's own ledger and sync code;
 * the server is the real API on a real MongoDB replica set.
 */
import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AuthResponse, SyncPullResponse, SyncPushResponse } from '@shagun/shared';
import { createApp } from '../../../api/src/app';
import { syncIndexes } from '../../../api/src/models';
import { ensureSyncIndexes } from '../../../api/src/sync';
import {
  addEntry,
  addJoinedFamily,
  createEvent,
  createLocalFamily,
  deleteEntry,
  getEventEntries,
  getEventSummary,
  markFamilyRegistered,
  updateEntry,
  type LedgerContext,
  type LedgerDb,
} from '../db/ledger';
import * as schema from '../db/schema';
import { countRejected, countUnsynced, syncFamily, type SyncTransport } from './engine';

const SECRET = 'integration-secret-integration-secret-123';
const app = createApp({
  accessSecret: SECRET,
  verifyGoogle: async () => {
    throw new Error('not used');
  },
  devLogin: true,
  rateLimits: false,
});

let rs: MongoMemoryReplSet;
beforeAll(async () => {
  rs = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(rs.getUri());
  await syncIndexes();
  await ensureSyncIndexes();
});
beforeEach(async () => {
  for (const c of await mongoose.connection.db!.collections()) await c.deleteMany({});
});
afterAll(async () => {
  await mongoose.disconnect();
  await rs?.stop();
});

let clock = 1_790_000_000_000;

class NetworkDown extends Error {}

/** One phone: its own SQLite database, its own account, a switchable network. */
class Phone {
  db: LedgerDb;
  online = true;
  /** When set, the next push reaches the server but the reply is lost (app killed / signal dropped). */
  loseNextPushReply = false;
  /** When set, the pull fails after this many pages. */
  failPullAfterPages: number | null = null;
  ctx!: LedgerContext;

  constructor(
    readonly name: string,
    readonly auth: AuthResponse,
  ) {
    const sqlite = new Database(':memory:');
    const d = drizzle(sqlite, { schema });
    migrate(d, { migrationsFolder: path.join(__dirname, '../../drizzle') });
    this.db = d as unknown as LedgerDb;
  }

  use(familyId: string, role: LedgerContext['role']) {
    this.ctx = { db: this.db, familyId, deviceId: `${this.name}-device`, userId: this.auth.user.id, role, newId: randomUUID, now: () => ++clock };
  }

  transport(): SyncTransport {
    const auth = { Authorization: `Bearer ${this.auth.accessToken}` };
    let pages = 0;
    return {
      push: async (body) => {
        if (!this.online) throw new NetworkDown();
        const res = await request(app).post('/sync/push').set(auth).send(body);
        if (res.status !== 200) throw new Error(`push ${res.status} ${JSON.stringify(res.body)}`);
        if (this.loseNextPushReply) {
          this.loseNextPushReply = false;
          throw new NetworkDown();
        }
        return res.body as SyncPushResponse;
      },
      pull: async (familyId, since, limit) => {
        if (!this.online) throw new NetworkDown();
        if (this.failPullAfterPages !== null && pages++ >= this.failPullAfterPages) {
          this.failPullAfterPages = null;
          throw new NetworkDown();
        }
        const res = await request(app).get('/sync/pull').set(auth).query({ familyId, since, limit });
        if (res.status !== 200) throw new Error(`pull ${res.status}`);
        return res.body as SyncPullResponse;
      },
    };
  }

  sync() {
    return syncFamily(this.db, this.transport(), this.ctx.familyId);
  }

  /** Sync the way the app does: a dropped connection is not an error, just "try later". */
  async trySync() {
    try {
      return await this.sync();
    } catch (e) {
      if (e instanceof NetworkDown) return null;
      throw e;
    }
  }

  log(eventId: string, name: string, amount: number) {
    return addEntry(this.ctx, {
      eventId, personId: null, newPersonName: name, relation: null, direction: 'received',
      amount, mode: 'cash', itemNote: null, subFunction: null, note: null,
    });
  }

  entries(eventId: string) {
    return getEventEntries(this.db, eventId);
  }
}

async function signInDev(email: string, name: string): Promise<AuthResponse> {
  const res = await request(app).post('/auth/dev').send({ email, name });
  expect(res.status).toBe(200);
  return res.body;
}

/** Chinmay's phone creates the ledger and the event; Neha joins with a code; both sync. */
async function twoPhonesOneLedger() {
  const a = new Phone('A', await signInDev('chinmay@example.com', 'Chinmay'));
  const b = new Phone('B', await signInDev('neha@example.com', 'Neha'));

  const family = createLocalFamily(a.db, 'Dubey parivaar', randomUUID, a.auth.user.id);
  const auth = (p: Phone) => ({ Authorization: `Bearer ${p.auth.accessToken}` });
  await request(app).post('/families').set(auth(a)).send({ id: family.id, name: family.name }).expect(201);
  markFamilyRegistered(a.db, family.id, 1);
  a.use(family.id, 'owner');
  const event = createEvent(a.ctx, {
    title: "Ananya's Wedding", type: 'wedding', role: 'hosted', hostPersonId: null, hostName: null,
    date: '2026-02-14', subFunctions: ['wedding'], venue: 'Bhopal',
  });
  await a.sync();

  const invite = await request(app).post(`/families/${family.id}/invites`).set(auth(a)).send({ role: 'editor' });
  const join = await request(app).post(`/invites/${invite.body.code}/accept`).set(auth(b));
  addJoinedFamily(b.db, join.body.family, b.auth.user.id, 1);
  b.use(family.id, 'editor');
  await b.sync();
  expect(getEventSummary(b.db, family.id, event.id)?.title).toBe("Ananya's Wedding");
  return { a, b, familyId: family.id, eventId: event.id };
}

const total = (p: Phone, familyId: string, eventId: string) => getEventSummary(p.db, familyId, eventId)!;

describe('Week 4: two phones offline at the same wedding', () => {
  for (const order of ['A first', 'B first'] as const) {
    it(`both end with every entry, the edit and the delete (${order} comes online)`, async () => {
      const { a, b, familyId, eventId } = await twoPhonesOneLedger();

      // 1. Both phones lose signal and log 10 gifts each.
      a.online = false;
      b.online = false;
      for (let i = 1; i <= 10; i++) a.log(eventId, `A-guest ${i}`, 1000 + i);
      for (let i = 1; i <= 10; i++) b.log(eventId, `B-guest ${i}`, 2000 + i);
      expect(await a.trySync()).toBeNull();
      expect(countUnsynced(a.db)).toBe(20); // 10 people + 10 entries

      // Signal comes back briefly: everyone has all 20.
      a.online = b.online = true;
      await a.sync();
      await b.sync();
      await a.sync();
      expect(a.entries(eventId)).toHaveLength(20);
      expect(b.entries(eventId)).toHaveLength(20);

      // 2. Offline again. A edits an entry B created; B deletes a different entry (one A created).
      a.online = b.online = false;
      const bEntry = a.entries(eventId).find((e) => e.personName === 'B-guest 3')!;
      updateEntry(a.ctx, bEntry.id, {
        eventId, personId: bEntry.personId, newPersonName: null, relation: 'mama_ji', direction: 'received',
        amount: 5100, mode: 'upi', itemNote: null, subFunction: 'wedding', note: 'was ₹2,003 — typo',
      });
      const aEntry = b.entries(eventId).find((e) => e.personName === 'A-guest 7')!;
      deleteEntry(b.ctx, aEntry.id);

      // 3. Both come online, in either order, and sync until settled.
      const [first, second] = order === 'A first' ? [a, b] : [b, a];
      first.online = true;
      await first.sync();
      second.online = true;
      await second.sync();
      await first.sync();

      for (const p of [a, b]) {
        const list = p.entries(eventId);
        expect(list, `${p.name} live entries`).toHaveLength(19);
        expect(list.find((e) => e.id === aEntry.id), `${p.name} sees the delete`).toBeUndefined();
        const edited = list.find((e) => e.id === bEntry.id)!;
        expect(edited.amount, `${p.name} sees the edit`).toBe(5100);
        expect(edited.mode).toBe('upi');
        expect(countUnsynced(p.db)).toBe(0);
        expect(countRejected(p.db)).toBe(0);
      }
      const expected = [...Array(10)].reduce((s, _, i) => s + 1001 + i + 2001 + i, 0) - 2003 + 5100 - 1007;
      expect(total(a, familyId, eventId).received).toBe(expected);
      expect(total(b, familyId, eventId).received).toBe(expected);
    });
  }

  it('an edit and a delete of the same entry: the delete wins on both phones', async () => {
    const { a, b, familyId, eventId } = await twoPhonesOneLedger();
    const { entry } = a.log(eventId, 'Verma parivaar', 2100);
    await a.sync();
    await b.sync();

    a.online = b.online = false;
    deleteEntry(a.ctx, entry.id);
    updateEntry(b.ctx, entry.id, {
      eventId, personId: entry.personId, newPersonName: null, relation: null, direction: 'received',
      amount: 1100, mode: 'cash', itemNote: null, subFunction: null, note: null,
    });
    a.online = b.online = true;
    await a.sync(); // delete reaches the server first
    await b.sync(); // the edit arrives late and loses; B's reply corrects B at once
    await a.sync();
    for (const p of [a, b]) {
      expect(p.entries(eventId)).toHaveLength(0);
      expect(total(p, familyId, eventId).received).toBe(0);
    }
  });
});

describe('Week 4: interrupted syncs lose and double nothing', () => {
  it('a push whose reply is lost is retried safely', async () => {
    const { a, b, familyId, eventId } = await twoPhonesOneLedger();
    for (let i = 1; i <= 5; i++) a.log(eventId, `Guest ${i}`, 501);
    a.loseNextPushReply = true; // server saved it, phone never heard back
    expect(await a.trySync()).toBeNull();
    expect(countUnsynced(a.db)).toBe(10); // still queued on the phone

    await a.sync(); // retried: same ids, server sees identical records
    await b.sync();
    expect(a.entries(eventId)).toHaveLength(5);
    expect(b.entries(eventId)).toHaveLength(5);
    const server = await request(app)
      .get('/sync/pull')
      .set({ Authorization: `Bearer ${a.auth.accessToken}` })
      .query({ familyId, since: 0 });
    const serverEntries = (server.body as SyncPullResponse).records.filter((r) => r.table === 'entries');
    expect(serverEntries).toHaveLength(5);
    // 1 event + 5 people + 5 entries: the retry got no new sequence numbers.
    expect(server.body.maxSeq).toBe(11);
  });

  it('a pull cut off between pages resumes where it stopped', async () => {
    const { a, b, eventId } = await twoPhonesOneLedger();
    for (let i = 1; i <= 30; i++) a.log(eventId, `Guest ${i}`, 1100);
    await a.sync();

    // Pull in pages of 7 and drop the connection after 2 pages.
    b.failPullAfterPages = 2;
    const t = b.transport();
    const small: SyncTransport = { push: t.push, pull: (f, s) => t.pull(f, s, 7) };
    const { pullFamily } = await import('./engine');
    await expect(pullFamily(b.db, small, b.ctx.familyId, 7)).rejects.toBeInstanceOf(NetworkDown);
    const partial = b.entries(eventId).length;
    expect(partial).toBeGreaterThan(0);
    expect(partial).toBeLessThan(30);

    await b.sync();
    expect(b.entries(eventId)).toHaveLength(30);
  });

  it('a record changed locally during a pull is not overwritten; the newer local change goes up next', async () => {
    const { a, b, eventId } = await twoPhonesOneLedger();
    const { entry } = a.log(eventId, 'Pandey parivaar', 11000);
    await a.sync();
    await b.sync();

    // A changes the amount on the server…
    updateEntry(a.ctx, entry.id, { eventId, personId: entry.personId, newPersonName: null, relation: null, direction: 'received', amount: 5100, mode: 'cash', itemNote: null, subFunction: null, note: null });
    await a.sync();
    // …while B, not yet synced, changes the note. B's pending change is kept, then pushed (last write wins).
    updateEntry(b.ctx, entry.id, { eventId, personId: entry.personId, newPersonName: null, relation: null, direction: 'received', amount: 11000, mode: 'cash', itemNote: null, subFunction: null, note: 'counted twice' });
    const { pullFamily } = await import('./engine');
    await pullFamily(b.db, b.transport(), b.ctx.familyId);
    expect(b.entries(eventId)[0]!.amount).toBe(11000); // not overwritten by the pull
    await b.sync();
    await a.sync();
    expect(a.entries(eventId)[0]!.amount).toBe(11000);
    expect(b.entries(eventId)[0]!.amount).toBe(11000);
    const history = await request(app)
      .get(`/families/${b.ctx.familyId}/entries/${entry.id}/history`)
      .set({ Authorization: `Bearer ${a.auth.accessToken}` });
    expect(history.body.map((h: { version: { amount: number } }) => h.version.amount)).toEqual([5100, 11000]);
  });

  it('parks a record the server rejects instead of retrying it forever', async () => {
    const { a, eventId } = await twoPhonesOneLedger();
    a.log(eventId, 'Fine', 1100);
    // Corrupt a queued change the way a bug might.
    const row = a.db.select().from(schema.outbox).all().find((r) => r.tableName === 'entries')!;
    const bad = { ...JSON.parse(row.payload), amount: -5 };
    a.db.update(schema.outbox).set({ payload: JSON.stringify(bad) }).where(eq(schema.outbox.id, row.id)).run();
    const res = await a.sync();
    expect(res.rejected).toBe(1);
    expect(res.pushed).toBe(1); // the person still went up
    expect(countRejected(a.db)).toBe(1);
    expect(countUnsynced(a.db)).toBe(0);
    expect((await a.sync()).pushed).toBe(0); // not re-sent
  });
});
