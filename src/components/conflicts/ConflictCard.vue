<script setup lang="ts">
import { I } from '@/icons';
import { computed, ref } from 'vue';
import { KEEP_BOTH, supportsKeepBoth, type Conflict, type ConflictCandidate } from '@/core/merge/conflicts';
import type { InputFieldRow, NoteRow, UserMarkRow } from '@/core/jwlibrary/types';
import TextDiffView from './TextDiffView.vue';
import { formatTimestamp, plural } from '@/utils/format';
import { deviceIcon, deviceKind, highlightColor } from '@/utils/display';

const props = defineProps<{ conflict: Conflict; chosen: number; index?: number; total?: number }>();
const emit = defineEmits<{ (e: 'choose', sourceIndex: number): void }>();

const KIND: Record<Conflict['kind'], { label: string; icon: string; pill: string }> = {
  note: { label: 'Note', icon: I.stickyNote2, pill: 'pill--violet' },
  inputField: { label: 'Input field', icon: I.editNote, pill: 'pill--cyan' },
  userMark: { label: 'Highlight', icon: I.formatInkHighlighter, pill: 'pill--amber' },
};

const meta = computed(() => KIND[props.conflict.kind]);
const isText = computed(() => props.conflict.kind !== 'userMark');
const showDiff = ref(false);
const expanded = ref(false);

const keptBoth = computed(() => props.chosen === KEEP_BOTH && supportsKeepBoth(props.conflict.kind));
const canKeepBoth = computed(() => supportsKeepBoth(props.conflict.kind));
const chosenCandidate = computed(
  () =>
    props.conflict.candidates.find((c) => c.sourceIndex === (keptBoth.value ? props.conflict.suggestedWinnerIndex : props.chosen)) ??
    props.conflict.candidates[0],
);
const isSelected = (c: ConflictCandidate<unknown>) => keptBoth.value || c.sourceIndex === props.chosen;
const thingName = computed(() => (props.conflict.kind === 'note' ? 'notes' : 'highlights'));
function toggleKeepBoth() {
  emit('choose', keptBoth.value ? props.conflict.suggestedWinnerIndex : KEEP_BOTH);
}
const others = computed(() => props.conflict.candidates.filter((c) => c !== chosenCandidate.value));

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

function mark(c: ConflictCandidate<unknown>) {
  const r = c.row as UserMarkRow;
  return { color: highlightColor(r.ColorIndex), style: r.StyleIndex, ranges: c.children?.length ?? 0, version: r.Version };
}

function isSuggested(c: ConflictCandidate<unknown>): boolean {
  return c.sourceIndex === props.conflict.suggestedWinnerIndex;
}

const longest = computed(() => Math.max(...props.conflict.candidates.map((c) => textOf(c).length + (titleOf(c)?.length ?? 0))));
const isLong = computed(() => isText.value && longest.value > 420);

/** Signature used to spot byte-identical candidates (common: two synced devices vs. an older third). */
function contentKey(c: ConflictCandidate<unknown>): string {
  if (props.conflict.kind === 'userMark') {
    const r = c.row as UserMarkRow;
    const ranges = (c.children ?? []).map((b) => `${b.BlockType}:${b.Identifier}:${b.StartToken}:${b.EndToken}`).sort().join('|');
    return `${r.ColorIndex}${r.StyleIndex}${r.Version}${ranges}`;
  }
  return `${titleOf(c) ?? ''}${textOf(c)}`;
}

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
  <article class="card" :class="{ 'is-open': expanded }">
    <header class="card__head">
      <span class="pill" :class="meta.pill"><q-icon :name="meta.icon" /> {{ meta.label }}</span>
      <span class="card__context">{{ conflict.context }}</span>
      <span v-if="keptBoth" class="pill pill--mint"><q-icon :name="I.doneAll" /> Both kept</span>
      <span v-if="index && total" class="card__count text-3">{{ index }} / {{ total }}</span>
    </header>

    <div class="cands" :style="{ '--cols': Math.min(conflict.candidates.length, 3) }">
      <button
        v-for="c in conflict.candidates"
        :key="c.sourceIndex"
        type="button"
        class="cand"
        :class="{ 'is-chosen': isSelected(c), 'is-both': keptBoth }"
        role="radio"
        :aria-checked="isSelected(c)"
        @click="emit('choose', c.sourceIndex)"
      >
        <div class="cand__head">
          <span class="cand__check" aria-hidden="true"><q-icon :name="I.check" /></span>
          <q-icon :name="deviceIcon(deviceKind(c.sourceLabel))" class="cand__device" />
          <span class="cand__label">{{ c.sourceLabel }}</span>
          <span v-if="isSuggested(c)" class="pill pill--mint cand__pill">Suggested</span>
          <span v-else-if="identicalTo.get(c.sourceIndex)" class="pill cand__pill">Same as {{ identicalTo.get(c.sourceIndex) }}</span>
        </div>
        <div class="cand__time text-3">{{ c.timestampSource === 'row' ? 'Edited' : 'Backup from' }} {{ formatTimestamp(c.timestamp) }}</div>
        <div class="cand__body">
          <template v-if="isText">
            <div v-if="titleOf(c)" class="cand__title">{{ titleOf(c) }}</div>
            <div class="cand__text" :class="{ 'is-empty': !textOf(c) }">{{ textOf(c) || 'Empty' }}</div>
          </template>
          <div v-else class="mark">
            <span class="mark__swatch" :style="{ background: mark(c).color.hex }" />
            <span>{{ mark(c).color.name }}</span>
            <span class="text-3">· style {{ mark(c).style }} · {{ plural(mark(c).ranges, 'range') }}</span>
          </div>
        </div>
      </button>
    </div>

    <footer class="card__foot">
      <span class="card__reason text-3">
        <template v-if="keptBoth">Every version will be saved as a separate {{ thingName.slice(0, -1) }} — nothing is discarded.</template>
        <template v-else>{{ conflict.suggestedWinnerReason }}</template>
      </span>
      <div class="card__tools">
        <q-btn
          v-if="canKeepBoth"
          flat
          dense
          no-caps
          class="btn-link"
          :class="{ 'is-on': keptBoth }"
          :icon="keptBoth ? I.check : I.doneAll"
          :label="keptBoth ? 'Keeping both' : 'Keep both'"
          @click="toggleKeepBoth()"
        >
          <q-tooltip v-if="!keptBoth">Save every version as separate {{ thingName }} instead of choosing</q-tooltip>
        </q-btn>
        <q-btn v-if="isLong" flat dense no-caps class="btn-link" :icon="expanded ? I.unfoldLess : I.unfoldMore" :label="expanded ? 'Collapse' : 'Full text'" @click="expanded = !expanded" />
        <q-btn v-if="isText && others.length" flat dense no-caps class="btn-link" :icon="showDiff ? I.visibilityOff : I.difference" :label="showDiff ? 'Hide differences' : 'Show differences'" @click="showDiff = !showDiff" />
      </div>
    </footer>

    <Transition name="fade">
      <div v-if="showDiff && isText" class="diffs">
        <div v-for="o in others" :key="o.sourceIndex" class="diff">
          <div class="diff__label text-3">What changes if you keep <b>{{ chosenCandidate.sourceLabel }}</b> instead of <b>{{ o.sourceLabel }}</b></div>
          <TextDiffView :from="textOf(o)" :to="textOf(chosenCandidate)" />
        </div>
      </div>
    </Transition>
  </article>
