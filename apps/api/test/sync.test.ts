import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { AuthResponse, SyncChange, SyncPullResponse, SyncPushResponse } from '@shagun/shared';
import { bearer, makeApp, signIn, useDatabase } from './helpers.js';

useDatabase();
const app = makeApp();

async function family() {
  const owner = await signIn(app, 'o', 'owner@example.com', 'Owner');
  const editor = await signIn(app, 'e', 'editor@example.com', 'Editor');
  const viewer = await signIn(app, 'v', 'viewer@example.com', 'Viewer');
  const familyId = randomUUID();
  await request(app).post('/families').set(bearer(owner)).send({ id: familyId, name: 'Dubey parivaar' }).expect(201);
  for (const [who, role] of [[editor, 'editor'], [viewer, 'viewer']] as const) {
    const { body } = await request(app).post(`/families/${familyId}/invites`).set(bearer(owner)).send({ role });
    await request(app).post(`/invites/${body.code}/accept`).set(bearer(who)).expect(200);
  }
  return { owner, editor, viewer, familyId };
}

const now = () => Date.now();
const person = (familyId: string, displayName: string, over: object = {}) => ({
  id: randomUUID(), familyId, updatedAt: now(), deletedAt: null, seq: null,
  displayName, nameLatin: 'client-made-key', nameDevanagari: null, relation: null, city: null, phone: null, mergedInto: null, ...over,
});
const event = (familyId: string, over: object = {}) => ({
  id: randomUUID(), familyId, updatedAt: now(), deletedAt: null, seq: null,
  title: "Ananya's Wedding", type: 'wedding', role: 'hosted', hostPersonId: null, date: '2026-02-14', subFunctions: ['wedding'], venue: null, ...over,
});
const entry = (familyId: string, eventId: string, personId: string, over: object = {}) => ({
  id: randomUUID(), familyId, updatedAt: now(), deletedAt: null, seq: null,
  eventId, personId, direction: 'received', amount: 1100, mode: 'cash', itemNote: null, subFunction: 'wedding', note: null,
  photoKey: null, createdBy: 'local', deviceId: 'phone-a', createdAt: now(), ...over,
});

let changeId = 1;
const ch = (table: SyncChange['table'], record: object, op: SyncChange['op'] = 'upsert'): SyncChange =>
  ({ changeId: changeId++, table, op, record: record as Record<string, unknown> });

async function push(who: AuthResponse, familyId: string, changes: SyncChange[]) {
  const res = await request(app).post('/sync/push').set(bearer(who)).send({ familyId, changes });
  return res as unknown as { status: number; body: SyncPushResponse & { error?: { code: string } } };
}
async function pull(who: AuthResponse, familyId: string, since = 0, limit?: number): Promise<SyncPullResponse> {
  const res = await request(app).get('/sync/pull').query({ familyId, since, ...(limit ? { limit } : {}) }).set(bearer(who));
  expect(res.status).toBe(200);
  return res.body;
}

