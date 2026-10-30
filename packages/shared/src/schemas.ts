import { z } from 'zod';
import {
  DIRECTIONS,
  EVENT_ROLES,
  EVENT_TYPES,
  MAX_AMOUNT,
  PAYMENT_MODES,
  SUB_FUNCTIONS,
} from './constants';

/**
 * Fields every synced record carries. On the phone `id` is the primary key;
 * the API maps it to Mongo's `_id`. Timestamps are epoch milliseconds.
 * `seq` is set only by the server, so it is null until the first push is accepted.
 */
export const syncFieldsSchema = z.object({
  id: z.uuid(),
  familyId: z.uuid(),
  updatedAt: z.number().int().nonnegative(),
  deletedAt: z.number().int().nonnegative().nullable(),
  seq: z.number().int().nonnegative().nullable(),
});

const optionalText = (max: number) => z.string().trim().max(max).nullable();

/** Whole rupees only; shagun amounts are never fractional. */
export const amountSchema = z.number().int().min(0).max(MAX_AMOUNT);

/** A person can also be a household, e.g. "Verma parivaar". */
export const personSchema = syncFieldsSchema.extend({
  displayName: z.string().trim().min(1).max(120),
  /** Normalized Latin match key. Week 2 replaces the simple version with the full match-key function. */
  nameLatin: z.string().max(160),
  nameDevanagari: optionalText(120),
  relation: optionalText(60),
  city: optionalText(80),
  phone: optionalText(20),
  mergedInto: z.uuid().nullable(),
});
export type Person = z.infer<typeof personSchema>;

/** ISO calendar date, e.g. 2026-02-14. Stored without a time so time zones never shift it. */
export const isoDateSchema = z.iso.date();

export const eventSchema = syncFieldsSchema.extend({
  title: z.string().trim().min(1).max(120),
  type: z.enum(EVENT_TYPES),
  role: z.enum(EVENT_ROLES),
  hostPersonId: z.uuid().nullable(),
  date: isoDateSchema,
  subFunctions: z.array(z.string().trim().min(1).max(40)).max(12),
  venue: optionalText(160),
});
export type LedgerEvent = z.infer<typeof eventSchema>;

export const entrySchema = syncFieldsSchema
  .extend({
    eventId: z.uuid(),
    personId: z.uuid(),
    direction: z.enum(DIRECTIONS),
    amount: amountSchema,
    mode: z.enum(PAYMENT_MODES),
    itemNote: optionalText(200),
    subFunction: optionalText(40),
    note: optionalText(500),
    photoKey: optionalText(200),
    createdBy: z.string().min(1).max(64),
    deviceId: z.string().min(1).max(64),
    /** When the gift was logged (epoch ms). Unlike updatedAt, edits don't change it. */
    createdAt: z.number().int().nonnegative(),
  })
  .refine((e) => e.mode === 'item' || e.amount > 0, {
    message: 'Amount must be more than zero unless the gift is an item',
    path: ['amount'],
  })
  .refine((e) => e.mode !== 'item' || (e.itemNote ?? '').length > 0 || e.amount > 0, {
    message: 'Describe the item',
    path: ['itemNote'],
  });
export type Entry = z.infer<typeof entrySchema>;

export const cashCountSchema = syncFieldsSchema.extend({
  eventId: z.uuid(),
  countedAmount: amountSchema,
  countedBy: z.string().min(1).max(64),
  countedAt: z.number().int().nonnegative(),
});
export type CashCount = z.infer<typeof cashCountSchema>;

/** Form-level input for Quick Entry, before ids and sync fields are added. */
export const quickEntryInputSchema = z
  .object({
    eventId: z.uuid(),
    personId: z.uuid().nullable(),
    newPersonName: z.string().trim().max(120).nullable(),
    /** Only used when creating a new person. */
    newPersonCity: optionalText(80).optional(),
    newPersonPhone: optionalText(20).optional(),
    relation: optionalText(60),
    direction: z.enum(DIRECTIONS),
    amount: amountSchema,
    mode: z.enum(PAYMENT_MODES),
    itemNote: optionalText(200),
    subFunction: z.enum(SUB_FUNCTIONS).or(z.string().max(40)).nullable(),
    note: optionalText(500),
  })
  .refine((v) => v.personId !== null || (v.newPersonName ?? '').length > 0, {
    message: 'Pick a person or type a new name',
    path: ['newPersonName'],
  })
  .refine((v) => v.mode === 'item' || v.amount > 0, {
    message: 'Enter an amount',
    path: ['amount'],
  })
  .refine((v) => v.mode !== 'item' || (v.itemNote ?? '').length > 0, {
    message: 'Describe the item',
    path: ['itemNote'],
  });
export type QuickEntryInput = z.infer<typeof quickEntryInputSchema>;

export const createEventInputSchema = z
  .object({
    title: z.string().trim().min(1, 'Give the event a name').max(120),
    type: z.enum(EVENT_TYPES),
    role: z.enum(EVENT_ROLES),
    hostPersonId: z.uuid().nullable(),
    hostName: z.string().trim().max(120).nullable(),
    date: isoDateSchema,
    subFunctions: z.array(z.string().trim().min(1).max(40)).max(12),
    venue: optionalText(160),
  })
  .refine((v) => v.role === 'hosted' || v.hostPersonId !== null || (v.hostName ?? '').length > 0, {
    message: 'Whose function is it?',
    path: ['hostName'],
  });
export type CreateEventInput = z.infer<typeof createEventInputSchema>;

export const personEditSchema = z.object({
  displayName: z.string().trim().min(1, 'Enter a name').max(120),
  relation: optionalText(60),
  city: optionalText(80),
  phone: optionalText(20),
});
export type PersonEdit = z.infer<typeof personEditSchema>;

/** Counted cash at the end of a function, in whole rupees. */
export const cashCountInputSchema = z.object({
  eventId: z.uuid(),
  countedAmount: amountSchema,
});
