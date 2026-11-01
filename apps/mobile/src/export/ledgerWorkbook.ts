import type { TFunction } from 'i18next';
import type { EventSummary, LedgerGift, PersonSummary } from '@/db/ledger';
import { buildWorkbook, excelDate, excelDateTime, type Sheet } from './xlsx';

export interface LedgerExport {
  gifts: LedgerGift[];
  people: PersonSummary[];
  events: EventSummary[];
}

/** Translated labels for stored values; custom relations and functions are shown as typed. */
export function labels(t: TFunction) {
  return {
    relation: (r: string | null) => (r ? t(`relation.${r}` as 'relation.friend', { defaultValue: r }) : null),
    subFunction: (f: string | null) => (f ? t(`subFunction.${f}` as 'subFunction.haldi', { defaultValue: f }) : null),
    mode: (m: LedgerGift['mode']) => t(`mode.${m}`),
  };
}

/**
 * The whole ledger as three sheets: every gift, each person's totals both ways, and each
 * function. Amounts are numbers (so the family can total and filter), dates are real dates.
 */
export function ledgerSheets(data: LedgerExport, t: TFunction): Sheet[] {
  const l = labels(t);
  const lastExchange = new Map<string, string>();
  for (const g of data.gifts) {
    if ((lastExchange.get(g.personId) ?? '') < g.eventDate) lastExchange.set(g.personId, g.eventDate);
  }
  const giftAmount = (g: { mode: string; amount: number }) => (g.mode === 'item' && !g.amount ? null : g.amount);

  return [
    {
      name: t('export.giftsSheet'),
      columns: [
        { header: t('export.date'), kind: 'date', width: 13 },
        { header: t('export.event'), kind: 'text', width: 28 },
        { header: t('export.function'), kind: 'text', width: 13 },
        { header: t('export.direction'), kind: 'text', width: 11 },
        { header: t('export.name'), kind: 'text', width: 26 },
        { header: t('export.city'), kind: 'text', width: 14 },
        { header: t('export.relation'), kind: 'text', width: 14 },
        { header: t('export.mode'), kind: 'text', width: 9 },
        { header: t('export.amount'), kind: 'amount', width: 12 },
        { header: t('export.item'), kind: 'text', width: 22 },
        { header: t('export.note'), kind: 'text', width: 26 },
        { header: t('export.loggedAt'), kind: 'dateTime', width: 20 },
      ],
      rows: data.gifts.map((g) => [
        excelDate(g.eventDate),
        g.eventTitle,
        l.subFunction(g.subFunction),
        t(`direction.${g.direction}`),
        g.personName,
        g.city,
        l.relation(g.relation),
        l.mode(g.mode),
        giftAmount(g),
        g.itemNote,
        g.note,
        excelDateTime(g.createdAt),
      ]),
    },
    {
      name: t('export.peopleSheet'),
      columns: [
        { header: t('export.name'), kind: 'text', width: 26 },
        { header: t('export.hindiName'), kind: 'text', width: 22 },
        { header: t('export.city'), kind: 'text', width: 14 },
        { header: t('export.relation'), kind: 'text', width: 14 },
        { header: t('export.phone'), kind: 'text', width: 15 },
        { header: t('export.youGave'), kind: 'amount', width: 12 },
        { header: t('export.theyGave'), kind: 'amount', width: 12 },
        { header: t('export.exchanges'), kind: 'count', width: 10 },
        { header: t('export.lastExchange'), kind: 'date', width: 14 },
      ],
      rows: data.people.map((p) => {
        const last = lastExchange.get(p.id);
        return [
          p.displayName,
          p.nameDevanagari && p.nameDevanagari !== p.displayName ? p.nameDevanagari : null,
          p.city,
          l.relation(p.relation),
          p.phone,
          p.given,
          p.received,
          p.exchanges,
          last ? excelDate(last) : null,
        ];
      }),
    },
    {
      name: t('export.eventsSheet'),
      columns: [
        { header: t('export.date'), kind: 'date', width: 13 },
        { header: t('export.event'), kind: 'text', width: 28 },
        { header: t('export.type'), kind: 'text', width: 14 },
        { header: t('export.whose'), kind: 'text', width: 15 },
        { header: t('export.host'), kind: 'text', width: 22 },
        { header: t('export.venue'), kind: 'text', width: 18 },
        { header: t('export.functions'), kind: 'text', width: 30 },
        { header: t('export.received'), kind: 'amount', width: 12 },
        { header: t('export.given'), kind: 'amount', width: 12 },
        { header: t('export.entries'), kind: 'count', width: 9 },
      ],
      rows: [...data.events]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((e) => [
          excelDate(e.date),
          e.title,
          t(`eventType.${e.type}`),
          e.role === 'hosted' ? t('createEvent.ours') : t('createEvent.theirs'),
          e.hostName,
          e.venue,
          e.subFunctions.map((f) => l.subFunction(f)).join(', ') || null,
          e.received,
          e.given,
          e.entryCount,
        ]),
    },
  ];
}

export function ledgerWorkbook(data: LedgerExport, t: TFunction): Uint8Array {
  return buildWorkbook(ledgerSheets(data, t));
}