describe('push and pull', () => {
  it('assigns increasing server sequence numbers and pulls in seq order', async () => {
    const { owner, editor, familyId } = await family();
    const p = person(familyId, 'Shri Ramesh Sharma ji');
    const e = event(familyId);
    const g = entry(familyId, e.id, p.id);
    const res = await push(owner, familyId, [ch('people', p), ch('events', e), ch('entries', g)]);
    expect(res.status).toBe(200);
    expect(res.body.accepted).toHaveLength(3);
    expect(res.body.rejected).toEqual([]);
    expect(res.body.records.map((r) => r.record.seq)).toEqual([1, 2, 3]);

    const all = await pull(editor, familyId);
    expect(all.records.map((r) => [r.table, r.record.seq])).toEqual([['people', 1], ['events', 2], ['entries', 3]]);
    expect(all.maxSeq).toBe(3);
    expect(all.hasMore).toBe(false);
    // The server computes its own match key, and takes createdBy from the signed-in user.
    expect(all.records[0]!.record.nameLatin).toBe('ramesh sharm');
    expect(all.records[2]!.record.createdBy).toBe(owner.user.id);
    expect(all.records[2]!.record.createdAt).toBe(g.createdAt);

    expect((await pull(editor, familyId, 3)).records).toEqual([]);
    expect((await pull(editor, familyId, 2)).records.map((r) => r.table)).toEqual(['entries']);
  });

  it('pages with hasMore', async () => {
    const { owner, familyId } = await family();
    await push(owner, familyId, Array.from({ length: 7 }, (_, i) => ch('people', person(familyId, `Guest ${i}`))));
    const first = await pull(owner, familyId, 0, 3);
    expect(first.records.map((r) => r.record.seq)).toEqual([1, 2, 3]);
    expect(first.hasMore).toBe(true);
    const second = await pull(owner, familyId, first.maxSeq, 3);
    expect(second.records.map((r) => r.record.seq)).toEqual([4, 5, 6]);
    const third = await pull(owner, familyId, second.maxSeq, 3);
    expect(third.records.map((r) => r.record.seq)).toEqual([7]);
    expect(third.hasMore).toBe(false);
  });

  it('lets viewers pull but not push, and hides other families', async () => {
    const { owner, viewer, familyId } = await family();
    await push(owner, familyId, [ch('people', person(familyId, 'A'))]);
    const denied = await push(viewer, familyId, [ch('people', person(familyId, 'B'))]);
    expect(denied.status).toBe(403);
    expect((await pull(viewer, familyId)).records).toHaveLength(1);

    const outsider = await signIn(app, 'x', 'x@example.com', 'X');
    expect((await push(outsider, familyId, [ch('people', person(familyId, 'C'))])).status).toBe(404);
    const res = await request(app).get('/sync/pull').query({ familyId }).set(bearer(outsider));
    expect(res.status).toBe(404);
  });
});

