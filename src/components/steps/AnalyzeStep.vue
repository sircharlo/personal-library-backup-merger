<script setup lang="ts">
import { computed } from 'vue';
import { useMergeWizard, type WizardFile } from '@/composables/useMergeWizard';
import { formatBytes, formatTimestamp, plural } from '@/utils/format';

const { files, analyzing, analysis, analysisError, compatibility, conflictCounts, conflicts, removeFileAndReanalyze, goTo, continueFromAnalyze } =
  useMergeWizard();

const okCount = computed(() => files.value.filter((f) => f.status === 'ok').length);
const errorCount = computed(() => files.value.filter((f) => f.status === 'error').length);

function chips(f: WizardFile) {
  const s = f.summary;
  if (!s) return [];
  const c = s.counts;
  return [
    { icon: 'sticky_note_2', label: plural(c.Note, 'note') },
    { icon: 'border_color', label: plural(c.UserMark, 'highlight') },
    { icon: 'bookmark', label: plural(c.Bookmark, 'bookmark') },
    { icon: 'label', label: plural(c.Tag - s.playlistCount, 'tag') },
    { icon: 'playlist_play', label: `${plural(s.playlistCount, 'playlist')} · ${plural(c.PlaylistItem, 'item')}` },
    { icon: 'perm_media', label: plural(s.mediaFileCount, 'media file') },
    { icon: 'edit_note', label: plural(c.InputField, 'input field') },
  ];
}

const autoLines = computed(() => {
  const a = analysis.value?.auto;
  if (!a) return [];
  const lines: string[] = [];
  const add = (n: number, text: string) => n > 0 && lines.push(`${n.toLocaleString()} ${text}`);
  add(a.notesDeduped, 'identical notes merged');
  add(a.userMarksDeduped, 'identical highlights merged');
  add(a.bookmarksDeduped, 'identical bookmarks merged');
  add(a.bookmarksRenumbered, 'bookmarks moved to a free slot');
  add(a.inputFieldsDeduped, 'identical input fields merged');
  add(a.tagsMerged, 'tags merged by name');
  add(a.playlistsMergedByName, 'playlists merged by name');
  add(a.tagMapsDeduped, 'duplicate tag assignments merged');
  add(a.tagPositionsRenumbered, 'tag/playlist positions renumbered');
  add(a.playlistItemsDeduped, 'identical playlist items merged');
  add(a.mediaDeduped, 'identical media files merged');
  add(a.mediaRenamed, 'media files renamed to avoid a name clash');
  add(a.locationsDeduped, 'publication/chapter references merged');
  return lines;
});
</script>

