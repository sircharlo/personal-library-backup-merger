<script setup lang="ts">
import { I } from '@/icons';
import { computed } from 'vue';
import { useMergeWizard } from '@/composables/useMergeWizard';
import type { RailStep } from '@/components/steps';
import StepRail from '@/components/StepRail.vue';
import UploadStep from '@/components/steps/UploadStep.vue';
import AnalyzeStep from '@/components/steps/AnalyzeStep.vue';
import ResolveConflictsStep from '@/components/steps/ResolveConflictsStep.vue';
import DownloadStep from '@/components/steps/DownloadStep.vue';

const { step, stepIndex, analysis, hasConflicts, conflicts, reset } = useMergeWizard();

const components = { upload: UploadStep, analyze: AnalyzeStep, resolve: ResolveConflictsStep, download: DownloadStep } as const;
const stepComponent = computed(() => components[step.value]);

const steps = computed<RailStep[]>(() => [
  { key: 'upload', title: 'Add backups', caption: 'Your .jwlibrary files', icon: I.uploadFile },
  { key: 'analyze', title: 'Compare', caption: 'Read & match everything', icon: I.compareArrows },
  {
    key: 'resolve',
    title: 'Decide',
    caption: analysis.value ? (hasConflicts.value ? `${conflicts.value.length} to review` : 'Nothing to review') : 'Pick between versions',
    icon: I.altRoute,
    skipped: !!analysis.value && !hasConflicts.value,
  },
  { key: 'download', title: 'Download', caption: 'Validate & save', icon: I.download },
]);
</script>

<template>
  <div class="aurora" aria-hidden="true"><div class="aurora__grid" /></div>

  <header class="topbar">
    <div class="shell topbar__inner">
      <a class="brand" href="./" @click.prevent="reset()">
        <span class="brand__mark"><q-icon :name="I.callMerge" /></span>
        <span class="brand__text">
          <strong>Backup Merger</strong>
          <small>for JW Library</small>
        </span>
      </a>
      <div class="topbar__right">
        <span class="pill pill--mint gt-xs"><q-icon :name="I.lock" /> 100% in your browser</span>
        <q-btn v-if="step !== 'upload'" flat no-caps class="btn-link" :icon="I.restartAlt" label="Start over" @click="reset()" />
      </div>
    </div>
  </header>

  <main class="shell page">
    <Transition name="fade">
      <section v-if="step === 'upload'" class="hero">
        <h1 class="h-display">
          Merge your JW Library backups
          <span class="grad-text">without losing a thing.</span>
        </h1>
        <p class="hero__sub text-2">
          Combine notes, highlights, bookmarks, tags and playlists from every device into one backup. Your files never leave this page.
        </p>
      </section>
    </Transition>

    <StepRail :steps="steps" :current="stepIndex" />

    <section class="panel glass">
      <Transition name="step" mode="out-in">
        <component :is="stepComponent" :key="step" />
      </Transition>
    </section>

    <footer class="foot text-3">
      <p>
        Restore the merged file on each device with JW Library's own <em>Backup and Restore → Restore</em>. Keep your original backups until you
        have checked the result.
      </p>
      <p>Independent project — not affiliated with the publishers of JW Library.</p>
    </footer>
  </main>
</template>

<style scoped>
.topbar {
  position: sticky;
  top: 0;
  z-index: 10;
  backdrop-filter: blur(16px) saturate(1.3);
  -webkit-backdrop-filter: blur(16px) saturate(1.3);
  background: rgba(10, 15, 30, 0.55);
  border-bottom: 1px solid var(--border);
}
.topbar__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  height: 64px;
}
.topbar__right {
  display: flex;
  align-items: center;
  gap: 10px;
}
.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  text-decoration: none;
  color: inherit;
  min-width: 0;
}
.brand__mark {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  background: var(--grad);
  display: grid;
  place-items: center;
  color: #fff;
  font-size: 24px;
  box-shadow: var(--glow-primary);
  flex: none;
}
.brand__text {
  display: flex;
  flex-direction: column;
  line-height: 1.1;
}
.brand__text strong {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 16px;
  letter-spacing: -0.01em;
}
.brand__text small {
  color: var(--text-3);
  font-size: 12px;
}
.page {
  padding-top: 28px;
  padding-bottom: 64px;
}
.hero {
  padding: 26px 0 8px;
  max-width: 760px;
}
.hero .grad-text {
  display: block;
}
.hero__sub {
  margin-top: 16px;
  font-size: clamp(15px, 1.6vw, 17.5px);
  max-width: 60ch;
}
.panel {
  padding: clamp(18px, 3vw, 34px);
  border-radius: var(--radius-lg);
}
.foot {
  margin-top: 28px;
  font-size: 12.5px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 80ch;
}
@media (max-width: 599px) {
  .topbar__inner {
    height: 58px;
  }
  .page {
    padding-top: 18px;
    padding-bottom: 40px;
  }
  .hero {
    padding-top: 12px;
  }
}
</style>
