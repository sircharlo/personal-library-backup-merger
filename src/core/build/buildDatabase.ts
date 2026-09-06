import type { Database, SqlValue } from 'sql.js';
import { createEmptyDatabase, tableExists } from '../jwlibrary/sqlite';
import { DATA_TABLE_NAMES, TABLE_COLUMNS, type AllTables, type DataTableName, type SchemaObjects } from '../jwlibrary/types';

export interface BuildDatabaseOptions {
  /** Live DDL of the chosen template source. */
  template: SchemaObjects;
  /** Value for the `LastModified` singleton (e.g. "2026-07-10T22:56:20Z"). */
  lastModified: string;
  /** Single `grdb_migrations` row (identifier of the template source). */
  grdbMigrationIdentifier: string;
  /** `PRAGMA user_version` (real backups carry the schema version here). */
  userVersion: number;
}

/**
 * Build the merged `userData.db`:
 *   CREATE TABLEs → seed LastModified (its RAISE(FAIL) guard triggers don't exist yet, so a plain INSERT
 *   works) → grdb_migrations → CREATE INDEXes → bulk insert in FK order inside one transaction →
 *   CREATE TRIGGERs last (also avoids tens of thousands of redundant trigger-fired updates).
 * Foreign keys are enforced during the insert so any remap bug fails loudly here.
 * The caller owns the returned Database (export + close).
 */
export async function buildDatabase(tables: AllTables, opts: BuildDatabaseOptions): Promise<Database> {
  const db = await createEmptyDatabase();
  try {
    db.exec('PRAGMA foreign_keys = ON');
    for (const t of opts.template.tables) db.exec(t.sql);

    if (tableExists(db, 'LastModified')) db.run('INSERT INTO LastModified (LastModified) VALUES (?)', [opts.lastModified]);
    if (tableExists(db, 'grdb_migrations') && opts.grdbMigrationIdentifier) {
      db.run('INSERT INTO grdb_migrations (identifier) VALUES (?)', [opts.grdbMigrationIdentifier]);
    }
    for (const i of opts.template.indexes) db.exec(i.sql);

    db.exec('BEGIN');
    try {
      insertAllTables(db, tables);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }

    for (const tr of opts.template.triggers) db.exec(tr.sql);
    if (Number.isFinite(opts.userVersion) && opts.userVersion > 0) db.exec(`PRAGMA user_version = ${Math.trunc(opts.userVersion)}`);
    return db;
  } catch (e) {
    db.close();
    throw e;
  }
}

/** Insert every table in FK-safe order. Shared with the test fixture builder. */
export function insertAllTables(db: Database, tables: AllTables): void {
  for (const name of DATA_TABLE_NAMES) insertRows(db, name, tables[name]);
}

export function insertRows<K extends DataTableName>(db: Database, name: K, rows: readonly AllTables[K][number][]): void {
  if (!rows?.length) return;
  const cols = TABLE_COLUMNS[name];
  const sql = `INSERT INTO "${name}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`;
  const stmt = db.prepare(sql);
  try {
    for (const row of rows) {
      const r = row as unknown as Record<string, unknown>;
      stmt.run(cols.map((c) => toSqlValue(r[c])));
    }
  } catch (e) {
    throw new Error(`Failed inserting into ${name}: ${(e as Error).message}`);
  } finally {
    stmt.free();
  }
}

function toSqlValue(v: unknown): SqlValue {
  if (v === undefined || v === null) return null;
  if (typeof v === 'number' || typeof v === 'string') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'bigint') return Number(v);
  if (v instanceof Uint8Array) return v;
  return String(v);
}
