import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { TFunction } from 'i18next';
import { Platform } from 'react-native';
import { getDb } from '@/db/client';
import {
  getAllGifts,
  getCashCounts,
  getCashSummary,
  getEventEntries,
  getEventModeTotals,
  getEventSummaries,
  getEventSummary,
  getPeopleSummaries,
} from '@/db/ledger';
import { ledgerWorkbook } from '@/export/ledgerWorkbook';
import { registerHtml } from '@/export/registerHtml';
import { todayISO } from './format';

/**
 * Exports, made on the phone from the local database and handed to the share sheet
 * (WhatsApp, Drive, email, print). Nothing is uploaded; the file sits in the app's cache.
 */

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export class ShareUnavailableError extends Error {}

/** What to tell the family when an export fails. */
export function exportErrorMessage(e: unknown, t: TFunction): string {
  console.warn('Export failed:', e);
  return e instanceof ShareUnavailableError ? t('export.noShare') : t('export.failed');
}

/** Characters phones and computers refuse in file names become spaces. */
export function safeFileName(name: string): string {
  // eslint-disable-next-line no-control-regex
  const clean = name.replace(/[\\/:*?"<>|\u0000-\u001F]+/g, ' ').replace(/\s+/g, ' ').trim();
  return clean.slice(0, 80) || 'Shagun Register';
}

async function share(uri: string, mimeType: string, UTI: string, dialogTitle: string) {
  if (!(await Sharing.isAvailableAsync())) throw new ShareUnavailableError();
  await Sharing.shareAsync(uri, { mimeType, UTI, dialogTitle });
}

/** An event's register as an A4 PDF. */
export async function shareEventRegister(familyId: string, ledgerName: string, eventId: string, t: TFunction) {
  const db = getDb();
  const event = getEventSummary(db, familyId, eventId);
  if (!event) return;
  const count = event.role === 'hosted' ? getCashCounts(db, eventId)[0] : undefined;
  const html = registerHtml(
    {
      ledgerName,
      event,
      entries: getEventEntries(db, eventId),
      modes: getEventModeTotals(db, eventId),
      cash: count ? { logged: getCashSummary(db, eventId).loggedCash, counted: count.countedAmount, countedAt: count.countedAt } : null,
      exportedAt: Date.now(),
    },
    t,
  );
  if (Platform.OS === 'web') return printOnWeb(html);
  // Written out rather than moved: Expo Go prints outside the project's sandbox, where the file API can't reach.
  const { uri, base64 } = await Print.printToFileAsync({ html, width: 595, height: 842, base64: true });
  const file = new File(Paths.cache, `${safeFileName(t('export.registerFile', { title: event.title }))}.pdf`);
  file.create({ overwrite: true });
  await file.write(base64!, { encoding: 'base64' });
  try {
    new File(uri).delete();
  } catch {
    // only tidying up: Expo Go can't reach it, and the register is already written
  }
  await share(file.uri, 'application/pdf', 'com.adobe.pdf', t('export.pdf'));
}

/** The whole ledger as an Excel workbook: gifts, people, events. */
export async function shareLedgerWorkbook(familyId: string, ledgerName: string, t: TFunction) {
  const db = getDb();
  const bytes = ledgerWorkbook(
    { gifts: getAllGifts(db, familyId), people: getPeopleSummaries(db, familyId), events: getEventSummaries(db, familyId) },
    t,
  );
  const name = `${safeFileName(t('export.ledgerFile', { name: ledgerName, date: todayISO() }))}.xlsx`;
  if (Platform.OS === 'web') return downloadOnWeb(bytes, name);
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true });
  await file.write(bytes);
  await share(file.uri, XLSX_MIME, 'org.openxmlformats.spreadsheetml.sheet', t('export.excel'));
}

/** Web preview: the browser's print dialog saves the register as a PDF. */
function printOnWeb(html: string) {
  const win = window.open('', '_blank');
  if (!win) throw new ShareUnavailableError();
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
}

function downloadOnWeb(bytes: Uint8Array, name: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: XLSX_MIME }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
