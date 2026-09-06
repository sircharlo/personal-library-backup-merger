import type { MergeContext } from '../context';
import { locationIdentityKeys } from '../identity';

/**
 * Stage 1 — Location. Dual constraint-mirroring keys + full-tuple key (see identity.ts).
 * Non-key `Title` differences are never a conflict: prefer non-null / first-seen.
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
        if (existing.Title == null && row.Title != null) existing.Title = row.Title;
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
}
