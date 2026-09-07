/**
 * Shared merge harness + the cross-cutting invariants asserted against every scenario:
 * traceability (no data loss), zero FK violations, integrity_check ok, determinism, idempotency, re-open sanity.
 */
import JSZip from 'jszip';
import { expect } from 'vitest';
import { buildArchive, type BuildArchiveOutput } from '../../src/core/build/buildArchive';
import { sha256hex } from '../../src/core/hash';
import { parseBackup } from '../../src/core/jwlibrary/parseBackup';
import { openDatabase, queryRows, queryScalar } from '../../src/core/jwlibrary/sqlite';
import { DATA_TABLE_NAMES, countTables, type DataTableName, type ParsedBackup, type TableCounts } from '../../src/core/jwlibrary/types';
import { analyze, type MergeAnalysis } from '../../src/core/merge/analyze';
import { applyCleanups, type CleanupOptions, type CleanupSummary } from '../../src/core/merge/cleanup';
import type { ConflictResolutions } from '../../src/core/merge/conflicts';
import { finalize, type MergeResult } from '../../src/core/merge/finalize';
import { localRowKey } from '../../src/core/merge/identity';
import { runPragmaChecks } from '../../src/core/validate/integrityCheck';
import { buildFixtureBytes, type FixtureSpec } from './builders';

export const FIXED_NOW = new Date('2026-09-06T15:00:00Z');

export interface MergeRun {
  specs: FixtureSpec[];
  sources: ParsedBackup[];
  analysis: MergeAnalysis;
  result: MergeResult;
  archive: BuildArchiveOutput;
  /** Zip member names of the produced archive. */
  zipEntries: string[];
  /** Present when clean-ups were applied. */
  cleanup?: CleanupSummary;
}

export async function parseSpecs(specs: FixtureSpec[]): Promise<ParsedBackup[]> {
  const out: ParsedBackup[] = [];
  for (let i = 0; i < specs.length; i++) {
    const bytes = await buildFixtureBytes(specs[i]);
    out.push(await parseBackup(bytes, specs[i].fileName ?? `${specs[i].deviceName}.jwlibrary`, i));
  }
  return out;
}

export async function runMerge(
  specs: FixtureSpec[],
  resolutions: ConflictResolutions = new Map(),
  deviceName?: string,
  cleanups?: CleanupOptions,
): Promise<MergeRun> {
  const sources = await parseSpecs(specs);
  const analysis = analyze(sources);
  let result = finalize(analysis, resolutions);
  let mediaFiles = analysis.mediaFiles;
  let cleanup: CleanupSummary | undefined;
  if (cleanups) {
    const cleaned = applyCleanups(result.tables, analysis.mediaFiles, cleanups);
    result = { ...result, tables: cleaned.tables, counts: countTables(cleaned.tables) };
    mediaFiles = cleaned.mediaFiles;
    cleanup = cleaned.summary;
  }
  const archive = await buildArchive({ analysis, result, now: FIXED_NOW, deviceName, mediaFiles, removed: cleanup?.removed });
  const zip = await JSZip.loadAsync(archive.bytes);
  const zipEntries = Object.keys(zip.files).sort();
  return { specs, sources, analysis, result, archive, zipEntries, cleanup };
}

/** Open the produced database for direct SQL assertions (caller closes). */
export async function openResultDb(run: MergeRun) {
  return openDatabase(run.archive.dbBytes);
}

export function sumCounts(counts: TableCounts[]): TableCounts {
  const out = {} as TableCounts;
  for (const t of DATA_TABLE_NAMES) out[t] = counts.reduce((a, c) => a + c[t], 0);
  return out;
}

/** Row-by-row traceability: every source row maps to a final row, or is a losing conflict candidate. */
export function assertTraceability(run: MergeRun): void {
  const { sources, analysis, result } = run;
  const finalKeys = new Map<DataTableName, Set<number | string>>();
  for (const t of DATA_TABLE_NAMES) {
    finalKeys.set(t, new Set((result.tables[t] as unknown as object[]).map((r) => localRowKey(t, r))));
  }
  const winners = new Map(result.resolvedConflicts.map((r) => [r.conflictId, r.winnerSourceIndex]));

  for (const src of sources) {
    const idMap = analysis.idMaps[src.sourceIndex];
    for (const t of DATA_TABLE_NAMES) {
      for (const row of src.tables[t] as unknown as object[]) {
        const local = localRowKey(t, row);
        const entry = idMap.get(t, local);
        expect(entry, `${src.deviceName}.${t}[${local}] has no id-map entry`).toBeDefined();
        if (!entry) continue;
        if (entry.kind === 'dropped') {
          throw new Error(`${src.deviceName}.${t}[${local}] was dropped: ${entry.reason}`);
        }
        if (entry.kind === 'mapped') {
          expect(finalKeys.get(t)!.has(entry.globalId), `${src.deviceName}.${t}[${local}] → ${t}[${entry.globalId}] missing from output`).toBe(true);
        } else {
          const winner = winners.get(entry.conflictId);
          expect(winner, `conflict ${entry.conflictId} was not resolved`).toBeDefined();
          const inOutput = finalKeys.get(t)!.has(entry.globalId);
          if (t === 'BlockRange') {
            // Children carry per-candidate ids: present iff their candidate won.
            if (winner === src.sourceIndex) expect(inOutput, `winning ${t}[${entry.globalId}] missing from output`).toBe(true);
            else expect(inOutput, `losing candidate ${t}[${entry.globalId}] leaked into output`).toBe(false);
          } else {
            // The conflicting row itself shares one global id across candidates; exactly one copy must be present.
            expect(inOutput, `conflicted ${t}[${entry.globalId}] missing from output`).toBe(true);
          }
        }
      }
    }
  }
}

