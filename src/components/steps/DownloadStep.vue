<script setup lang="ts">
import { computed } from 'vue';
import { useMergeWizard } from '@/composables/useMergeWizard';
import { defaultDeviceName } from '@/core/build/buildArchive';
import { formatBytes, formatTimestamp, plural } from '@/utils/format';

const { analysis, result, conflicts, overriddenCount, hasConflicts, deviceName, building, archive, buildError, downloadUrl, build, goTo } =
  useMergeWizard();

const placeholder = computed(() => defaultDeviceName(analysis.value?.sources.length ?? 0));

const summaryRows = computed(() => {
  const c = result.value?.counts;
  if (!c) return [];
  const playlists = analysis.value?.merged.Tag.filter((t) => t.Type === 2).length ?? 0;
  return [
    ['Notes', c.Note],
    ['Highlights', c.UserMark],
    ['Bookmarks', c.Bookmark],
    ['Tags', c.Tag - playlists],
    ['Playlists', playlists],
    ['Playlist items', c.PlaylistItem],
    ['Media files', analysis.value?.mediaFiles.size ?? 0],
    ['Input fields', c.InputField],
  ] as [string, number][];
});

const autoLines = computed(() => {
  const a = analysis.value?.auto;
  if (!a) return [];
  const lines: string[] = [];
  const add = (n: number, text: string) => n > 0 && lines.push(`${n.toLocaleString()} ${text}`);
  add(a.bookmarksRenumbered, 'bookmarks moved to a free slot');
  add(a.tagPositionsRenumbered, 'tag/playlist positions renumbered');
  add(a.mediaRenamed, 'media files renamed');
  add(a.mediaDeduped, 'duplicate media files merged');
  add(a.playlistsMergedByName, 'playlists merged by name');
  add(a.playlistItemsDeduped, 'identical playlist items merged');
  add(a.tagsMerged, 'tags merged by name');
  add(a.notesDeduped + a.userMarksDeduped + a.bookmarksDeduped + a.inputFieldsDeduped, 'identical notes/highlights/bookmarks/fields merged');
  return lines;
});

const validationRows = computed(() => {
  const v = archive.value?.validation;
  if (!v) return [];
  return [
    { label: 'Foreign key check', ok: v.foreignKeyViolations === 0, detail: v.foreignKeyViolations === 0 ? 'no violations' : `${v.foreignKeyViolations} violation(s)` },
    { label: 'Integrity check', ok: v.integrityCheck === 'ok', detail: v.integrityCheck },
    { label: 'Row counts vs. sources', ok: v.rowCounts.every((r) => r.ok), detail: `${v.rowCounts.filter((r) => r.ok).length}/${v.rowCounts.length} tables reconciled` },
    { label: 'Re-open check', ok: v.reopen.ok, detail: v.reopen.ok ? 'export → re-open → checks pass' : 'failed' },
  ];
});
</script>

