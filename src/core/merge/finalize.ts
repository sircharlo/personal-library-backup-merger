import {
  DATA_TABLE_NAMES,
  TABLE_PRIMARY_KEYS,
  countTables,
  type AllTables,
  type BlockRangeRow,
  type DataTableName,
  type InputFieldRow,
  type NoteRow,
  type TableCounts,
  type UserMarkRow,
} from '../jwlibrary/types';
import { deterministicGuid } from '../util/guid';
import type { MergeAnalysis } from './analyze';
import { chooseCandidate, isKeepBoth, type Conflict, type ConflictKind, type ConflictResolutions } from './conflicts';

export interface ResolvedConflict {
  conflictId: string;
  kind: ConflictKind;
  /** The copy that keeps the original identity (with `keptBoth`, the suggested one). */
  winnerSourceIndex: number;
  wasSuggested: boolean;
  /** Every other copy was written as a separate row with a fresh GUID. */
  keptBoth: boolean;
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

  const ids = new FreshIds(analysis);
  const resolvedConflicts: ResolvedConflict[] = [];
  for (const conflict of analysis.conflicts) {
    const keepBoth = isKeepBoth(conflict, resolutions);
    const winner = keepBoth
      ? (conflict.candidates.find((c) => c.sourceIndex === conflict.suggestedWinnerIndex) ?? conflict.candidates[0])
      : chooseCandidate(conflict, resolutions);
    const extras = keepBoth ? conflict.candidates.filter((c) => c !== winner) : [];

    switch (conflict.kind) {
      case 'note': {
        tables.Note.push(winner.row as NoteRow);
        for (const extra of extras) {
          const row = extra.row as NoteRow;
          tables.Note.push({ ...row, NoteId: ids.next('Note'), Guid: deterministicGuid(`${conflict.id}:${extra.sourceIndex}`) });
        }
        break;
      }
      case 'inputField':
        tables.InputField.push(winner.row as InputFieldRow);
        break;
      case 'userMark': {
        tables.UserMark.push(winner.row as UserMarkRow);
        if (winner.children) tables.BlockRange.push(...winner.children);
        for (const extra of extras) {
          const row = extra.row as UserMarkRow;
          const userMarkId = ids.next('UserMark');
          tables.UserMark.push({ ...row, UserMarkId: userMarkId, UserMarkGuid: deterministicGuid(`${conflict.id}:${extra.sourceIndex}`) });
          for (const child of extra.children ?? []) {
            tables.BlockRange.push({ ...child, BlockRangeId: ids.next('BlockRange'), UserMarkId: userMarkId });
          }
        }
        break;
      }
    }
    resolvedConflicts.push({
      conflictId: conflict.id,
      kind: conflict.kind,
      winnerSourceIndex: winner.sourceIndex,
      wasSuggested: winner.sourceIndex === conflict.suggestedWinnerIndex,
      keptBoth: keepBoth,
    });
  }

  sortAllTables(tables);
  return { tables, counts: countTables(tables), resolvedConflicts };
}

/** Ids above everything the analysis allocated, for rows created while keeping both versions. */
class FreshIds {
  private readonly next_: Record<'Note' | 'UserMark' | 'BlockRange', number>;

  constructor(analysis: MergeAnalysis) {
    const max = (table: 'Note' | 'UserMark' | 'BlockRange', column: string): number => {
      let m = 0;
      for (const row of analysis.merged[table] as unknown as Record<string, number>[]) m = Math.max(m, row[column]);
      for (const c of analysis.conflicts as Conflict<Record<string, number>>[]) {
        for (const cand of c.candidates) {
          if (c.kind === 'note' && table === 'Note') m = Math.max(m, cand.row.NoteId);
          if (c.kind === 'userMark' && table === 'UserMark') m = Math.max(m, cand.row.UserMarkId);
          if (c.kind === 'userMark' && table === 'BlockRange') for (const b of (cand.children ?? []) as BlockRangeRow[]) m = Math.max(m, b.BlockRangeId);
        }
      }
      return m;
    };
    this.next_ = { Note: max('Note', 'NoteId') + 1, UserMark: max('UserMark', 'UserMarkId') + 1, BlockRange: max('BlockRange', 'BlockRangeId') + 1 };
  }

  next(table: 'Note' | 'UserMark' | 'BlockRange'): number {
    return this.next_[table]++;
  }
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
