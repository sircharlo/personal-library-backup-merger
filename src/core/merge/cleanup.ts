/**
 * Opt-in clean-ups applied to the merged tables (after conflict resolution, before the database is
 * built). Every removal is counted so validation can prove nothing else went missing.
 */
import type { CleanupKey } from '../health/healthCheck';
import { DATA_TABLE_NAMES, type AllTables, type DataTableName, type TableCounts, type UserMarkRow } from '../jwlibrary/types';
import { createLogger, fmtCount } from '../util/log';
import { blockRangeSignature } from './identity';
import { normalizeText } from './tables/mergeNote';

export type CleanupOptions = Record<CleanupKey, boolean>;

export const DEFAULT_CLEANUPS: CleanupOptions = {
  emptyNotes: false,
  rangelessHighlights: true,
  duplicateHighlights: true,
  unusedMedia: true,
  unreferencedLocations: true,
};

export interface CleanupSummary {
  emptyNotes: number;
  rangelessHighlights: number;
  /** Notes that were attached to a removed range-less highlight and now hang off the location only. */
  notesDetached: number;
  duplicateHighlights: number;
  /** Notes moved from a removed duplicate highlight to the kept copy. */
  notesReattached: number;
  unusedMedia: number;
  unreferencedLocations: number;
  /** Rows removed per table (for the row-count validation). */
  removed: Partial<TableCounts>;
}

export interface CleanupResult {
  tables: AllTables;
  mediaFiles: Map<string, Uint8Array>;
  summary: CleanupSummary;
}

const log = createLogger('cleanup');

export function applyCleanups(input: AllTables, mediaFiles: Map<string, Uint8Array>, opts: CleanupOptions): CleanupResult {
  const t = {} as AllTables;
  for (const name of DATA_TABLE_NAMES) (t as Record<DataTableName, unknown[]>)[name] = [...input[name]];
  const summary: CleanupSummary = {
    emptyNotes: 0,
    rangelessHighlights: 0,
    notesDetached: 0,
    duplicateHighlights: 0,
    notesReattached: 0,
    unusedMedia: 0,
    unreferencedLocations: 0,
    removed: {},
  };
  let files = mediaFiles;

  if (opts.emptyNotes) {
    const gone = new Set(t.Note.filter((n) => normalizeText(n.Title) === '' && normalizeText(n.Content) === '').map((n) => n.NoteId));
    t.Note = t.Note.filter((n) => !gone.has(n.NoteId));
    t.TagMap = t.TagMap.filter((m) => m.NoteId == null || !gone.has(m.NoteId));
    summary.emptyNotes = gone.size;
  }

  if (opts.rangelessHighlights) {
    const withRanges = new Set(t.BlockRange.map((r) => r.UserMarkId));
    const gone = new Set(t.UserMark.filter((u) => !withRanges.has(u.UserMarkId)).map((u) => u.UserMarkId));
    t.UserMark = t.UserMark.filter((u) => !gone.has(u.UserMarkId));
    t.Note = t.Note.map((n) => {
      if (n.UserMarkId == null || !gone.has(n.UserMarkId)) return n;
      summary.notesDetached++;
      return { ...n, UserMarkId: null };
    });
    summary.rangelessHighlights = gone.size;
  }

  if (opts.duplicateHighlights) {
    const rangesByMark = new Map<number, string[]>();
    for (const r of t.BlockRange) rangesByMark.set(r.UserMarkId, [...(rangesByMark.get(r.UserMarkId) ?? []), blockRangeSignature(r)]);
    const notesByMark = new Map<number, number>();
    for (const n of t.Note) if (n.UserMarkId != null) notesByMark.set(n.UserMarkId, (notesByMark.get(n.UserMarkId) ?? 0) + 1);

    const groups = new Map<string, UserMarkRow[]>();
    for (const u of t.UserMark) {
      const sigs = rangesByMark.get(u.UserMarkId);
      if (!sigs) continue;
      const key = `${u.LocationId}${u.ColorIndex}/${u.StyleIndex}${[...sigs].sort().join('')}`;
      groups.set(key, [...(groups.get(key) ?? []), u]);
    }
    const remap = new Map<number, number>();
    for (const marks of groups.values()) {
      if (marks.length < 2) continue;
      // Keep the copy that carries notes (most first), then the oldest id.
      const sorted = [...marks].sort((a, b) => (notesByMark.get(b.UserMarkId) ?? 0) - (notesByMark.get(a.UserMarkId) ?? 0) || a.UserMarkId - b.UserMarkId);
      const keeper = sorted[0];
      for (const dup of sorted.slice(1)) remap.set(dup.UserMarkId, keeper.UserMarkId);
    }
    if (remap.size) {
      t.UserMark = t.UserMark.filter((u) => !remap.has(u.UserMarkId));
      t.BlockRange = t.BlockRange.filter((r) => !remap.has(r.UserMarkId));
      t.Note = t.Note.map((n) => {
        if (n.UserMarkId == null || !remap.has(n.UserMarkId)) return n;
        summary.notesReattached++;
        return { ...n, UserMarkId: remap.get(n.UserMarkId)! };
      });
    }
    summary.duplicateHighlights = remap.size;
  }

  if (opts.unusedMedia) {
    const usedIds = new Set(t.PlaylistItemIndependentMediaMap.map((x) => x.IndependentMediaId));
    const usedPaths = new Set(t.PlaylistItem.map((p) => p.ThumbnailFilePath).filter((p): p is string => p != null));
    const gone = t.IndependentMedia.filter((m) => !usedIds.has(m.IndependentMediaId) && !usedPaths.has(m.FilePath));
    if (gone.length) {
      const goneIds = new Set(gone.map((m) => m.IndependentMediaId));
      t.IndependentMedia = t.IndependentMedia.filter((m) => !goneIds.has(m.IndependentMediaId));
      files = new Map(mediaFiles);
      for (const m of gone) files.delete(m.FilePath);
    }
    summary.unusedMedia = gone.length;
  }

  if (opts.unreferencedLocations) {
    const referenced = new Set<number>();
    for (const n of t.Note) if (n.LocationId != null) referenced.add(n.LocationId);
    for (const u of t.UserMark) referenced.add(u.LocationId);
    for (const k of t.Bookmark) {
      referenced.add(k.LocationId);
      referenced.add(k.PublicationLocationId);
    }
    for (const f of t.InputField) referenced.add(f.LocationId);
    for (const m of t.TagMap) if (m.LocationId != null) referenced.add(m.LocationId);
    for (const x of t.PlaylistItemLocationMap) referenced.add(x.LocationId);
    const before = t.Location.length;
    t.Location = t.Location.filter((l) => referenced.has(l.LocationId));
    summary.unreferencedLocations = before - t.Location.length;
  }

  for (const name of DATA_TABLE_NAMES) {
    const removed = input[name].length - t[name].length;
    if (removed > 0) summary.removed[name] = removed;
  }
  const total = Object.values(summary.removed).reduce((a, b) => a + b, 0);
  if (total > 0) log.info(`clean-up removed ${fmtCount(total)} row(s)`, summary);
  else log.debug('clean-up: nothing to remove', opts);
  return { tables: t, mediaFiles: files, summary };
}
