<script setup lang="ts">
import { I } from '@/icons';
import { computed } from 'vue';
import { useMergeWizard } from '@/composables/useMergeWizard';
import { formatBytes, formatTimestamp, plural } from '@/utils/format';
import { deviceIcon, deviceKind, statChips } from '@/utils/display';

const { files, analyzing, analysisProgress, analysis, analysisError, compatibility, conflictCounts, conflicts, hasConflicts, removeFileAndReanalyze, goTo, continueFromAnalyze } =
  useMergeWizard();

const STAGE_LABELS: Record<string, string> = {
  Location: 'Matching publications and chapters',
  UserMark: 'Matching highlights',
  IndependentMedia: 'Matching media files',
  BlockRange: 'Matching highlighted ranges',
  Note: 'Matching notes',
  Bookmark: 'Matching bookmarks',
  InputField: 'Matching input fields',
  Tag: 'Matching tags and playlists',
  PlaylistItemAccuracy: 'Matching playlist settings',
  PlaylistItem: 'Matching playlist items',
  TagMap: 'Ordering tags and playlists',
};

const stageLabel = computed(() => {
  const p = analysisProgress.value;
  if (!p) return 'Preparing…';
  return STAGE_LABELS[p.stage] ?? p.stage;
});
const stageFraction = computed(() => {
  const p = analysisProgress.value;
  return p ? (p.index + 1) / p.total : 0.05;
});

const okFiles = computed(() => files.value.filter((f) => f.status === 'ok'));
const errorFiles = computed(() => files.value.filter((f) => f.status === 'error'));

function chips(counts: NonNullable<(typeof okFiles.value)[number]['summary']>) {
  return statChips(counts.counts, counts.playlistCount, counts.mediaFileCount).filter((c) => c.value > 0);
}

const conflictBreakdown = computed(() => {
  const parts: string[] = [];
  if (conflictCounts.value.note) parts.push(plural(conflictCounts.value.note, 'note'));
  if (conflictCounts.value.inputField) parts.push(plural(conflictCounts.value.inputField, 'input field'));
  if (conflictCounts.value.userMark) parts.push(plural(conflictCounts.value.userMark, 'highlight'));
  return parts.join(', ');
});

const autoTiles = computed(() => {
  const a = analysis.value?.auto;
  if (!a) return [];
  const tiles: { n: number; label: string; icon: string }[] = [];
  const add = (n: number, label: string, icon: string) => n > 0 && tiles.push({ n, label, icon });
  add(a.notesDeduped, 'identical notes merged', I.stickyNote2);
  add(a.userMarksDeduped, 'identical highlights merged', I.formatInkHighlighter);
  add(a.bookmarksDeduped, 'identical bookmarks merged', I.bookmark);
  add(a.bookmarksRenumbered, 'bookmarks moved to a free slot', I.swapVert);
  add(a.inputFieldsDeduped, 'identical input fields merged', I.editNote);
  add(a.tagsMerged, 'tags merged by name', I.label);
  add(a.playlistsMergedByName, 'playlists merged by name', I.playlistPlay);
  add(a.tagMapsDeduped, 'duplicate tag assignments merged', I.join);
  add(a.tagPositionsRenumbered, 'tag & playlist positions renumbered', I.formatListNumbered);
  add(a.playlistItemsDeduped, 'identical playlist items merged', I.queueMusic);
  add(a.mediaDeduped, 'identical media files merged', I.permMedia);
  add(a.mediaRenamed, 'media files renamed to avoid a clash', I.driveFileRename);
  add(a.locationsDeduped, 'publication references merged', I.menuBook);
  return tiles;
});
</script>

