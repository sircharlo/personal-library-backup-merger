<script setup lang="ts">
import { computed } from 'vue';
import { diffWords } from 'diff';

const props = defineProps<{ from: string; to: string }>();
const parts = computed(() => diffWords(props.from ?? '', props.to ?? ''));
</script>

<template>
  <div class="diff">
    <span v-for="(p, i) in parts" :key="i" :class="{ diff__add: p.added, diff__del: p.removed }">{{ p.value }}</span>
  </div>
</template>

<style scoped>
.diff {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 14px;
  line-height: 1.6;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 10px 12px;
  background: rgba(0, 0, 0, 0.25);
  color: var(--text-2);
}
.diff__add {
  background: rgba(52, 211, 153, 0.22);
  color: #a7f3d0;
  border-radius: 3px;
  padding: 0 1px;
}
.diff__del {
  background: rgba(251, 113, 133, 0.2);
  color: #fecdd3;
  text-decoration: line-through;
  text-decoration-color: rgba(254, 205, 211, 0.6);
  border-radius: 3px;
  padding: 0 1px;
}
</style>
