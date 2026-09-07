<script setup lang="ts">
import { I } from '@/icons';
import { computed, ref } from 'vue';
import type { HealthFinding, HealthReport } from '@/core/health/healthCheck';
import { plural } from '@/utils/format';

const props = defineProps<{ report: HealthReport; title?: string }>();
const open = ref<Set<string>>(new Set());

const found = computed(() => props.report.findings.filter((f) => f.count > 0));
const problems = computed(() => found.value.filter((f) => !f.info));
const infos = computed(() => found.value.filter((f) => f.info));

function toggle(code: string) {
  const next = new Set(open.value);
  if (next.has(code)) next.delete(code);
  else next.add(code);
  open.value = next;
}

function tone(f: HealthFinding): string {
  if (f.info) return 'pill--violet';
  return f.category === 'dangling' || f.category === 'archive' ? 'pill--rose' : 'pill--amber';
}
</script>

<template>
  <div class="health">
    <div class="health__head">
      <span v-if="title" class="health__title">{{ title }}</span>
      <span v-if="!found.length" class="pill pill--mint"><q-icon :name="I.taskAlt" /> All {{ report.checks }} checks passed</span>
      <span v-else class="health__sub text-3">
        {{ plural(problems.length, 'problem') }}<template v-if="infos.length"> · {{ plural(infos.length, 'note') }}</template> · {{ report.checks }} checks
      </span>
    </div>
    <ul v-if="found.length" class="health__list">
      <li v-for="f in found" :key="f.code" class="finding">
        <button type="button" class="finding__row" :aria-expanded="open.has(f.code)" @click="toggle(f.code)">
          <span class="pill finding__code" :class="tone(f)">{{ f.code }}</span>
          <span class="finding__label"><b class="num">{{ f.count.toLocaleString() }}</b> {{ f.label }}</span>
          <span class="finding__flag text-3">{{ f.cleanup ? 'clean-up available' : f.info ? 'info' : '' }}</span>
          <q-icon :name="I.keyboardArrowDown" class="finding__chev" :class="{ 'is-open': open.has(f.code) }" />
        </button>
        <ul v-if="open.has(f.code)" class="finding__samples">
          <li v-for="(s, i) in f.samples" :key="i">{{ s }}</li>
          <li v-if="f.count > f.samples.length" class="text-3">… and {{ (f.count - f.samples.length).toLocaleString() }} more</li>
        </ul>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.health {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}
.health__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}
.health__title {
  font-weight: 700;
  font-size: 15px;
}
.health__sub {
  font-size: 12.5px;
}
.health__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.finding__row {
  appearance: none;
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.03);
  color: inherit;
  font: inherit;
  width: 100%;
  text-align: left;
  border-radius: 10px;
  padding: 8px 10px;
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  transition: background 0.15s;
}
.finding__row:hover {
  background: var(--surface-hover);
}
.finding__code {
  min-width: 42px;
  justify-content: center;
}
.finding__label {
  flex: 1 1 200px;
  font-size: 13.5px;
  min-width: 0;
  line-height: 1.35;
}
.finding__flag {
  font-size: 12px;
  white-space: nowrap;
  flex: none;
}
.finding__chev {
  font-size: 20px;
  color: var(--text-3);
  transition: transform 0.2s var(--ease);
}
.finding__chev.is-open {
  transform: rotate(180deg);
}
.finding__samples {
  margin: 6px 0 4px;
  padding: 0 0 0 52px;
  list-style: none;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  color: var(--text-2);
  display: flex;
  flex-direction: column;
  gap: 3px;
  overflow-wrap: anywhere;
}
@media (max-width: 900px) {
  .finding__flag {
    display: none;
  }
  .finding__samples {
    padding-left: 12px;
  }
}
</style>
