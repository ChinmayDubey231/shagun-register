import { randomUUID } from 'node:crypto';
import {
  DEMO_ACCOUNTS,
  hasDevanagari,
  matchKey,
  type EventType,
  type PaymentMode,
  type SyncChange,
  type SyncedTable,
} from '@shagun/shared';
import { Family, Membership } from './models.js';
import { applyPush } from './sync.js';

const [ASHA, ROHAN, MEENA] = DEMO_ACCOUNTS;
type DemoAccount = (typeof DEMO_ACCOUNTS)[number];

interface DemoPerson {
  name: string;
  relation?: string;
  city?: string;
  phone?: string;
}

interface DemoGift {
  person: string;
  amount: number;
  /** Cash unless stated. */
  mode?: PaymentMode;
  item?: string;
  subFunction?: string;
  note?: string;
}

interface DemoEvent {
  title: string;
  type: EventType;
  /** Another family's function, so its gifts are given. Without a host it's ours, and they're received. */
  host?: string;
  /** Counted from the first demo sign-in, so some functions are still to come. */
  inDays: number;
  subFunctions?: string[];
  venue?: string;
  gifts?: DemoGift[];
  countedCash?: number;
}

interface DemoLedger {
  name: string;
  owner: DemoAccount;
  editor: DemoAccount;
  viewer: DemoAccount;
  people: Record<string, DemoPerson>;
  events: DemoEvent[];
}

