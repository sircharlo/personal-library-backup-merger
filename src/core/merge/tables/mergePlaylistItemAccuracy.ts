import type { MergeContext } from '../context';
import { playlistItemAccuracyKey } from '../identity';

/** Stage 9 — PlaylistItemAccuracy, deduplicated by `Description`; values come from the sources, never hardcoded. */
export function mergePlaylistItemAccuracy(ctx: MergeContext): void {
  for (const src of ctx.sources) {
    const idMap = ctx.idMaps[src.sourceIndex];
    for (const row of src.tables.PlaylistItemAccuracy) {
      const { id, isNew } = ctx.alloc.PlaylistItemAccuracy.mapOrAllocate(playlistItemAccuracyKey(row));
      if (isNew) ctx.merged.PlaylistItemAccuracy.push({ ...row, PlaylistItemAccuracyId: id });
      else ctx.auto.playlistItemAccuraciesDeduped++;
      idMap.set('PlaylistItemAccuracy', row.PlaylistItemAccuracyId, { kind: 'mapped', globalId: id, mergedInto: !isNew });
    }
  }
}
