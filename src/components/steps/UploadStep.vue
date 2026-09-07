<script setup lang="ts">
import { I } from '@/icons';
import { computed, ref } from 'vue';
import { useQuasar } from 'quasar';
import { useMergeWizard, type WizardFile } from '@/composables/useMergeWizard';
import { formatBytes, plural } from '@/utils/format';
import { deviceIcon, deviceKind, statChips } from '@/utils/display';

const $q = useQuasar();
const { files, addFiles, removeFile, retryFile, startAnalysis, canMerge, parsedFiles, busyCount } = useMergeWizard();
const dragging = ref(false);
const input = ref<HTMLInputElement | null>(null);

const PHASES: Record<string, string> = {
  unzip: 'Unpacking the archive…',
  open: 'Opening the database…',
  schema: 'Checking the schema…',
  tables: 'Reading every table…',
  done: 'Almost there…',
};

function take(list: FileList | null | undefined) {
  if (!list || list.length === 0) return;
  const outcome = addFiles(list);
  for (const r of outcome.rejected) $q.notify({ type: 'warning', message: `${r.name}: ${r.reason}`, icon: I.warning });
}

function onDrop(e: DragEvent) {
  dragging.value = false;
  take(e.dataTransfer?.files);
}

function onPick(e: Event) {
  const el = e.target as HTMLInputElement;
  take(el.files);
  el.value = '';
}

function iconFor(f: WizardFile): string {
  return deviceIcon(deviceKind(f.summary?.deviceName ?? f.name));
}

function statusText(f: WizardFile): string {
  if (f.status === 'queued') return 'Waiting…';
  if (f.status === 'reading') return 'Reading the file…';
  return PHASES[f.phase ?? ''] ?? 'Parsing…';
}

function stats(f: WizardFile) {
  const s = f.summary;
  if (!s) return [];
  return statChips(s.counts, s.playlistCount, s.mediaFileCount).filter((c) => c.value > 0 || /note|highlight/.test(c.label));
}

const ctaLabel = computed(() => {
  if (files.value.length === 0) return 'Add backups to begin';
  if (busyCount.value > 0) return `Reading ${plural(busyCount.value, 'file')}…`;
  return parsedFiles.value.length === 1 ? 'Check this backup' : `Compare ${parsedFiles.value.length} backups`;
});

const hint = computed(() => {
  const errors = files.value.filter((f) => f.status === 'error').length;
  if (errors) return `${plural(errors, 'file')} could not be read — remove or retry ${errors === 1 ? 'it' : 'them'} to continue.`;
  if (parsedFiles.value.length === 1 && busyCount.value === 0) return 'Add a backup from another device to merge, or continue to check this one.';
  return '';
});
</script>

<template>
  <div class="step">
    <header class="step__head">
      <h2 class="h-step">Add your backups</h2>
      <p class="text-2">
        On each device open JW Library → <b>Personal Study</b> → <b>Backup and Restore</b> → <b>Create a backup</b>, then bring every
        <code>.jwlibrary</code> file here.
      </p>
    </header>

    <div
      class="drop"
      :class="{ 'is-drag': dragging, 'is-compact': files.length > 0 }"
      role="button"
      tabindex="0"
      aria-label="Add .jwlibrary files"
      @dragover.prevent
      @dragenter.prevent="dragging = true"
      @dragleave.prevent="dragging = false"
      @drop.prevent="onDrop"
      @click="input?.click()"
      @keydown.enter.prevent="input?.click()"
      @keydown.space.prevent="input?.click()"
    >
      <div class="drop__icon"><q-icon :name="I.cloudUpload" /></div>
      <div class="drop__text">
        <div class="drop__title">{{ files.length ? 'Add another backup' : 'Drop your backups here' }}</div>
        <div class="drop__sub text-2">
          <span class="gt-xs">Drag &amp; drop <code>.jwlibrary</code> files, or </span><span class="drop__link">browse your device</span>
        </div>
      </div>
      <input ref="input" type="file" multiple hidden @change="onPick" />
    </div>

    <TransitionGroup v-if="files.length" name="list" tag="ul" class="files">
      <li v-for="f in files" :key="f.id" class="file" :class="`is-${f.status}`">
        <div class="file__icon"><q-icon :name="iconFor(f)" /></div>
        <div class="file__body">
          <div class="file__top">
            <span class="file__name">{{ f.summary?.deviceName ?? f.name }}</span>
            <span v-if="f.summary" class="pill pill--violet">schema v{{ f.summary.schemaVersion }}</span>
            <span v-if="f.status === 'ok'" class="pill pill--mint"><q-icon :name="I.check" /> Ready</span>
            <span v-else-if="f.status === 'error'" class="pill pill--rose"><q-icon :name="I.error" /> Problem</span>
          </div>
          <div class="file__meta text-3">{{ f.name }} · {{ formatBytes(f.size) }}</div>
          <div v-if="f.status === 'ok'" class="file__stats">
            <span v-for="c in stats(f)" :key="c.label" class="stat"><q-icon :name="c.icon" />{{ c.label }}</span>
          </div>
          <div v-else-if="f.status === 'error'" class="file__error">{{ f.error }}</div>
          <div v-else class="file__progress"><q-spinner-dots size="18px" /> {{ statusText(f) }}</div>
        </div>
        <div class="file__actions">
          <q-btn v-if="f.status === 'error'" flat round dense class="btn-icon" :icon="I.refresh" aria-label="Try again" @click.stop="retryFile(f.id)">
            <q-tooltip>Try again</q-tooltip>
          </q-btn>
          <q-btn flat round dense class="btn-icon" :icon="I.close" aria-label="Remove file" @click.stop="removeFile(f.id)">
            <q-tooltip>Remove</q-tooltip>
          </q-btn>
        </div>
      </li>
    </TransitionGroup>

    <div class="actions">
      <div class="actions__hint text-3">{{ hint }}</div>
      <q-btn class="btn-primary" no-caps :disable="!canMerge" :loading="busyCount > 0" :icon-right="I.arrowForward" :label="ctaLabel" @click="startAnalysis()" />
    </div>
  </div>
