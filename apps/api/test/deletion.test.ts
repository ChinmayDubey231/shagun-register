import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { AccountDeletionPreview, AuthResponse, MeResponse, SyncChange } from '@shagun/shared';
import { LEDGER_GRACE_MS, purgeDeletedFamilies } from '../src/deletion.js';
import { Family, Invite, Membership, RefreshToken, User } from '../src/models.js';
import { bearer, makeApp, signIn, useDatabase } from './helpers.js';

useDatabase();
const app = makeApp();

const asOwner = () => signIn(app, 'o', 'owner@example.com', 'Owner');
const asEditor = () => signIn(app, 'e', 'editor@example.com', 'Editor');
const asViewer = () => signIn(app, 'v', 'viewer@example.com', 'Viewer');

async function makeLedger(owner: AuthResponse, name: string, members: [AuthResponse, 'editor' | 'viewer'][] = []) {
  const familyId = randomUUID();
  await request(app).post('/families').set(bearer(owner)).send({ id: familyId, name }).expect(201);
  for (const [who, role] of members) {
    const { body } = await request(app).post(`/families/${familyId}/invites`).set(bearer(owner)).send({ role });
    await request(app).post(`/invites/${body.code}/accept`).set(bearer(who)).expect(200);
  }
  return familyId;
}

let changeId = 1;
const ch = (table: SyncChange['table'], record: object): SyncChange => ({ changeId: changeId++, table, op: 'upsert', record: record as Record<string, unknown> });

/** One of each synced record, then an edit, so entry history has a row too. */
async function addRecords(who: AuthResponse, familyId: string) {
  const at = Date.now();
  const base = { familyId, updatedAt: at, deletedAt: null, seq: null };
  const person = { ...base, id: randomUUID(), displayName: 'Ramesh Sharma', nameLatin: 'x', nameDevanagari: null, relation: null, city: null, phone: null, mergedInto: null };
  const event = { ...base, id: randomUUID(), title: 'Wedding', type: 'wedding', role: 'hosted', hostPersonId: null, date: '2026-02-14', subFunctions: [], venue: null };
  const entry = { ...base, id: randomUUID(), eventId: event.id, personId: person.id, direction: 'received', amount: 1100, mode: 'cash', itemNote: null, subFunction: null, note: null, photoKey: null, createdBy: 'local', deviceId: 'phone-a', createdAt: at };
  const count = { ...base, id: randomUUID(), eventId: event.id, countedAmount: 1100, countedBy: 'local', countedAt: at };
  for (const changes of [
    [ch('people', person), ch('events', event), ch('entries', entry), ch('cashCounts', count)],
    [ch('entries', { ...entry, amount: 2100, updatedAt: at + 1000 })],
  ]) {
    const res = await request(app).post('/sync/push').set(bearer(who)).send({ familyId, changes });
    expect(res.status).toBe(200);
    expect(res.body.rejected).toEqual([]);
  }
  return { entryId: entry.id };
}

const COLLECTIONS = ['people', 'events', 'entries', 'cashCounts', 'entryHistory'];
const recordCounts = async (familyId: string) => {
  const counts: Record<string, number> = {};
  for (const name of COLLECTIONS) counts[name] = await mongoose.connection.db!.collection(name).countDocuments({ familyId });
  return counts;
};
const ALL_ONE = { people: 1, events: 1, entries: 1, cashCounts: 1, entryHistory: 1 };
const ALL_ZERO = { people: 0, events: 0, entries: 0, cashCounts: 0, entryHistory: 0 };

const ledgers = async (who: AuthResponse) => ((await request(app).get('/me').set(bearer(who)).expect(200)).body as MeResponse).families;
const preview = async (who: AuthResponse) => (await request(app).get('/me/deletion').set(bearer(who)).expect(200)).body as AccountDeletionPreview;
const names = (list: { name: string }[]) => list.map((f) => f.name).sort();

