import type { Database } from 'sql.js';
import { queryRows, queryScalar, tableExists } from './sqlite';
import {
  DATA_TABLE_NAMES,
  TABLE_COLUMNS,
  TABLE_PRIMARY_KEYS,
  emptyAllTables,
  type AllTables,
  type DataTableName,
} from './types';

/** Read every user-data table, ordered by primary key so results are deterministic. */
export function readAllTables(db: Database): AllTables {
  const tables = emptyAllTables();
  for (const name of DATA_TABLE_NAMES) {
    (tables as Record<DataTableName, unknown[]>)[name] = readTable(db, name);
  }
  return tables;
}

export function readTable<K extends DataTableName>(db: Database, name: K): AllTables[K] {
  if (!tableExists(db, name)) return [] as unknown as AllTables[K];
  const cols = TABLE_COLUMNS[name].map((c) => `"${c}"`).join(', ');
  const order = TABLE_PRIMARY_KEYS[name].map((c) => `"${c}"`).join(', ');
  return queryRows(db, `SELECT ${cols} FROM "${name}" ORDER BY ${order}`) as AllTables[K];
}

export function readLastModified(db: Database): string {
  if (!tableExists(db, 'LastModified')) return '';
  return (queryScalar<string>(db, 'SELECT LastModified FROM LastModified LIMIT 1') ?? '') as string;
}

export function readGrdbMigrationIdentifier(db: Database): string {
  if (!tableExists(db, 'grdb_migrations')) return '';
  // Single row in practice; if several exist, keep the highest-numbered one.
  const ids = queryRows<{ identifier: string }>(db, 'SELECT identifier FROM grdb_migrations').map((r) => r.identifier);
  if (ids.length === 0) return '';
  return ids.sort((a, b) => numericSuffix(a) - numericSuffix(b))[ids.length - 1];
}

export function readUserVersion(db: Database): number {
  return Number(queryScalar<number>(db, 'PRAGMA user_version') ?? 0);
}

function numericSuffix(s: string): number {
  const m = /(\d+)\s*$/.exec(s);
  return m ? Number(m[1]) : -1;
}
