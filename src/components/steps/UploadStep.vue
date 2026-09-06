<script setup lang="ts">
import { ref } from 'vue';
import { useQuasar } from 'quasar';
import { useMergeWizard } from '@/composables/useMergeWizard';
import { formatBytes } from '@/utils/format';

const $q = useQuasar();
const { files, addFiles, removeFile, startAnalysis } = useMergeWizard();
const dragging = ref(false);
const input = ref<HTMLInputElement | null>(null);

function take(list: FileList | null | undefined) {
  if (!list || list.length === 0) return;
  const outcome = addFiles(list);
  for (const r of outcome.rejected) $q.notify({ type: 'warning', message: `${r.name}: ${r.reason}` });
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
</script>

<template>
  <div class="column q-gutter-md">
    <div>
      <div class="text-h6">Choose the backups to merge</div>
      <div class="text-body2 text-grey-8">
        In JW Library on each device, go to <em>Personal Study → Backup and Restore → Create a backup</em>, then add every
        <code>.jwlibrary</code> file here. Two or more files from different devices are typical; a single file works too.
      </div>
    </div>

    <div
      class="dropzone"
      :class="{ 'dropzone--active': dragging }"
      role="button"
      tabindex="0"
      @dragover.prevent="dragging = true"
      @dragleave.prevent="dragging = false"
      @drop.prevent="onDrop"
      @click="input?.click()"
      @keydown.enter.prevent="input?.click()"
      @keydown.space.prevent="input?.click()"
    >
      <q-icon name="cloud_upload" size="48px" color="primary" />
      <div class="text-subtitle1 q-mt-sm">Drag &amp; drop <code>.jwlibrary</code> files here</div>
      <div class="text-caption text-grey-7">or click to browse — several files at once is fine</div>
      <input ref="input" type="file" accept=".jwlibrary" multiple hidden @change="onPick" />
    </div>

    <q-list v-if="files.length" bordered separator class="rounded-borders">
      <q-item v-for="f in files" :key="f.id">
        <q-item-section avatar><q-icon name="inventory_2" color="primary" /></q-item-section>
        <q-item-section>
          <q-item-label class="ellipsis">{{ f.name }}</q-item-label>
          <q-item-label caption>{{ formatBytes(f.size) }}</q-item-label>
        </q-item-section>
        <q-item-section side>
          <q-btn flat round dense icon="close" aria-label="Remove file" @click="removeFile(f.id)" />
        </q-item-section>
      </q-item>
    </q-list>

    <div class="row justify-end">
      <q-btn unelevated color="primary" icon-right="arrow_forward" label="Analyze backups" :disable="files.length === 0" @click="startAnalysis()" />
    </div>
  </div>
</template>

<style scoped>
.dropzone {
  border: 2px dashed #b9c4d6;
  border-radius: 12px;
  padding: 36px 16px;
  text-align: center;
  cursor: pointer;
  background: #fafbfd;
  transition: background 0.15s, border-color 0.15s;
}
.dropzone:hover,
.dropzone:focus-visible,
.dropzone--active {
  border-color: #4a6da7;
  background: #eef3fb;
  outline: none;
}
</style>
