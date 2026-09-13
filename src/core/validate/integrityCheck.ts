import type { Database } from 'sql.js';
import { openDatabase, queryRows, queryScalar, tableExists } from '../jwlibrary/sqlite';
import { DATA_TABLE_NAMES, type DataTableName, type TableCounts } from '../jwlibrary/types';

export interface RowCountCheck {
  table: DataTableName;
  final: number;
  /** Largest raw row count among the sources. */
  maxSource: number;
  /**
   * Largest number of rows any single source can actually contribute: its count minus the rows that were
   * already broken in that backup and deliberately left out at analysis (each one warned about).
   */
  maxCarried: number;
  sumSource: number;
  /** Rows intentionally removed by clean-ups (lowers the bound below). */
  removed: number;
  /** `maxCarried - removed <= final <= sum(sourceCounts)` */
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
 *
 * `dropped[i]` holds, per table, the rows of source `i` the merge left out because they were already
 * broken in that backup (e.g. a tag assignment whose note or playlist item no longer exists there).
 */
export async function validateDatabaseBytes(
  dbBytes: Uint8Array,
  sourceCounts: TableCounts[],
  expectedCounts?: TableCounts,
  removed: Partial<TableCounts> = {},
  dropped: Partial<TableCounts>[] = [],
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
    const carried = counts.map((n, i) => Math.max(0, n - (dropped[i]?.[table] ?? 0)));
    const maxSource = counts.length ? Math.max(...counts) : 0;
    const maxCarried = carried.length ? Math.max(...carried) : 0;
    const sumSource = counts.reduce((a, b) => a + b, 0);
    const final = finalCounts[table];
    const removedHere = removed[table] ?? 0;
    const upperOk = final <= sumSource;
    const lowerOk = final >= maxCarried - removedHere;
    if (!upperOk) errors.push(`${table}: merged count ${final} exceeds the sum of the sources (${sumSource}).`);
    if (!lowerOk) {
      const bound =
        maxCarried === maxSource
          ? `the largest source (${maxSource})`
          : `the ${maxCarried} row(s) the largest source can contribute (${maxSource} in that backup, the rest already broken there and left out)`;
      const msg = `${table}: merged count ${final} is below ${bound}${removedHere ? ` minus the ${removedHere} row(s) removed by clean-up` : ''}.`;
      if (LOWER_BOUND_SOFT_TABLES.has(table)) warnings.push(msg + ' (expected when a highlight conflict winner has fewer ranges)');
      else errors.push(msg);
    }
    if (expectedCounts && expectedCounts[table] !== final) errors.push(`${table}: database holds ${final} rows but the merge produced ${expectedCounts[table]}.`);
    return { table, final, maxSource, maxCarried, sumSource, removed: removedHere, ok: upperOk && (lowerOk || LOWER_BOUND_SOFT_TABLES.has(table)) };
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
