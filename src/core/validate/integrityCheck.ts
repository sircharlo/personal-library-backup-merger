import type { Database } from 'sql.js';
import { openDatabase, queryRows, queryScalar, tableExists } from '../jwlibrary/sqlite';
import { DATA_TABLE_NAMES, type DataTableName, type TableCounts } from '../jwlibrary/types';

export interface RowCountCheck {
  table: DataTableName;
  final: number;
  maxSource: number;
  sumSource: number;
  /** Rows intentionally removed by clean-ups (lowers the bound below). */
  removed: number;
  /** `max(sourceCounts) - removed <= final <= sum(sourceCounts)` */
  ok: boolean;
}

export interface PragmaChecks {
  foreignKeyViolations: number;
  integrityCheck: string;
}

export interface ValidationReport {
  /** Hard pass: zero FK violations, integrity ok, re-open ok, counts match the merge result. */
  ok: boolean;
  foreignKeyViolations: number;
  integrityCheck: string;
  rowCounts: RowCountCheck[];
  reopen: PragmaChecks & { ok: boolean; countsMatch: boolean };
  errors: string[];
  warnings: string[];
}

/**
 * Tables whose final count may legitimately fall below `max(sourceCounts)`: BlockRange children of a
 * losing UserMark conflict candidate are (correctly) not carried over.
 */
const LOWER_BOUND_SOFT_TABLES = new Set<DataTableName>(['BlockRange']);

export function runPragmaChecks(db: Database): PragmaChecks {
  const fk = queryRows(db, 'PRAGMA foreign_key_check');
  const integrity = String(queryScalar<string>(db, 'PRAGMA integrity_check') ?? '');
  return { foreignKeyViolations: fk.length, integrityCheck: integrity };
}

export function readTableCounts(db: Database): TableCounts {
  const out = {} as TableCounts;
  for (const t of DATA_TABLE_NAMES) {
    out[t] = tableExists(db, t) ? Number(queryScalar<number>(db, `SELECT count(*) FROM "${t}"`) ?? 0) : 0;
  }
  return out;
}

/**
 * `PRAGMA foreign_key_check` (zero rows), `PRAGMA integrity_check` ('ok'), per-table row-count
 * reconciliation against the sources, then export → re-open → re-run both pragmas + spot-check counts.
 */
export async function validateDatabaseBytes(
  dbBytes: Uint8Array,
  sourceCounts: TableCounts[],
  expectedCounts?: TableCounts,
  removed: Partial<TableCounts> = {},
): Promise<ValidationReport> {
  const errors: string[] = [];
  const warnings: string[] = [];

  const db = await openDatabase(dbBytes);
  let first: PragmaChecks;
  let finalCounts: TableCounts;
  let reexported: Uint8Array;
  try {
    first = runPragmaChecks(db);
    finalCounts = readTableCounts(db);
    reexported = db.export();
  } finally {
    db.close();
  }

  if (first.foreignKeyViolations > 0) errors.push(`${first.foreignKeyViolations} foreign key violation(s) in the merged database.`);
  if (first.integrityCheck !== 'ok') errors.push(`integrity_check failed: ${first.integrityCheck}`);

  const rowCounts: RowCountCheck[] = DATA_TABLE_NAMES.map((table) => {
    const counts = sourceCounts.map((c) => c[table] ?? 0);
    const maxSource = counts.length ? Math.max(...counts) : 0;
    const sumSource = counts.reduce((a, b) => a + b, 0);
    const final = finalCounts[table];
    const removedHere = removed[table] ?? 0;
    const upperOk = final <= sumSource;
    const lowerOk = final >= maxSource - removedHere;
    if (!upperOk) errors.push(`${table}: merged count ${final} exceeds the sum of the sources (${sumSource}).`);
    if (!lowerOk) {
      const msg = `${table}: merged count ${final} is below the largest source (${maxSource})${removedHere ? ` minus the ${removedHere} row(s) removed by clean-up` : ''}.`;
      if (LOWER_BOUND_SOFT_TABLES.has(table)) warnings.push(msg + ' (expected when a highlight conflict winner has fewer ranges)');
      else errors.push(msg);
    }
    if (expectedCounts && expectedCounts[table] !== final) errors.push(`${table}: database holds ${final} rows but the merge produced ${expectedCounts[table]}.`);
    return { table, final, maxSource, sumSource, removed: removedHere, ok: upperOk && (lowerOk || LOWER_BOUND_SOFT_TABLES.has(table)) };
  });

  const reopened = await openDatabase(reexported);
  let second: PragmaChecks;
  let countsMatch: boolean;
  try {
    second = runPragmaChecks(reopened);
    const again = readTableCounts(reopened);
    countsMatch = DATA_TABLE_NAMES.every((t) => again[t] === finalCounts[t]);
  } finally {
    reopened.close();
  }
  const reopenOk = second.foreignKeyViolations === 0 && second.integrityCheck === 'ok' && countsMatch;
  if (!reopenOk) errors.push('The merged database did not survive an export/re-open round trip.');

  return {
    ok: errors.length === 0,
    foreignKeyViolations: first.foreignKeyViolations,
    integrityCheck: first.integrityCheck,
    rowCounts,
    reopen: { ...second, ok: reopenOk, countsMatch },
    errors,
    warnings,
  };
}
