/**
 * Vue-facing orchestration only. All merge logic lives in `src/core` and runs inside the merge
 * worker; this composable holds wizard state, talks to the worker and logs the lifecycle.
 * Module-level singletons: the app has exactly one wizard.
 */
import { computed, ref, shallowRef } from 'vue';
import type { BuildPhase } from '@/core/build/buildArchive';
import type { ParsePhase } from '@/core/jwlibrary/parseBackup';
import { KEEP_BOTH, supportsKeepBoth, type Conflict, type ConflictKind } from '@/core/merge/conflicts';
import { DEFAULT_CLEANUPS, type CleanupOptions } from '@/core/merge/cleanup';
import { findingByCleanup, type CleanupKey } from '@/core/health/healthCheck';
import type { DataTableName, TableCounts } from '@/core/jwlibrary/types';
import type { CompatibilityReport } from '@/core/merge/errors';
import { createLogger, errorMessage, fmtBytes, fmtCount, fmtMs, getLogLevel, setLogLevel } from '@/core/util/log';
import { MergeWorkerClient, WorkerRequestError } from '@/worker/client';
import type { AnalysisView, BuildView, FileSummary } from '@/worker/protocol';

export type WizardStep = 'upload' | 'analyze' | 'resolve' | 'download';
export const STEP_ORDER: readonly WizardStep[] = ['upload', 'analyze', 'resolve', 'download'];

export type FileStatus = 'queued' | 'reading' | 'parsing' | 'ok' | 'error';

export interface WizardFile {
  id: string;
  name: string;
  size: number;
  status: FileStatus;
  phase?: ParsePhase;
  error?: string;
  summary?: FileSummary;
}

export interface AnalysisProgress {
  stage: string;
  index: number;
  total: number;
}

const log = createLogger('wizard');
const MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024; // sanity cap only; real backups are ≤ tens of MB

let client: MergeWorkerClient | null = null;
function worker(): MergeWorkerClient {
  if (!client) {
    client = new MergeWorkerClient();
    void client.request({ type: 'warmup' }, { label: 'warmup sql.js' }).catch((e) => log.error('sql.js failed to initialise in the worker', e));
  }
  return client;
}

// --- state (singletons) -----------------------------------------------------
const files = ref<WizardFile[]>([]);
const rawFiles = new Map<string, File>();
const step = ref<WizardStep>('upload');
const analyzing = ref(false);
const analysisProgress = ref<AnalysisProgress | null>(null);
const analysis = shallowRef<AnalysisView | null>(null);
const analysisError = ref<string | null>(null);
const compatibility = shallowRef<CompatibilityReport | null>(null);
const resolutions = shallowRef<Map<string, number>>(new Map());
const deviceName = ref('');
const cleanups = ref<CleanupOptions>({ ...DEFAULT_CLEANUPS });
const building = ref(false);
const buildPhase = ref<BuildPhase | null>(null);
const archive = shallowRef<BuildView | null>(null);
const buildError = ref<string | null>(null);
const downloadUrl = ref<string | null>(null);
let nextFileId = 1;
let analysisRun = 0;

// --- derived ----------------------------------------------------------------
const conflicts = computed<Conflict[]>(() => analysis.value?.conflicts ?? []);
const hasConflicts = computed(() => conflicts.value.length > 0);
const conflictCounts = computed<Record<ConflictKind, number>>(() => {
  const out: Record<ConflictKind, number> = { note: 0, inputField: 0, userMark: 0 };
  for (const c of conflicts.value) out[c.kind]++;
  return out;
});
const overriddenCount = computed(() => {
  let n = 0;
  for (const c of conflicts.value) {
    const chosen = resolutions.value.get(c.id);
    if (chosen !== undefined && chosen !== c.suggestedWinnerIndex) n++;
  }
  return n;
});
const keptBothCount = computed(() => conflicts.value.filter((c) => resolutions.value.get(c.id) === KEEP_BOTH && supportsKeepBoth(c.kind)).length);
const mergedHealth = computed(() => analysis.value?.mergedHealth ?? null);
const CLEANUP_TABLE: Record<CleanupKey, DataTableName> = {
  emptyNotes: 'Note',
  rangelessHighlights: 'UserMark',
  duplicateHighlights: 'UserMark',
  unusedMedia: 'IndependentMedia',
  unreferencedLocations: 'Location',
};
/** Merged row counts reflecting the current decisions (keeping both adds rows, clean-ups remove some). */
const displayCounts = computed<TableCounts | null>(() => {
  const base = analysis.value?.counts;
  if (!base) return null;
  const out = { ...base };
  for (const c of conflicts.value) {
    if (resolutions.value.get(c.id) !== KEEP_BOTH || !supportsKeepBoth(c.kind)) continue;
    const extra = c.candidates.length - 1;
    if (c.kind === 'note') out.Note += extra;
    if (c.kind === 'userMark') out.UserMark += extra;
  }
  for (const key of Object.keys(CLEANUP_TABLE) as CleanupKey[]) {
    if (!cleanups.value[key]) continue;
    const table = CLEANUP_TABLE[key];
    out[table] = Math.max(0, out[table] - (findingByCleanup(mergedHealth.value, key)?.count ?? 0));
  }
  return out;
});
const displayMediaCount = computed(() => {
  const base = analysis.value?.mediaFileCount ?? 0;
  return cleanups.value.unusedMedia ? Math.max(0, base - (findingByCleanup(mergedHealth.value, 'unusedMedia')?.count ?? 0)) : base;
});
const stepIndex = computed(() => STEP_ORDER.indexOf(step.value) + 1);
const parsedFiles = computed(() => files.value.filter((f) => f.status === 'ok'));
const busyCount = computed(() => files.value.filter((f) => f.status === 'reading' || f.status === 'parsing' || f.status === 'queued').length);
const canMerge = computed(() => parsedFiles.value.length > 0 && busyCount.value === 0 && !analyzing.value);

