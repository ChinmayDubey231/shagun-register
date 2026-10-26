import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseAsync, openDatabaseSync, type SQLiteOpenOptions } from 'expo-sqlite';
import { Platform } from 'react-native';
import * as schema from './schema';
import type { LedgerDb } from './ledger';

const NAME = 'shagun.db';
/** The change listener lets screens re-run their queries when a table they read is written (see useDbQuery). */
const OPTIONS: SQLiteOpenOptions = { enableChangeListener: true };

function open() {
  const expoDb = openDatabaseSync(NAME, OPTIONS);
  if (Platform.OS !== 'web') expoDb.execSync('PRAGMA journal_mode = WAL;');
  return drizzle(expoDb, { schema });
}

let instance: ReturnType<typeof open> | null = null;

/**
 * Opens the one local database. Call once at startup and wait for it.
 * On web, SQLite runs in a WebAssembly worker and synchronous calls time out until
 * the worker has started, so the first open is asynchronous there. Android opens instantly.
 */
export async function prepareDatabase(): Promise<void> {
  if (instance) return;
  if (Platform.OS === 'web') await openDatabaseAsync(NAME, OPTIONS);
  instance = open();
}

/** The database, after prepareDatabase() has resolved. */
export function getDb(): ReturnType<typeof open> & LedgerDb {
  if (!instance) throw new Error('getDb() called before prepareDatabase() finished');
  return instance;
}
