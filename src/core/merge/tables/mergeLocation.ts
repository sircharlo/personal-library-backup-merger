import type { MergeContext } from '../context';
import { locationIdentityKeys } from '../identity';

/**
 * JW Library for Windows never writes a NULL `Location.Title` (it stores ' ', rarely ''), while iOS
 * does — and the Windows app then fails to build a note's backlink for a NULL title (SQLite
 * `NULL || 'x'` is NULL). A single space is what a native Windows backup would contain.
 */
export const BLANK_TITLE = ' ';

const isBlank = (title: string | null | undefined): boolean => title == null || title.trim() === '';

/**
 * Stage 1 — Location. Dual constraint-mirroring keys + full-tuple key (see identity.ts).
 * Non-key `Title` differences are never a conflict: prefer a real title over a blank one, else first-seen.
 */
export function mergeLocation(ctx: MergeContext): void {
  for (const src of ctx.sources) {
    const si = src.sourceIndex;
    const idMap = ctx.idMaps[si];
    for (const row of src.tables.Location) {
      const keys = locationIdentityKeys(row);
      let globalId: number | undefined;
      for (const k of keys) {
        globalId = ctx.locationIndex.match(k, si);
        if (globalId !== undefined) break;
      }
      if (globalId !== undefined) {
        const existing = ctx.locationById.get(globalId)!;
        if (isBlank(existing.Title) && !isBlank(row.Title)) existing.Title = row.Title;
        idMap.set('Location', row.LocationId, { kind: 'mapped', globalId, mergedInto: true });
        ctx.auto.locationsDeduped++;
      } else {
        globalId = ctx.alloc.Location.allocate();
        const merged = { ...row, LocationId: globalId };
        ctx.merged.Location.push(merged);
        ctx.locationById.set(globalId, merged);
        idMap.set('Location', row.LocationId, { kind: 'mapped', globalId, mergedInto: false });
      }
      for (const k of keys) ctx.locationIndex.add(k, si, globalId);
    }
  }

  for (const loc of ctx.merged.Location) {
    if (loc.Title === null || loc.Title === undefined) {
      loc.Title = BLANK_TITLE;
      ctx.auto.locationTitlesNormalized++;
    }
  }
}
