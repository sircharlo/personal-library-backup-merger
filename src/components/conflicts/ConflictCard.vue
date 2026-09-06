<script setup lang="ts">
import { computed } from 'vue';
import type { Conflict, ConflictCandidate } from '@/core/merge/conflicts';
import type { InputFieldRow, NoteRow, UserMarkRow } from '@/core/jwlibrary/types';
import TextDiffView from './TextDiffView.vue';
import { formatTimestamp, plural } from '@/utils/format';

const props = defineProps<{ conflict: Conflict; chosen: number }>();
const emit = defineEmits<{ (e: 'choose', sourceIndex: number): void }>();

const kindLabel: Record<Conflict['kind'], { label: string; icon: string; color: string }> = {
  note: { label: 'Note', icon: 'sticky_note_2', color: 'primary' },
  inputField: { label: 'Input field', icon: 'edit_note', color: 'secondary' },
  userMark: { label: 'Highlight', icon: 'border_color', color: 'accent' },
};

const meta = computed(() => kindLabel[props.conflict.kind]);
const isText = computed(() => props.conflict.kind !== 'userMark');
const chosenCandidate = computed(
  () => props.conflict.candidates.find((c) => c.sourceIndex === props.chosen) ?? props.conflict.candidates[0],
);
const others = computed(() => props.conflict.candidates.filter((c) => c !== chosenCandidate.value));
const colClass = computed(() => (props.conflict.candidates.length >= 3 ? 'col-12 col-md-4' : 'col-12 col-md-6'));

function textOf(c: ConflictCandidate<unknown>): string {
  switch (props.conflict.kind) {
    case 'note':
      return (c.row as NoteRow).Content ?? '';
    case 'inputField':
      return (c.row as InputFieldRow).Value ?? '';
    default:
      return '';
  }
}

function titleOf(c: ConflictCandidate<unknown>): string | null {
  return props.conflict.kind === 'note' ? ((c.row as NoteRow).Title ?? null) : null;
}

function highlightSummary(c: ConflictCandidate<unknown>): string {
  const r = c.row as UserMarkRow;
  const ranges = c.children?.length ?? 0;
  return `Color ${r.ColorIndex} · style ${r.StyleIndex} · ${plural(ranges, 'highlighted range')}`;
}

function isSuggested(c: ConflictCandidate<unknown>): boolean {
  return c.sourceIndex === props.conflict.suggestedWinnerIndex;
}

/** Signature used to spot byte-identical candidates (common: two synced devices vs. an older third). */
function contentKey(c: ConflictCandidate<unknown>): string {
  if (props.conflict.kind === 'userMark') {
    const r = c.row as UserMarkRow;
    const ranges = (c.children ?? []).map((b) => `${b.BlockType}:${b.Identifier}:${b.StartToken}:${b.EndToken}`).sort().join('|');
    return `${r.ColorIndex}${r.StyleIndex}${r.Version}${ranges}`;
  }
  return `${titleOf(c) ?? ''}${textOf(c)}`;
}

/** Label of the first earlier candidate with identical content, if any. */
const identicalTo = computed(() => {
  const seen = new Map<string, string>();
  const out = new Map<number, string>();
  for (const c of props.conflict.candidates) {
    const key = contentKey(c);
    const first = seen.get(key);
    if (first !== undefined) out.set(c.sourceIndex, first);
    else seen.set(key, c.sourceLabel);
  }
  return out;
});
</script>

<template>
  <q-card flat bordered>
    <q-card-section class="q-pb-sm">
      <div class="row items-center q-gutter-sm">
        <q-chip dense :color="meta.color" text-color="white" :icon="meta.icon">{{ meta.label }}</q-chip>
        <div class="text-subtitle2 ellipsis col">{{ conflict.context }}</div>
      </div>
      <div class="text-caption text-grey-7 q-mt-xs">{{ conflict.suggestedWinnerReason }}</div>
    </q-card-section>

    <q-card-section class="q-pt-none">
      <div class="row q-col-gutter-sm">
        <div v-for="c in conflict.candidates" :key="c.sourceIndex" :class="colClass">
          <q-card
            flat
            bordered
            class="candidate cursor-pointer full-height"
            :class="{ 'candidate--chosen': c.sourceIndex === chosen }"
            role="radio"
            :aria-checked="c.sourceIndex === chosen"
            tabindex="0"
            @click="emit('choose', c.sourceIndex)"
            @keydown.enter.prevent="emit('choose', c.sourceIndex)"
            @keydown.space.prevent="emit('choose', c.sourceIndex)"
          >
            <q-card-section class="q-py-sm">
              <div class="row items-center no-wrap">
                <q-radio :model-value="chosen" :val="c.sourceIndex" dense @update:model-value="emit('choose', c.sourceIndex)" />
                <div class="col q-ml-xs">
                  <div class="text-subtitle2 ellipsis">
                    {{ c.sourceLabel }}
                    <q-badge v-if="isSuggested(c)" color="positive" outline class="q-ml-xs">suggested</q-badge>
                    <q-badge v-if="identicalTo.get(c.sourceIndex)" color="grey-7" outline class="q-ml-xs">same as {{ identicalTo.get(c.sourceIndex) }}</q-badge>
                  </div>
                  <div class="text-caption text-grey-7">
                    {{ c.timestampSource === 'row' ? 'edited' : 'backup modified' }} {{ formatTimestamp(c.timestamp) }}
                  </div>
                </div>
              </div>
            </q-card-section>
            <q-separator />
            <q-card-section class="q-py-sm candidate__body">
              <template v-if="isText">
                <div v-if="titleOf(c)" class="text-weight-medium q-mb-xs">{{ titleOf(c) }}</div>
                <div class="candidate__text">{{ textOf(c) || '(empty)' }}</div>
              </template>
              <div v-else class="text-body2">{{ highlightSummary(c) }}</div>
            </q-card-section>
          </q-card>
        </div>
      </div>
    </q-card-section>

    <template v-if="isText && others.length">
      <q-separator />
      <q-expansion-item dense icon="difference" label="Show differences against the selected version" header-class="text-grey-8">
        <q-card-section class="q-pt-none">
          <div v-for="o in others" :key="o.sourceIndex" class="q-mb-md">
            <div class="text-caption text-grey-7 q-mb-xs">{{ o.sourceLabel }} → {{ chosenCandidate.sourceLabel }} (removed / added)</div>
            <TextDiffView :from="textOf(o)" :to="textOf(chosenCandidate)" />
          </div>
        </q-card-section>
      </q-expansion-item>
    </template>
  </q-card>
</template>

<style scoped>
.candidate {
  transition: border-color 0.15s, background 0.15s;
}
.candidate--chosen {
  border-color: #4a6da7;
  background: #f2f6fc;
}
.candidate:focus-visible {
  outline: 2px solid #4a6da7;
}
.candidate__body {
  max-height: 260px;
  overflow: auto;
}
.candidate__text {
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 0.92rem;
}
</style>
