import type { BuildPhase } from '@/core/build/buildArchive';
import type { ParsePhase } from '@/core/jwlibrary/parseBackup';
import type { JwManifest, SchemaCheckResult, TableCounts } from '@/core/jwlibrary/types';
import type { SourceSummary } from '@/core/merge/analyze';
import type { Conflict } from '@/core/merge/conflicts';
import type { AutoResolutionSummary } from '@/core/merge/context';
import type { CompatibilityReport } from '@/core/merge/errors';
import type { ValidationReport } from '@/core/validate/integrityCheck';

/** What the UI needs to know about one parsed file (the full ParsedBackup stays inside the worker). */
export interface FileSummary {
  fileName: string;
  deviceName: string;
  schemaVersion: number;
  grdbMigrationIdentifier: string;
  lastModified: string;
  counts: TableCounts;
  playlistCount: number;
  mediaFileCount: number;
  triggerCount: number;
  schemaCheck: SchemaCheckResult;
  dbSize: number;
  durationMs: number;
}

export interface AnalysisView {
  sources: SourceSummary[];
  labels: string[];
  compatibility: CompatibilityReport;
  conflicts: Conflict[];
  auto: AutoResolutionSummary;
  warnings: string[];
  /** Merged row counts with every conflict resolved to its suggestion. */
  counts: TableCounts;
  playlistCount: number;
  mediaFileCount: number;
  schemaVersion: number;
  grdbMigrationIdentifier: string;
  templateSourceIndex: number;
  latestSourceLastModified: string;
  durationMs: number;
}

export interface BuildView {
  bytes: Uint8Array;
  fileName: string;
  manifest: JwManifest;
  dbHash: string;
  dbSize: number;
  lastModified: string;
  validation: ValidationReport;
  mediaFileCount: number;
  durationMs: number;
}

export type ProgressInfo =
  | { kind: 'parse'; phase: ParsePhase }
  | { kind: 'analyze'; stage: string; index: number; total: number }
  | { kind: 'build'; phase: BuildPhase };

export type WorkerRequestBody =
  | { type: 'warmup' }
  | { type: 'parse'; fileId: string; fileName: string; bytes: ArrayBuffer }
  | { type: 'remove'; fileId: string }
  | { type: 'analyze'; fileIds: string[] }
  | { type: 'build'; resolutions: [string, number][]; deviceName: string }
  | { type: 'reset' };

export type WorkerRequest = WorkerRequestBody & { requestId: number };

export type WorkerResponse =
  | { type: 'ready' }
  | { type: 'progress'; requestId: number; progress: ProgressInfo }
  | { type: 'result'; requestId: number; payload: unknown }
  | { type: 'error'; requestId: number; message: string; name: string; stack?: string; report?: CompatibilityReport };