export async function assertDatabaseSound(run: MergeRun): Promise<void> {
  const v = run.archive.validation;
  expect(v.errors, 'validation errors').toEqual([]);
  expect(v.ok).toBe(true);
  expect(v.foreignKeyViolations).toBe(0);
  expect(v.integrityCheck).toBe('ok');
  expect(v.reopen.ok).toBe(true);
  for (const rc of v.rowCounts) expect(rc.ok, `${rc.table} count reconciliation: ${JSON.stringify(rc)}`).toBe(true);

  const db = await openDatabase(run.archive.dbBytes);
  try {
    const checks = runPragmaChecks(db);
    expect(checks.foreignKeyViolations).toBe(0);
    expect(checks.integrityCheck).toBe('ok');
    expect(queryScalar<string>(db, 'SELECT LastModified FROM LastModified')).toBe(run.archive.lastModified);
    expect(queryScalar<string>(db, 'SELECT identifier FROM grdb_migrations')).toBe(run.analysis.grdbMigrationIdentifier);
    expect(queryScalar<number>(db, 'PRAGMA user_version')).toBe(run.analysis.userVersion);
    // Guard triggers exist and work in the output too.
    expect(() => db.exec("INSERT INTO LastModified VALUES ('x')")).toThrow();
    for (const t of DATA_TABLE_NAMES) {
      expect(queryScalar<number>(db, `SELECT count(*) FROM "${t}"`), `${t} row count in db`).toBe(run.result.counts[t]);
    }
  } finally {
    db.close();
  }
}

/** The produced archive is itself a valid backup: re-parses with identical counts and a self-consistent manifest. */
export async function assertReopenSanity(run: MergeRun): Promise<ParsedBackup> {
  const reparsed = await parseBackup(run.archive.bytes, run.archive.fileName, 0);
  expect(reparsed.schemaVersion).toBe(run.analysis.schemaVersion);
  expect(reparsed.schemaCheck.ok).toBe(true);
  expect(reparsed.counts).toEqual(run.result.counts);
  expect(reparsed.lastModified).toBe(run.archive.lastModified);
  expect(reparsed.manifest.userDataBackup.hash).toBe(await sha256hex(run.archive.dbBytes));
  expect(reparsed.manifest.userDataBackup.hash).toBe(run.archive.dbHash);
  expect(reparsed.mediaFiles.size).toBe(run.archive.mediaFileCount);
  expect(run.zipEntries).toContain('manifest.json');
  expect(run.zipEntries).toContain('userData.db');
  return reparsed;
}

/** Serialize the analysis to something comparable (Maps/Uint8Arrays normalised). */
export function analysisFingerprint(a: MergeAnalysis): string {
  return JSON.stringify({
    merged: a.merged,
    conflicts: a.conflicts,
    auto: a.auto,
    warnings: a.warnings,
    template: a.templateSourceIndex,
    grdb: a.grdbMigrationIdentifier,
    media: [...a.mediaFiles.entries()].map(([k, v]) => [k, Array.from(v)]).sort(),
    idMaps: a.idMaps.map((m) => DATA_TABLE_NAMES.map((t) => [t, [...m.table(t).entries()]])),
  });
}

/** analyze() twice on identical bytes ⇒ identical result. */
export async function assertDeterminism(specs: FixtureSpec[]): Promise<void> {
  const a = analyze(await parseSpecs(specs));
  const b = analyze(await parseSpecs(specs));
  expect(analysisFingerprint(a)).toBe(analysisFingerprint(b));
}

/** merge([A, A]) ≡ merge([A]); and re-merging the output with the originals adds nothing. */
export async function assertIdempotency(specs: FixtureSpec[], resolutions: ConflictResolutions = new Map()): Promise<void> {
  const single = await runMerge([specs[0]]);
  const doubled = await runMerge([specs[0], specs[0]]);
  expect(doubled.analysis.conflicts).toEqual([]);
  expect(doubled.result.tables).toEqual(single.result.tables);

  const full = await runMerge(specs, resolutions);
  const outputSource = await parseBackup(full.archive.bytes, 'merged.jwlibrary', 0);
  const again = analyze([outputSource, ...(await parseSpecs(specs))]);
  const againResult = finalize(again, resolutions);
  expect(againResult.counts).toEqual(full.result.counts);
}

export async function assertAllInvariants(run: MergeRun): Promise<void> {
  assertTraceability(run);
  await assertDatabaseSound(run);
  await assertReopenSanity(run);
}

export function rows<T>(db: import('sql.js').Database, sql: string): T[] {
  return queryRows<T>(db, sql);
}