const DEMO_LEDGERS: DemoLedger[] = [
  {
    name: 'Sharma parivaar',
    owner: ASHA,
    editor: ROHAN,
    viewer: MEENA,
    people: {
      ramesh: { name: 'Ramesh Sharma', relation: 'chacha_ji', city: 'Indore', phone: '+91 90000 00001' },
      // The same man typed in Hindi: suggested as a merge for the same name.
      rameshHindi: { name: 'रमेश शर्मा', city: 'इंदौर' },
      sunita: { name: 'Smt. Sunita Mishra', relation: 'mausi_ji', city: 'Bhopal' },
      verma: { name: 'Verma parivaar', relation: 'neighbour', city: 'Indore' },
      anil: { name: 'Anil Gupta', relation: 'colleague', city: 'Pune' },
      kamla: { name: 'कमला देवी', relation: 'bua_ji', city: 'Ujjain' },
      deepak: { name: 'Deepak Joshi', relation: 'friend', city: 'Indore', phone: '+91 90000 00002' },
      pooja: { name: 'Pooja Agrawal', relation: 'friend', city: 'Mumbai' },
      suresh: { name: 'Suresh Tiwari', relation: 'mama_ji', city: 'Jabalpur' },
      neelam: { name: 'Neelam Saxena', relation: 'relative', city: 'Gwalior' },
      iqbal: { name: 'Iqbal Khan', relation: 'neighbour', city: 'Indore' },
      harpreet: { name: 'Harpreet Kaur', relation: 'colleague', city: 'Delhi' },
      lata: { name: 'लता पाटीदार', relation: 'relative', city: 'देवास' },
      vikram: { name: 'Vikram Rathore', relation: 'friend', city: 'Jaipur', phone: '+91 90000 00003' },
      // The same man under another name: suggested as a merge for the same phone number.
      vRathore: { name: 'V. Rathore', phone: '090000-00003' },
    },
    events: [
      {
        title: "Priya's Wedding",
        type: 'wedding',
        inDays: -240,
        subFunctions: ['haldi', 'sangeet', 'wedding', 'reception'],
        venue: 'Shree Garden, Indore',
        gifts: [
          { person: 'kamla', amount: 501, subFunction: 'haldi' },
          { person: 'neelam', amount: 0, mode: 'item', item: 'Silver diya set', subFunction: 'haldi' },
          { person: 'deepak', amount: 1100, subFunction: 'sangeet' },
          { person: 'rameshHindi', amount: 1100, subFunction: 'sangeet' },
          { person: 'ramesh', amount: 5100, subFunction: 'wedding' },
          { person: 'sunita', amount: 2100, mode: 'upi', subFunction: 'wedding' },
          { person: 'suresh', amount: 11000, mode: 'cheque', subFunction: 'wedding', note: 'Cheque no. 004512' },
          { person: 'lata', amount: 1100, subFunction: 'wedding' },
          { person: 'verma', amount: 1100, subFunction: 'reception' },
          { person: 'anil', amount: 2100, mode: 'upi', subFunction: 'reception' },
          { person: 'pooja', amount: 2100, mode: 'upi', subFunction: 'reception' },
          { person: 'iqbal', amount: 1100, subFunction: 'reception' },
          { person: 'harpreet', amount: 501, mode: 'upi', subFunction: 'reception' },
          { person: 'vikram', amount: 2100, subFunction: 'reception' },
          { person: 'vRathore', amount: 501, subFunction: 'reception' },
        ],
        // ₹13,702 was logged in cash, so the count shows ₹500 short.
        countedCash: 13202,
      },
      {
        title: "Aditya Verma's Wedding",
        type: 'wedding',
        host: 'verma',
        inDays: -150,
        subFunctions: ['reception'],
        venue: 'Indore',
        gifts: [{ person: 'verma', amount: 2100, subFunction: 'reception' }],
      },
      {
        title: "Anil's Retirement Party",
        type: 'other',
        host: 'anil',
        inDays: -100,
        venue: 'Pune',
        gifts: [{ person: 'anil', amount: 1100, mode: 'upi' }],
      },
      {
        title: 'Griha Pravesh',
        type: 'griha_pravesh',
        inDays: -75,
        venue: 'Vijay Nagar, Indore',
        gifts: [
          { person: 'ramesh', amount: 2100, mode: 'upi' },
          { person: 'sunita', amount: 1100 },
          { person: 'verma', amount: 0, mode: 'item', item: 'Brass kalash' },
          { person: 'pooja', amount: 501, mode: 'upi' },
          { person: 'deepak', amount: 1100 },
        ],
      },
      {
        title: "Deepak's Son's Mundan",
        type: 'mundan',
        host: 'deepak',
        inDays: -40,
        venue: 'Indore',
        gifts: [{ person: 'deepak', amount: 1100 }],
      },
      {
        title: 'कमला बुआ का जन्मदिन',
        type: 'birthday',
        host: 'kamla',
        inDays: -20,
        venue: 'Ujjain',
        gifts: [
          { person: 'kamla', amount: 501 },
          { person: 'kamla', amount: 0, mode: 'item', item: 'Saree' },
        ],
      },
      {
        title: "Kunal Sharma's Wedding",
        type: 'wedding',
        host: 'ramesh',
        inDays: 21,
        subFunctions: ['sangeet', 'wedding'],
        venue: 'Indore',
      },
      { title: "Dadaji's 75th Birthday", type: 'birthday', inDays: 45, venue: 'Home' },
    ],
  },
  {
    // Sorts after Sharma parivaar, so a fresh phone opens the larger ledger first.
    name: 'Yadav parivaar',
    owner: ROHAN,
    editor: MEENA,
    viewer: ASHA,
    people: {
      mohan: { name: 'Mohan Yadav', relation: 'chacha_ji', city: 'Lucknow' },
      geeta: { name: 'गीता यादव', relation: 'mausi_ji', city: 'Kanpur' },
      pradeep: { name: 'Pradeep Singh', relation: 'friend', city: 'Lucknow' },
    },
    events: [
      {
        title: "Aarav's Mundan",
        type: 'mundan',
        inDays: -30,
        venue: 'Lucknow',
        gifts: [
          { person: 'mohan', amount: 1100 },
          { person: 'geeta', amount: 501 },
          { person: 'pradeep', amount: 1100, mode: 'upi' },
        ],
      },
      {
        title: "Geeta's Griha Pravesh",
        type: 'griha_pravesh',
        host: 'geeta',
        inDays: -10,
        venue: 'Kanpur',
        gifts: [{ person: 'geeta', amount: 1100 }],
      },
    ],
  },
];

const DAY_MS = 86_400_000;

