import type {
  PlaylistItemIndependentMediaMapRow,
  PlaylistItemLocationMapRow,
  PlaylistItemMarkerParagraphMapRow,
  PlaylistItemMarkerRow,
} from '../../jwlibrary/types';
import { groupBy, labelOf, mapId, warn, type MergeContext, type PlaylistChildIndex } from '../context';
import { keyOf, localRowKey } from '../identity';
import { computePlaylistItemSignature } from '../playlistSignature';

const locChildSig = (locGid: number, r: PlaylistItemLocationMapRow) => keyOf([locGid, r.MajorMultimediaType, r.BaseDurationTicks]);
const mediaChildSig = (hash: string | null, r: PlaylistItemIndependentMediaMapRow) => keyOf([hash, r.DurationTicks]);

/**
 * Stages 10 + 11 — PlaylistItem (Accuracy + IndependentMedia remapped first; identity = structural
 * signature) and its child tables (PlaylistItemLocationMap, PlaylistItemIndependentMediaMap,
 * PlaylistItemMarker + its two map tables), carried forward only from the winning copy.
 */
export function mergePlaylistItem(ctx: MergeContext): void {
  for (const src of ctx.sources) {
    const si = src.sourceIndex;
    const idMap = ctx.idMaps[si];
    const label = labelOf(ctx, si);
    const t = src.tables;

    const accDesc = new Map(t.PlaylistItemAccuracy.map((a) => [a.PlaylistItemAccuracyId, a.Description] as const));
    const mediaById = new Map(t.IndependentMedia.map((m) => [m.IndependentMediaId, m] as const));
    const mediaByPath = new Map(t.IndependentMedia.map((m) => [m.FilePath, m] as const));
    const locMapsByItem = groupBy(t.PlaylistItemLocationMap, (r) => r.PlaylistItemId);
    const mediaMapsByItem = groupBy(t.PlaylistItemIndependentMediaMap, (r) => r.PlaylistItemId);
    const markersByItem = groupBy(t.PlaylistItemMarker, (r) => r.PlaylistItemId);
    const versesByMarker = groupBy(t.PlaylistItemMarkerBibleVerseMap, (r) => r.PlaylistItemMarkerId);
    const parasByMarker = groupBy(t.PlaylistItemMarkerParagraphMap, (r) => r.PlaylistItemMarkerId);

    for (const item of t.PlaylistItem) {
      const localId = item.PlaylistItemId;
      const resolvedLocs = (locMapsByItem.get(localId) ?? []).map((raw) => ({ raw, locGid: mapId(ctx, si, 'Location', raw.LocationId) }));
      const resolvedMedia = (mediaMapsByItem.get(localId) ?? []).map((raw) => ({
        raw,
        mediaGid: mapId(ctx, si, 'IndependentMedia', raw.IndependentMediaId),
        hash: mediaById.get(raw.IndependentMediaId)?.Hash ?? null,
      }));
      const resolvedMarkers = (markersByItem.get(localId) ?? []).map((raw) => ({
        raw,
        verseIds: (versesByMarker.get(raw.PlaylistItemMarkerId) ?? []).map((v) => v.VerseId),
        paragraphs: parasByMarker.get(raw.PlaylistItemMarkerId) ?? [],
      }));

      const thumbnailHash = item.ThumbnailFilePath == null ? null : (mediaByPath.get(item.ThumbnailFilePath)?.Hash ?? null);
      const signature = computePlaylistItemSignature({
        item,
        accuracyDescription: accDesc.get(item.Accuracy) ?? null,
        thumbnailHash,
        locationMaps: resolvedLocs.map((l) => ({
          locationKey: l.locGid ?? `?${l.raw.LocationId}`,
          MajorMultimediaType: l.raw.MajorMultimediaType,
          BaseDurationTicks: l.raw.BaseDurationTicks,
        })),
        mediaMaps: resolvedMedia.map((m) => ({ mediaHash: m.hash ?? `?${m.raw.IndependentMediaId}`, DurationTicks: m.raw.DurationTicks })),
        markers: resolvedMarkers.map((m) => ({ marker: m.raw, verseIds: m.verseIds, paragraphs: m.paragraphs })),
      });

      // --- Structural duplicate of an item from another source: trace everything to the winner. ---
      const existing = ctx.playlistItemIndex.match(signature, si);
      if (existing !== undefined) {
        ctx.playlistItemIndex.add(signature, si, existing);
        idMap.set('PlaylistItem', localId, { kind: 'mapped', globalId: existing, mergedInto: true });
        ctx.auto.playlistItemsDeduped++;
        const idx = ctx.playlistChildIndex.get(existing)!;
        for (const l of resolvedLocs) {
          const g = l.locGid === undefined ? undefined : idx.locationMaps.get(locChildSig(l.locGid, l.raw));
          idMap.set('PlaylistItemLocationMap', localRowKey('PlaylistItemLocationMap', l.raw), traced(g));
        }
        for (const m of resolvedMedia) {
          const g = idx.mediaMaps.get(mediaChildSig(m.hash, m.raw));
          idMap.set('PlaylistItemIndependentMediaMap', localRowKey('PlaylistItemIndependentMediaMap', m.raw), traced(g));
        }
        for (const m of resolvedMarkers) {
          const mg = idx.markers.get(m.raw.StartTimeTicks);
          idMap.set('PlaylistItemMarker', m.raw.PlaylistItemMarkerId, traced(mg));
          for (const v of m.verseIds) {
            idMap.set('PlaylistItemMarkerBibleVerseMap', keyOf([m.raw.PlaylistItemMarkerId, v]), traced(mg === undefined ? undefined : keyOf([mg, v])));
          }
          for (const p of m.paragraphs) {
            idMap.set(
              'PlaylistItemMarkerParagraphMap',
              localRowKey('PlaylistItemMarkerParagraphMap', p),
              traced(mg === undefined ? undefined : keyOf([mg, p.MepsDocumentId, p.ParagraphIndex, p.MarkerIndexWithinParagraph])),
            );
          }
        }
        continue;
      }

      // --- New global item. ---
      const accuracy = mapId(ctx, si, 'PlaylistItemAccuracy', item.Accuracy);
      if (accuracy === undefined) {
        warn(ctx, `${label}: playlist item "${item.Label}" references a missing accuracy #${item.Accuracy}; skipped.`);
        idMap.set('PlaylistItem', localId, { kind: 'dropped', reason: 'dangling Accuracy' });
        dropChildren(ctx, si, resolvedLocs, resolvedMedia, resolvedMarkers);
        continue;
      }
      let thumbnail: string | null = null;
      if (item.ThumbnailFilePath != null) {
        thumbnail = ctx.mediaFilePathMaps[si].get(item.ThumbnailFilePath) ?? null;
        if (thumbnail === null) warn(ctx, `${label}: playlist item "${item.Label}" thumbnail "${item.ThumbnailFilePath}" has no media row; thumbnail cleared.`);
      }

      const gid = ctx.alloc.PlaylistItem.allocate();
      ctx.playlistItemIndex.add(signature, si, gid);
      ctx.merged.PlaylistItem.push({ ...item, PlaylistItemId: gid, Accuracy: accuracy, ThumbnailFilePath: thumbnail });
      idMap.set('PlaylistItem', localId, { kind: 'mapped', globalId: gid, mergedInto: false });
      const idx: PlaylistChildIndex = { locationMaps: new Map(), mediaMaps: new Map(), markers: new Map() };
      ctx.playlistChildIndex.set(gid, idx);

      const seenLoc = new Set<number>();
      for (const l of resolvedLocs) {
        const lk = localRowKey('PlaylistItemLocationMap', l.raw);
        if (l.locGid === undefined) {
          warn(ctx, `${label}: playlist item "${item.Label}" references a missing location #${l.raw.LocationId}; that entry was skipped.`);
          idMap.set('PlaylistItemLocationMap', lk, { kind: 'dropped', reason: 'dangling LocationId' });
          continue;
        }
        const gk = keyOf([gid, l.locGid]);
        if (seenLoc.has(l.locGid)) {
          idMap.set('PlaylistItemLocationMap', lk, { kind: 'mapped', globalId: gk, mergedInto: true });
          continue;
        }
        seenLoc.add(l.locGid);
        ctx.merged.PlaylistItemLocationMap.push({
          PlaylistItemId: gid,
          LocationId: l.locGid,
          MajorMultimediaType: l.raw.MajorMultimediaType,
          BaseDurationTicks: l.raw.BaseDurationTicks,
        });
        idMap.set('PlaylistItemLocationMap', lk, { kind: 'mapped', globalId: gk, mergedInto: false });
        idx.locationMaps.set(locChildSig(l.locGid, l.raw), gk);
      }

      const seenMedia = new Set<number>();
      for (const m of resolvedMedia) {
        const lk = localRowKey('PlaylistItemIndependentMediaMap', m.raw);
        if (m.mediaGid === undefined) {
          warn(ctx, `${label}: playlist item "${item.Label}" references a missing media #${m.raw.IndependentMediaId}; that entry was skipped.`);
          idMap.set('PlaylistItemIndependentMediaMap', lk, { kind: 'dropped', reason: 'dangling IndependentMediaId' });
          continue;
        }
        const gk = keyOf([gid, m.mediaGid]);
        if (seenMedia.has(m.mediaGid)) {
          idMap.set('PlaylistItemIndependentMediaMap', lk, { kind: 'mapped', globalId: gk, mergedInto: true });
          continue;
        }
        seenMedia.add(m.mediaGid);
        ctx.merged.PlaylistItemIndependentMediaMap.push({ PlaylistItemId: gid, IndependentMediaId: m.mediaGid, DurationTicks: m.raw.DurationTicks });
        idMap.set('PlaylistItemIndependentMediaMap', lk, { kind: 'mapped', globalId: gk, mergedInto: false });
        idx.mediaMaps.set(mediaChildSig(m.hash, m.raw), gk);
      }

      const seenStart = new Set<number>();
      for (const m of resolvedMarkers) {
        const marker: PlaylistItemMarkerRow = m.raw;
        if (seenStart.has(marker.StartTimeTicks)) {
          const mg = idx.markers.get(marker.StartTimeTicks)!;
          idMap.set('PlaylistItemMarker', marker.PlaylistItemMarkerId, { kind: 'mapped', globalId: mg, mergedInto: true });
          continue;
        }
        seenStart.add(marker.StartTimeTicks);
        const mg = ctx.alloc.PlaylistItemMarker.allocate();
        ctx.merged.PlaylistItemMarker.push({ ...marker, PlaylistItemMarkerId: mg, PlaylistItemId: gid });
        idMap.set('PlaylistItemMarker', marker.PlaylistItemMarkerId, { kind: 'mapped', globalId: mg, mergedInto: false });
        idx.markers.set(marker.StartTimeTicks, mg);

        const seenVerse = new Set<number>();
        for (const v of m.verseIds) {
          const gk = keyOf([mg, v]);
          const lk = keyOf([marker.PlaylistItemMarkerId, v]);
          if (!seenVerse.has(v)) {
            seenVerse.add(v);
            ctx.merged.PlaylistItemMarkerBibleVerseMap.push({ PlaylistItemMarkerId: mg, VerseId: v });
          }
          idMap.set('PlaylistItemMarkerBibleVerseMap', lk, { kind: 'mapped', globalId: gk, mergedInto: false });
        }
        const seenPara = new Set<string>();
        for (const p of m.paragraphs) {
          const pk = keyOf([p.MepsDocumentId, p.ParagraphIndex, p.MarkerIndexWithinParagraph]);
          const gk = keyOf([mg, p.MepsDocumentId, p.ParagraphIndex, p.MarkerIndexWithinParagraph]);
          if (!seenPara.has(pk)) {
            seenPara.add(pk);
            const row: PlaylistItemMarkerParagraphMapRow = { ...p, PlaylistItemMarkerId: mg };
            ctx.merged.PlaylistItemMarkerParagraphMap.push(row);
          }
          idMap.set('PlaylistItemMarkerParagraphMap', localRowKey('PlaylistItemMarkerParagraphMap', p), { kind: 'mapped', globalId: gk, mergedInto: false });
        }
      }
    }
  }
}