<template>
  <div class="column q-gutter-md">
    <div>
      <div class="text-h6">Reading your backups</div>
      <div class="text-body2 text-grey-8">Each file is opened locally, checked for compatibility, and compared row by row.</div>
    </div>

    <div class="row q-col-gutter-md">
      <div v-for="f in files" :key="f.id" class="col-12 col-md-6">
        <q-card flat bordered class="full-height">
          <q-card-section class="row items-center no-wrap q-pb-none">
            <q-spinner v-if="f.status === 'parsing'" color="primary" size="24px" class="q-mr-sm" />
            <q-icon v-else-if="f.status === 'ok'" name="check_circle" color="positive" size="24px" class="q-mr-sm" />
            <q-icon v-else-if="f.status === 'error'" name="error" color="negative" size="24px" class="q-mr-sm" />
            <q-icon v-else name="schedule" color="grey-6" size="24px" class="q-mr-sm" />
            <div class="col ellipsis">
              <div class="text-subtitle1">{{ f.summary?.deviceName ?? f.name }}</div>
              <div class="text-caption text-grey-7 ellipsis">{{ f.name }} · {{ formatBytes(f.size) }}</div>
            </div>
          </q-card-section>

          <q-card-section v-if="f.status === 'error'">
            <q-banner rounded dense class="bg-red-1 text-red-10">
              {{ f.error }}
              <template #action>
                <q-btn flat dense no-caps color="negative" label="Remove this file and continue" @click="removeFileAndReanalyze(f.id)" />
              </template>
            </q-banner>
          </q-card-section>

          <q-card-section v-else-if="f.summary" class="q-pt-sm">
            <div class="q-gutter-xs q-mb-sm">
              <q-badge color="primary" outline>schema v{{ f.summary.schemaVersion }}</q-badge>
              <q-badge color="grey-7" outline>migration {{ f.summary.grdbMigrationIdentifier || '?' }}</q-badge>
              <q-badge color="grey-7" outline>{{ f.summary.triggerCount }} triggers</q-badge>
              <q-badge color="grey-7" outline>last modified {{ formatTimestamp(f.summary.lastModified) }}</q-badge>
            </div>
            <div class="row q-gutter-xs">
              <q-chip v-for="c in chips(f)" :key="c.label" dense size="sm" :icon="c.icon" class="bg-grey-2">{{ c.label }}</q-chip>
            </div>
          </q-card-section>
        </q-card>
      </div>
    </div>

    <q-banner v-if="analysisError" rounded class="bg-red-1 text-red-10">
      <template #avatar><q-icon name="block" color="negative" /></template>
      <div class="text-subtitle2">These backups cannot be merged</div>
      <div>{{ analysisError }}</div>
    </q-banner>

    <q-card v-else-if="analysis" flat bordered>
      <q-card-section>
        <div class="text-subtitle1">
          <q-icon name="fact_check" color="positive" class="q-mr-xs" />
          {{ plural(okCount, 'backup') }} compared
          <span v-if="errorCount" class="text-negative"> · {{ plural(errorCount, 'file') }} could not be read and will be left out</span>
        </div>
        <div class="q-mt-sm">
          <template v-if="conflicts.length">
            <q-icon name="call_merge" color="warning" class="q-mr-xs" />
            <strong>{{ plural(conflicts.length, 'conflict') }}</strong> need a decision:
            <span v-if="conflictCounts.note">{{ plural(conflictCounts.note, 'note') }}</span>
            <span v-if="conflictCounts.inputField">, {{ plural(conflictCounts.inputField, 'input field') }}</span>
            <span v-if="conflictCounts.userMark">, {{ plural(conflictCounts.userMark, 'highlight') }}</span>
            — each one is pre-selected with the most recently modified version.
          </template>
          <template v-else>
            <q-icon name="thumb_up" color="positive" class="q-mr-xs" />
            No conflicts — nothing was edited differently on two devices.
          </template>
        </div>
        <div v-if="autoLines.length" class="q-mt-sm text-body2 text-grey-8">
          Resolved automatically: {{ autoLines.join(' · ') }}.
        </div>
      </q-card-section>

      <q-separator v-if="analysis.warnings.length" />
      <q-expansion-item v-if="analysis.warnings.length" icon="warning" :label="plural(analysis.warnings.length, 'warning')" header-class="text-orange-9" dense>
        <q-card-section class="q-pt-none">
          <ul class="q-my-none q-pl-md">
            <li v-for="(w, i) in analysis.warnings.slice(0, 50)" :key="i" class="text-body2">{{ w }}</li>
            <li v-if="analysis.warnings.length > 50" class="text-caption">… and {{ analysis.warnings.length - 50 }} more</li>
          </ul>
        </q-card-section>
      </q-expansion-item>
    </q-card>

    <q-banner v-if="compatibility?.warnings.length && !analysisError" rounded dense class="bg-orange-1 text-orange-10">
      <template #avatar><q-icon name="info" color="orange-8" /></template>
      <div v-for="(w, i) in compatibility.warnings" :key="i">{{ w }}</div>
    </q-banner>

    <div class="row justify-between">
      <q-btn flat no-caps icon="arrow_back" label="Back" @click="goTo('upload')" />
      <q-btn unelevated color="primary" icon-right="arrow_forward" :label="conflicts.length ? 'Review conflicts' : 'Continue'" :disable="analyzing || !analysis" :loading="analyzing" @click="continueFromAnalyze()" />
    </div>
  </div>
</template>