describe('handing a ledger over', () => {
  it('swaps the roles, and the old owner can then leave', async () => {
    const [owner, editor] = [await asOwner(), await asEditor()];
    const familyId = await makeLedger(owner, 'Dubey parivaar', [[editor, 'editor']]);

    const res = await request(app).post(`/families/${familyId}/owner`).set(bearer(owner)).send({ userId: editor.user.id });
    expect(res.status).toBe(200);

    expect((await ledgers(editor))[0]!.role).toBe('owner');
    expect((await ledgers(owner))[0]!.role).toBe('editor');
    expect((await Family.findById(familyId).lean<{ ownerId: string }>())!.ownerId).toBe(editor.user.id);

    await request(app).patch(`/families/${familyId}`).set(bearer(owner)).send({ name: 'No' }).expect(403);
    await request(app).patch(`/families/${familyId}`).set(bearer(editor)).send({ name: 'Yes' }).expect(200);
    await request(app).delete(`/families/${familyId}/members/${editor.user.id}`).set(bearer(editor)).expect(409);
    await request(app).delete(`/families/${familyId}/members/${owner.user.id}`).set(bearer(owner)).expect(204);
  });

  it('only goes from the owner to another member', async () => {
    const [owner, editor, viewer] = [await asOwner(), await asEditor(), await asViewer()];
    const stranger = await signIn(app, 's', 'stranger@example.com', 'Stranger');
    const familyId = await makeLedger(owner, 'Dubey parivaar', [[editor, 'editor'], [viewer, 'viewer']]);
    const handOver = (who: AuthResponse, userId: string) => request(app).post(`/families/${familyId}/owner`).set(bearer(who)).send({ userId });

    expect((await handOver(editor, editor.user.id)).status).toBe(403);
    expect((await handOver(stranger, stranger.user.id)).status).toBe(404);
    expect((await handOver(owner, owner.user.id)).status).toBe(400);
    expect((await handOver(owner, stranger.user.id)).status).toBe(404);

    // The failed attempts changed nothing.
    expect((await Family.findById(familyId).lean<{ ownerId: string }>())!.ownerId).toBe(owner.user.id);
    expect((await ledgers(owner))[0]!.role).toBe('owner');
    expect(await Membership.countDocuments({ familyId, role: 'owner' })).toBe(1);
  });

  it('leaves one owner when two hand-overs race', async () => {
    const [owner, editor, viewer] = [await asOwner(), await asEditor(), await asViewer()];
    const familyId = await makeLedger(owner, 'Dubey parivaar', [[editor, 'editor'], [viewer, 'viewer']]);

    await Promise.all(
      [editor, viewer].map((to) => request(app).post(`/families/${familyId}/owner`).set(bearer(owner)).send({ userId: to.user.id })),
    );

    const owners = await Membership.find({ familyId, role: 'owner' }).lean<{ userId: string }[]>();
    expect(owners).toHaveLength(1);
    expect((await Family.findById(familyId).lean<{ ownerId: string }>())!.ownerId).toBe(owners[0]!.userId);
  });
});

describe('deleting a ledger', () => {
  it('cuts members off at once and keeps the data through the grace period', async () => {
    const [owner, viewer] = [await asOwner(), await asViewer()];
    const familyId = await makeLedger(owner, 'Dubey parivaar', [[viewer, 'viewer']]);
    await addRecords(owner, familyId);

    await request(app).delete(`/families/${familyId}`).set(bearer(viewer)).expect(403);
    await request(app).delete(`/families/${familyId}`).set(bearer(owner)).expect(204);

    expect(await ledgers(owner)).toEqual([]);
    expect(await ledgers(viewer)).toEqual([]);
    await request(app).get('/sync/pull').query({ familyId, since: 0 }).set(bearer(viewer)).expect(404);
    const change = ch('people', { familyId, updatedAt: Date.now(), deletedAt: null, seq: null, id: randomUUID(), displayName: 'Late', nameLatin: 'x', nameDevanagari: null, relation: null, city: null, phone: null, mergedInto: null });
    await request(app).post('/sync/push').set(bearer(owner)).send({ familyId, changes: [change] }).expect(404);

    expect(await purgeDeletedFamilies(Date.now() + LEDGER_GRACE_MS - 60_000)).toBe(0);
    expect(await recordCounts(familyId)).toEqual(ALL_ONE);
  });

  it('erases it for good after the grace period, and nothing of any other ledger', async () => {
    const owner = await asOwner();
    const [gone, kept] = [await makeLedger(owner, 'Gone'), await makeLedger(owner, 'Kept')];
    await addRecords(owner, gone);
    await addRecords(owner, kept);
    await request(app).post(`/families/${gone}/invites`).set(bearer(owner)).send({ role: 'editor' }).expect(201);

    await request(app).delete(`/families/${gone}`).set(bearer(owner)).expect(204);
    expect(await purgeDeletedFamilies(Date.now() + LEDGER_GRACE_MS + 60_000)).toBe(1);

    expect(await recordCounts(gone)).toEqual(ALL_ZERO);
    expect(await Family.exists({ _id: gone })).toBeNull();
    expect(await Membership.exists({ familyId: gone })).toBeNull();
    expect(await Invite.exists({ familyId: gone })).toBeNull();

    expect(await recordCounts(kept)).toEqual(ALL_ONE);
    expect(names(await ledgers(owner))).toEqual(['Kept']);
  });
});