function traced(globalKey: number | string | undefined): { kind: 'mapped'; globalId: number | string; mergedInto: true } | { kind: 'dropped'; reason: string } {
  return globalKey === undefined ? { kind: 'dropped', reason: 'no matching child on the winning copy' } : { kind: 'mapped', globalId: globalKey, mergedInto: true };
}

function dropChildren(
  ctx: MergeContext,
  si: number,
  locs: { raw: PlaylistItemLocationMapRow }[],
  media: { raw: PlaylistItemIndependentMediaMapRow }[],
  markers: { raw: PlaylistItemMarkerRow; verseIds: number[]; paragraphs: PlaylistItemMarkerParagraphMapRow[] }[],
): void {
  const idMap = ctx.idMaps[si];
  const dropped = { kind: 'dropped' as const, reason: 'parent playlist item dropped' };
  for (const l of locs) idMap.set('PlaylistItemLocationMap', localRowKey('PlaylistItemLocationMap', l.raw), dropped);
  for (const m of media) idMap.set('PlaylistItemIndependentMediaMap', localRowKey('PlaylistItemIndependentMediaMap', m.raw), dropped);
  for (const m of markers) {
    idMap.set('PlaylistItemMarker', m.raw.PlaylistItemMarkerId, dropped);
    for (const v of m.verseIds) idMap.set('PlaylistItemMarkerBibleVerseMap', keyOf([m.raw.PlaylistItemMarkerId, v]), dropped);
    for (const p of m.paragraphs) idMap.set('PlaylistItemMarkerParagraphMap', localRowKey('PlaylistItemMarkerParagraphMap', p), dropped);
  }
}