<template>
  <div class="step">
    <header class="step__head">
      <h2 class="h-step">{{ analyzing ? 'Comparing your backups' : analysis ? "Here's what we found" : 'Comparison' }}</h2>
      <p class="text-2">Every note, highlight, bookmark, tag and playlist is matched across devices. Only things edited differently on two devices need a decision.</p>
    </header>

    <div v-if="analyzing" class="progress">
      <div class="progress__row">
        <q-spinner-puff size="28px" />
        <div class="progress__text">
          <div class="progress__title">{{ stageLabel }}</div>
          <div class="text-3 progress__sub">Step {{ (analysisProgress?.index ?? 0) + 1 }} of {{ analysisProgress?.total ?? 11 }} · running in a background thread</div>
        </div>
      </div>
      <q-linear-progress :value="stageFraction" size="6px" rounded animation-speed="300" class="progress__bar" />
    </div>

    <div v-else-if="analysisError" class="callout callout--rose">
      <div class="callout__icon"><q-icon :name="I.block" /></div>
      <div>
        <div class="callout__title">These backups cannot be merged</div>
        <div class="callout__body">{{ analysisError }}</div>
      </div>
    </div>

    <template v-else-if="analysis">
      <div class="callout" :class="hasConflicts ? 'callout--amber' : 'callout--mint'">
        <div class="callout__icon"><q-icon :name="hasConflicts ? I.altRoute : I.taskAlt" /></div>
        <div>
          <div class="callout__title">
            <template v-if="hasConflicts">{{ plural(conflicts.length, 'item') }} need{{ conflicts.length === 1 ? 's' : '' }} your decision</template>
            <template v-else>Everything merged cleanly</template>
          </div>
          <div class="callout__body">
            <template v-if="hasConflicts">{{ conflictBreakdown }} — edited differently on two or more devices. The most recent version is pre-selected for each.</template>
            <template v-else>Nothing was edited differently on two devices, so there is nothing to decide.</template>
          </div>
        </div>
      </div>
    </template>

    <section v-if="okFiles.length || errorFiles.length" class="devices">
      <h3 class="h-section">Backups compared</h3>
      <div class="devices__grid">
        <article v-for="f in okFiles" :key="f.id" class="device">
          <div class="device__head">
            <div class="device__icon"><q-icon :name="deviceIcon(deviceKind(f.summary?.deviceName))" /></div>
            <div class="device__title">
              <div class="device__name">{{ f.summary?.deviceName }}</div>
              <div class="device__meta text-3">{{ f.name }} · {{ formatBytes(f.size) }}</div>
            </div>
          </div>
          <div class="device__pills">
            <span class="pill">Last change {{ formatTimestamp(f.summary?.lastModified) }}</span>
            <span class="pill pill--violet">schema v{{ f.summary?.schemaVersion }} · {{ f.summary?.grdbMigrationIdentifier || '?' }}</span>
          </div>
          <div v-if="f.summary" class="device__stats">
            <span v-for="c in chips(f.summary)" :key="c.label" class="stat"><q-icon :name="c.icon" />{{ c.label }}</span>
          </div>
        </article>
        <article v-for="f in errorFiles" :key="f.id" class="device device--error">
          <div class="device__head">
            <div class="device__icon"><q-icon :name="I.error" /></div>
            <div class="device__title">
              <div class="device__name">{{ f.name }}</div>
              <div class="device__meta text-3">{{ formatBytes(f.size) }} · could not be read</div>
            </div>
          </div>
          <div class="device__error">{{ f.error }}</div>
          <q-btn flat no-caps dense class="btn-link self-start" :icon="I.delete" label="Leave this file out" @click="removeFileAndReanalyze(f.id)" />
        </article>
      </div>
    </section>

    <section v-if="autoTiles.length" class="auto">
      <h3 class="h-section">Handled automatically</h3>
      <div class="auto__grid">
        <div v-for="t in autoTiles" :key="t.label" class="tile">
          <q-icon :name="t.icon" class="tile__icon" />
          <div class="tile__n num">{{ t.n.toLocaleString() }}</div>
          <div class="tile__label">{{ t.label }}</div>
        </div>
      </div>
    </section>

    <div v-if="compatibility?.warnings.length && !analysisError" class="callout callout--violet">
      <div class="callout__icon"><q-icon :name="I.info" /></div>
      <div>
        <div class="callout__title">Good to know</div>
        <div v-for="(w, i) in compatibility.warnings" :key="i" class="callout__body">{{ w }}</div>
      </div>
    </div>

    <q-expansion-item
      v-if="analysis?.warnings.length"
      dense
      :icon="I.warning"
      :label="plural(analysis.warnings.length, 'warning')"
      caption="Rows that could not be carried over and why"
      header-class="warnings__head"
      class="warnings"
    >
      <ul class="warnings__list">
        <li v-for="(w, i) in analysis.warnings.slice(0, 60)" :key="i">{{ w }}</li>
        <li v-if="analysis.warnings.length > 60" class="text-3">… and {{ analysis.warnings.length - 60 }} more (see the browser console)</li>
      </ul>
    </q-expansion-item>

    <div class="actions">
      <q-btn flat no-caps class="btn-link" :icon="I.arrowBack" label="Back" @click="goTo('upload')" />
      <q-btn
        class="btn-primary"
        no-caps
        :icon-right="I.arrowForward"
        :label="hasConflicts ? `Review ${plural(conflicts.length, 'decision')}` : 'Continue to download'"
        :disable="analyzing || !analysis"
        @click="continueFromAnalyze()"
      />
    </div>
  </div>
</template>

<style scoped>
.progress {
  padding: 22px 22px 20px;
  border-radius: var(--radius-sm);
  background: var(--surface);
  border: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.progress__row {
  display: flex;
  align-items: center;
  gap: 16px;
}
.progress__title {
  font-weight: 700;
  font-size: 16px;
}
.progress__sub {
  font-size: 13px;
}
.progress__bar {
  color: var(--primary);
}
.devices__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 12px;
}
.device {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border-radius: var(--radius-sm);
  background: var(--surface);
  border: 1px solid var(--border);
  min-width: 0;
}
.device--error {
  border-color: rgba(251, 113, 133, 0.4);
  background: rgba(251, 113, 133, 0.05);
}
.device__head {
  display: flex;
  gap: 12px;
  align-items: center;
  min-width: 0;
}
.device__icon {
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
.device--error .device__icon {
  color: #fda4af;
}
.device__title {
  min-width: 0;
}
.device__name {
  font-weight: 700;
  font-size: 16px;
}
.device__meta {
  font-size: 12.5px;
  overflow-wrap: anywhere;
}
.device__pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.device__stats {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  font-size: 13px;
  color: var(--text-2);
}
.device__error {
  font-size: 13px;
  color: #fda4af;
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
.auto__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 10px;
}
.tile {
  padding: 14px 14px 12px;
  border-radius: var(--radius-sm);
  background: var(--surface);
  border: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.tile__icon {
  font-size: 20px;
  color: #67e8f9;
  margin-bottom: 6px;
}
.tile__n {
  font-size: 24px;
  font-weight: 700;
  line-height: 1;
}
.tile__label {
  font-size: 12.5px;
  color: var(--text-2);
  line-height: 1.3;
}
.warnings {
  border: 1px solid rgba(251, 191, 36, 0.3);
  background: rgba(251, 191, 36, 0.06);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.warnings :deep(.warnings__head) {
  color: #fcd34d;
}
.warnings__list {
  margin: 0;
  padding: 0 18px 14px 40px;
  font-size: 13.5px;
  color: var(--text-2);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.self-start {
  align-self: flex-start;
}
</style>
