import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { Invite } from '../src/models.js';
import { bearer, googleToken, makeApp, SECRET, signIn, useDatabase } from './helpers.js';

useDatabase();
const app = makeApp();

describe('Week 3 done-when: two family members join the same ledger', () => {
  it('owner creates the ledger and an invite; a relative joins with the code; both see each other', async () => {
    const chinmay = await signIn(app, 'g-chinmay', 'chinmay@example.com', 'Chinmay Dubey');
    const neha = await signIn(app, 'g-neha', 'neha@example.com', 'Neha Dubey');

    // The phone made this id offline in week 1; registering it keeps all local records valid.
    const familyId = randomUUID();
    const created = await request(app).post('/families').set(bearer(chinmay)).send({ id: familyId, name: 'Dubey parivaar' });
    expect(created.status).toBe(201);
    expect(created.body).toEqual({ id: familyId, name: 'Dubey parivaar', role: 'owner' });

    const invite = await request(app).post(`/families/${familyId}/invites`).set(bearer(chinmay)).send({ role: 'editor' });
    expect(invite.status).toBe(201);
    expect(invite.body.code).toMatch(/^[A-HJKMNP-Z2-9]{6}$/);
    expect(invite.body.expiresAt - Date.now()).toBeGreaterThan(47 * 3600_000);

    // Typed sloppily, as people do.
    const typed = invite.body.code.toLowerCase().slice(0, 3) + '-' + invite.body.code.toLowerCase().slice(3);
    const join = await request(app).post(`/invites/${typed}/accept`).set(bearer(neha));
    expect(join.status).toBe(200);
    expect(join.body).toEqual({ family: { id: familyId, name: 'Dubey parivaar', role: 'editor' }, alreadyMember: false });

    for (const who of [chinmay, neha]) {
      const detail = await request(app).get(`/families/${familyId}`).set(bearer(who));
      expect(detail.status).toBe(200);
      expect(detail.body.members.map((m: { name: string; role: string }) => [m.name, m.role])).toEqual([
        ['Chinmay Dubey', 'owner'],
        ['Neha Dubey', 'editor'],
      ]);
    }
    const nehaMe = await request(app).get('/me').set(bearer(neha));
    expect(nehaMe.body.families).toEqual([{ id: familyId, name: 'Dubey parivaar', role: 'editor' }]);
  });
});

describe('sign-in and tokens', () => {
  it('creates the user once and keeps a name they edited', async () => {
    const first = await signIn(app, 'g1', 'a@example.com', 'Asha');
    await request(app).patch('/me').set(bearer(first)).send({ name: 'Asha Dubey', language: 'hi' }).expect(200);
    const again = await signIn(app, 'g1', 'a@example.com', 'Asha');
    expect(again.user).toEqual({ id: first.user.id, name: 'Asha Dubey', email: 'a@example.com', language: 'hi' });
  });

  it('rejects a bad Google token, a missing token and a forged JWT', async () => {
    const bad = await request(app).post('/auth/google').send({ idToken: 'not-a-google-token-at-all' });
    expect(bad.status).toBe(401);
    expect((await request(app).get('/me')).body.error.code).toBe('UNAUTHENTICATED');
    const forged = jwt.sign({}, 'some-other-secret-that-is-long-enough!!', { subject: 'x', issuer: 'shagun-register' });
    expect((await request(app).get('/me').set('Authorization', `Bearer ${forged}`)).status).toBe(401);
  });

  it('reports an expired access token so the app knows to refresh', async () => {
    const expired = jwt.sign({ exp: Math.floor(Date.now() / 1000) - 10 }, SECRET, { subject: 'x', issuer: 'shagun-register' });
    const res = await request(app).get('/me').set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');
  });

  it('rotates refresh tokens and revokes everything when an old one is reused', async () => {
    const a = await signIn(app, 'g2', 'b@example.com', 'Bina');
    const r1 = await request(app).post('/auth/refresh').send({ refreshToken: a.refreshToken });
    expect(r1.status).toBe(200);
    expect(r1.body.refreshToken).not.toBe(a.refreshToken);
    expect((await request(app).get('/me').set('Authorization', `Bearer ${r1.body.accessToken}`)).status).toBe(200);

    // The first token was stolen and used again: both chains die.
    const reuse = await request(app).post('/auth/refresh').send({ refreshToken: a.refreshToken });
    expect(reuse.status).toBe(401);
    const afterTheft = await request(app).post('/auth/refresh').send({ refreshToken: r1.body.refreshToken });
    expect(afterTheft.status).toBe(401);
  });

  it('logout revokes the refresh token', async () => {
    const a = await signIn(app, 'g3', 'c@example.com', 'Chanda');
    await request(app).post('/auth/logout').send({ refreshToken: a.refreshToken }).expect(204);
    expect((await request(app).post('/auth/refresh').send({ refreshToken: a.refreshToken })).status).toBe(401);
  });

  it('only offers dev sign-in when enabled, and config refuses it in production', async () => {
    expect((await request(app).post('/auth/dev').send({ email: 'x@example.com', name: 'X' })).status).toBe(404);
    const devApp = makeApp({ devLogin: true });
    const dev = await request(devApp).post('/auth/dev').send({ email: 'X@Example.com', name: 'X' });
    expect(dev.status).toBe(200);
    expect(dev.body.user.email).toBe('x@example.com');
    const base = { MONGODB_URI: 'mongodb://x', JWT_ACCESS_SECRET: SECRET, GOOGLE_CLIENT_IDS: 'abc' };
    expect(() => loadConfig({ ...base, NODE_ENV: 'production', DEV_LOGIN: 'true' })).toThrow('DEV_LOGIN');
    expect(() => loadConfig({ ...base, NODE_ENV: 'production', GOOGLE_CLIENT_IDS: '' })).toThrow('GOOGLE_CLIENT_IDS');
    expect(loadConfig({ ...base, NODE_ENV: 'production' }).googleClientIds).toEqual(['abc']);
  });

  it('rate-limits sign-in attempts', async () => {
    const limited = makeApp({ rateLimits: true });
    let last = 0;
    for (let i = 0; i < 31; i++) last = (await request(limited).post('/auth/google').send({ idToken: googleToken('r', 'r@x.com', 'R') })).status;
    expect(last).toBe(429);
  });
});

