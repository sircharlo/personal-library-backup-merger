import { labelOf, mapId, warn, type MergeContext } from '../context';
import { bookmarkTargetKey } from '../identity';

/** Highest slot JW Library is known to display per publication; beyond it we still keep the bookmark but warn. */
const MAX_VISIBLE_SLOT = 9;

/**
 * Stage 6 — Bookmark, both Location FKs remapped. Same target ⇒ true duplicate (deduped).
 * Different target in an occupied `(PublicationLocationId, Slot)` ⇒ auto-renumber to the next free
 * slot — slot numbers carry no meaning, so this is never a user-facing conflict and never drops a bookmark.
 */
export function mergeBookmark(ctx: MergeContext): void {
  const usedSlots = new Map<number, Set<number>>();

  for (const src of ctx.sources) {
    const si = src.sourceIndex;
    const idMap = ctx.idMaps[si];
    const label = labelOf(ctx, si);

    for (const row of src.tables.Bookmark) {
      const pub = mapId(ctx, si, 'Location', row.PublicationLocationId);
      const loc = mapId(ctx, si, 'Location', row.LocationId);
      if (pub === undefined || loc === undefined) {
        warn(ctx, `${label}: bookmark #${row.BookmarkId} references a missing location; skipped.`);
        idMap.set('Bookmark', row.BookmarkId, { kind: 'dropped', reason: 'dangling LocationId' });
        continue;
      }
      const targetKey = bookmarkTargetKey(pub, loc, row);
      const dup = ctx.bookmarkTargetIndex.match(targetKey, si);
      if (dup !== undefined) {
        ctx.bookmarkTargetIndex.add(targetKey, si, dup);
        idMap.set('Bookmark', row.BookmarkId, { kind: 'mapped', globalId: dup, mergedInto: true });
        ctx.auto.bookmarksDeduped++;
        continue;
      }

      let slots = usedSlots.get(pub);
      if (!slots) {
        slots = new Set();
        usedSlots.set(pub, slots);
      }
      let slot = row.Slot;
      if (slots.has(slot)) {
        slot = 0;
        while (slots.has(slot)) slot++;
        ctx.auto.bookmarksRenumbered++;
        if (slot > MAX_VISIBLE_SLOT) {
          warn(ctx, `${label}: bookmark "${row.Title}" was moved to slot ${slot}, beyond the ${MAX_VISIBLE_SLOT + 1} slots JW Library shows per publication.`);
        }
      }
      slots.add(slot);

      const gid = ctx.alloc.Bookmark.allocate();
      ctx.merged.Bookmark.push({ ...row, BookmarkId: gid, LocationId: loc, PublicationLocationId: pub, Slot: slot });
      ctx.bookmarkTargetIndex.add(targetKey, si, gid);
      idMap.set('Bookmark', row.BookmarkId, { kind: 'mapped', globalId: gid, mergedInto: false });
    }
  }
}
