import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { DEMO_ACCOUNTS, type AuthResponse, type MeResponse } from '@shagun/shared';
import { Family, Membership, User } from '../src/models.js';
import { bearer, makeApp, useDatabase } from './helpers.js';

useDatabase();

const [ASHA, ROHAN, MEENA, KABIR] = DEMO_ACCOUNTS;
const app = makeApp({ devLogin: true });

async function demoSignIn(account: (typeof DEMO_ACCOUNTS)[number], over = app): Promise<AuthResponse> {
  const res = await request(over).post('/auth/dev').send({ email: account.email, name: account.name });
  expect(res.status).toBe(200);
  return res.body;
}

async function me(auth: AuthResponse): Promise<MeResponse> {
  const res = await request(app).get('/me').set(bearer(auth));
  expect(res.status).toBe(200);
  return res.body;
}

const lastSeqs = async () => (await Family.find().sort({ name: 1 }).lean<{ lastSeq: number }[]>()).map((f) => f.lastSeq);

describe('demo accounts', () => {
  it('sets up every account and sample ledger on the first demo sign-in', async () => {
    await demoSignIn(ASHA);
    expect(await User.countDocuments()).toBe(DEMO_ACCOUNTS.length);
    expect(await Family.countDocuments()).toBe(2);
    expect((await lastSeqs()).every((seq) => seq > 0)).toBe(true);
  });

  it('gives each account the role the card shows, in both ledgers', async () => {
    for (const account of [ASHA, ROHAN, MEENA]) {
      const { families } = await me(await demoSignIn(account));
      expect(families.map((f) => f.name).sort()).toEqual(['Sharma parivaar', 'Yadav parivaar']);
      expect(families.find((f) => f.name === 'Sharma parivaar')!.role).toBe(account.role);
    }
  });

  it('leaves Kabir without a ledger', async () => {
    expect((await me(await demoSignIn(KABIR))).families).toEqual([]);
  });

  it('never seeds twice, and keeps what happened since', async () => {
    const asha = await demoSignIn(ASHA);
    const family = (await me(asha)).families.find((f) => f.role === 'owner')!;
    await request(app).patch(`/families/${family.id}`).set(bearer(asha)).send({ name: 'Renamed' }).expect(200);
    const meena = await demoSignIn(MEENA);
    await request(app).delete(`/families/${family.id}/members/${meena.user.id}`).set(bearer(asha)).expect(204);
    const seqs = await lastSeqs();

    await demoSignIn(ROHAN);
    await demoSignIn(ASHA);
    await demoSignIn(MEENA);

    expect(await Family.countDocuments()).toBe(2);
    expect(await lastSeqs()).toEqual(seqs);
    expect((await Family.findById(family.id).lean<{ name: string }>())!.name).toBe('Renamed');
    expect(await Membership.exists({ familyId: family.id, userId: meena.user.id })).toBeNull();
  });

  it('survives two first sign-ins at the same moment', async () => {
    await Promise.all([demoSignIn(ASHA), demoSignIn(ROHAN), demoSignIn(MEENA)]);
    expect(await Family.countDocuments()).toBe(2);
    expect(await User.countDocuments()).toBe(DEMO_ACCOUNTS.length);
  });

  it('adds nothing for any other developer email', async () => {
    await request(app).post('/auth/dev').send({ email: 'someone@example.com', name: 'Someone' }).expect(200);
    expect(await Family.countDocuments()).toBe(0);
    expect(await User.countDocuments()).toBe(1);
  });

  it('adds nothing without DEV_LOGIN', async () => {
    const res = await request(makeApp()).post('/auth/dev').send({ email: ASHA.email, name: ASHA.name });
    expect(res.status).toBe(404);
    expect(await User.countDocuments()).toBe(0);
    expect(await Family.countDocuments()).toBe(0);
  });
});