describe('families, invites and roles', () => {
  async function setup() {
    const owner = await signIn(app, 'o', 'owner@example.com', 'Owner');
    const editor = await signIn(app, 'e', 'editor@example.com', 'Editor');
    const viewer = await signIn(app, 'v', 'viewer@example.com', 'Viewer');
    const outsider = await signIn(app, 'x', 'outsider@example.com', 'Outsider');
    const { body: family } = await request(app).post('/families').set(bearer(owner)).send({ name: 'Verma parivaar' });
    for (const [who, role] of [[editor, 'editor'], [viewer, 'viewer']] as const) {
      const { body } = await request(app).post(`/families/${family.id}/invites`).set(bearer(owner)).send({ role });
      await request(app).post(`/invites/${body.code}/accept`).set(bearer(who)).expect(200);
    }
    return { owner, editor, viewer, outsider, familyId: family.id as string };
  }

  it('registering the same offline id again is idempotent for the owner and refused for others', async () => {
    const { owner, outsider, familyId } = await setup();
    const again = await request(app).post('/families').set(bearer(owner)).send({ id: familyId, name: 'Verma parivaar' });
    expect(again.status).toBe(200);
    const stolen = await request(app).post('/families').set(bearer(outsider)).send({ id: familyId, name: 'Mine' });
    expect(stolen.status).toBe(409);
    expect(stolen.body.error.code).toBe('CONFLICT');
  });

  it('hides a family from non-members (404, not 403)', async () => {
    const { outsider, familyId } = await setup();
    const res = await request(app).get(`/families/${familyId}`).set(bearer(outsider));
    expect(res.status).toBe(404);
  });

  it('enforces the role table: only the owner invites, renames and changes roles', async () => {
    const { owner, editor, viewer, familyId } = await setup();
    for (const who of [editor, viewer]) {
      const inv = await request(app).post(`/families/${familyId}/invites`).set(bearer(who)).send({ role: 'viewer' });
      expect(inv.status).toBe(403);
      expect(inv.body.error.code).toBe('ROLE_FORBIDDEN');
      expect((await request(app).patch(`/families/${familyId}`).set(bearer(who)).send({ name: 'x' })).status).toBe(403);
    }
    const promote = await request(app).patch(`/families/${familyId}/members/${viewer.user.id}`).set(bearer(owner)).send({ role: 'editor' });
    expect(promote.status).toBe(200);
    expect(promote.body.role).toBe('editor');
    const demoteOwner = await request(app).patch(`/families/${familyId}/members/${owner.user.id}`).set(bearer(owner)).send({ role: 'viewer' });
    expect(demoteOwner.status).toBe(403);
    const renamed = await request(app).patch(`/families/${familyId}`).set(bearer(owner)).send({ name: 'Verma family' });
    expect(renamed.body.name).toBe('Verma family');
  });

  it('members can leave, the owner can remove people, the owner cannot leave', async () => {
    const { owner, editor, viewer, familyId } = await setup();
    expect((await request(app).delete(`/families/${familyId}/members/${viewer.user.id}`).set(bearer(editor))).status).toBe(403);
    await request(app).delete(`/families/${familyId}/members/${viewer.user.id}`).set(bearer(viewer)).expect(204);
    await request(app).delete(`/families/${familyId}/members/${editor.user.id}`).set(bearer(owner)).expect(204);
    const ownerLeaves = await request(app).delete(`/families/${familyId}/members/${owner.user.id}`).set(bearer(owner));
    expect(ownerLeaves.status).toBe(409);
    expect(ownerLeaves.body.error.code).toBe('OWNER_CANNOT_LEAVE');
    expect((await request(app).get(`/families/${familyId}`).set(bearer(editor))).status).toBe(404);
  });

  it('joining twice is harmless and never changes the role', async () => {
    const { owner, editor, familyId } = await setup();
    const { body } = await request(app).post(`/families/${familyId}/invites`).set(bearer(owner)).send({ role: 'viewer' });
    const again = await request(app).post(`/invites/${body.code}/accept`).set(bearer(editor));
    expect(again.body).toEqual({ family: { id: familyId, name: 'Verma parivaar', role: 'editor' }, alreadyMember: true });
    const ownerJoins = await request(app).post(`/invites/${body.code}/accept`).set(bearer(owner));
    expect(ownerJoins.body.family.role).toBe('owner');
  });

  it('rejects wrong, expired, cancelled and deleted-ledger codes alike', async () => {
    const { owner, outsider, familyId } = await setup();
    const wrong = await request(app).post('/invites/ZZZZZZ/accept').set(bearer(outsider));
    expect(wrong.status).toBe(404);
    expect(wrong.body.error.code).toBe('INVITE_INVALID');
    expect((await request(app).post('/invites/abc/accept').set(bearer(outsider))).body.error.code).toBe('INVITE_INVALID');

    const { body: inv } = await request(app).post(`/families/${familyId}/invites`).set(bearer(owner)).send({ role: 'viewer' });
    await Invite.updateOne({ code: inv.code }, { expiresAt: new Date(Date.now() - 1000) });
    expect((await request(app).post(`/invites/${inv.code}/accept`).set(bearer(outsider))).status).toBe(404);

    const { body: inv2 } = await request(app).post(`/families/${familyId}/invites`).set(bearer(owner)).send({ role: 'viewer' });
    const listed = await request(app).get(`/families/${familyId}/invites`).set(bearer(owner));
    expect(listed.body.map((i: { code: string }) => i.code)).toContain(inv2.code);
    await request(app).delete(`/families/${familyId}/invites/${inv2.code}`).set(bearer(owner)).expect(204);
    expect((await request(app).post(`/invites/${inv2.code}/accept`).set(bearer(outsider))).status).toBe(404);

    const { body: inv3 } = await request(app).post(`/families/${familyId}/invites`).set(bearer(owner)).send({ role: 'viewer' });
    await request(app).delete(`/families/${familyId}`).set(bearer(owner)).expect(204);
    expect((await request(app).post(`/invites/${inv3.code}/accept`).set(bearer(outsider))).status).toBe(404);
    expect((await request(app).get('/me').set(bearer(owner))).body.families).toEqual([]);
  });

  it('rate-limits code guessing per user', async () => {
    const limited = makeApp({ rateLimits: true });
    const who = await signIn(app, 'guess', 'guess@example.com', 'Guesser');
    let last = 0;
    for (let i = 0; i < 11; i++) last = (await request(limited).post('/invites/ZZZZZZ/accept').set(bearer(who))).status;
    expect(last).toBe(429);
  });

  it('validates bodies with the shared schemas', async () => {
    const { owner, familyId } = await setup();
    const res = await request(app).post(`/families/${familyId}/invites`).set(bearer(owner)).send({ role: 'owner' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
    expect((await request(app).post('/families').set(bearer(owner)).send({ name: '  ' })).status).toBe(400);
    expect((await request(app).post('/families').set(bearer(owner)).send({ id: 'not-a-uuid', name: 'x' })).status).toBe(400);
  });
});
