import {
  DATA_TABLE_NAMES,
  emptyAllTables,
  type AllTables,
  type DataTableName,
  type IndependentMediaRow,
  type LocationRow,
  type ParsedBackup,
} from '../jwlibrary/types';
import type { Conflict } from './conflicts';
import { GlobalIdAllocator, MultiKeyIndex, SourceIdMaps, type LocalKey } from './idAllocator';

/** Counts of everything the engine resolved on its own (never shown as user conflicts). */
export interface AutoResolutionSummary {
  locationsDeduped: number;
  /** NULL `Location.Title` rows written as '' so the Windows app can build note backlinks. */
  locationTitlesNormalized: number;
  userMarksDeduped: number;
  blockRangesDeduped: number;
  notesDeduped: number;
  bookmarksDeduped: number;
  bookmarksRenumbered: number;
  inputFieldsDeduped: number;
  mediaDeduped: number;
  mediaRenamed: number;
  tagsMerged: number;
  playlistsMergedByName: number;
  playlistItemAccuraciesDeduped: number;
  playlistItemsDeduped: number;
  tagMapsDeduped: number;
  tagPositionsRenumbered: number;
}

export function emptyAutoSummary(): AutoResolutionSummary {
  return {
    locationsDeduped: 0,
    locationTitlesNormalized: 0,
    userMarksDeduped: 0,
    blockRangesDeduped: 0,
    notesDeduped: 0,
    bookmarksDeduped: 0,
    bookmarksRenumbered: 0,
    inputFieldsDeduped: 0,
    mediaDeduped: 0,
    mediaRenamed: 0,
    tagsMerged: 0,
    playlistsMergedByName: 0,
    playlistItemAccuraciesDeduped: 0,
    playlistItemsDeduped: 0,
    tagMapsDeduped: 0,
    tagPositionsRenumbered: 0,
  };
}

/** One global UserMark and the per-source copies that fed it — consumed by the BlockRange stage. */
export interface UserMarkGroup {
  globalId: number;
  candidates: { sourceIndex: number; localId: number }[];
  /** Set when the copies disagree; BlockRange children are then attached to the conflict candidates. */
  conflict?: Conflict;
}

/** Child rows of one global PlaylistItem, keyed by their structural signature, so deduplicated copies can be traced. */
export interface PlaylistChildIndex {
  locationMaps: Map<string, string>;
  mediaMaps: Map<string, string>;
  /** StartTimeTicks → global marker id (UNIQUE(PlaylistItemId, StartTimeTicks) makes this a key). */
  markers: Map<number, number>;
}

export interface MergeContext {
  sources: ParsedBackup[];
  labels: string[];
  idMaps: SourceIdMaps[];
  alloc: { [K in DataTableName]: GlobalIdAllocator };
  merged: AllTables;
  conflicts: Conflict[];
  warnings: string[];
  auto: AutoResolutionSummary;

  // Cross-stage lookups
  locationIndex: MultiKeyIndex;
  locationById: Map<number, LocationRow>;
  mediaIndex: MultiKeyIndex;
  mediaById: Map<number, IndependentMediaRow>;
  /** Per source: local IndependentMedia.FilePath → global FilePath (post-rename). */
  mediaFilePathMaps: Map<string, string>[];
  /** Global FilePath → bytes for the output archive. */
  mediaFiles: Map<string, Uint8Array>;
  userMarkGroups: UserMarkGroup[];
  playlistItemIndex: MultiKeyIndex;
  playlistChildIndex: Map<number, PlaylistChildIndex>;
  bookmarkTargetIndex: MultiKeyIndex;
}

export function createMergeContext(sources: ParsedBackup[], labels: string[]): MergeContext {
  const alloc = {} as { [K in DataTableName]: GlobalIdAllocator };
  for (const t of DATA_TABLE_NAMES) alloc[t] = new GlobalIdAllocator();
  return {
    sources,
    labels,
    idMaps: sources.map((s) => new SourceIdMaps(s.sourceIndex)),
    alloc,
    merged: emptyAllTables(),
    conflicts: [],
    warnings: [],
    auto: emptyAutoSummary(),
    locationIndex: new MultiKeyIndex(),
    locationById: new Map(),
    mediaIndex: new MultiKeyIndex(),
    mediaById: new Map(),
    mediaFilePathMaps: sources.map(() => new Map()),
    mediaFiles: new Map(),
    userMarkGroups: [],
    playlistItemIndex: new MultiKeyIndex(),
    playlistChildIndex: new Map(),
    bookmarkTargetIndex: new MultiKeyIndex(),
  };
}

/** Global integer id for a source-local id, or undefined if that row was dropped / never mapped. */
export function mapId(ctx: MergeContext, sourceIndex: number, table: DataTableName, localKey: LocalKey): number | undefined {
  return ctx.idMaps[sourceIndex].globalId(table, localKey);
}

export function warn(ctx: MergeContext, message: string): void {
  ctx.warnings.push(message);
}

export function labelOf(ctx: MergeContext, sourceIndex: number): string {
  return ctx.labels[sourceIndex] ?? `Backup ${sourceIndex + 1}`;
}

/** Group rows by a key, preserving first-seen key order and row order within a group. */
export function groupBy<T, K>(rows: readonly T[], key: (row: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const r of rows) {
    const k = key(r);
    const list = out.get(k);
    if (list) list.push(r);
    else out.set(k, [r]);
  }
  return out;
}
