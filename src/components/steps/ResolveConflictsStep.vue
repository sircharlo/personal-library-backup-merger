<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { Conflict, ConflictKind } from '@/core/merge/conflicts';
import { useMergeWizard } from '@/composables/useMergeWizard';
import ConflictCard from '@/components/conflicts/ConflictCard.vue';
import { plural } from '@/utils/format';

const { conflicts, resolutions, overriddenCount, setResolution, acceptAllSuggestions, chosenFor, goTo, continueFromResolve } = useMergeWizard();

const PAGE = 20;

interface Group {
  kind: ConflictKind;
  label: string;
  icon: string;
  items: Conflict[];
}

const groups = computed<Group[]>(() =>
  (
    [
      { kind: 'note', label: 'Notes', icon: 'sticky_note_2' },
      { kind: 'inputField', label: 'Input fields', icon: 'edit_note' },
      { kind: 'userMark', label: 'Highlights', icon: 'border_color' },
    ] as const
  )
    .map((g) => ({ ...g, items: conflicts.value.filter((c) => c.kind === g.kind) }))
    .filter((g) => g.items.length > 0),
);

const tab = ref<ConflictKind>(groups.value[0]?.kind ?? 'note');
const shown = ref<Record<ConflictKind, number>>({ note: PAGE, inputField: PAGE, userMark: PAGE });

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
  <div class="column q-gutter-md">
    <div>
      <div class="text-h6">Resolve conflicts</div>
      <div class="text-body2 text-grey-8">
        These items were edited differently on two or more devices. The most recently modified version is pre-selected everywhere; change
        any choice you like, then continue. Nothing else in your backups is affected.
      </div>
    </div>

    <div class="row items-center q-gutter-sm">
      <q-badge color="primary" outline>{{ plural(conflicts.length, 'conflict') }}</q-badge>
      <q-badge :color="overriddenCount ? 'accent' : 'grey-6'" outline>{{ overriddenCount }} overridden</q-badge>
      <q-space />
      <q-btn flat dense no-caps icon="done_all" label="Use all suggestions" :disable="overriddenCount === 0" @click="acceptAllSuggestions()" />
    </div>

    <q-tabs v-model="tab" dense align="left" class="text-grey-8" active-color="primary" indicator-color="primary" narrow-indicator>
      <q-tab v-for="g in groups" :key="g.kind" :name="g.kind" :icon="g.icon" :label="`${g.label} (${g.items.length})`" no-caps />
    </q-tabs>
    <q-separator />

    <q-tab-panels v-model="tab" animated>
      <q-tab-panel v-for="g in groups" :key="g.kind" :name="g.kind" class="q-pa-none">
        <div class="column q-gutter-md q-pt-md">
          <ConflictCard
            v-for="c in g.items.slice(0, shown[g.kind])"
            :key="c.id"
            :conflict="c"
            :chosen="chosen(c)"
            @choose="(sourceIndex) => setResolution(c.id, sourceIndex)"
          />
          <div v-if="g.items.length > shown[g.kind]" class="row justify-center">
            <q-btn flat no-caps color="primary" :label="`Show ${Math.min(PAGE, g.items.length - shown[g.kind])} more of ${g.items.length - shown[g.kind]}`" @click="shown[g.kind] += PAGE" />
          </div>
        </div>
      </q-tab-panel>
    </q-tab-panels>

    <div class="row justify-between">
      <q-btn flat no-caps icon="arrow_back" label="Back" @click="goTo('analyze')" />
      <q-btn unelevated color="primary" icon-right="arrow_forward" label="Continue" @click="continueFromResolve()" />
    </div>
  </div>
</template>
