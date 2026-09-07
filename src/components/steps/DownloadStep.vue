<script setup lang="ts">
import { I } from '@/icons';
import { computed } from 'vue';
import { useMergeWizard } from '@/composables/useMergeWizard';
import { defaultDeviceName } from '@/core/build/buildArchive';
import { formatBytes, formatTimestamp, plural } from '@/utils/format';

const { analysis, conflicts, overriddenCount, keptBothCount, displayCounts, hasConflicts, deviceName, building, buildPhase, archive, buildError, downloadUrl, build, goTo } =
  useMergeWizard();

const placeholder = computed(() => defaultDeviceName(analysis.value?.sources.length ?? 0));

const PHASES: { key: string; label: string }[] = [
  { key: 'database', label: 'Writing the database' },
  { key: 'validate', label: 'Validating integrity' },
  { key: 'manifest', label: 'Signing the manifest' },
  { key: 'zip', label: 'Packing the archive' },
];
const phaseIndex = computed(() => Math.max(0, PHASES.findIndex((p) => p.key === buildPhase.value)));

const tiles = computed(() => {
  const a = analysis.value;
  const c = displayCounts.value;
  if (!a || !c) return [];
  return [
    { icon: I.stickyNote2, label: 'Notes', n: c.Note },
    { icon: I.formatInkHighlighter, label: 'Highlights', n: c.UserMark },
    { icon: I.bookmark, label: 'Bookmarks', n: c.Bookmark },
    { icon: I.label, label: 'Tags', n: Math.max(0, c.Tag - a.playlistCount) },
    { icon: I.playlistPlay, label: 'Playlists', n: a.playlistCount },
    { icon: I.queueMusic, label: 'Playlist items', n: c.PlaylistItem },
    { icon: I.permMedia, label: 'Media files', n: a.mediaFileCount },
    { icon: I.editNote, label: 'Input fields', n: c.InputField },
  ];
});

const checks = computed(() => {
  const v = archive.value?.validation;
  if (!v) return [];
  return [
    { label: 'Foreign keys', ok: v.foreignKeyViolations === 0, detail: v.foreignKeyViolations === 0 ? 'every reference resolves' : `${v.foreignKeyViolations} broken reference(s)` },
    { label: 'Database integrity', ok: v.integrityCheck === 'ok', detail: v.integrityCheck === 'ok' ? 'SQLite integrity check passed' : v.integrityCheck },
    { label: 'Row counts', ok: v.rowCounts.every((r) => r.ok), detail: `${v.rowCounts.filter((r) => r.ok).length} of ${v.rowCounts.length} tables reconciled with the sources` },
    { label: 'Re-open test', ok: v.reopen.ok, detail: v.reopen.ok ? 'exported, re-opened and re-checked' : 'the file did not survive a round trip' },
  ];
});
</script>

<template>
  <div class="step">
    <header class="step__head">
      <h2 class="h-step">{{ archive ? 'Your merged backup is ready' : 'Build your merged backup' }}</h2>
      <p class="text-2">Everything below goes into one <code>.jwlibrary</code> file that JW Library restores like any other backup — custom playlist media included.</p>
    </header>

    <section>
      <h3 class="h-section">What's inside</h3>
      <div class="tiles">
        <div v-for="t in tiles" :key="t.label" class="tile">
          <q-icon :name="t.icon" class="tile__icon" />
          <div class="tile__n num">{{ t.n.toLocaleString() }}</div>
          <div class="tile__label">{{ t.label }}</div>
        </div>
      </div>
    </section>

    <div class="callout decisions" :class="hasConflicts ? 'callout--violet' : 'callout--mint'">
      <div class="callout__icon"><q-icon :name="hasConflicts ? I.altRoute : I.taskAlt" /></div>
      <div class="callout__grow">
        <div class="callout__title">
          <template v-if="hasConflicts">{{ plural(conflicts.length, 'decision') }} applied</template>
          <template v-else>No decisions were needed</template>
        </div>
        <div class="callout__body">
          <template v-if="hasConflicts">
            {{ conflicts.length - overriddenCount }} using the suggested version, {{ overriddenCount - keptBothCount }} changed by you<template v-if="keptBothCount">, {{ keptBothCount }} keeping both versions</template>.
          </template>
          <template v-else>Nothing was edited differently on two devices.</template>
          <span v-if="analysis?.warnings.length"> · {{ plural(analysis.warnings.length, 'warning') }} listed on the Compare step.</span>
        </div>
      </div>
      <q-btn v-if="hasConflicts" flat dense no-caps class="btn-link" label="Change" :icon="I.edit" @click="goTo('resolve')" />
    </div>

    <section class="buildbox">
      <div class="buildbox__form">
        <q-input v-model="deviceName" outlined dense dark label="Device name written into the backup" :placeholder="placeholder" :disable="building" class="buildbox__input">
          <template #prepend><q-icon :name="I.devices" /></template>
        </q-input>
        <q-btn class="btn-primary" no-caps :icon="archive ? I.refresh : I.build" :label="archive ? 'Rebuild' : 'Build merged backup'" :loading="building" :disable="!analysis" @click="build()" />
      </div>

      <Transition name="fade">
        <div v-if="building" class="phases">
          <div v-for="(p, i) in PHASES" :key="p.key" class="phase" :class="{ 'is-done': i < phaseIndex, 'is-active': i === phaseIndex }">
            <span class="phase__dot"><q-icon :name="i < phaseIndex ? I.check : I.moreHoriz" /></span>
            <span>{{ p.label }}</span>
          </div>
        </div>
      </Transition>

      <div v-if="buildError" class="callout callout--rose">
        <div class="callout__icon"><q-icon :name="I.error" /></div>
        <div>
          <div class="callout__title">The build failed</div>
          <div class="callout__body">{{ buildError }} — details are in the browser console.</div>
        </div>
      </div>

      <Transition name="fade">
        <div v-if="archive" class="result">
          <ul class="checks">
            <li v-for="c in checks" :key="c.label" class="check" :class="c.ok ? 'is-ok' : 'is-bad'">
              <span class="check__dot"><q-icon :name="c.ok ? I.check : I.close" /></span>
              <span class="check__label">{{ c.label }}</span>
              <span class="check__detail text-3">{{ c.detail }}</span>
            </li>
          </ul>
          <div v-if="archive.validation.warnings.length" class="notes text-3">
            <div v-for="(w, i) in archive.validation.warnings" :key="i">{{ w }}</div>
          </div>
          <div v-if="archive.validation.errors.length" class="notes notes--bad">
            <div v-for="(e, i) in archive.validation.errors" :key="i">{{ e }}</div>
          </div>

          <div v-if="!archive.validation.ok" class="callout callout--rose">
            <div class="callout__icon"><q-icon :name="I.report" /></div>
            <div>
              <div class="callout__title">Do not restore this file</div>
              <div class="callout__body">Validation failed. Please report this together with the messages above and the browser console output.</div>
            </div>
          </div>

          <div class="dl" :class="{ 'is-ok': archive.validation.ok }">
            <div class="dl__icon"><q-icon :name="I.folderZip" /></div>
            <div class="dl__text">
              <div class="dl__name">{{ archive.fileName }}</div>
              <div class="dl__meta text-3">
                {{ formatBytes(archive.bytes.byteLength) }} · {{ plural(archive.mediaFileCount, 'media file') }} · {{ formatTimestamp(archive.lastModified) }} ·
                <span class="mono">sha256 {{ archive.dbHash.slice(0, 10) }}…</span>
              </div>
            </div>
            <q-btn
              :class="archive.validation.ok ? 'btn-mint' : 'btn-ghost'"
              no-caps
              :icon="I.download"
              label="Download"
              type="a"
              :href="archive.validation.ok ? (downloadUrl ?? undefined) : undefined"
              :download="archive.fileName"
              :disable="!downloadUrl || !archive.validation.ok"
            />
          </div>
          <p class="text-3 dl__hint">On each device: JW Library → Personal Study → Backup and Restore → <b>Restore</b>, then choose this file.</p>
        </div>
      </Transition>
    </section>

    <div class="actions">
      <q-btn flat no-caps class="btn-link" :icon="I.arrowBack" label="Back" @click="goTo(hasConflicts ? 'resolve' : 'analyze')" />
    </div>
  </div>
