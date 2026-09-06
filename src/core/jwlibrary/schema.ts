import type { Database } from 'sql.js';
import { queryRows } from './sqlite';
import {
  DATA_TABLE_NAMES,
  SYSTEM_TABLE_NAMES,
  TABLE_COLUMNS,
  type SchemaCheckResult,
  type SchemaObject,
  type SchemaObjects,
} from './types';

interface SqliteMasterRow {
  type: string;
  name: string;
  tbl_name: string;
  sql: string | null;
}

/**
 * Extract the live DDL of a source database from `sqlite_master`, in creation (rowid) order.
 * DDL text differs across devices (quoting/whitespace) even when logically identical, which is
 * why the output database is always built from one source's *live* DDL, never from hardcoded text.
 */
export function extractSchemaObjects(db: Database): SchemaObjects {
  const rows = queryRows<SqliteMasterRow>(
    db,
    "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY rowid",
  );
  const out: SchemaObjects = { tables: [], indexes: [], triggers: [] };
  for (const r of rows) {
    const obj: SchemaObject = { type: r.type as SchemaObject['type'], name: r.name, tblName: r.tbl_name, sql: r.sql! };
    if (r.type === 'table') out.tables.push(obj);
    else if (r.type === 'index') out.indexes.push(obj);
    else if (r.type === 'trigger') out.triggers.push(obj);
    // views: none exist in JW Library backups; ignored deliberately.
  }
  return out;
}

/** Confirm every expected table and column exists in this source (via PRAGMA table_info). */
export function checkExpectedSchema(db: Database): SchemaCheckResult {
  const missingTables: string[] = [];
  const missingColumns: string[] = [];
  const existing = new Set(
    queryRows<{ name: string }>(db, "SELECT name FROM sqlite_master WHERE type='table'").map((r) => r.name),
  );
  for (const t of [...DATA_TABLE_NAMES, ...SYSTEM_TABLE_NAMES]) {
    if (!existing.has(t)) missingTables.push(t);
  }
  for (const t of DATA_TABLE_NAMES) {
    if (!existing.has(t)) continue;
    const cols = new Set(queryRows<{ name: string }>(db, `PRAGMA table_info("${t}")`).map((r) => r.name));
    for (const c of TABLE_COLUMNS[t]) if (!cols.has(c)) missingColumns.push(`${t}.${c}`);
  }
  return { missingTables, missingColumns, ok: missingTables.length === 0 && missingColumns.length === 0 };
}

/** Parse the numeric part of a grdb migration identifier ("v16" → 16); NaN-safe (returns -1). */
export function parseMigrationNumber(identifier: string): number {
  const m = /(\d+)\s*$/.exec(identifier ?? '');
  return m ? Number(m[1]) : -1;
}
