export class MergeError extends Error {}

export interface CompatibilityReport {
  ok: boolean;
  errors: string[];
  warnings: string[];
  /** The validated common schema version (null when sources disagree). */
  schemaVersion: number | null;
  /** Source whose live DDL is used as the output template (highest grdb_migrations identifier). */
  templateSourceIndex: number;
}

export class IncompatibleBackupsError extends MergeError {
  constructor(readonly report: CompatibilityReport) {
    super(report.errors.join('\n') || 'Backups are incompatible');
  }
}