<template>
  <div class="column q-gutter-md">
    <div>
      <div class="text-h6">Review &amp; download</div>
      <div class="text-body2 text-grey-8">Here is what the merged backup will contain. Build it, check the validation report, then download.</div>
    </div>

    <div class="row q-col-gutter-md">
      <div class="col-12 col-md-6">
        <q-card flat bordered class="full-height">
          <q-card-section>
            <div class="text-subtitle1">Merged content</div>
            <q-markup-table flat dense class="q-mt-sm">
              <tbody>
                <tr v-for="[label, n] in summaryRows" :key="label">
                  <td class="text-grey-8">{{ label }}</td>
                  <td class="text-right text-weight-medium">{{ n.toLocaleString() }}</td>
                </tr>
              </tbody>
            </q-markup-table>
          </q-card-section>
        </q-card>
      </div>
      <div class="col-12 col-md-6">
        <q-card flat bordered class="full-height">
          <q-card-section>
            <div class="text-subtitle1">Decisions</div>
            <div class="q-mt-sm text-body2">
              <div v-if="hasConflicts">
                <q-icon name="call_merge" color="warning" class="q-mr-xs" />
                {{ plural(conflicts.length, 'conflict') }} resolved — {{ overriddenCount }} overridden, {{ conflicts.length - overriddenCount }} using the suggestion.
                <q-btn flat dense no-caps color="primary" label="Change" class="q-ml-xs" @click="goTo('resolve')" />
              </div>
              <div v-else><q-icon name="thumb_up" color="positive" class="q-mr-xs" />No conflicts needed a decision.</div>
              <div v-if="autoLines.length" class="q-mt-sm text-grey-8">Handled automatically: {{ autoLines.join(' · ') }}.</div>
              <div v-if="analysis?.warnings.length" class="q-mt-sm text-orange-9">
                <q-icon name="warning" class="q-mr-xs" />{{ plural(analysis.warnings.length, 'warning') }} — see the Analyze step for details.
              </div>
            </div>
          </q-card-section>
        </q-card>
      </div>
    </div>

    <q-card flat bordered>
      <q-card-section>
        <div class="row q-col-gutter-md items-end">
          <div class="col-12 col-sm">
            <q-input v-model="deviceName" dense outlined label="Device name written into the backup" :placeholder="placeholder" :disable="building" />
          </div>
          <div class="col-12 col-sm-auto">
            <q-btn unelevated color="primary" icon="build" :label="archive ? 'Rebuild' : 'Build merged backup'" :loading="building" :disable="!result" @click="build()" />
          </div>
        </div>
      </q-card-section>

      <template v-if="buildError">
        <q-separator />
        <q-card-section>
          <q-banner rounded class="bg-red-1 text-red-10"><template #avatar><q-icon name="error" color="negative" /></template>{{ buildError }}</q-banner>
        </q-card-section>
      </template>

      <template v-if="archive">
        <q-separator />
        <q-card-section>
          <div class="text-subtitle1 q-mb-sm">Validation report</div>
          <q-list dense>
            <q-item v-for="r in validationRows" :key="r.label">
              <q-item-section avatar><q-icon :name="r.ok ? 'check_circle' : 'cancel'" :color="r.ok ? 'positive' : 'negative'" /></q-item-section>
              <q-item-section>
                <q-item-label>{{ r.label }}</q-item-label>
                <q-item-label caption>{{ r.detail }}</q-item-label>
              </q-item-section>
            </q-item>
          </q-list>
          <div v-if="archive.validation.warnings.length" class="text-caption text-orange-9 q-mt-xs">
            <div v-for="(w, i) in archive.validation.warnings" :key="i">{{ w }}</div>
          </div>
          <div v-if="archive.validation.errors.length" class="text-caption text-negative q-mt-xs">
            <div v-for="(e, i) in archive.validation.errors" :key="i">{{ e }}</div>
          </div>
        </q-card-section>

        <q-separator />
        <q-card-section>
          <q-banner v-if="!archive.validation.ok" rounded class="bg-red-1 text-red-10 q-mb-md">
            <template #avatar><q-icon name="report" color="negative" /></template>
            Validation failed — this file should not be restored. Please report this along with the warnings shown above.
          </q-banner>
          <div class="row items-center q-col-gutter-md">
            <div class="col-12 col-sm">
              <div class="text-subtitle2">{{ archive.fileName }}</div>
              <div class="text-caption text-grey-7">
                {{ formatBytes(archive.bytes.byteLength) }} · {{ plural(archive.mediaFileCount, 'media file') }} · last modified
                {{ formatTimestamp(archive.lastModified) }} · sha256 {{ archive.dbHash.slice(0, 12) }}…
              </div>
            </div>
            <div class="col-12 col-sm-auto">
              <q-btn
                unelevated
                :color="archive.validation.ok ? 'positive' : 'negative'"
                icon="download"
                label="Download merged backup"
                :href="downloadUrl ?? undefined"
                :download="archive.fileName"
                :disable="!downloadUrl"
                type="a"
              />
            </div>
          </div>
        </q-card-section>
      </template>
    </q-card>

    <div class="row justify-between">
      <q-btn flat no-caps icon="arrow_back" label="Back" @click="goTo(hasConflicts ? 'resolve' : 'analyze')" />
    </div>
  </div>
</template>
