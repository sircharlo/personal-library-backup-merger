import type { JwManifest } from '../jwlibrary/types';
import { writeJwlibraryZip } from '../jwlibrary/zip';
import type { MergeAnalysis } from '../merge/analyze';
import type { MergeResult } from '../merge/finalize';
import { formatSqliteUtc } from '../util/datetime';
import { validateDatabaseBytes, type ValidationReport } from '../validate/integrityCheck';
import { buildDatabase } from './buildDatabase';
import { buildManifestForDb } from './buildManifest';

export interface BuildArchiveInput {
  analysis: MergeAnalysis;
  result: MergeResult;
  /** manifest.userDataBackup.deviceName; defaults to "Merged (N backups)". */
  deviceName?: string;
  /** Output file name; defaults to `UserdataBackup_<date>_Merged.jwlibrary`. */
  fileName?: string;
  /** Injectable clock for deterministic tests. */
  now?: Date;
  /** Override the `LastModified` written to the db (defaults to `now` in SQLite's UTC format). */
  lastModified?: string;
}

export interface BuildArchiveOutput {
  bytes: Uint8Array;
  fileName: string;
  manifest: JwManifest;
  dbBytes: Uint8Array;
  dbHash: string;
  lastModified: string;
  validation: ValidationReport;
  mediaFileCount: number;
}

/** Build db → validate → manifest (self-computed hash) → zip. */
export async function buildArchive(input: BuildArchiveInput): Promise<BuildArchiveOutput> {
  const { analysis, result } = input;
  const now = input.now ?? new Date();
  const lastModified = input.lastModified ?? formatSqliteUtc(now);
  const deviceName = input.deviceName?.trim() || defaultDeviceName(analysis.sources.length);
  const fileName = input.fileName?.trim() || defaultFileName(now);

  const db = await buildDatabase(result.tables, {
    template: analysis.templateSchema,
    lastModified,
    grdbMigrationIdentifier: analysis.grdbMigrationIdentifier,
    userVersion: analysis.userVersion,
  });
  let dbBytes: Uint8Array;
  try {
    dbBytes = db.export();
  } finally {
    db.close();
  }

  const validation = await validateDatabaseBytes(dbBytes, analysis.sourceCounts, result.counts);
  const { manifest, dbHash } = await buildManifestForDb({
    dbBytes,
    fileName,
    deviceName,
    schemaVersion: analysis.schemaVersion,
    lastModified,
    now,
  });

  const bytes = await writeJwlibraryZip({
    manifest,
    dbBytes,
    mediaFiles: analysis.mediaFiles,
    defaultThumbnail: analysis.defaultThumbnail,
  });

  return { bytes, fileName, manifest, dbBytes, dbHash, lastModified, validation, mediaFileCount: analysis.mediaFiles.size };
}

export function defaultDeviceName(sourceCount: number): string {
  return `Merged (${sourceCount} backup${sourceCount === 1 ? '' : 's'})`;
}

export function defaultFileName(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `UserdataBackup_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_Merged.jwlibrary`;
}
