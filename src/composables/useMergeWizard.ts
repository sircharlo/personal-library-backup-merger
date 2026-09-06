/**
 * Vue-facing orchestration only. All merge logic lives in `src/core` (framework-agnostic); this
 * composable holds wizard state and calls core functions. Module-level singletons: the app has
 * exactly one wizard.
 */
import { computed, markRaw, ref, shallowRef } from 'vue';
import { buildArchive, type BuildArchiveOutput } from '@/core/build/buildArchive';
import { BackupParseError, parseBackup } from '@/core/jwlibrary/parseBackup';
import type { ParsedBackup, TableCounts } from '@/core/jwlibrary/types';
import { analyze, type MergeAnalysis } from '@/core/merge/analyze';
import type { Conflict, ConflictKind } from '@/core/merge/conflicts';
import { IncompatibleBackupsError, type CompatibilityReport } from '@/core/merge/errors';
import { finalize } from '@/core/merge/finalize';
import { TAG_TYPE_PLAYLIST } from '@/core/merge/tables/mergeTag';

export type WizardStep = 'upload' | 'analyze' | 'resolve' | 'download';
export const STEP_ORDER: readonly WizardStep[] = ['upload', 'analyze', 'resolve', 'download'];

export interface FileSummary {
  deviceName: string;
  schemaVersion: number;
  grdbMigrationIdentifier: string;
  lastModified: string;
  counts: TableCounts;
  playlistCount: number;
  mediaFileCount: number;
  triggerCount: number;
}

export interface WizardFile {
  id: string;
  name: string;
  size: number;
  status: 'pending' | 'parsing' | 'ok' | 'error';
  error?: string;
  summary?: FileSummary;
}

const MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024; // sanity cap only; real backups are ≤ tens of MB

// --- state (singletons) -----------------------------------------------------
const files = ref<WizardFile[]>([]);
const rawFiles = new Map<string, File>();
const parsedFiles = new Map<string, ParsedBackup>();
const step = ref<WizardStep>('upload');
const analyzing = ref(false);
const analysis = shallowRef<MergeAnalysis | null>(null);
const analysisError = ref<string | null>(null);
const compatibility = shallowRef<CompatibilityReport | null>(null);
const resolutions = shallowRef<Map<string, number>>(new Map());
const deviceName = ref('');
const building = ref(false);
const archive = shallowRef<BuildArchiveOutput | null>(null);
const buildError = ref<string | null>(null);
const downloadUrl = ref<string | null>(null);
let nextFileId = 1;
let analysisRun = 0;

// --- derived ----------------------------------------------------------------
const result = computed(() => (analysis.value ? finalize(analysis.value, resolutions.value) : null));
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
const stepIndex = computed(() => STEP_ORDER.indexOf(step.value) + 1);

// --- helpers ----------------------------------------------------------------
const yieldToUi = () => new Promise<void>((r) => setTimeout(r, 0));

function summarize(p: ParsedBackup): FileSummary {
  return {
    deviceName: p.deviceName,
    schemaVersion: p.schemaVersion,
    grdbMigrationIdentifier: p.grdbMigrationIdentifier,
    lastModified: p.lastModified,
    counts: p.counts,
    playlistCount: p.tables.Tag.filter((t) => t.Type === TAG_TYPE_PLAYLIST).length,
    mediaFileCount: p.mediaFiles.size,
    triggerCount: p.schemaObjects.triggers.length,
  };
}

function invalidateAnalysis(): void {
  analysisRun++;
  analysis.value = null;
  analysisError.value = null;
  compatibility.value = null;
  resolutions.value = new Map();
  clearArchive();
}

function clearArchive(): void {
  archive.value = null;
  buildError.value = null;
  if (downloadUrl.value) URL.revokeObjectURL(downloadUrl.value);
  downloadUrl.value = null;
}

// --- actions ----------------------------------------------------------------
export interface AddFilesOutcome {
  added: number;
  rejected: { name: string; reason: string }[];
}

function addFiles(list: FileList | File[]): AddFilesOutcome {
  const outcome: AddFilesOutcome = { added: 0, rejected: [] };
  for (const file of Array.from(list)) {
    if (!/\.jwlibrary$/i.test(file.name)) {
      outcome.rejected.push({ name: file.name, reason: 'not a .jwlibrary file' });
      continue;
    }
    if (file.size === 0) {
      outcome.rejected.push({ name: file.name, reason: 'empty file' });
      continue;
    }
    if (file.size > MAX_FILE_BYTES) {
      outcome.rejected.push({ name: file.name, reason: 'file is too large' });
      continue;
    }
    if (files.value.some((f) => f.name === file.name && f.size === file.size)) {
      outcome.rejected.push({ name: file.name, reason: 'already added' });
      continue;
    }
    const id = `f${nextFileId++}`;
    rawFiles.set(id, file);
    files.value.push({ id, name: file.name, size: file.size, status: 'pending' });
    outcome.added++;
  }
  if (outcome.added > 0) invalidateAnalysis();
  return outcome;
}

