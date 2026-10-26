import { describe, expect, it } from 'vitest';
import {
  amountFromDigits,
  createEventInputSchema,
  entrySchema,
  formatINR,
  groupINR,
  hasDevanagari,
  pressAmountKey,
  quickEntryInputSchema,
  simpleNameKey,
  sumAmounts,
} from './index';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('rupee formatting', () => {
  it('uses Indian digit grouping', () => {
    expect(groupINR(0)).toBe('0');
    expect(groupINR(101)).toBe('101');
    expect(groupINR(1100)).toBe('1,100');
    expect(groupINR(48300)).toBe('48,300');
    expect(groupINR(377500)).toBe('3,77,500');
    expect(groupINR(9999999)).toBe('99,99,999');
    expect(groupINR(12345678)).toBe('1,23,45,678');
  });
  it('adds the rupee sign and handles negatives', () => {
    expect(formatINR(2100)).toBe('₹2,100');
    expect(formatINR(-2100)).toBe('-₹2,100');
  });
  it('sums as integers', () => {
    expect(sumAmounts([101, 501, 1100, 2100])).toBe(3802);
  });
});

describe('amount keypad', () => {
  it('builds digits and deletes', () => {
    let d = '';
    for (const k of ['2', '1', '00']) d = pressAmountKey(d, k);
    expect(d).toBe('2100');
    expect(pressAmountKey(d, 'back')).toBe('210');
    expect(amountFromDigits('2100')).toBe(2100);
    expect(amountFromDigits('')).toBe(0);
  });
  it('drops leading zeros and caps the maximum', () => {
    expect(pressAmountKey('', '0')).toBe('');
    expect(pressAmountKey('', '00')).toBe('');
    expect(pressAmountKey('9999999', '9')).toBe('9999999');
  });
  it('ignores unknown keys', () => {
    expect(pressAmountKey('12', '.')).toBe('12');
  });
});

describe('name key', () => {
  it('normalizes case, punctuation and spaces', () => {
    expect(simpleNameKey('  Ramesh   Sharma, ji ')).toBe('ramesh sharma ji');
    expect(simpleNameKey('रमेश शर्मा')).toBe('रमेश शर्मा');
  });
  it('detects Devanagari', () => {
    expect(hasDevanagari('रमेश')).toBe(true);
    expect(hasDevanagari('Ramesh')).toBe(false);
  });
});

describe('schemas', () => {
  const base = {
    id: uuid(1),
    familyId: uuid(2),
    updatedAt: 1,
    deletedAt: null,
    seq: null,
    eventId: uuid(3),
    personId: uuid(4),
    direction: 'received' as const,
    itemNote: null,
    subFunction: 'wedding',
    note: null,
    photoKey: null,
    createdBy: 'local',
    deviceId: 'device-1',
  };
  it('accepts a cash entry in whole rupees', () => {
    expect(entrySchema.safeParse({ ...base, amount: 2100, mode: 'cash' }).success).toBe(true);
  });
  it('rejects fractional and zero cash amounts', () => {
    expect(entrySchema.safeParse({ ...base, amount: 2100.5, mode: 'cash' }).success).toBe(false);
    expect(entrySchema.safeParse({ ...base, amount: 0, mode: 'cash' }).success).toBe(false);
  });
  it('allows an item gift with no amount when it is described', () => {
    expect(
      entrySchema.safeParse({ ...base, amount: 0, mode: 'item', itemNote: 'Silver dinner set' }).success,
    ).toBe(true);
    expect(entrySchema.safeParse({ ...base, amount: 0, mode: 'item' }).success).toBe(false);
  });
  it('quick entry needs a person or a new name', () => {
    const input = {
      eventId: uuid(3),
      personId: null,
      newPersonName: '',
      relation: null,
      direction: 'received',
      amount: 501,
      mode: 'cash',
      itemNote: null,
      subFunction: null,
      note: null,
    };
    expect(quickEntryInputSchema.safeParse(input).success).toBe(false);
    expect(quickEntryInputSchema.safeParse({ ...input, newPersonName: 'Anil Khare' }).success).toBe(true);
  });
  it('attended events need a host', () => {
    const input = {
      title: 'Sakshi weds Rohit',
      type: 'wedding',
      role: 'attended',
      hostPersonId: null,
      hostName: null,
      date: '2026-12-12',
      subFunctions: [],
      venue: null,
    };
    expect(createEventInputSchema.safeParse(input).success).toBe(false);
    expect(createEventInputSchema.safeParse({ ...input, hostName: 'Verma parivaar' }).success).toBe(true);
    expect(createEventInputSchema.safeParse({ ...input, date: '12/12/2026', hostName: 'x' }).success).toBe(false);
  });
});