/** The ledger as the changes a phone would push: people first, since events and gifts point at them. */
function ledgerChanges(ledger: DemoLedger, familyId: string, userId: string, now: number): SyncChange[] {
  const records: [SyncedTable, Record<string, unknown>][] = [];
  const syncFields = (updatedAt: number) => ({ id: randomUUID(), familyId, updatedAt, deletedAt: null, seq: null });

  const personIds = new Map<string, string>();
  for (const [key, p] of Object.entries(ledger.people)) {
    const fields = syncFields(now);
    personIds.set(key, fields.id);
    records.push([
      'people',
      {
        ...fields,
        displayName: p.name,
        nameLatin: matchKey(p.name),
        nameDevanagari: hasDevanagari(p.name) ? p.name : null,
        relation: p.relation ?? null,
        city: p.city ?? null,
        phone: p.phone ?? null,
        mergedInto: null,
      },
    ]);
  }

  for (const e of ledger.events) {
    const heldAt = now + e.inDays * DAY_MS;
    const event = syncFields(now);
    records.push([
      'events',
      {
        ...event,
        title: e.title,
        type: e.type,
        role: e.host ? 'attended' : 'hosted',
        hostPersonId: e.host ? personIds.get(e.host)! : null,
        date: new Date(heldAt).toISOString().slice(0, 10),
        subFunctions: e.subFunctions ?? [],
        venue: e.venue ?? null,
      },
    ]);
    (e.gifts ?? []).forEach((g, i) => {
      const loggedAt = heldAt + i * 60_000;
      records.push([
        'entries',
        {
          ...syncFields(loggedAt),
          eventId: event.id,
          personId: personIds.get(g.person)!,
          direction: e.host ? 'given' : 'received',
          amount: g.amount,
          mode: g.mode ?? 'cash',
          itemNote: g.item ?? null,
          subFunction: g.subFunction ?? null,
          note: g.note ?? null,
          photoKey: null,
          createdBy: userId,
          deviceId: 'demo',
          createdAt: loggedAt,
        },
      ]);
    });
    if (e.countedCash !== undefined) {
      const countedAt = heldAt + DAY_MS;
      records.push([
        'cashCounts',
        { ...syncFields(countedAt), eventId: event.id, countedAmount: e.countedCash, countedBy: userId, countedAt },
      ]);
    }
  }
  return records.map(([table, record], changeId) => ({ changeId, table, op: 'upsert', record }));
}

async function seedLedger(ledger: DemoLedger, userIds: Map<string, string>) {
  const ownerId = userIds.get(ledger.owner.email)!;
  const familyId = randomUUID();
  await Family.create({ _id: familyId, name: ledger.name, ownerId });
  const { rejected } = await applyPush(familyId, ownerId, ledgerChanges(ledger, familyId, ownerId, Date.now()));
  if (rejected.length) throw new Error(`Demo ledger "${ledger.name}": ${rejected[0]!.message}`);
  // Last: the owner's membership is what marks this ledger as finished.
  await Membership.insertMany([
    { familyId, userId: ownerId, role: 'owner' },
    { familyId, userId: userIds.get(ledger.editor.email)!, role: 'editor' },
    { familyId, userId: userIds.get(ledger.viewer.email)!, role: 'viewer' },
  ]);
}

let seeding: Promise<void> | null = null;

/**
 * Creates the demo accounts and their sample ledgers, once. The records go through the same
 * write path as a phone's push. Later sign-ins leave the ledgers alone, so changes made while
 * testing stay. Only reachable from POST /auth/dev, which needs DEV_LOGIN.
 */
export function seedDemoLedgers(devUser: (email: string, name: string) => Promise<{ id: string }>): Promise<void> {
  seeding ??= (async () => {
    const userIds = new Map<string, string>();
    for (const a of DEMO_ACCOUNTS) userIds.set(a.email, (await devUser(a.email, a.name)).id);
    for (const ledger of DEMO_LEDGERS) {
      const done = await Membership.exists({ userId: userIds.get(ledger.owner.email), role: 'owner' });
      if (!done) await seedLedger(ledger, userIds);
    }
  })().finally(() => {
    seeding = null;
  });
  return seeding;
}
