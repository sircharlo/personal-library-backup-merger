import { parseMigrationNumber } from '../jwlibrary/schema';
import type { AllTables, ParsedBackup, SchemaCheckResult, SchemaObjects, TableCounts } from '../jwlibrary/types';
import { maxTimestamp } from '../util/datetime';
import type { Conflict } from './conflicts';
import { createMergeContext, type AutoResolutionSummary } from './context';
import { IncompatibleBackupsError, MergeError, type CompatibilityReport } from './errors';
import type { SourceIdMaps } from './idAllocator';
import { mergeBlockRange } from './tables/mergeBlockRange';
import { mergeBookmark } from './tables/mergeBookmark';
import { mergeIndependentMedia } from './tables/mergeIndependentMedia';
import { mergeInputField } from './tables/mergeInputField';
import { mergeLocation } from './tables/mergeLocation';
import { mergeNote } from './tables/mergeNote';
import { mergePlaylistItem } from './tables/mergePlaylistItem';
import { mergePlaylistItemAccuracy } from './tables/mergePlaylistItemAccuracy';
import { mergeTag } from './tables/mergeTag';
import { mergeTagMap } from './tables/mergeTagMap';
import { mergeUserMark } from './tables/mergeUserMark';

export interface SourceSummary {
  sourceIndex: number;
  fileName: string;
  deviceName: string;
  label: string;
  schemaVersion: number;
  grdbMigrationIdentifier: string;
  userVersion: number;
  lastModified: string;
  counts: TableCounts;
  mediaFileCount: number;
  schemaCheck: SchemaCheckResult;
  triggerCount: number;
}

export interface MergeAnalysis {
  sources: SourceSummary[];
  labels: string[];
  compatibility: CompatibilityReport;
  templateSourceIndex: number;
  templateSchema: SchemaObjects;
  schemaVersion: number;
  grdbMigrationIdentifier: string;
  userVersion: number;
  /** All non-conflicting merged rows (global ids). Conflicting rows live only in `conflicts`. */
  merged: AllTables;
  conflicts: Conflict[];
  auto: AutoResolutionSummary;
  idMaps: SourceIdMaps[];
  warnings: string[];
  /** Global FilePath → bytes. */
  mediaFiles: Map<string, Uint8Array>;
  defaultThumbnail?: Uint8Array;
  /** Latest LastModified among the sources (informational). */
  latestSourceLastModified: string;
  sourceCounts: TableCounts[];
}

/** Human labels per source (device name, disambiguated), in upload order. */
export function makeSourceLabels(sources: ParsedBackup[]): string[] {
  const seen = new Map<string, number>();
  return sources.map((s) => {
    const base = s.deviceName?.trim() || s.fileName || `Backup ${s.sourceIndex + 1}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base} (${n})`;
  });
}

/** Block on schemaVersion mismatch / missing schema; warn on grdb_migrations differences. */
export function validateCompatibility(sources: ParsedBackup[]): CompatibilityReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const labels = makeSourceLabels(sources);

  if (sources.length === 0) {
    return { ok: false, errors: ['No backups were provided.'], warnings, schemaVersion: null, templateSourceIndex: 0 };
  }

  const versions = new Set(sources.map((s) => s.schemaVersion));
  let schemaVersion: number | null = null;
  if (versions.size === 1) schemaVersion = sources[0].schemaVersion;
  else {
    errors.push(
      'These backups come from incompatible app versions (different schema versions): ' +
        sources.map((s, i) => `${labels[i]} = ${s.schemaVersion}`).join(', ') +
        '. Update JW Library on every device, create fresh backups, and try again.',
    );
  }

  sources.forEach((s, i) => {
    if (!s.schemaCheck.ok) {
      const missing = [...s.schemaCheck.missingTables, ...s.schemaCheck.missingColumns];
      errors.push(`${labels[i]}: the database is missing expected tables/columns (${missing.slice(0, 6).join(', ')}${missing.length > 6 ? ', …' : ''}).`);
    }
  });

  const migrations = new Set(sources.map((s) => s.grdbMigrationIdentifier));
  if (migrations.size > 1) {
    warnings.push(
      'The backups report different internal migration levels (' +
        sources.map((s, i) => `${labels[i]} = ${s.grdbMigrationIdentifier || '?'}`).join(', ') +
        '); the most complete schema is used for the merged file.',
    );
  }

  let templateSourceIndex = 0;
  let bestNumber = -Infinity;
  sources.forEach((s, i) => {
    const n = parseMigrationNumber(s.grdbMigrationIdentifier);
    if (n > bestNumber) {
      bestNumber = n;
      templateSourceIndex = i;
    }
  });

  return { ok: errors.length === 0, errors, warnings, schemaVersion, templateSourceIndex };
}

/**
 * Pure, deterministic two-phase step 1: produces every non-conflicting merged row plus the
 * unfinalized conflict list. Sources are processed in upload order.
 */
export function analyze(input: ParsedBackup[]): MergeAnalysis {
  const sources = input.map((s, i) => (s.sourceIndex === i ? s : { ...s, sourceIndex: i }));
  const compatibility = validateCompatibility(sources);
  if (!compatibility.ok) throw new IncompatibleBackupsError(compatibility);
  if (compatibility.schemaVersion === null) throw new MergeError('Could not determine a common schema version.');

  const labels = makeSourceLabels(sources);
  const ctx = createMergeContext(sources, labels);

  mergeLocation(ctx);
  mergeUserMark(ctx);
  mergeIndependentMedia(ctx);
  mergeBlockRange(ctx);
  mergeNote(ctx);
  mergeBookmark(ctx);
  mergeInputField(ctx);
  mergeTag(ctx);
  mergePlaylistItemAccuracy(ctx);
  mergePlaylistItem(ctx);
  mergeTagMap(ctx);

  const template = sources[compatibility.templateSourceIndex];
  const defaultThumbnail = sources.find((s) => s.defaultThumbnail)?.defaultThumbnail;

  return {
    sources: sources.map((s, i) => ({
      sourceIndex: i,
      fileName: s.fileName,
      deviceName: s.deviceName,
      label: labels[i],
      schemaVersion: s.schemaVersion,
      grdbMigrationIdentifier: s.grdbMigrationIdentifier,
      userVersion: s.userVersion,
      lastModified: s.lastModified,
      counts: s.counts,
      mediaFileCount: s.mediaFiles.size,
      schemaCheck: s.schemaCheck,
      triggerCount: s.schemaObjects.triggers.length,
    })),
    labels,
    compatibility,
    templateSourceIndex: compatibility.templateSourceIndex,
    templateSchema: template.schemaObjects,
    schemaVersion: compatibility.schemaVersion,
    grdbMigrationIdentifier: template.grdbMigrationIdentifier,
    userVersion: template.userVersion || compatibility.schemaVersion,
    merged: ctx.merged,
    conflicts: ctx.conflicts,
    auto: ctx.auto,
    idMaps: ctx.idMaps,
    warnings: [...compatibility.warnings, ...ctx.warnings],
    mediaFiles: ctx.mediaFiles,
    defaultThumbnail,
    latestSourceLastModified: maxTimestamp(sources.map((s) => s.lastModified)),
    sourceCounts: sources.map((s) => s.counts),
  };
}