// --- helpers ----------------------------------------------------------------
function invalidateAnalysis(): void {
  analysisRun++;
  analysis.value = null;
  analysisError.value = null;
  compatibility.value = null;
  analysisProgress.value = null;
  resolutions.value = new Map();
  clearArchive();
}

function clearArchive(): void {
  archive.value = null;
  buildError.value = null;
  buildPhase.value = null;
  if (downloadUrl.value) URL.revokeObjectURL(downloadUrl.value);
  downloadUrl.value = null;
}

function fileById(id: string): WizardFile | undefined {
  return files.value.find((f) => f.id === id);
}

function countsLine(s: FileSummary): string {
  const c = s.counts;
  return `${fmtCount(c.Note)} notes, ${fmtCount(c.UserMark)} highlights, ${fmtCount(c.Bookmark)} bookmarks, ${fmtCount(c.Tag - s.playlistCount)} tags, ${fmtCount(s.playlistCount)} playlists (${fmtCount(c.PlaylistItem)} items, ${fmtCount(s.mediaFileCount)} media files), ${fmtCount(c.InputField)} input fields`;
}

// --- actions ----------------------------------------------------------------
export interface AddFilesOutcome {
  added: number;
  rejected: { name: string; reason: string }[];
}

function addFiles(list: FileList | File[]): AddFilesOutcome {
  const outcome: AddFilesOutcome = { added: 0, rejected: [] };
  const incoming = Array.from(list);
  log.info(`addFiles: ${incoming.length} file(s) offered`, incoming.map((f) => `${f.name} (${fmtBytes(f.size)})`));
  for (const file of incoming) {
    if (!/\.jwlibrary$/i.test(file.name)) {
      outcome.rejected.push({ name: file.name, reason: 'not a .jwlibrary file' });
      continue;
    }
    if (file.size === 0) {
      outcome.rejected.push({ name: file.name, reason: 'the file is empty' });
      continue;
    }
    if (file.size > MAX_FILE_BYTES) {
      outcome.rejected.push({ name: file.name, reason: 'the file is too large' });
      continue;
    }
    if (files.value.some((f) => f.name === file.name && f.size === file.size)) {
      outcome.rejected.push({ name: file.name, reason: 'already added' });
      continue;
    }
    const id = `f${nextFileId++}`;
    rawFiles.set(id, file);
    files.value.push({ id, name: file.name, size: file.size, status: 'queued' });
    outcome.added++;
    void parseFile(id);
  }
  for (const r of outcome.rejected) log.warn(`rejected ${r.name}: ${r.reason}`);
  if (outcome.added > 0) invalidateAnalysis();
  return outcome;
}