describe('deleting an account', () => {
  it('sorts ledgers into deleted, blocking and left', async () => {
    const [owner, editor] = [await asOwner(), await asEditor()];
    await makeLedger(owner, 'Mine alone');
    await makeLedger(owner, 'Shared', [[editor, 'editor']]);
    await makeLedger(editor, "Editor's", [[owner, 'viewer']]);
    const alreadyDeleted = await makeLedger(owner, 'Already deleted');
    await request(app).delete(`/families/${alreadyDeleted}`).set(bearer(owner)).expect(204);

    const p = await preview(owner);
    expect(names(p.deletes)).toEqual(['Mine alone']);
    expect(names(p.blocks)).toEqual(['Shared']);
    expect(names(p.leaves)).toEqual(["Editor's"]);
  });

  it('refuses while the account owns a shared ledger, and changes nothing', async () => {
    const [owner, editor] = [await asOwner(), await asEditor()];
    const alone = await makeLedger(owner, 'Mine alone');
    const shared = await makeLedger(owner, 'Shared', [[editor, 'editor']]);
    await addRecords(owner, alone);

    const res = await request(app).delete('/me').set(bearer(owner));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('OWNS_SHARED_LEDGER');

    expect(await User.exists({ _id: owner.user.id })).not.toBeNull();
    expect(await recordCounts(alone)).toEqual(ALL_ONE);
    expect(names(await ledgers(owner))).toEqual(['Mine alone', 'Shared']);
    expect(await Family.exists({ _id: shared, deletedAt: null })).not.toBeNull();
    await request(app).post('/auth/refresh').send({ refreshToken: owner.refreshToken }).expect(200);
  });

  it('removes the account, its tokens and the ledgers only it used, at once', async () => {
    const owner = await asOwner();
    const alone = await makeLedger(owner, 'Mine alone');
    const deletedEarlier = await makeLedger(owner, 'Deleted earlier');
    await addRecords(owner, alone);
    await addRecords(owner, deletedEarlier);
    await request(app).post(`/families/${alone}/invites`).set(bearer(owner)).send({ role: 'editor' }).expect(201);
    await request(app).delete(`/families/${deletedEarlier}`).set(bearer(owner)).expect(204);

    await request(app).delete('/me').set(bearer(owner)).expect(204);

    expect(await User.exists({ _id: owner.user.id })).toBeNull();
    expect(await RefreshToken.exists({ userId: owner.user.id })).toBeNull();
    expect(await Membership.exists({ userId: owner.user.id })).toBeNull();
    expect(await Invite.exists({ createdBy: owner.user.id })).toBeNull();
    for (const familyId of [alone, deletedEarlier]) {
      expect(await Family.exists({ _id: familyId })).toBeNull();
      expect(await recordCounts(familyId)).toEqual(ALL_ZERO);
    }
    await request(app).get('/me').set(bearer(owner)).expect(401);
    await request(app).post('/auth/refresh').send({ refreshToken: owner.refreshToken }).expect(401);
  });

  it('leaves other families with their record, and no name or email behind', async () => {
    const [owner, editor] = [await asOwner(), await asEditor()];
    const familyId = await makeLedger(owner, 'Dubey parivaar', [[editor, 'editor']]);
    await addRecords(editor, familyId);

    await request(app).delete('/me').set(bearer(editor)).expect(204);

    expect(await recordCounts(familyId)).toEqual(ALL_ONE);
    const { body } = await request(app).get(`/families/${familyId}`).set(bearer(owner)).expect(200);
    expect(body.members.map((m: { name: string }) => m.name)).toEqual(['Owner']);
    expect(JSON.stringify(await mongoose.connection.db!.collection('entries').find({ familyId }).toArray())).not.toContain('editor@example.com');
  });

  it('goes through once the shared ledger is handed over, and the ledger lives on', async () => {
    const [owner, editor] = [await asOwner(), await asEditor()];
    const familyId = await makeLedger(owner, 'Dubey parivaar', [[editor, 'editor']]);
    await addRecords(owner, familyId);
    await request(app).delete('/me').set(bearer(owner)).expect(409);

    await request(app).post(`/families/${familyId}/owner`).set(bearer(owner)).send({ userId: editor.user.id }).expect(200);
    await request(app).delete('/me').set(bearer(owner)).expect(204);

    expect(await recordCounts(familyId)).toEqual(ALL_ONE);
    expect((await ledgers(editor))[0]).toMatchObject({ name: 'Dubey parivaar', role: 'owner' });
  });

  it('goes through once the shared ledger is deleted, without waiting out its grace period', async () => {
    const [owner, editor] = [await asOwner(), await asEditor()];
    const familyId = await makeLedger(owner, 'Dubey parivaar', [[editor, 'editor']]);
    await addRecords(owner, familyId);
    await request(app).delete(`/families/${familyId}`).set(bearer(owner)).expect(204);

    await request(app).delete('/me').set(bearer(owner)).expect(204);

    expect(await Family.exists({ _id: familyId })).toBeNull();
    expect(await recordCounts(familyId)).toEqual(ALL_ZERO);
  });

  it('starts from nothing if the same person signs in again', async () => {
    const owner = await asOwner();
    await makeLedger(owner, 'Mine alone');
    await request(app).delete('/me').set(bearer(owner)).expect(204);

    const again = await asOwner();
    expect(again.user.id).not.toBe(owner.user.id);
    expect(await ledgers(again)).toEqual([]);
  });
});
