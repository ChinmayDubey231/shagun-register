import { MAX_AMOUNT } from './constants';

/**
 * Formats whole rupees with Indian digit grouping: 377500 → "3,77,500".
 * Integers only — amounts are never stored as floats.
 */
export function groupINR(amount: number): string {
  if (!Number.isFinite(amount)) return '0';
  const negative = amount < 0;
  const digits = String(Math.trunc(Math.abs(amount)));
  if (digits.length <= 3) return (negative ? '-' : '') + digits;
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return (negative ? '-' : '') + rest + ',' + last3;
}

/** "₹3,77,500" */
export function formatINR(amount: number): string {
  const grouped = groupINR(amount);
  return grouped.startsWith('-') ? '-₹' + grouped.slice(1) : '₹' + grouped;
}

/**
 * Applies one keypad press to the digit string shown in Quick Entry.
 * Keys: '0'-'9', '00', 'back'. Leading zeros are dropped; length is capped by MAX_AMOUNT.
 */
export function pressAmountKey(current: string, key: string): string {
  if (key === 'back') return current.slice(0, -1);
  if (!/^\d{1,2}$/.test(key)) return current;
  const next = (current + key).replace(/^0+/, '');
  if (next === '') return '';
  return Number(next) > MAX_AMOUNT ? current : next;
}

/** Digit string from the keypad → whole rupees. Empty string is 0. */
export function amountFromDigits(digits: string): number {
  const n = Number.parseInt(digits, 10);
  return Number.isFinite(n) ? n : 0;
}

/** Sums whole-rupee amounts. Kept as a function so every total in the app goes through integers. */
export function sumAmounts(amounts: readonly number[]): number {
  let total = 0;
  for (const a of amounts) total += Math.trunc(a);
  return total;
}