async function parseFile(id: string): Promise<void> {
  const f = fileById(id);
  const raw = rawFiles.get(id);
  if (!f || !raw) return;
  const stillPresent = () => files.value.some((x) => x.id === id);
  const t0 = performance.now();
  f.status = 'reading';
  f.error = undefined;
  log.info(`reading ${f.name} (${fmtBytes(f.size)})`);
  try {
    const buffer = await raw.arrayBuffer();
    if (!stillPresent()) return;
    f.status = 'parsing';
    f.phase = 'unzip';
    const summary = await worker().request<FileSummary>(
      { type: 'parse', fileId: id, fileName: f.name, bytes: buffer },
      {
        transfer: [buffer],
        label: `parse ${f.name}`,
        onProgress: (p) => {
          if (p.kind === 'parse') f.phase = p.phase;
        },
      },
    );
    if (!stillPresent()) return;
    f.summary = summary;
    f.status = 'ok';
    f.phase = undefined;
    log.info(`✓ ${f.name} → "${summary.deviceName}" · schema v${summary.schemaVersion} · ${countsLine(summary)} · ${fmtMs(performance.now() - t0)}`);
    if (!summary.schemaCheck.ok) log.warn(`${f.name}: schema check failed`, summary.schemaCheck);
  } catch (e) {
    if (!stillPresent()) return;
    f.status = 'error';
    f.phase = undefined;
    f.error = errorMessage(e);
    log.error(`✗ ${f.name}: ${f.error}`, e);
  }
}

function retryFile(id: string): void {
  const f = fileById(id);
  if (!f) return;
  log.info(`retrying ${f.name}`);
  f.status = 'queued';
  invalidateAnalysis();
  void parseFile(id);
}

function removeFile(id: string): void {
  const f = fileById(id);
  log.info(`removing ${f?.name ?? id}`);
  files.value = files.value.filter((x) => x.id !== id);
  rawFiles.delete(id);
  void worker().request({ type: 'remove', fileId: id }, { label: `remove ${f?.name ?? id}` }).catch(() => {});
  invalidateAnalysis();
  if (files.value.length === 0 && step.value !== 'upload') step.value = 'upload';
}

async function startAnalysis(): Promise<void> {
  step.value = 'analyze';
  await runAnalysis();
}

async function runAnalysis(): Promise<void> {
  invalidateAnalysis();
  const run = analysisRun;
  analyzing.value = true;
  const ids = parsedFiles.value.map((f) => f.id);
  log.info(`analysis #${run}: comparing ${ids.length} backup(s)`, parsedFiles.value.map((f) => f.summary?.deviceName ?? f.name));
  try {
    if (ids.length === 0) {
      analysisError.value = 'None of the files could be read. Remove the broken files or add valid backups.';
      log.warn(analysisError.value);
      return;
    }
    const view = await worker().request<AnalysisView>(
      { type: 'analyze', fileIds: ids },
      {
        label: `analyze #${run}`,
        onProgress: (p) => {
          if (p.kind === 'analyze' && run === analysisRun) analysisProgress.value = { stage: p.stage, index: p.index, total: p.total };
        },
      },
    );
    if (run !== analysisRun) {
      log.debug(`analysis #${run} finished but was superseded`);
      return;
    }
    analysis.value = view;
    compatibility.value = view.compatibility;
    log.info(
      `analysis #${run} done in ${fmtMs(view.durationMs)}: ${view.conflicts.length} conflict(s) to decide, ${view.warnings.length} warning(s), merged ${fmtCount(view.counts.Note)} notes / ${fmtCount(view.counts.UserMark)} highlights / ${fmtCount(view.counts.Bookmark)} bookmarks / ${fmtCount(view.playlistCount)} playlists`,
      { conflictsByKind: conflictCounts.value, auto: view.auto },
    );
  } catch (e) {
    if (run !== analysisRun) return;
    if (e instanceof WorkerRequestError && e.report) {
      compatibility.value = e.report;
      analysisError.value = e.report.errors.join(' ');
    } else {
      analysisError.value = errorMessage(e);
    }
    log.error(`analysis #${run} failed: ${analysisError.value}`, e);
  } finally {
    if (run === analysisRun) {
      analyzing.value = false;
      analysisProgress.value = null;
    }
  }
}

async function removeFileAndReanalyze(id: string): Promise<void> {
  removeFile(id);
  if (files.value.length > 0) await runAnalysis();
}

function continueFromAnalyze(): void {
  if (!analysis.value) return;
  goTo(hasConflicts.value ? 'resolve' : 'download');
}

function continueFromResolve(): void {
  goTo('download');
}

