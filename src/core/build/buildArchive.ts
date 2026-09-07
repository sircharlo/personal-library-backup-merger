import type { JwManifest, TableCounts } from '../jwlibrary/types';
import { writeJwlibraryZip } from '../jwlibrary/zip';
import type { MergeAnalysis } from '../merge/analyze';
import type { MergeResult } from '../merge/finalize';
import { formatSqliteUtc } from '../util/datetime';
import { createLogger, fmtBytes } from '../util/log';
import { validateDatabaseBytes, type ValidationReport } from '../validate/integrityCheck';
import { buildDatabase } from './buildDatabase';
import { buildManifestForDb } from './buildManifest';

export type BuildPhase = 'database' | 'validate' | 'manifest' | 'zip' | 'done';

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
  /** Media to embed (defaults to everything the analysis collected; clean-ups may pass fewer). */
  mediaFiles?: Map<string, Uint8Array>;
  /** Rows intentionally removed by clean-ups, so validation can lower its bound accordingly. */
  removed?: Partial<TableCounts>;
  onPhase?: (phase: BuildPhase) => void;
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

const log = createLogger('build');

/** Build db → validate → manifest (self-computed hash) → zip. */
export async function buildArchive(input: BuildArchiveInput): Promise<BuildArchiveOutput> {
  const { analysis, result } = input;
  const mediaFiles = input.mediaFiles ?? analysis.mediaFiles;
  const phase = (p: BuildPhase) => input.onPhase?.(p);
  const now = input.now ?? new Date();
  const lastModified = input.lastModified ?? formatSqliteUtc(now);
  const deviceName = input.deviceName?.trim() || defaultDeviceName(analysis.sources.length);
  const fileName = input.fileName?.trim() || defaultFileName(now);
  const total = log.time(`built ${fileName}`);
  log.info(`building ${fileName} · device "${deviceName}" · schema v${analysis.schemaVersion} · template ${analysis.grdbMigrationIdentifier || '?'}`);

  phase('database');
  const tDb = log.time('build sqlite database');
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
  tDb(fmtBytes(dbBytes.byteLength));

  phase('validate');
  const tValidate = log.time('validate');
  const validation = await validateDatabaseBytes(dbBytes, analysis.sourceCounts, result.counts, input.removed);
  tValidate(
    `fk violations ${validation.foreignKeyViolations}, integrity ${validation.integrityCheck}, re-open ${validation.reopen.ok ? 'ok' : 'FAILED'}, ${validation.errors.length} error(s), ${validation.warnings.length} warning(s)`,
  );
  if (!validation.ok) log.error('validation FAILED', validation.errors);
  for (const w of validation.warnings) log.warn(w);

  phase('manifest');
  const tManifest = log.time('manifest + sha256');
  const { manifest, dbHash } = await buildManifestForDb({
    dbBytes,
    fileName,
    deviceName,
    schemaVersion: analysis.schemaVersion,
    lastModified,
    now,
  });
  tManifest(`sha256 ${dbHash.slice(0, 12)}…`);

  phase('zip');
  const tZip = log.time('zip');
  const bytes = await writeJwlibraryZip({
    manifest,
    dbBytes,
    mediaFiles,
    defaultThumbnail: analysis.defaultThumbnail,
  });
  tZip(`${fmtBytes(bytes.byteLength)} · ${mediaFiles.size} media files`);
  phase('done');
  total();

  return { bytes, fileName, manifest, dbBytes, dbHash, lastModified, validation, mediaFileCount: mediaFiles.size };
}

export function defaultDeviceName(sourceCount: number): string {
  return `Merged (${sourceCount} backup${sourceCount === 1 ? '' : 's'})`;
}

export function defaultFileName(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `UserdataBackup_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_Merged.jwlibrary`;
}