describe('conflict rules', () => {
  it('retries are safe: the same record twice changes nothing and gets no new seq', async () => {
    const { owner, familyId } = await family();
    const p = person(familyId, 'Sunita Mishra');
    await push(owner, familyId, [ch('people', p)]);
    const again = await push(owner, familyId, [ch('people', p)]);
    expect(again.body.accepted).toHaveLength(1);
    expect(again.body.records[0]!.record.seq).toBe(1);
    expect((await pull(owner, familyId)).maxSeq).toBe(1);
  });

  it('edits: the last write to reach the server wins and the old version goes to history', async () => {
    const { owner, editor, familyId } = await family();
    const p = person(familyId, 'Anil Khare');
    const e = event(familyId);
    const g = entry(familyId, e.id, p.id, { amount: 2100 });
    await push(owner, familyId, [ch('people', p), ch('events', e), ch('entries', g)]);

    await push(editor, familyId, [ch('entries', { ...g, amount: 1100, updatedAt: now() + 1 })]);
    const last = await push(owner, familyId, [ch('entries', { ...g, amount: 5100, mode: 'upi', updatedAt: now() + 2 })]);
    expect(last.body.records[0]!.record.amount).toBe(5100);
    expect(last.body.records[0]!.record.seq).toBe(5);
    // createdBy stays with whoever logged the gift first.
    expect(last.body.records[0]!.record.createdBy).toBe(owner.user.id);

    const history = await request(app).get(`/families/${familyId}/entries/${g.id}/history`).set(bearer(editor));
    expect(history.status).toBe(200);
    expect(history.body.map((h: { version: { amount: number } }) => h.version.amount)).toEqual([1100, 2100]);
    expect(history.body[0].replacedBy).toBe(owner.user.id);
  });

  it('deletes are soft and win over a later edit', async () => {
    const { owner, editor, familyId } = await family();
    const p = person(familyId, 'Joshi parivaar');
    const e = event(familyId);
    const g = entry(familyId, e.id, p.id, { amount: 501 });
    await push(owner, familyId, [ch('people', p), ch('events', e), ch('entries', g)]);

    const del = await push(owner, familyId, [ch('entries', { ...g, deletedAt: now(), updatedAt: now() }, 'delete')]);
    expect(del.body.records[0]!.record.deletedAt).not.toBeNull();
    const edit = await push(editor, familyId, [ch('entries', { ...g, amount: 1100, updatedAt: now() + 5 })]);
    expect(edit.body.accepted).toHaveLength(1);
    // The reply carries the server's copy: still deleted, so the editor's phone corrects itself.
    expect(edit.body.records[0]!.record.deletedAt).not.toBeNull();
    expect(edit.body.records[0]!.record.amount).toBe(501);
  });

  it('rejects bad records without sinking the rest of the batch', async () => {
    const { owner, familyId } = await family();
    const p = person(familyId, 'Good');
    const e = event(familyId);
    const bad = entry(familyId, e.id, p.id, { amount: 10.5 });
    const otherFamily = person(randomUUID(), 'Wrong family');
    const res = await push(owner, familyId, [ch('people', p), ch('entries', bad), ch('people', otherFamily), ch('events', e)]);
    expect(res.body.accepted).toHaveLength(2);
    expect(res.body.rejected.map((r) => r.code)).toEqual(['VALIDATION', 'VALIDATION']);
    expect(res.body.rejected[0]!.message).toMatch(/amount/);
  });

  it('refuses to let one family overwrite another family’s record id', async () => {
    const a = await family();
    const p = person(a.familyId, 'Mine');
    await push(a.owner, a.familyId, [ch('people', p)]);

    const other = await signIn(app, 'z', 'z@example.com', 'Z');
    const zFamily = randomUUID();
    await request(app).post('/families').set(bearer(other)).send({ id: zFamily, name: 'Z' }).expect(201);
    const hijack = await push(other, zFamily, [ch('people', { ...p, familyId: zFamily, displayName: 'Stolen' })]);
    expect(hijack.body.accepted).toEqual([]);
    expect(hijack.body.rejected[0]!.code).toBe('CONFLICT');
    expect((await pull(a.owner, a.familyId)).records[0]!.record.displayName).toBe('Mine');
  });

  it('two phones pushing at once get distinct, gap-free sequence numbers', async () => {
    const { owner, editor, familyId } = await family();
    const batch = (n: number) => Array.from({ length: n }, (_, i) => ch('people', person(familyId, `P${n}-${i}`)));
    const [r1, r2] = await Promise.all([push(owner, familyId, batch(20)), push(editor, familyId, batch(20))]);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    const seqs = (await pull(owner, familyId)).records.map((r) => r.record.seq);
    expect(seqs).toEqual(Array.from({ length: 40 }, (_, i) => i + 1));
  });
});

