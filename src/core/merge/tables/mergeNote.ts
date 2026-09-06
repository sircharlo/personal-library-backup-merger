import type { NoteRow } from '../../jwlibrary/types';
import { compareTimestamps } from '../../util/datetime';
import { conflictIdFor, pickSuggestedWinner, type Conflict, type ConflictCandidate } from '../conflicts';
import { labelOf, mapId, warn, type MergeContext } from '../context';
import { describeLocation } from '../describe';
import { keyOf } from '../identity';

interface Copy {
  sourceIndex: number;
  localId: number;
  row: NoteRow;
}

/**
 * Stage 5 — Note, deduplicated by `Guid` with UserMark + Location remapped.
 * Conflict when `Content` / `Title` differ; suggested winner = later `LastModified`.
 */
export function mergeNote(ctx: MergeContext): void {
  const groups = new Map<string, { sourceIndex: number; row: NoteRow }[]>();
  for (const src of ctx.sources) {
    for (const row of src.tables.Note) {
      const list = groups.get(row.Guid);
      const entry = { sourceIndex: src.sourceIndex, row };
      if (list) list.push(entry);
      else groups.set(row.Guid, [entry]);
    }
  }

  for (const [guid, members] of groups) {
    const { id } = ctx.alloc.Note.mapOrAllocate(guid);
    const copies: Copy[] = members.map((m) => {
      const label = labelOf(ctx, m.sourceIndex);
      let userMarkId: number | null = null;
      if (m.row.UserMarkId != null) {
        userMarkId = mapId(ctx, m.sourceIndex, 'UserMark', m.row.UserMarkId) ?? null;
        if (userMarkId === null) warn(ctx, `${label}: note ${guid} referenced a missing highlight #${m.row.UserMarkId}; link cleared.`);
      }
      let locationId: number | null = null;
      if (m.row.LocationId != null) {
        locationId = mapId(ctx, m.sourceIndex, 'Location', m.row.LocationId) ?? null;
        if (locationId === null) warn(ctx, `${label}: note ${guid} referenced a missing location #${m.row.LocationId}; link cleared.`);
      }
      return { sourceIndex: m.sourceIndex, localId: m.row.NoteId, row: { ...m.row, NoteId: id, UserMarkId: userMarkId, LocationId: locationId } };
    });

    const distinct = new Set(copies.map((c) => keyOf([c.row.Title, c.row.Content])));
    if (distinct.size === 1) {
      let winner = copies[0];
      for (let i = 1; i < copies.length; i++) {
        if (compareTimestamps(copies[i].row.LastModified, winner.row.LastModified) > 0) winner = copies[i];
      }
      ctx.merged.Note.push(winner.row);
      for (const c of copies) {
        ctx.idMaps[c.sourceIndex].set('Note', c.localId, { kind: 'mapped', globalId: id, mergedInto: c !== winner });
      }
      ctx.auto.notesDeduped += copies.length - 1;
      continue;
    }

    const candidates: ConflictCandidate<NoteRow>[] = copies.map((c) => ({
      sourceIndex: c.sourceIndex,
      sourceLabel: labelOf(ctx, c.sourceIndex),
      row: c.row,
      timestamp: c.row.LastModified,
      timestampSource: 'row',
      backupTimestamp: ctx.sources[c.sourceIndex].lastModified,
    }));
    const suggested = pickSuggestedWinner(candidates);
    const loc = copies.find((c) => c.row.LocationId != null)?.row.LocationId;
    const conflict: Conflict<NoteRow> = {
      id: conflictIdFor('note', guid),
      kind: 'note',
      identityKey: guid,
      candidates,
      suggestedWinnerIndex: suggested.sourceIndex,
      suggestedWinnerReason: suggested.reason,
      context: loc != null ? describeLocation(ctx.locationById.get(loc)) : 'note without a location',
    };
    ctx.conflicts.push(conflict);
    for (const c of copies) {
      ctx.idMaps[c.sourceIndex].set('Note', c.localId, { kind: 'conflict', globalId: id, conflictId: conflict.id });
    }
  }
}
