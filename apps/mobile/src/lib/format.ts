import { isHonorific } from '@shagun/shared';
import i18n from 'i18next';

const locale = () => (i18n.language === 'hi' ? 'hi-IN' : 'en-IN');

function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
}

/** "2026-02-14" → "14 Feb 2026". Calendar dates are formatted in UTC so they never shift a day. */
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    parseIsoDate(iso),
  );
}

/** Parts for the date badge: { mon: "FEB", day: "14", year: "2026" }. */
export function dateBadgeParts(iso: string) {
  const date = parseIsoDate(iso);
  const mon = new Intl.DateTimeFormat(locale(), { month: 'short', timeZone: 'UTC' }).format(date).toUpperCase();
  return { mon, day: String(date.getUTCDate()), year: String(date.getUTCFullYear()) };
}

/** Epoch ms → "8:42 pm" in the phone's time zone. */
export function formatTime(ms: number): string {
  return new Intl.DateTimeFormat(locale(), { hour: 'numeric', minute: '2-digit' }).format(new Date(ms));
}

/** Today's local calendar date as "YYYY-MM-DD". */
export function todayISO(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Epoch ms → "14 Feb 2026, 8:42 pm", on the phone's calendar and clock. */
export function formatDateTime(ms: number): string {
  return `${formatDate(todayISO(new Date(ms)))}, ${formatTime(ms)}`;
}

export function dateToISO(date: Date): string {
  return todayISO(date);
}

export function isoToLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/** "Shri Ramesh Sharma ji" → "RS", "डॉ. राजेश अग्रवाल" → "रअ". Honorifics are skipped. */
export function initials(name: string): string {
  const all = name.trim().split(/\s+/).filter(Boolean);
  const named = all.filter((w) => !isHonorific(w));
  const parts = named.length ? named : all;
  const first = Array.from(parts[0] ?? '?')[0] ?? '?';
  const second = parts.length > 1 ? (Array.from(parts[parts.length - 1]!)[0] ?? '') : '';
  return (first + second).toUpperCase();
}

/** "2026-08-03" → "Aug 2026" */
export function formatMonthYear(iso: string): string {
  const [y, m] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat(i18n.language === 'hi' ? 'hi-IN' : 'en-IN', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, 1)));
}
