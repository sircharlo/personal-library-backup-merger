import type { PlaylistItemMarkerParagraphMapRow, PlaylistItemMarkerRow, PlaylistItemRow } from '../jwlibrary/types';
import { KEY_SEP, keyOf } from './identity';

const LIST_SEP = '\u001D'; // group separator
const ITEM_SEP = '\u001C'; // file separator

export interface PlaylistItemSignatureInput {
  item: PlaylistItemRow;
  /** `Accuracy` resolved through PlaylistItemAccuracy.Description (never the raw local id). */
  accuracyDescription: string | null;
  /** `ThumbnailFilePath` resolved through IndependentMedia.Hash (content, not the per-source file name). */
  thumbnailHash: string | null;
  /** PlaylistItemLocationMap rows with the location resolved to its canonical identity (global id). */
  locationMaps: { locationKey: string | number; MajorMultimediaType: number; BaseDurationTicks: number | null }[];
  /** PlaylistItemIndependentMediaMap rows resolved through IndependentMedia.Hash. */
  mediaMaps: { mediaHash: string; DurationTicks: number }[];
  markers: {
    marker: Pick<PlaylistItemMarkerRow, 'Label' | 'StartTimeTicks' | 'DurationTicks' | 'EndTransitionDurationTicks'>;
    verseIds: number[];
    paragraphs: Pick<PlaylistItemMarkerParagraphMapRow, 'MepsDocumentId' | 'ParagraphIndex' | 'MarkerIndexWithinParagraph'>[];
  }[];
}

/**
 * PlaylistItem has no GUID and no natural key, so identity is a canonical, order-independent
 * structural signature. Two items match only when they are structurally identical — an accepted,
 * documented limitation: independently re-created "similar" playlists stay separate (no invented
 * semantic dedup; conservative and loss-free).
 */
export function computePlaylistItemSignature(input: PlaylistItemSignatureInput): string {
  const { item } = input;
  const scalars = keyOf([
    item.Label,
    item.StartTrimOffsetTicks,
    item.EndTrimOffsetTicks,
    item.EndAction,
    input.accuracyDescription,
    input.thumbnailHash,
  ]);
  const locs = input.locationMaps
    .map((l) => keyOf([l.locationKey, l.MajorMultimediaType, l.BaseDurationTicks]))
    .sort()
    .join(LIST_SEP);
  const media = input.mediaMaps
    .map((m) => keyOf([m.mediaHash, m.DurationTicks]))
    .sort()
    .join(LIST_SEP);
  const markers = input.markers
    .map((m) => computeMarkerSignature(m))
    .sort()
    .join(LIST_SEP);
  return [scalars, locs, media, markers].join(ITEM_SEP);
}

export function computeMarkerSignature(m: PlaylistItemSignatureInput['markers'][number]): string {
  const verses = [...m.verseIds].sort((a, b) => a - b).join(KEY_SEP);
  const paragraphs = m.paragraphs
    .map((p) => keyOf([p.MepsDocumentId, p.ParagraphIndex, p.MarkerIndexWithinParagraph]))
    .sort()
    .join(LIST_SEP);
  return [
    keyOf([m.marker.Label, m.marker.StartTimeTicks, m.marker.DurationTicks, m.marker.EndTransitionDurationTicks]),
    verses,
    paragraphs,
  ].join(ITEM_SEP);
}