function removeFile(id: string): void {
  files.value = files.value.filter((f) => f.id !== id);
  rawFiles.delete(id);
  parsedFiles.delete(id);
  invalidateAnalysis();
}

async function startAnalysis(): Promise<void> {
  step.value = 'analyze';
  await runAnalysis();
}

async function runAnalysis(): Promise<void> {
  invalidateAnalysis();
  const run = analysisRun;
  analyzing.value = true;
  try {
    for (const f of files.value) {
      if (parsedFiles.has(f.id)) {
        f.status = 'ok';
        continue;
      }
      f.status = 'parsing';
      f.error = undefined;
      await yieldToUi();
      try {
        const raw = rawFiles.get(f.id);
        if (!raw) throw new Error('file is no longer available; please add it again');
        const bytes = new Uint8Array(await raw.arrayBuffer());
        const parsed = await parseBackup(bytes, f.name, 0);
        if (run !== analysisRun) return;
        parsedFiles.set(f.id, markRaw(parsed));
        f.summary = summarize(parsed);
        f.status = 'ok';
      } catch (e) {
        if (run !== analysisRun) return;
        f.status = 'error';
        f.error = e instanceof BackupParseError ? e.message : `${f.name}: ${(e as Error).message ?? String(e)}`;
      }
    }

    const sources = files.value.filter((f) => f.status === 'ok').map((f) => parsedFiles.get(f.id)!);
    if (sources.length === 0) {
      analysisError.value = 'None of the files could be read. Remove the broken files or add valid backups.';
      return;
    }
    await yieldToUi();
    try {
      const a = analyze(sources);
      if (run !== analysisRun) return;
      analysis.value = markRaw(a);
      compatibility.value = a.compatibility;
    } catch (e) {
      if (run !== analysisRun) return;
      if (e instanceof IncompatibleBackupsError) {
        compatibility.value = e.report;
        analysisError.value = e.report.errors.join(' ');
      } else {
        analysisError.value = (e as Error).message ?? String(e);
      }
    }
  } finally {
    if (run === analysisRun) analyzing.value = false;
  }
}

async function removeFileAndReanalyze(id: string): Promise<void> {
  removeFile(id);
  if (files.value.length > 0) await runAnalysis();
  else step.value = 'upload';
}

function continueFromAnalyze(): void {
  if (!analysis.value) return;
  step.value = hasConflicts.value ? 'resolve' : 'download';
}

function continueFromResolve(): void {
  step.value = 'download';
}

function goTo(target: WizardStep): void {
  if (target === 'resolve' && !hasConflicts.value) target = 'analyze';
  step.value = target;
}

function setResolution(conflictId: string, sourceIndex: number): void {
  const next = new Map(resolutions.value);
  next.set(conflictId, sourceIndex);
  resolutions.value = next;
  clearArchive();
}

function acceptAllSuggestions(): void {
  resolutions.value = new Map();
  clearArchive();
}

function chosenFor(conflict: Conflict): number {
  return resolutions.value.get(conflict.id) ?? conflict.suggestedWinnerIndex;
}

async function build(): Promise<void> {
  if (!analysis.value || !result.value) return;
  building.value = true;
  buildError.value = null;
  try {
    await yieldToUi();
    const out = await buildArchive({ analysis: analysis.value, result: result.value, deviceName: deviceName.value });
    archive.value = markRaw(out);
    if (downloadUrl.value) URL.revokeObjectURL(downloadUrl.value);
    downloadUrl.value = URL.createObjectURL(new Blob([new Uint8Array(out.bytes)], { type: 'application/zip' }));
  } catch (e) {
    buildError.value = (e as Error).message ?? String(e);
  } finally {
    building.value = false;
  }
}

function reset(): void {
  invalidateAnalysis();
  files.value = [];
  rawFiles.clear();
  parsedFiles.clear();
  deviceName.value = '';
  step.value = 'upload';
}

export function useMergeWizard() {
  return {
    // state
    files,
    step,
    stepIndex,
    analyzing,
    analysis,
    analysisError,
    compatibility,
    resolutions,
    result,
    conflicts,
    hasConflicts,
    conflictCounts,
    overriddenCount,
    deviceName,
    building,
    archive,
    buildError,
    downloadUrl,
    // actions
    addFiles,
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
    build,
    reset,
  };
}
