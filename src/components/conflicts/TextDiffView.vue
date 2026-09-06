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
  word-break: break-word;
  font-size: 0.92rem;
  line-height: 1.5;
  border: 1px solid #e0e4ea;
  border-radius: 6px;
  padding: 8px 10px;
  background: #fff;
}
.diff__add {
  background: #d9f2df;
  color: #1c5a2e;
  border-radius: 2px;
}
.diff__del {
  background: #f9dada;
  color: #8a1f1f;
  text-decoration: line-through;
  border-radius: 2px;
}
</style>
