/**
 * All heavy lifting (unzip, sql.js, merge, validation, zip) runs here so the page never freezes and
 * can show live progress. The parsed backups and the analysis live in this worker; the page only
 * receives small summaries plus the final archive bytes.
 */
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { buildArchive } from '@/core/build/buildArchive';
import { parseBackup } from '@/core/jwlibrary/parseBackup';
import { configureSqlJs, initSqlJsOnce } from '@/core/jwlibrary/sqlite';
import type { ParsedBackup } from '@/core/jwlibrary/types';
import { analyze, type MergeAnalysis } from '@/core/merge/analyze';
import { IncompatibleBackupsError } from '@/core/merge/errors';
import { finalize } from '@/core/merge/finalize';
import { TAG_TYPE_PLAYLIST } from '@/core/merge/tables/mergeTag';
import { createLogger, errorMessage, fmtMs } from '@/core/util/log';
import type { AnalysisView, BuildView, FileSummary, ProgressInfo, WorkerRequest, WorkerResponse } from './protocol';

configureSqlJs({ locateFile: () => sqlWasmUrl });

const log = createLogger('worker');
const parsed = new Map<string, ParsedBackup>();
let analysis: MergeAnalysis | null = null;
let queue: Promise<void> = Promise.resolve();

const port = self as unknown as Worker;
const post = (msg: WorkerResponse, transfer: Transferable[] = []) => port.postMessage(msg, transfer);

self.addEventListener('message', (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  queue = queue.then(() => handle(req));
});

async function handle(req: WorkerRequest): Promise<void> {
  const t0 = performance.now();
  const progress = (info: ProgressInfo) => post({ type: 'progress', requestId: req.requestId, progress: info });
  const reply = (payload: unknown, transfer: Transferable[] = []) => post({ type: 'result', requestId: req.requestId, payload }, transfer);
  log.debug(`← ${req.type}`, describe(req));
  try {
    switch (req.type) {
      case 'warmup': {
        await initSqlJsOnce();
        log.info(`sql.js ready (${fmtMs(performance.now() - t0)}) from ${sqlWasmUrl}`);
        reply(undefined);
        break;
      }
      case 'parse': {
        const bytes = new Uint8Array(req.bytes);
        const backup = await parseBackup(bytes, req.fileName, 0, { onPhase: (phase) => progress({ kind: 'parse', phase }) });
        parsed.set(req.fileId, backup);
        analysis = null;
        reply(summarize(backup, performance.now() - t0));
        break;
      }
      case 'remove': {
        parsed.delete(req.fileId);
        analysis = null;
        reply(undefined);
        break;
      }
      case 'analyze': {
        const sources = req.fileIds.map((id) => parsed.get(id)).filter((p): p is ParsedBackup => !!p);
        if (sources.length !== req.fileIds.length) log.warn(`analyze: ${req.fileIds.length - sources.length} requested file(s) are not parsed`);
        analysis = analyze(sources, { onStage: (stage, index, total) => progress({ kind: 'analyze', stage, index, total }) });
        reply(makeAnalysisView(analysis, performance.now() - t0));
        break;
      }
      case 'build': {
        if (!analysis) throw new Error('Nothing to build — run the analysis first.');
        const resolutions = new Map(req.resolutions);
        const result = finalize(analysis, resolutions);
        log.debug(`finalize: ${result.resolvedConflicts.length} conflict(s) applied, ${result.resolvedConflicts.filter((r) => !r.wasSuggested).length} overridden`);
        const out = await buildArchive({ analysis, result, deviceName: req.deviceName, onPhase: (phase) => progress({ kind: 'build', phase }) });
        const view: BuildView = {
          bytes: out.bytes,
          fileName: out.fileName,
          manifest: out.manifest,
          dbHash: out.dbHash,
          dbSize: out.dbBytes.byteLength,
          lastModified: out.lastModified,
          validation: out.validation,
          mediaFileCount: out.mediaFileCount,
          durationMs: performance.now() - t0,
        };
        reply(view, [out.bytes.buffer]);
        break;
      }
      case 'reset': {
        parsed.clear();
        analysis = null;
        log.info('state cleared');
        reply(undefined);
        break;
      }
    }
  } catch (e) {
    log.error(`${req.type} failed`, e);
    post({
      type: 'error',
      requestId: req.requestId,
      message: errorMessage(e),
      name: e instanceof Error ? e.name : 'Error',
      stack: e instanceof Error ? e.stack : undefined,
      report: e instanceof IncompatibleBackupsError ? e.report : undefined,
    });
  }
}

function describe(req: WorkerRequest): string {
  switch (req.type) {
    case 'parse':
      return `${req.fileName} (${req.bytes.byteLength} bytes)`;
    case 'analyze':
      return req.fileIds.join(', ');
    case 'build':
      return `${req.resolutions.length} explicit resolution(s), device "${req.deviceName || '(default)'}"`;
    case 'remove':
      return req.fileId;
    default:
      return '';
  }
}

function summarize(p: ParsedBackup, durationMs: number): FileSummary {
  return {
    fileName: p.fileName,
    deviceName: p.deviceName,
    schemaVersion: p.schemaVersion,
    grdbMigrationIdentifier: p.grdbMigrationIdentifier,
    lastModified: p.lastModified,
    counts: p.counts,
    playlistCount: p.tables.Tag.filter((t) => t.Type === TAG_TYPE_PLAYLIST).length,
    mediaFileCount: p.mediaFiles.size,
    triggerCount: p.schemaObjects.triggers.length,
    schemaCheck: p.schemaCheck,
    dbSize: 0,
    durationMs,
  };
}

function makeAnalysisView(a: MergeAnalysis, durationMs: number): AnalysisView {
  const defaults = finalize(a);
  return {
    sources: a.sources,
    labels: a.labels,
    compatibility: a.compatibility,
    conflicts: a.conflicts,
    auto: a.auto,
    warnings: a.warnings,
    counts: defaults.counts,
    playlistCount: a.merged.Tag.filter((t) => t.Type === TAG_TYPE_PLAYLIST).length,
    mediaFileCount: a.mediaFiles.size,
    schemaVersion: a.schemaVersion,
    grdbMigrationIdentifier: a.grdbMigrationIdentifier,
    templateSourceIndex: a.templateSourceIndex,
    latestSourceLastModified: a.latestSourceLastModified,
    durationMs,
  };
}

log.info('worker started');
post({ type: 'ready' });
