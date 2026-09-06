<script setup lang="ts">
import { computed } from 'vue';
import { useMergeWizard } from '@/composables/useMergeWizard';
import UploadStep from '@/components/steps/UploadStep.vue';
import AnalyzeStep from '@/components/steps/AnalyzeStep.vue';
import ResolveConflictsStep from '@/components/steps/ResolveConflictsStep.vue';
import DownloadStep from '@/components/steps/DownloadStep.vue';

const { step, stepIndex, hasConflicts, conflicts, reset } = useMergeWizard();

// The stepper is display-only (no header navigation); the wizard owns the step state.
const current = computed({
  get: () => stepIndex.value,
  set: () => {
    /* navigation happens through the wizard actions only */
  },
});
</script>

<template>
  <q-layout view="hHh lpR fFf">
    <q-header elevated class="bg-primary text-white">
      <q-toolbar>
        <q-icon name="merge_type" size="28px" class="q-mr-sm" />
        <q-toolbar-title>
          JW Library Backup Merger
          <span class="text-caption q-ml-sm gt-xs">merge notes, highlights, bookmarks, tags and playlists from several devices</span>
        </q-toolbar-title>
        <q-btn v-if="step !== 'upload'" flat dense no-caps icon="restart_alt" label="Start over" @click="reset()" />
      </q-toolbar>
    </q-header>

    <q-page-container>
      <q-page padding class="page">
        <q-banner rounded dense class="bg-blue-1 text-blue-10 q-mb-md">
          <template #avatar><q-icon name="lock" color="blue-8" /></template>
          Everything happens inside your browser. Your backups are never uploaded anywhere.
        </q-banner>

        <q-stepper v-model="current" flat bordered animated :header-nav="false" color="primary" active-color="primary" done-color="positive" class="stepper">
          <q-step :name="1" title="Upload" caption="Add your .jwlibrary files" icon="upload_file" :done="stepIndex > 1">
            <UploadStep />
          </q-step>
          <q-step :name="2" title="Analyze" caption="Read and compare" icon="manage_search" :done="stepIndex > 2">
            <AnalyzeStep />
          </q-step>
          <q-step
            :name="3"
            title="Resolve conflicts"
            :caption="hasConflicts ? `${conflicts.length} to review` : 'Skipped — none found'"
            icon="call_merge"
            :done="stepIndex > 3"
            :disable="!hasConflicts && stepIndex !== 3"
          >
            <ResolveConflictsStep />
          </q-step>
          <q-step :name="4" title="Review & download" caption="Validate and save" icon="download">
            <DownloadStep />
          </q-step>
        </q-stepper>

        <div class="text-caption text-grey-7 q-mt-lg">
          Restore the merged file on each device with JW Library's own "Restore" function. Keep your original backups until you have
          checked the result. This tool is not affiliated with the publisher of JW Library.
        </div>
      </q-page>
    </q-page-container>
  </q-layout>
</template>

<style>
.page {
  max-width: 1100px;
  margin: 0 auto;
}
.stepper .q-stepper__step-inner {
  padding-bottom: 24px;
}
code {
  background: rgba(0, 0, 0, 0.06);
  border-radius: 3px;
  padding: 0 4px;
}
</style>