</template>

<style scoped>
.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
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
  color: #c4b5fd;
  margin-bottom: 6px;
}
.tile__n {
  font-size: 26px;
  font-weight: 700;
  line-height: 1;
}
.tile__label {
  font-size: 12.5px;
  color: var(--text-2);
}
.callout__grow {
  flex: 1;
  min-width: 0;
}
.buildbox {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 18px;
  border-radius: var(--radius);
  background: var(--surface);
  border: 1px solid var(--border);
}
.buildbox__form {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}
.buildbox__input {
  flex: 1;
  min-width: 240px;
}
.phases {
  display: flex;
  gap: 10px 22px;
  flex-wrap: wrap;
  font-size: 13.5px;
  color: var(--text-3);
}
.phase {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition: color 0.2s;
}
.phase__dot {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 15px;
  border: 1px solid var(--border-strong);
  color: var(--text-3);
}
.phase.is-active {
  color: var(--text);
}
.phase.is-active .phase__dot {
  background: var(--grad);
  border-color: transparent;
  color: #fff;
  animation: pulse 1.2s ease-in-out infinite;
}
.phase.is-done {
  color: var(--text-2);
}
.phase.is-done .phase__dot {
  background: rgba(52, 211, 153, 0.18);
  border-color: rgba(52, 211, 153, 0.4);
  color: #6ee7b7;
}
@keyframes pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(139, 124, 255, 0.5);
  }
  50% {
    box-shadow: 0 0 0 6px rgba(139, 124, 255, 0);
  }
}
.result {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.checks {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
  gap: 8px;
}
.check {
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-rows: auto auto;
  column-gap: 10px;
  align-items: center;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border);
}
.check__dot {
  grid-row: 1 / span 2;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 17px;
}
.is-ok .check__dot {
  background: rgba(52, 211, 153, 0.18);
  color: #6ee7b7;
}
.is-bad .check__dot {
  background: rgba(251, 113, 133, 0.18);
  color: #fda4af;
}
.check__label {
  font-weight: 700;
  font-size: 13.5px;
}
.check__detail {
  font-size: 12px;
}
.notes {
  font-size: 12.5px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.notes--bad {
  color: #fda4af;
}
.dl {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.03);
  flex-wrap: wrap;
}
.dl.is-ok {
  border-color: rgba(52, 211, 153, 0.35);
  background: rgba(52, 211, 153, 0.06);
}
.dl__icon {
  width: 46px;
  height: 46px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  font-size: 26px;
  background: var(--grad-mint);
  color: #062a20;
  flex: none;
}
.dl__text {
  flex: 1;
  min-width: 200px;
}
.dl__name {
  font-weight: 700;
  overflow-wrap: anywhere;
}
.dl__meta {
  font-size: 12.5px;
}
.dl__hint {
  font-size: 12.5px;
}
@media (max-width: 599px) {
  .decisions {
    flex-wrap: wrap;
  }
  .decisions .q-btn {
    width: 100%;
    margin-top: 4px;
  }
  .buildbox__form .q-btn,
  .dl .q-btn {
    width: 100%;
  }
  .dl__text {
    min-width: 0;
    flex-basis: 100%;
  }
}
</style>
