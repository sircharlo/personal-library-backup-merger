import initSqlJs from 'sql.js';
import type { Database, SqlJsStatic, SqlValue } from 'sql.js';

/**
 * sql.js bootstrap, memoized. In Node (Vitest) the default emscripten loader finds
 * `sql-wasm.wasm` next to `sql-wasm.js` via `__dirname`. In the browser the app entry
 * calls `configureSqlJs({ locateFile })` with a Vite `?url` import so the wasm is served
 * under the correct `base` path.
 */
export interface SqlJsRuntimeConfig {
  locateFile?: (file: string) => string;
  wasmBinary?: ArrayBuffer;
}

let runtimeConfig: SqlJsRuntimeConfig = {};
let sqlPromise: Promise<SqlJsStatic> | null = null;

export function configureSqlJs(config: SqlJsRuntimeConfig): void {
  runtimeConfig = config;
  sqlPromise = null;
}

export function initSqlJsOnce(): Promise<SqlJsStatic> {
  if (!sqlPromise) {
    sqlPromise = initSqlJs({ ...runtimeConfig }).catch((err) => {
      sqlPromise = null;
      throw err;
    });
  }
  return sqlPromise;
}

export async function openDatabase(bytes: Uint8Array): Promise<Database> {
  const SQL = await initSqlJsOnce();
  return new SQL.Database(bytes);
}

export async function createEmptyDatabase(): Promise<Database> {
  const SQL = await initSqlJsOnce();
  return new SQL.Database();
}

/** Run a query and return every row as a plain object. */
export function queryRows<T = Record<string, SqlValue>>(db: Database, sql: string, params?: SqlValue[]): T[] {
  const stmt = db.prepare(sql);
  try {
    if (params) stmt.bind(params);
    const rows: T[] = [];
    while (stmt.step()) rows.push(stmt.getAsObject() as unknown as T);
    return rows;
  } finally {
    stmt.free();
  }
}

/** Run a query and return the first column of the first row (or undefined). */
export function queryScalar<T extends SqlValue = SqlValue>(db: Database, sql: string, params?: SqlValue[]): T | undefined {
  const stmt = db.prepare(sql);
  try {
    if (params) stmt.bind(params);
    if (!stmt.step()) return undefined;
    const row = stmt.get();
    return row[0] as T;
  } finally {
    stmt.free();
  }
}

export function tableExists(db: Database, name: string): boolean {
  return queryScalar<number>(db, "SELECT count(*) FROM sqlite_master WHERE type='table' AND name=?", [name]) === 1;
}
