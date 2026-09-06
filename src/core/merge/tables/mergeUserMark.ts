import type { UserMarkRow } from '../../jwlibrary/types';
import { conflictIdFor, pickSuggestedWinner, type Conflict, type ConflictCandidate } from '../conflicts';
import { groupBy, labelOf, mapId, warn, type MergeContext } from '../context';
import { describeLocation } from '../describe';
import { blockRangeSignature, KEY_SEP, keyOf } from '../identity';

interface Copy {
  sourceIndex: number;
  localId: number;
  row: UserMarkRow;
  signature: string;
}

/**
 * Stage 2 — UserMark, deduplicated by `UserMarkGuid` with Location remapped.
 * Conflict when the copies differ in ColorIndex / StyleIndex / Version (or, more conservatively,
 * in the mapped Location or the set of highlighted BlockRanges — a highlight edited differently).
 */
export function mergeUserMark(ctx: MergeContext): void {
  const childrenBySource = ctx.sources.map((s) => groupBy(s.tables.BlockRange, (r) => r.UserMarkId));
  const groups = new Map<string, { sourceIndex: number; row: UserMarkRow }[]>();
  for (const src of ctx.sources) {
    for (const row of src.tables.UserMark) {
      const list = groups.get(row.UserMarkGuid);
      const entry = { sourceIndex: src.sourceIndex, row };
      if (list) list.push(entry);
      else groups.set(row.UserMarkGuid, [entry]);
    }
  }

  for (const [guid, members] of groups) {
    const { id } = ctx.alloc.UserMark.mapOrAllocate(guid);
    const copies: Copy[] = [];
    for (const m of members) {
      const loc = mapId(ctx, m.sourceIndex, 'Location', m.row.LocationId);
      if (loc === undefined) {
        warn(ctx, `${labelOf(ctx, m.sourceIndex)}: highlight ${guid} references a missing location #${m.row.LocationId}; skipped.`);
        ctx.idMaps[m.sourceIndex].set('UserMark', m.row.UserMarkId, { kind: 'dropped', reason: 'dangling LocationId' });
        continue;
      }
      const remapped: UserMarkRow = { ...m.row, UserMarkId: id, LocationId: loc };
      const children = childrenBySource[m.sourceIndex].get(m.row.UserMarkId) ?? [];
      const childSig = children.map(blockRangeSignature).sort().join(KEY_SEP + KEY_SEP);
      copies.push({
        sourceIndex: m.sourceIndex,
        localId: m.row.UserMarkId,
        row: remapped,
        signature: keyOf([remapped.ColorIndex, remapped.StyleIndex, remapped.Version, remapped.LocationId, childSig]),
      });
    }
    if (copies.length === 0) continue;

    const distinct = new Set(copies.map((c) => c.signature));
    if (distinct.size === 1) {
      ctx.merged.UserMark.push(copies[0].row);
      copies.forEach((c, i) =>
        ctx.idMaps[c.sourceIndex].set('UserMark', c.localId, { kind: 'mapped', globalId: id, mergedInto: i > 0 }),
      );
      ctx.auto.userMarksDeduped += copies.length - 1;
      ctx.userMarkGroups.push({
        globalId: id,
        candidates: copies.map((c) => ({ sourceIndex: c.sourceIndex, localId: c.localId })),
      });
      continue;
    }

    const candidates: ConflictCandidate<UserMarkRow>[] = copies.map((c) => ({
      sourceIndex: c.sourceIndex,
      sourceLabel: labelOf(ctx, c.sourceIndex),
      row: c.row,
      timestamp: ctx.sources[c.sourceIndex].lastModified,
      timestampSource: 'backup',
      backupTimestamp: ctx.sources[c.sourceIndex].lastModified,
    }));
    const suggested = pickSuggestedWinner(candidates);
    const conflict: Conflict<UserMarkRow> = {
      id: conflictIdFor('userMark', guid),
      kind: 'userMark',
      identityKey: guid,
      candidates,
      suggestedWinnerIndex: suggested.sourceIndex,
      suggestedWinnerReason: suggested.reason,
      context: describeLocation(ctx.locationById.get(copies[0].row.LocationId)),
    };
    ctx.conflicts.push(conflict);
    copies.forEach((c) =>
      ctx.idMaps[c.sourceIndex].set('UserMark', c.localId, { kind: 'conflict', globalId: id, conflictId: conflict.id }),
    );
    ctx.userMarkGroups.push({
      globalId: id,
      candidates: copies.map((c) => ({ sourceIndex: c.sourceIndex, localId: c.localId })),
      conflict,
    });
  }
}