function goTo(target: WizardStep): void {
  if (target === 'resolve' && !hasConflicts.value) target = 'analyze';
  log.info(`step: ${step.value} → ${target}`);
  step.value = target;
  if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setResolution(conflictId: string, sourceIndex: number): void {
  const next = new Map(resolutions.value);
  next.set(conflictId, sourceIndex);
  resolutions.value = next;
  const c = conflicts.value.find((x) => x.id === conflictId);
  const label = sourceIndex === KEEP_BOTH ? 'keep both versions' : (c?.candidates.find((x) => x.sourceIndex === sourceIndex)?.sourceLabel ?? `source ${sourceIndex}`);
  log.info(`resolution: ${conflictId} → ${label}${c && sourceIndex === c.suggestedWinnerIndex ? ' (suggested)' : ' (override)'}`);
  clearArchive();
}

function acceptAllSuggestions(): void {
  log.info('resolutions reset to suggestions');
  resolutions.value = new Map();
  clearArchive();
}

function chosenFor(conflict: Conflict): number {
  return resolutions.value.get(conflict.id) ?? conflict.suggestedWinnerIndex;
}

function setCleanup(key: CleanupKey, on: boolean): void {
  cleanups.value = { ...cleanups.value, [key]: on };
  log.info(`clean-up ${key}: ${on ? 'on' : 'off'}`);
  clearArchive();
}

async function build(): Promise<void> {
  if (!analysis.value) return;
  building.value = true;
  buildError.value = null;
  buildPhase.value = 'database';
  const t0 = performance.now();
  log.info(`build: ${conflicts.value.length} conflict(s), ${overriddenCount.value} overridden, device "${deviceName.value || '(default)'}"`, { cleanups: cleanups.value });
  try {
    const out = await worker().request<BuildView>(
      { type: 'build', resolutions: [...resolutions.value.entries()], deviceName: deviceName.value, cleanups: { ...cleanups.value } },
      {
        label: 'build archive',
        onProgress: (p) => {
          if (p.kind === 'build') buildPhase.value = p.phase;
        },
      },
    );
    archive.value = out;
    if (downloadUrl.value) URL.revokeObjectURL(downloadUrl.value);
    downloadUrl.value = URL.createObjectURL(new Blob([out.bytes.slice()], { type: 'application/zip' }));
    log.info(
      `build done in ${fmtMs(performance.now() - t0)}: ${out.fileName} · ${fmtBytes(out.bytes.byteLength)} · db ${fmtBytes(out.dbSize)} · ${out.mediaFileCount} media files · sha256 ${out.dbHash.slice(0, 12)}… · validation ${out.validation.ok ? 'OK' : 'FAILED'}`,
      { validation: out.validation, cleanup: out.cleanup },
    );
    if (!out.validation.ok) log.error('validation errors', out.validation.errors);
  } catch (e) {
    buildError.value = errorMessage(e);
    log.error(`build failed: ${buildError.value}`, e);
  } finally {
    building.value = false;
    buildPhase.value = null;
  }
}

function reset(): void {
  log.info('reset');
  invalidateAnalysis();
  files.value = [];
  rawFiles.clear();
  deviceName.value = '';
  cleanups.value = { ...DEFAULT_CLEANUPS };
  step.value = 'upload';
  void worker().request({ type: 'reset' }, { label: 'reset' }).catch(() => {});
}

/** `window.jwmerge` — inspect state and change the log level from the devtools console. */
export function installDebugConsole(): void {
  const api = {
    get state() {
      return {
        step: step.value,
        files: files.value.map((f) => ({ ...f })),
        analysis: analysis.value,
        analysisError: analysisError.value,
        resolutions: Object.fromEntries(resolutions.value),
        cleanups: { ...cleanups.value },
        archive: archive.value ? { ...archive.value, bytes: `<${archive.value.bytes.byteLength} bytes>` } : null,
        buildError: buildError.value,
      };
    },
    setLogLevel,
    getLogLevel,
    worker: () => worker(),
  };
  (window as unknown as { jwmerge: typeof api }).jwmerge = api;
  log.info('debug handle: window.jwmerge.state · window.jwmerge.setLogLevel("debug" | "info" | "warn" | "error" | "silent")');
}

export function useMergeWizard() {
  return {
    // state
    files,
    step,
    stepIndex,
    analyzing,
    analysisProgress,
    analysis,
    analysisError,
    compatibility,
    resolutions,
    conflicts,
    hasConflicts,
    conflictCounts,
    overriddenCount,
    keptBothCount,
    displayCounts,
    displayMediaCount,
    mergedHealth,
    cleanups,
    parsedFiles,
    busyCount,
    canMerge,
    deviceName,
    building,
    buildPhase,
    archive,
    buildError,
    downloadUrl,
    // actions
    addFiles,
    retryFile,
    removeFile,
    removeFileAndReanalyze,
    startAnalysis,
    runAnalysis,
    continueFromAnalyze,
    continueFromResolve,
    goTo,
    setResolution,
    acceptAllSuggestions,
    chosenFor,
    setCleanup,
    build,
    reset,
  };
}
