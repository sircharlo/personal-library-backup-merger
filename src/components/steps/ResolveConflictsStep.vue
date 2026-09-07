<script setup lang="ts">
import { I } from '@/icons';
import { computed, ref, watch } from 'vue';
import type { Conflict, ConflictKind } from '@/core/merge/conflicts';
import { useMergeWizard } from '@/composables/useMergeWizard';
import ConflictCard from '@/components/conflicts/ConflictCard.vue';
import { plural } from '@/utils/format';

const { conflicts, resolutions, overriddenCount, keptBothCount, setResolution, acceptAllSuggestions, chosenFor, goTo, continueFromResolve } = useMergeWizard();

const PAGE = 15;

interface Group {
  kind: ConflictKind;
  label: string;
  icon: string;
  items: Conflict[];
}

const groups = computed<Group[]>(() =>
  (
    [
      { kind: 'note', label: 'Notes', icon: I.stickyNote2 },
      { kind: 'inputField', label: 'Input fields', icon: I.editNote },
      { kind: 'userMark', label: 'Highlights', icon: I.formatInkHighlighter },
    ] as const
  )
    .map((g) => ({ ...g, items: conflicts.value.filter((c) => c.kind === g.kind) }))
    .filter((g) => g.items.length > 0),
);

const tab = ref<ConflictKind>(groups.value[0]?.kind ?? 'note');
const shown = ref<Record<ConflictKind, number>>({ note: PAGE, inputField: PAGE, userMark: PAGE });
const active = computed(() => groups.value.find((g) => g.kind === tab.value) ?? groups.value[0]);

watch(groups, (g) => {
  if (!g.some((x) => x.kind === tab.value) && g[0]) tab.value = g[0].kind;
});

// Depend on `resolutions` so cards re-render when a choice changes.
const chosen = computed(() => {
  void resolutions.value;
  return (c: Conflict) => chosenFor(c);
});
</script>

<template>
  <div class="step">
    <header class="step__head">
      <h2 class="h-step">Pick the version to keep</h2>
      <p class="text-2">
        These were edited differently on two or more devices. The most recently modified version is pre-selected; tap another version to keep that one
        instead, or choose <b>Keep both</b> to save every version. Everything else in your backups merges untouched.
      </p>
    </header>

    <div class="bar">
      <div class="bar__pills">
        <span class="pill pill--amber"><q-icon :name="I.altRoute" /> {{ plural(conflicts.length, 'decision') }}</span>
        <span class="pill" :class="overriddenCount ? 'pill--cyan' : ''"><q-icon :name="I.tune" /> {{ overriddenCount - keptBothCount }} changed from the suggestion</span>
        <span v-if="keptBothCount" class="pill pill--mint"><q-icon :name="I.doneAll" /> {{ keptBothCount }} keeping both</span>
      </div>
      <q-btn flat no-caps dense class="btn-link" :icon="I.doneAll" label="Use all suggestions" :disable="overriddenCount === 0" @click="acceptAllSuggestions()" />
    </div>

    <div v-if="groups.length > 1" class="seg" role="tablist">
      <button
        v-for="g in groups"
        :key="g.kind"
        type="button"
        role="tab"
        class="seg__btn"
        :class="{ 'is-active': tab === g.kind }"
        :aria-selected="tab === g.kind"
        @click="tab = g.kind"
      >
        <q-icon :name="g.icon" /> {{ g.label }} <span class="seg__n">{{ g.items.length }}</span>
      </button>
    </div>

    <div v-if="active" class="cards">
      <ConflictCard
        v-for="(c, i) in active.items.slice(0, shown[active.kind])"
        :key="c.id"
        :conflict="c"
        :chosen="chosen(c)"
        :index="i + 1"
        :total="active.items.length"
        @choose="(sourceIndex) => setResolution(c.id, sourceIndex)"
      />
      <div v-if="active.items.length > shown[active.kind]" class="more">
        <q-btn class="btn-ghost" no-caps :icon="I.keyboardArrowDown" :label="`Show ${Math.min(PAGE, active.items.length - shown[active.kind])} more of ${active.items.length - shown[active.kind]}`" @click="shown[active.kind] += PAGE" />
      </div>
    </div>

    <div class="actions actions--sticky">
      <q-btn flat no-caps class="btn-link" :icon="I.arrowBack" label="Back" @click="goTo('analyze')" />
      <q-btn class="btn-primary" no-caps :icon-right="I.arrowForward" label="Continue to download" @click="continueFromResolve()" />
    </div>
  </div>
</template>

<style scoped>
.bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.bar__pills {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.seg {
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  border-radius: 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  align-self: flex-start;
  max-width: 100%;
  overflow-x: auto;
}
.seg__btn {
  appearance: none;
  border: 0;
  background: transparent;
  color: var(--text-2);
  font: inherit;
  font-weight: 600;
  font-size: 14px;
  padding: 8px 14px;
  border-radius: 10px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
  transition:
    background 0.2s var(--ease),
    color 0.2s var(--ease);
}
.seg__btn .q-icon {
  font-size: 18px;
}
.seg__btn:hover {
  color: var(--text);
}
.seg__btn.is-active {
  background: var(--grad);
  color: #fff;
  box-shadow: var(--glow-primary);
}
.seg__n {
  font-size: 12px;
  padding: 1px 7px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.14);
}
.cards {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.more {
  display: flex;
  justify-content: center;
  padding-top: 4px;
}
.actions--sticky {
  position: sticky;
  bottom: 0;
  z-index: 2;
  margin: 8px calc(-1 * clamp(18px, 3vw, 34px)) calc(-1 * clamp(18px, 3vw, 34px));
  padding: 14px clamp(18px, 3vw, 34px);
  background: rgba(13, 19, 38, 0.82);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border-top: 1px solid var(--border);
  border-radius: 0 0 var(--radius-lg) var(--radius-lg);
}
</style>