</template>

<style scoped>
.card {
  border-radius: var(--radius);
  background: var(--surface);
  border: 1px solid var(--border);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.card__head {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.card__context {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}
.card__count {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.cands {
  display: grid;
  grid-template-columns: repeat(var(--cols, 2), minmax(0, 1fr));
  gap: 10px;
}
.cand {
  appearance: none;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
  border-radius: 14px;
  padding: 12px 14px 14px;
  background: rgba(255, 255, 255, 0.03);
  border: 1.5px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  position: relative;
  transition:
    border-color 0.2s var(--ease),
    background 0.2s var(--ease),
    box-shadow 0.2s var(--ease),
    transform 0.2s var(--ease);
}
.cand:hover {
  background: var(--surface-hover);
  border-color: var(--border-strong);
}
.cand:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}
.cand.is-chosen {
  border-color: transparent;
  background:
    linear-gradient(#141c3a, #141c3a) padding-box,
    var(--grad) border-box;
  box-shadow: 0 16px 40px -20px rgba(139, 124, 255, 0.7);
}
.cand__head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.cand__check {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 1.5px solid var(--border-strong);
  display: grid;
  place-items: center;
  font-size: 15px;
  color: transparent;
  flex: none;
  transition:
    background 0.2s var(--ease),
    color 0.2s var(--ease),
    border-color 0.2s var(--ease);
}
.is-chosen .cand__check {
  background: var(--grad);
  border-color: transparent;
  color: #fff;
}
.cand.is-both {
  background:
    linear-gradient(#12203a, #12203a) padding-box,
    var(--grad-mint) border-box;
  box-shadow: none;
}
.is-both .cand__check {
  background: var(--grad-mint);
  color: #062a20;
}
.btn-link.is-on {
  color: #6ee7b7;
}
.cand__device {
  font-size: 18px;
  color: var(--text-3);
}
.cand__label {
  font-weight: 700;
  font-size: 14.5px;
}
.cand__pill {
  margin-left: auto;
}
.cand__time {
  font-size: 12.5px;
}
.cand__body {
  margin-top: 4px;
  max-height: 180px;
  overflow: hidden;
  position: relative;
  transition: max-height 0.3s var(--ease);
}
.is-open .cand__body {
  max-height: none;
}
.card:not(.is-open) .cand__body::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 40px;
  background: linear-gradient(transparent, rgba(20, 28, 58, 0.9));
  pointer-events: none;
}
.cand__title {
  font-weight: 700;
  margin-bottom: 4px;
}
.cand__text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 14px;
  line-height: 1.55;
  color: var(--text);
}
.cand__text.is-empty {
  color: var(--text-3);
  font-style: italic;
}
.mark {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
}
.mark__swatch {
  width: 18px;
  height: 18px;
  border-radius: 6px;
  border: 1px solid rgba(0, 0, 0, 0.25);
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.08);
}
.card__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}
.card__reason {
  font-size: 12.5px;
}
.card__tools {
  display: flex;
  gap: 4px;
}
.diffs {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.diff__label {
  font-size: 12.5px;
  margin-bottom: 6px;
}
@media (max-width: 700px) {
  .cands {
    grid-template-columns: 1fr;
  }
  .card {
    padding: 14px;
  }
}
</style>
