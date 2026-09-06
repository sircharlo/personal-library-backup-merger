import { labelOf, warn, type MergeContext } from '../context';
import { deterministicGuid, splitExtension } from '../../util/guid';

/**
 * Stage 3 — IndependentMedia, content-addressed by `Hash`. A `FilePath` collision with a *different*
 * hash is auto-renamed to a fresh GUID name (extension preserved) — never a user-facing conflict.
 * Media bytes are collected from whichever source actually has the file.
 */
export function mergeIndependentMedia(ctx: MergeContext): void {
  const usedPaths = new Set<string>(); // lower-cased: zip members are extracted onto case-insensitive file systems

  for (const src of ctx.sources) {
    const si = src.sourceIndex;
    const idMap = ctx.idMaps[si];
    const pathMap = ctx.mediaFilePathMaps[si];

    for (const row of src.tables.IndependentMedia) {
      const bytes = src.mediaFiles.get(row.FilePath);
      const existing = ctx.mediaIndex.match(row.Hash, si);
      if (existing !== undefined) {
        const g = ctx.mediaById.get(existing)!;
        ctx.mediaIndex.add(row.Hash, si, existing);
        idMap.set('IndependentMedia', row.IndependentMediaId, { kind: 'mapped', globalId: existing, mergedInto: true });
        pathMap.set(row.FilePath, g.FilePath);
        ctx.auto.mediaDeduped++;
        if (bytes && !ctx.mediaFiles.has(g.FilePath)) ctx.mediaFiles.set(g.FilePath, bytes);
        continue;
      }

      const gid = ctx.alloc.IndependentMedia.allocate();
      let filePath = row.FilePath;
      if (usedPaths.has(filePath.toLowerCase())) {
        const { ext } = splitExtension(row.FilePath);
        let n = 0;
        do {
          filePath = deterministicGuid(`${row.Hash}|${row.FilePath}|${n++}`) + ext;
        } while (usedPaths.has(filePath.toLowerCase()));
        ctx.auto.mediaRenamed++;
      }
      usedPaths.add(filePath.toLowerCase());

      const merged = { ...row, IndependentMediaId: gid, FilePath: filePath };
      ctx.merged.IndependentMedia.push(merged);
      ctx.mediaById.set(gid, merged);
      ctx.mediaIndex.add(row.Hash, si, gid);
      idMap.set('IndependentMedia', row.IndependentMediaId, { kind: 'mapped', globalId: gid, mergedInto: false });
      pathMap.set(row.FilePath, filePath);
      if (bytes) ctx.mediaFiles.set(filePath, bytes);
      else warn(ctx, `${labelOf(ctx, si)}: media file "${row.FilePath}" (${row.OriginalFilename}) is missing from the archive; its row is kept.`);
    }
  }
}
