import type { BlockRangeRow, InputFieldRow, NoteRow, UserMarkRow } from '../jwlibrary/types';
import { compareTimestamps } from '../util/datetime';

/** Only these three kinds ever reach the user; everything else is auto-resolved. */
export type ConflictKind = 'note' | 'inputField' | 'userMark';

export interface ConflictCandidate<T> {
  sourceIndex: number;
  sourceLabel: string;
  /** Fully remapped row carrying the shared global id. */
  row: T;
  /** UserMark conflicts: the candidate's BlockRange children, already remapped with their own global ids. */
  children?: BlockRangeRow[];
  /** Timestamp used for the suggestion heuristic. */
  timestamp: string;
  /** Whether `timestamp` is the row's own (Note.LastModified) or the owning backup's LastModified. */
  timestampSource: 'row' | 'backup';
  /** The owning backup's LastModified (tie-breaker when row timestamps tie). */
  backupTimestamp: string;
}

export interface Conflict<T = unknown> {
  /** Deterministic: `${kind}:${identityKey}` — stable across re-analysis. */
  id: string;
  kind: ConflictKind;
  identityKey: string;
  /** 2+ candidates, one per source holding the row (3+-way possible). */
  candidates: ConflictCandidate<T>[];
  /** sourceIndex of the pre-selected winner. */
  suggestedWinnerIndex: number;
  suggestedWinnerReason: string;
  /** Human-readable context (e.g. the location / publication this row belongs to). */
  context: string;
}

export type NoteConflict = Conflict<NoteRow>;
export type InputFieldConflict = Conflict<InputFieldRow>;
export type UserMarkConflict = Conflict<UserMarkRow>;

/**
 * conflictId → winning sourceIndex, or `KEEP_BOTH`. Absent entries default to `suggestedWinnerIndex`.
 */
export type ConflictResolutions = Map<string, number>;

/**
 * Resolution value meaning "keep every version": the suggested copy keeps its identity and each
 * other copy is written as a separate row with a fresh GUID, so no content is ever discarded.
 * Not possible for input fields (their identity *is* the field; two values cannot coexist).
 */
export const KEEP_BOTH = -1;

export function supportsKeepBoth(kind: ConflictKind): boolean {
  return kind === 'note' || kind === 'userMark';
}

export function isKeepBoth(conflict: Conflict, resolutions: ConflictResolutions): boolean {
  return resolutions.get(conflict.id) === KEEP_BOTH && supportsKeepBoth(conflict.kind);
}

export function conflictIdFor(kind: ConflictKind, identityKey: string): string {
  return `${kind}:${identityKey}`;
}

export interface SuggestedWinner {
  sourceIndex: number;
  reason: string;
}

/**
 * Most-recently-modified wins (row timestamp, then the owning backup's timestamp as tie-breaker).
 * A full tie falls back to the earliest-uploaded source.
 */
export function pickSuggestedWinner<T>(candidates: ConflictCandidate<T>[]): SuggestedWinner {
  let best = candidates[0];
  let decidedBy: 'row' | 'backup' | 'tie' = 'tie';
  for (let i = 1; i < candidates.length; i++) {
    const c = candidates[i];
    let cmp = compareTimestamps(c.timestamp, best.timestamp);
    let basis: 'row' | 'backup' = best.timestampSource;
    if (cmp === 0 && best.timestampSource === 'row') {
      cmp = compareTimestamps(c.backupTimestamp, best.backupTimestamp);
      basis = 'backup';
    }
    if (cmp > 0) {
      best = c;
      decidedBy = basis;
    } else if (cmp < 0) {
      if (decidedBy === 'tie') decidedBy = basis;
    }
  }
  if (candidates.length > 1 && decidedBy === 'tie') {
    return {
      sourceIndex: best.sourceIndex,
      reason: `Timestamps tie; keeping the copy from the first uploaded backup (${best.sourceLabel}).`,
    };
  }
  const basisText =
    best.timestampSource === 'row' && decidedBy === 'row'
      ? 'this copy was edited most recently'
      : best.timestampSource === 'row'
        ? 'the copies carry the same edit time, so the backup that was modified most recently is preferred'
        : 'this table has no per-row timestamp, so the backup that was modified most recently is preferred';
  return { sourceIndex: best.sourceIndex, reason: `Suggested: ${best.sourceLabel} — ${basisText}.` };
}

/** Resolve a conflict to the chosen (or suggested) candidate. */
export function chooseCandidate<T>(conflict: Conflict<T>, resolutions: ConflictResolutions): ConflictCandidate<T> {
  const chosen = resolutions.get(conflict.id);
  return (
    conflict.candidates.find((c) => c.sourceIndex === chosen) ??
    conflict.candidates.find((c) => c.sourceIndex === conflict.suggestedWinnerIndex) ??
    conflict.candidates[0]
  );
}
