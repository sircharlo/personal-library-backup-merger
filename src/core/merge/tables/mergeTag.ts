import type { MergeContext } from '../context';
import { tagKey } from '../identity';

/** Tag.Type value that denotes a playlist (there is no Playlist table). */
export const TAG_TYPE_PLAYLIST = 2;

/**
 * Stage 8 — Tag, deduplicated by `(Type, Name)`. A playlist (`Type = 2`) name collision *is* "the same
 * playlist" by the schema's own definition, so it auto-merges — not a user conflict.
 */
export function mergeTag(ctx: MergeContext): void {
  for (const src of ctx.sources) {
    const idMap = ctx.idMaps[src.sourceIndex];
    for (const row of src.tables.Tag) {
      const { id, isNew } = ctx.alloc.Tag.mapOrAllocate(tagKey(row));
      if (isNew) ctx.merged.Tag.push({ ...row, TagId: id });
      else if (row.Type === TAG_TYPE_PLAYLIST) ctx.auto.playlistsMergedByName++;
      else ctx.auto.tagsMerged++;
      idMap.set('Tag', row.TagId, { kind: 'mapped', globalId: id, mergedInto: !isNew });
    }
  }
}
