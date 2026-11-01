import { formatINR, PAYMENT_MODES, sumAmounts } from '@shagun/shared';
import type { TFunction } from 'i18next';
import type { EntryListItem, EventSummary, ModeTotal } from '@/db/ledger';
import { formatDate, formatDateTime } from '@/lib/format';
import { labels } from './ledgerWorkbook';

export interface RegisterData {
  ledgerName: string;
  event: EventSummary;
  /** Every live entry of the event, in any order (the register lists them as logged). */
  entries: EntryListItem[];
  modes: ModeTotal[];
  /** Hosted events: the latest cash count against the cash logged. */
  cash: { logged: number; counted: number; countedAt: number } | null;
  exportedAt: number;
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * An event's gift register as printable HTML (A4), for expo-print to turn into a PDF:
 * the totals, then every gift in the order it was logged, grouped by function when the
 * event has them. Colours follow the app: sindoor headings, received blue ↙, given orange ↗.
 */
export function registerHtml(data: RegisterData, t: TFunction): string {
  const { event } = data;
  const l = labels(t);
  const e = escapeHtml;
  const hosted = event.role === 'hosted';
  const entries = [...data.entries].sort((a, b) => a.createdAt - b.createdAt);
  const mixed = new Set(entries.map((x) => x.direction)).size > 1;

  const amountText = (x: EntryListItem) => {
    const value = x.mode === 'item' && !x.amount ? t('mode.item') : formatINR(x.amount);
    return mixed ? `${x.direction === 'received' ? '↙' : '↗'} ${value}` : value;
  };
  const total = (list: EntryListItem[]) => {
    const sum = (d: EntryListItem['direction']) => sumAmounts(list.filter((x) => x.direction === d).map((x) => x.amount));
    return mixed ? `↙ ${formatINR(sum('received'))} · ↗ ${formatINR(sum('given'))}` : formatINR(sumAmounts(list.map((x) => x.amount)));
  };

  // Group by function, in the event's order, when gifts were logged against functions.
  const grouped = entries.some((x) => x.subFunction);
  const order = [...event.subFunctions, ...entries.map((x) => x.subFunction).filter((f): f is string => !!f)];
  const groups = grouped
    ? [...new Set([...order, null])]
        .map((fn) => ({ fn, list: entries.filter((x) => (x.subFunction ?? null) === fn) }))
        .filter((g) => g.list.length > 0)
    : [{ fn: null, list: entries }];

  let n = 0;
  const rows = groups
    .map(({ fn, list }) => {
      const title = fn ? l.subFunction(fn)! : t('export.noFunction');
      const head = grouped
        ? `<tr class="group"><td colspan="4">${e(title)}<span class="count"> · ${e(t('events.entries', { count: list.length }))}</span></td></tr>`
        : '';
      const body = list
        .map((x) => {
          n += 1;
          const sub = [x.city, l.relation(x.relation)].filter(Boolean).join(' · ');
          const mode = x.mode === 'item' ? (x.itemNote ?? t('mode.item')) : l.mode(x.mode);
          return (
            `<tr><td class="num">${n}</td>` +
            `<td><div class="name">${e(x.personName)}</div>${sub ? `<div class="sub">${e(sub)}</div>` : ''}</td>` +
            `<td>${e(mode)}</td>` +
            `<td class="amount ${mixed ? x.direction : ''}">${e(amountText(x))}</td></tr>`
          );
        })
        .join('');
      const subtotal =
        grouped && groups.length > 1
          ? `<tr class="subtotal"><td></td><td colspan="2">${e(t('export.functionTotal', { name: title }))}</td><td class="amount">${e(total(list))}</td></tr>`
          : '';
      return head + body + subtotal;
    })
    .join('');

  const meta = [hosted ? t('eventRole.hosted') : (event.hostName ?? t('eventRole.attended')), formatDate(event.date), event.venue]
    .filter(Boolean)
    .join(' · ');
  const boxes = [
    { label: hosted ? t('eventDetail.totalReceived') : t('eventDetail.totalGiven'), value: formatINR(hosted ? event.received : event.given), main: true },
    ...((hosted ? event.given : event.received) > 0
      ? [{ label: hosted ? t('eventDetail.totalGiven') : t('eventDetail.totalReceived'), value: formatINR(hosted ? event.given : event.received) }]
      : []),
    { label: t('export.entries'), value: String(entries.length) },
    ...[...data.modes].sort((a, b) => PAYMENT_MODES.indexOf(a.mode) - PAYMENT_MODES.indexOf(b.mode)).map((m) => ({
      label: t('eventDetail.modeCount', { mode: l.mode(m.mode), count: m.count }),
      value: m.mode === 'item' && m.total === 0 ? t('eventDetail.items', { count: m.count }) : formatINR(m.total),
    })),
  ];
  const cash = data.cash
    ? (() => {
        const diff = data.cash.counted - data.cash.logged;
        const verdict = diff === 0 ? t('cash.match') : diff < 0 ? t('cash.short', { amount: formatINR(-diff) }) : t('cash.over', { amount: formatINR(diff) });
        return `<p class="cash">${e(
          t('export.cashLine', {
            when: formatDateTime(data.cash.countedAt),
            counted: formatINR(data.cash.counted),
            logged: formatINR(data.cash.logged),
          }),
        )} <strong class="${diff === 0 ? 'ok' : 'off'}">${e(verdict)}</strong></p>`;
      })()
    : '';

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(event.title)}</title>
<style>
@page { size: A4; margin: 14mm 12mm 16mm; }
* { box-sizing: border-box; }
body { margin: 0; font-family: 'Mukta', 'Noto Sans Devanagari', 'Noto Sans', Roboto, Arial, sans-serif; color: #171A21; font-size: 10.5pt; line-height: 1.4; }
.eyebrow { font-size: 7.5pt; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: #8A5300; }
h1 { font-family: 'Rozha One', 'Noto Serif Devanagari', 'Noto Serif', Georgia, serif; font-weight: 400; font-size: 24pt; line-height: 1.15; color: #7A1C2E; margin: 3pt 0 2pt; }
h1 .dot { color: #F4A51C; }
.meta { color: #4B5262; }
.summary { display: flex; flex-wrap: wrap; gap: 6pt; margin: 12pt 0 8pt; }
.box { flex: 1 1 0; min-width: 22%; border: 1px solid #E2E4E9; border-radius: 7pt; padding: 6pt 8pt; }
.box.main { background: #F6E8EA; border-color: #F6E8EA; }
.box .label { font-size: 7.5pt; color: #4B5262; }
.box .value { font-size: 12pt; font-weight: 700; font-variant-numeric: tabular-nums; }
.box.main .value { color: #7A1C2E; font-size: 15pt; }
.cash { margin: 0 0 10pt; color: #4B5262; }
.cash .ok { color: #1E6B45; } .cash .off { color: #B42318; }
table { width: 100%; border-collapse: collapse; }
thead th { font-size: 7.5pt; text-transform: uppercase; letter-spacing: .08em; color: #4B5262; text-align: left; border-bottom: 1.5pt solid #7A1C2E; padding: 4pt 6pt; }
td { padding: 4pt 6pt; border-bottom: 1px solid #E2E4E9; vertical-align: top; }
tr { break-inside: avoid; page-break-inside: avoid; }
.num { width: 2.5em; color: #6B7180; text-align: right; }
th.num { text-align: right; }
.amount { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; font-weight: 600; }
.name { font-weight: 600; }
.sub { font-size: 8pt; color: #6B7180; }
.group td { background: #FEF3DC; color: #3D2600; font-weight: 700; border-bottom: none; padding-top: 6pt; }
.group .count { font-weight: 400; color: #8A5300; }
.subtotal td { font-weight: 700; border-bottom: 1.5pt solid #D5D8DF; }
.grand td { font-weight: 800; font-size: 12pt; border-top: 1.5pt solid #7A1C2E; border-bottom: none; padding-top: 6pt; }
.received { color: #0E5AA7; } .given { color: #A4480A; }
footer { margin-top: 14pt; font-size: 7.5pt; color: #6B7180; }
</style></head>
<body>
<div class="eyebrow">${e(data.ledgerName)} · ${e(t('export.register'))}</div>
<h1>${e(event.title)}<span class="dot">.</span></h1>
<div class="meta">${e(meta)}</div>
<div class="summary">${boxes
    .map((b) => `<div class="box${'main' in b && b.main ? ' main' : ''}"><div class="label">${e(b.label)}</div><div class="value">${e(b.value)}</div></div>`)
    .join('')}</div>
${cash}
${
  entries.length
    ? `<table>
<thead><tr><th class="num">#</th><th>${e(t('export.name'))}</th><th>${e(t('export.mode'))}</th><th class="amount">${e(t('export.amount'))}</th></tr></thead>
<tbody>${rows}<tr class="grand"><td></td><td colspan="2">${e(t('export.total'))}</td><td class="amount">${e(total(entries))}</td></tr></tbody>
</table>`
    : `<p class="meta">${e(t('eventDetail.emptyTitle'))}</p>`
}
<footer>${e(t('export.footer', { when: formatDateTime(data.exportedAt) }))}${
    mixed ? ` · ${e(t('people.legend'))}` : ''
  }</footer>
</body></html>`;
}
