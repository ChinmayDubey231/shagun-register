/** Enum values shared by the phone and the server. Keep these in sync with i18n keys. */

export const EVENT_TYPES = ['wedding', 'griha_pravesh', 'birthday', 'mundan', 'other'] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** hosted = our function (gifts received), attended = another family's function (gifts given). */
export const EVENT_ROLES = ['hosted', 'attended'] as const;
export type EventRole = (typeof EVENT_ROLES)[number];

export const DIRECTIONS = ['received', 'given'] as const;
export type Direction = (typeof DIRECTIONS)[number];

export const PAYMENT_MODES = ['cash', 'upi', 'cheque', 'item'] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export const SUB_FUNCTIONS = ['haldi', 'mehendi', 'sangeet', 'wedding', 'reception'] as const;
export type SubFunction = (typeof SUB_FUNCTIONS)[number];

/** Quick picks shown on the relation row in Quick Entry. Free text is also allowed. */
export const RELATION_PRESETS = [
  'relative',
  'neighbour',
  'friend',
  'colleague',
  'mama_ji',
  'chacha_ji',
  'bua_ji',
  'mausi_ji',
] as const;

/** Amount chips on Quick Entry, in whole rupees. */
export const AMOUNT_CHIPS = [101, 501, 1100, 2100, 5100] as const;

/** Largest single gift the app accepts, in whole rupees (₹99,99,999). Guards against typos. */
export const MAX_AMOUNT = 9_999_999;

export const ROLES = ['owner', 'editor', 'viewer'] as const;
export type MemberRole = (typeof ROLES)[number];

/** Tables that sync between phone and server. */
export const SYNCED_TABLES = ['people', 'events', 'entries', 'cashCounts'] as const;
export type SyncedTable = (typeof SYNCED_TABLES)[number];
