import { addDatabaseChangeListener } from 'expo-sqlite';
import { useEffect, useMemo, useState } from 'react';
import type { SQL_TABLE_NAMES } from './schema';

type TableName = (typeof SQL_TABLE_NAMES)[keyof typeof SQL_TABLE_NAMES];

/**
 * Runs a synchronous query and runs it again whenever any of `tables` changes.
 *
 * Drizzle's useLiveQuery only watches a query's main table, so an event list with
 * totals would not refresh when an entry is added. Listing the tables explicitly
 * fixes that. Bursts of row changes (one transaction writes several rows) are
 * coalesced into a single re-run.
 */
export function useDbQuery<T>(run: () => T, tables: readonly TableName[], deps: readonly unknown[]): T {
  const [version, setVersion] = useState(0);
  const tableKey = tables.join(',');

  useEffect(() => {
    const watched = new Set(tableKey.split(','));
    let timer: ReturnType<typeof setTimeout> | null = null;
    const sub = addDatabaseChangeListener(({ tableName }) => {
      if (!watched.has(tableName) || timer) return;
      timer = setTimeout(() => {
        timer = null;
        setVersion((v) => v + 1);
      }, 0);
    });
    return () => {
      sub.remove();
      if (timer) clearTimeout(timer);
    };
  }, [tableKey]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(run, [version, tableKey, ...deps]);
}
