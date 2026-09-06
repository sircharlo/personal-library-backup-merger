import { groupBy, labelOf, mapId, warn, type MergeContext } from '../context';
import { tagMapKey, type TagMapRefKind } from '../identity';

interface TagState {
  maxPos: number;
  usedPos: Set<number>;
}

/**
 * Stage 12 — TagMap, last (needs Tag + Location + Note + PlaylistItem fully remapped).
 * Identity mirrors the three UNIQUE constraints. Position renumbering per TagId: the first source to
 * contribute keeps its positions verbatim; every later source's rows are appended from
 * `max(existing) + 1`, preserving that source's internal relative order — so `UNIQUE(TagId, Position)`
 * can never be violated and nothing is reordered within a source.
 */
export function mergeTagMap(ctx: MergeContext): void {
  const byRef = new Map<string, number>();
  const tagState = new Map<number, TagState>();

  for (const src of ctx.sources) {
    const si = src.sourceIndex;
    const idMap = ctx.idMaps[si];
    const label = labelOf(ctx, si);
    const byLocalTag = groupBy(src.tables.TagMap, (r) => r.TagId);

    for (const [localTagId, rows] of byLocalTag) {
      const tagId = mapId(ctx, si, 'Tag', localTagId);
      if (tagId === undefined) {
        warn(ctx, `${label}: ${rows.length} tag assignment(s) reference a missing tag #${localTagId}; skipped.`);
        for (const r of rows) idMap.set('TagMap', r.TagMapId, { kind: 'dropped', reason: 'dangling TagId' });
        continue;
      }
      let state = tagState.get(tagId);
      const firstContributor = !state;
      if (!state) {
        state = { maxPos: -1, usedPos: new Set() };
        tagState.set(tagId, state);
      }

      const ordered = [...rows].sort((a, b) => a.Position - b.Position || a.TagMapId - b.TagMapId);
      for (const row of ordered) {
        const ref = resolveRef(ctx, si, row);
        if (!ref) {
          // Real backups (foreign_keys=0 in JW Library) do carry tag assignments whose note was deleted.
          warn(
            ctx,
            `${label}: tag assignment #${row.TagMapId} points at a ${refTypeName(row)} that no longer exists in that backup (already broken there); it was left out.`,
          );
          idMap.set('TagMap', row.TagMapId, { kind: 'dropped', reason: 'dangling reference in source' });
          continue;
        }
        const key = tagMapKey(tagId, ref.kind, ref.id);
        const dup = byRef.get(key);
        if (dup !== undefined) {
          idMap.set('TagMap', row.TagMapId, { kind: 'mapped', globalId: dup, mergedInto: true });
          ctx.auto.tagMapsDeduped++;
          continue;
        }

        let pos: number;
        if (firstContributor && !state.usedPos.has(row.Position)) pos = row.Position;
        else pos = state.maxPos + 1;
        if (pos !== row.Position) ctx.auto.tagPositionsRenumbered++;
        state.usedPos.add(pos);
        if (pos > state.maxPos) state.maxPos = pos;

        const gid = ctx.alloc.TagMap.allocate();
        ctx.merged.TagMap.push({
          TagMapId: gid,
          PlaylistItemId: ref.kind === 'P' ? ref.id : null,
          LocationId: ref.kind === 'L' ? ref.id : null,
          NoteId: ref.kind === 'N' ? ref.id : null,
          TagId: tagId,
          Position: pos,
        });
        byRef.set(key, gid);
        idMap.set('TagMap', row.TagMapId, { kind: 'mapped', globalId: gid, mergedInto: false });
      }
    }
  }
}

function refTypeName(row: { NoteId: number | null; LocationId: number | null; PlaylistItemId: number | null }): string {
  if (row.NoteId != null) return 'note';
  if (row.LocationId != null) return 'publication/chapter';
  if (row.PlaylistItemId != null) return 'playlist item';
  return 'target';
}

function resolveRef(
  ctx: MergeContext,
  si: number,
  row: { NoteId: number | null; LocationId: number | null; PlaylistItemId: number | null },
): { kind: TagMapRefKind; id: number } | null {
  if (row.NoteId != null) {
    const id = mapId(ctx, si, 'Note', row.NoteId);
    return id === undefined ? null : { kind: 'N', id };
  }
  if (row.LocationId != null) {
    const id = mapId(ctx, si, 'Location', row.LocationId);
    return id === undefined ? null : { kind: 'L', id };
  }
  if (row.PlaylistItemId != null) {
    const id = mapId(ctx, si, 'PlaylistItem', row.PlaylistItemId);
    return id === undefined ? null : { kind: 'P', id };
  }
  return null;
}
