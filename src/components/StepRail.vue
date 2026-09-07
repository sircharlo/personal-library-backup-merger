<script setup lang="ts">
import { I } from '@/icons';
import { computed } from 'vue';
import type { RailStep } from './steps';

const props = defineProps<{ steps: RailStep[]; current: number }>();
const pct = computed(() => (props.steps.length > 1 ? ((props.current - 1) / (props.steps.length - 1)) * 100 : 100));
</script>

<template>
  <nav class="rail" aria-label="Progress">
    <ol class="rail__list">
      <li
        v-for="(s, i) in steps"
        :key="s.key"
        class="rail__item"
        :class="{ 'is-done': i + 1 < current, 'is-active': i + 1 === current, 'is-skipped': s.skipped && i + 1 !== current }"
        :aria-current="i + 1 === current ? 'step' : undefined"
      >
        <span class="rail__dot"><q-icon :name="i + 1 < current ? I.check : s.icon" /></span>
        <span class="rail__text">
          <span class="rail__title">{{ s.title }}</span>
          <span class="rail__caption">{{ s.caption }}</span>
        </span>
      </li>
    </ol>
    <div class="rail__mobile">
      <span class="rail__step">Step {{ current }} of {{ steps.length }}</span>
      <span class="rail__now">{{ steps[current - 1]?.title }}</span>
    </div>
    <div class="rail__bar" aria-hidden="true"><span class="rail__fill" :style="{ width: pct + '%' }" /></div>
  </nav>
</template>

<style scoped>
.rail {
  margin: 22px 0 18px;
}
.rail__list {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  list-style: none;
  margin: 0;
  padding: 0;
}
.rail__item {
  display: flex;
  align-items: center;
  gap: 11px;
  min-width: 0;
  transition: opacity 0.2s;
}
.rail__dot {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text-3);
  font-size: 21px;
  flex: none;
  transition:
    background 0.25s var(--ease),
    color 0.25s var(--ease),
    box-shadow 0.25s var(--ease),
    transform 0.25s var(--ease);
}
.is-active .rail__dot {
  background: var(--grad);
  color: #fff;
  border-color: transparent;
  box-shadow: var(--glow-primary);
  transform: scale(1.06);
}
.is-done .rail__dot {
  background: rgba(52, 211, 153, 0.14);
  color: #6ee7b7;
  border-color: rgba(52, 211, 153, 0.35);
}
.rail__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.rail__title {
  font-weight: 700;
  font-size: 14px;
  color: var(--text-2);
  line-height: 1.2;
}
.is-active .rail__title {
  color: var(--text);
}
.rail__caption {
  font-size: 12px;
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.is-skipped {
  opacity: 0.5;
}
.rail__bar {
  height: 4px;
  border-radius: 999px;
  background: var(--surface-strong);
  margin-top: 14px;
  overflow: hidden;
}
.rail__fill {
  display: block;
  height: 100%;
  background: var(--grad);
  border-radius: 999px;
  transition: width 0.45s var(--ease);
}
.rail__mobile {
  display: none;
}
@media (max-width: 640px) {
  .rail__list {
    display: flex;
    justify-content: space-between;
  }
  .rail__text {
    display: none;
  }
  .rail__dot {
    width: 42px;
    height: 42px;
  }
  .rail__mobile {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-top: 12px;
    font-size: 13px;
    color: var(--text-3);
  }
  .rail__now {
    font-weight: 700;
    color: var(--text);
    font-size: 14px;
  }
  .rail__bar {
    margin-top: 8px;
  }
}
</style>
