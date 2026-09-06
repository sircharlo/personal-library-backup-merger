import {
  DATA_TABLE_NAMES,
  TABLE_PRIMARY_KEYS,
  countTables,
  type AllTables,
  type DataTableName,
  type InputFieldRow,
  type NoteRow,
  type TableCounts,
  type UserMarkRow,
} from '../jwlibrary/types';
import type { MergeAnalysis } from './analyze';
import { chooseCandidate, type ConflictKind, type ConflictResolutions } from './conflicts';

export interface ResolvedConflict {
  conflictId: string;
  kind: ConflictKind;
  winnerSourceIndex: number;
  wasSuggested: boolean;
}

export interface MergeResult {
  tables: AllTables;
  counts: TableCounts;
  resolvedConflicts: ResolvedConflict[];
}

/**
 * Two-phase step 2: apply conflict resolutions to the analysis. Any conflict id absent from
 * `resolutions` defaults to its `suggestedWinnerIndex` (no forced clicking). Cheap to re-run.
 */
export function finalize(analysis: MergeAnalysis, resolutions: ConflictResolutions = new Map()): MergeResult {
  const tables = {} as AllTables;
  for (const name of DATA_TABLE_NAMES) (tables as Record<DataTableName, unknown[]>)[name] = [...analysis.merged[name]];

  const resolvedConflicts: ResolvedConflict[] = [];
  for (const conflict of analysis.conflicts) {
    const winner = chooseCandidate(conflict, resolutions);
    switch (conflict.kind) {
      case 'note':
        tables.Note.push(winner.row as NoteRow);
        break;
      case 'inputField':
        tables.InputField.push(winner.row as InputFieldRow);
        break;
      case 'userMark':
        tables.UserMark.push(winner.row as UserMarkRow);
        if (winner.children) tables.BlockRange.push(...winner.children);
        break;
    }
    resolvedConflicts.push({
      conflictId: conflict.id,
      kind: conflict.kind,
      winnerSourceIndex: winner.sourceIndex,
      wasSuggested: winner.sourceIndex === conflict.suggestedWinnerIndex,
    });
  }

  sortAllTables(tables);
  return { tables, counts: countTables(tables), resolvedConflicts };
}

/** Deterministic output order: every table sorted by its primary key. */
export function sortAllTables(tables: AllTables): void {
  for (const name of DATA_TABLE_NAMES) {
    const pk = TABLE_PRIMARY_KEYS[name];
    (tables[name] as unknown as Record<string, unknown>[]).sort((a, b) => {
      for (const col of pk) {
        const x = a[col] as number | string;
        const y = b[col] as number | string;
        if (x === y) continue;
        if (typeof x === 'number' && typeof y === 'number') return x - y;
        return String(x) < String(y) ? -1 : 1;
      }
      return 0;
    });
  }
}
