import type { InputFieldRow } from '../../jwlibrary/types';
import { conflictIdFor, pickSuggestedWinner, type Conflict, type ConflictCandidate } from '../conflicts';
import { labelOf, mapId, warn, type MergeContext } from '../context';
import { describeLocation } from '../describe';
import { inputFieldKey, localRowKey } from '../identity';

interface Copy {
  sourceIndex: number;
  localKey: number | string;
  row: InputFieldRow;
}

/**
 * Stage 7 — InputField, identity `(mappedLocationId, TextTag)` (the table's own PK).
 * Conflict when `Value` differs. No per-row timestamp exists, so the suggestion falls back to the
 * owning backup's LastModified (labelled as such).
 */
export function mergeInputField(ctx: MergeContext): void {
  const groups = new Map<string, Copy[]>();
  for (const src of ctx.sources) {
    const si = src.sourceIndex;
    for (const row of src.tables.InputField) {
      const localKey = localRowKey('InputField', row);
      const loc = mapId(ctx, si, 'Location', row.LocationId);
      if (loc === undefined) {
        warn(ctx, `${labelOf(ctx, si)}: input field "${row.TextTag}" references a missing location #${row.LocationId}; skipped.`);
        ctx.idMaps[si].set('InputField', localKey, { kind: 'dropped', reason: 'dangling LocationId' });
        continue;
      }
      const key = inputFieldKey(loc, row);
      const copy: Copy = { sourceIndex: si, localKey, row: { ...row, LocationId: loc } };
      const list = groups.get(key);
      if (list) list.push(copy);
      else groups.set(key, [copy]);
    }
  }

  for (const [key, copies] of groups) {
    const distinct = new Set(copies.map((c) => c.row.Value));
    if (distinct.size === 1) {
      ctx.merged.InputField.push(copies[0].row);
      copies.forEach((c, i) => ctx.idMaps[c.sourceIndex].set('InputField', c.localKey, { kind: 'mapped', globalId: key, mergedInto: i > 0 }));
      ctx.auto.inputFieldsDeduped += copies.length - 1;
      continue;
    }
    const candidates: ConflictCandidate<InputFieldRow>[] = copies.map((c) => ({
      sourceIndex: c.sourceIndex,
      sourceLabel: labelOf(ctx, c.sourceIndex),
      row: c.row,
      timestamp: ctx.sources[c.sourceIndex].lastModified,
      timestampSource: 'backup',
      backupTimestamp: ctx.sources[c.sourceIndex].lastModified,
    }));
    const suggested = pickSuggestedWinner(candidates);
    const conflict: Conflict<InputFieldRow> = {
      id: conflictIdFor('inputField', key),
      kind: 'inputField',
      identityKey: key,
      candidates,
      suggestedWinnerIndex: suggested.sourceIndex,
      suggestedWinnerReason: suggested.reason,
      context: `${describeLocation(ctx.locationById.get(copies[0].row.LocationId))} · field "${copies[0].row.TextTag}"`,
    };
    ctx.conflicts.push(conflict);
    for (const c of copies) ctx.idMaps[c.sourceIndex].set('InputField', c.localKey, { kind: 'conflict', globalId: key, conflictId: conflict.id });
  }
}