describe('Week 5: merging people', () => {
  /** Two people who are the same household, each with a gift, synced to the server. */
  async function duplicates() {
    const f = await family();
    const keep = person(f.familyId, 'Ramesh Sharma');
    const dup = person(f.familyId, 'रमेश शर्मा');
    const e = event(f.familyId);
    const g1 = entry(f.familyId, e.id, keep.id, { amount: 1100 });
    const g2 = entry(f.familyId, e.id, dup.id, { amount: 2100 });
    await push(f.owner, f.familyId, [ch('people', keep), ch('people', dup), ch('events', e), ch('entries', g1), ch('entries', g2)]);
    return { ...f, keep, dup, e, g1, g2 };
  }
  const merged = (p: object, into: string) => ({ ...p, mergedInto: into, updatedAt: now() + 10 });
  const latest = async (who: AuthResponse, familyId: string) => {
    const byId = new Map<string, Record<string, unknown>>();
    for (const r of (await pull(who, familyId)).records) byId.set(r.record.id, r.record);
    return byId;
  };

  it('moves gifts logged on a phone that hadn’t heard of the merge to the kept person', async () => {
    const { owner, editor, familyId, keep, dup, e, g2 } = await duplicates();
    // The owner's phone merges: moves its copy of the gift, then marks the duplicate.
    await push(owner, familyId, [ch('entries', { ...g2, personId: keep.id, updatedAt: now() + 5 }), ch('people', merged(dup, keep.id))]);
    // The editor's phone, offline during the merge, logs another gift against the duplicate.
    const late = entry(familyId, e.id, dup.id, { amount: 501 });
    const res = await push(editor, familyId, [ch('entries', late)]);
    expect(res.body.records[0]!.record.personId).toBe(keep.id);

    const server = await latest(editor, familyId);
    expect(server.get(dup.id)!.mergedInto).toBe(keep.id);
    const gifts = [...server.values()].filter((r) => r.eventId === e.id);
    expect(gifts.map((g) => g.personId)).toEqual([keep.id, keep.id, keep.id]);
  });

  it('moves gifts the server already had when the merge arrives, keeping history', async () => {
    const { owner, familyId, keep, dup, g2 } = await duplicates();
    // A merge record on its own (the phone's own moves were lost): the server moves the rest.
    await push(owner, familyId, [ch('people', merged(dup, keep.id))]);
    const server = await latest(owner, familyId);
    expect(server.get(g2.id)!.personId).toBe(keep.id);
    const history = await request(app).get(`/families/${familyId}/entries/${g2.id}/history`).set(bearer(owner));
    expect(history.body.map((h: { version: { personId: string } }) => h.version.personId)).toEqual([dup.id]);
  });

  it('keeps a merge when a phone that hadn’t heard of it edits the merged person', async () => {
    const { owner, editor, familyId, keep, dup } = await duplicates();
    await push(owner, familyId, [ch('people', merged(dup, keep.id))]);
    const stale = await push(editor, familyId, [ch('people', { ...dup, phone: '9826012345', updatedAt: now() + 20 })]);
    expect(stale.body.records[0]!.record.mergedInto).toBe(keep.id);
    expect(stale.body.records[0]!.record.phone).toBe('9826012345');
  });

  it('two phones merging each other’s way end with one person and every gift', async () => {
    const { owner, editor, familyId, keep, dup, g1, g2 } = await duplicates();
    // Owner keeps "Ramesh Sharma"; editor, offline, kept "रमेश शर्मा".
    await push(owner, familyId, [ch('entries', { ...g2, personId: keep.id, updatedAt: now() + 5 }), ch('people', merged(dup, keep.id))]);
    const res = await push(editor, familyId, [ch('entries', { ...g1, personId: dup.id, updatedAt: now() + 6 }), ch('people', merged(keep, dup.id))]);
    expect(res.body.rejected).toEqual([]);

    const server = await latest(owner, familyId);
    expect(server.get(dup.id)!.mergedInto).toBe(keep.id);
    expect(server.get(keep.id)!.mergedInto).toBeNull(); // the loop-making merge was dropped
    expect([g1.id, g2.id].map((id) => server.get(id)!.personId)).toEqual([keep.id, keep.id]);
  });

  it('follows a chain of merges and refuses a merge into another ledger’s person', async () => {
    const { owner, familyId, keep, dup, e } = await duplicates();
    const third = person(familyId, 'Sharma ji Indore');
    await push(owner, familyId, [ch('people', third), ch('people', merged(dup, keep.id))]);
    await push(owner, familyId, [ch('people', merged(keep, third.id))]);
    const late = await push(owner, familyId, [ch('entries', entry(familyId, e.id, dup.id))]);
    expect(late.body.records[0]!.record.personId).toBe(third.id);

    const stranger = person(familyId, 'Stranger');
    const res = await push(owner, familyId, [ch('people', { ...stranger, mergedInto: randomUUID() })]);
    expect(res.body.rejected.map((r) => r.code)).toEqual(['VALIDATION']);
  });
});