</template>

<style scoped>
.drop {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 14px;
  padding: 44px 20px;
  border-radius: var(--radius);
  cursor: pointer;
  background:
    linear-gradient(var(--bg-elev), var(--bg-elev)) padding-box,
    linear-gradient(135deg, rgba(139, 124, 255, 0.55), rgba(217, 70, 239, 0.35), rgba(34, 211, 238, 0.45)) border-box;
  border: 2px dashed transparent;
  transition:
    transform 0.2s var(--ease),
    box-shadow 0.2s var(--ease),
    background 0.2s var(--ease);
  outline: none;
}
.drop:hover,
.drop:focus-visible,
.drop.is-drag {
  transform: translateY(-2px);
  box-shadow: 0 24px 60px -24px rgba(139, 124, 255, 0.6);
  background:
    linear-gradient(#131b36, #131b36) padding-box,
    linear-gradient(135deg, #8b7cff, #d946ef, #22d3ee) border-box;
}
.drop.is-drag {
  transform: scale(1.01);
}
.drop.is-compact {
  flex-direction: row;
  text-align: left;
  padding: 18px 20px;
  gap: 16px;
}
.drop__icon {
  width: 64px;
  height: 64px;
  border-radius: 20px;
  display: grid;
  place-items: center;
  font-size: 34px;
  color: #fff;
  background: var(--grad);
  box-shadow: var(--glow-primary);
  flex: none;
}
.is-compact .drop__icon {
  width: 46px;
  height: 46px;
  border-radius: 14px;
  font-size: 26px;
}
.drop__title {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 19px;
}
.is-compact .drop__title {
  font-size: 16px;
}
.drop__sub {
  font-size: 14px;
  margin-top: 2px;
}
.drop__link {
  color: #c4b5fd;
  font-weight: 600;
  text-decoration: underline;
  text-decoration-color: rgba(196, 181, 253, 0.4);
  text-underline-offset: 3px;
}
.files {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.file {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 14px 14px 14px 16px;
  border-radius: var(--radius-sm);
  background: var(--surface);
  border: 1px solid var(--border);
  transition:
    border-color 0.2s,
    background 0.2s;
}
.file.is-ok {
  border-color: rgba(52, 211, 153, 0.25);
}
.file.is-error {
  border-color: rgba(251, 113, 133, 0.4);
  background: rgba(251, 113, 133, 0.05);
}
.file__icon {
  width: 44px;
  height: 44px;
  border-radius: 13px;
  display: grid;
  place-items: center;
  font-size: 24px;
  background: var(--surface-strong);
  color: #c4b5fd;
  flex: none;
}
.file__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.file__top {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.file__name {
  font-weight: 700;
  font-size: 15.5px;
  overflow-wrap: anywhere;
}
.file__meta {
  font-size: 12.5px;
  overflow-wrap: anywhere;
}
.file__stats {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  margin-top: 4px;
  font-size: 13px;
  color: var(--text-2);
}
.stat {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.stat .q-icon {
  font-size: 17px;
  color: var(--text-3);
}
.file__progress {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #c4b5fd;
  margin-top: 2px;
}
.file__error {
  font-size: 13px;
  color: #fda4af;
  margin-top: 2px;
}
.file__actions {
  display: flex;
  gap: 2px;
  flex: none;
}
@media (max-width: 599px) {
  .drop {
    padding: 32px 16px;
  }
  .file {
    padding: 12px;
    gap: 10px;
  }
  .file__icon {
    width: 38px;
    height: 38px;
    font-size: 21px;
  }
}
</style>
