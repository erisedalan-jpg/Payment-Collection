<script setup lang="ts">
import { computed } from 'vue'
import type { CalYearHeatCell } from '@/lib/calendar'
import { fmtWan } from '@/lib/format'

const props = defineProps<{ cells: CalYearHeatCell[]; activeMonth: number }>()
const emit = defineEmits<{ select: [number] }>()

const max = computed(() => Math.max(1, ...props.cells.map((c) => c.remaining)))
function bg(rem: number): string {
  if (rem <= 0) return 'transparent'
  const p = Math.round(10 + (rem / max.value) * 60)
  return `color-mix(in srgb, var(--accent) ${p}%, transparent)`
}
</script>

<template>
  <div class="cyh">
    <div class="cyh-title">年度待回款热力</div>
    <div class="cyh-row">
      <div
        v-for="c in cells"
        :key="c.month"
        class="cyh-cell"
        :class="{ active: c.month === activeMonth, hot: c.remaining > 0 }"
        :style="{ background: bg(c.remaining) }"
        :title="`${c.month + 1}月 待回款 ${fmtWan(c.remaining)}万 · ${c.count}笔`"
        v-activate="c.remaining > 0"
        @click="c.remaining > 0 && emit('select', c.month)"
      >
        <span class="cyh-m">{{ c.month + 1 }}月</span>
        <span class="cyh-amt">{{ fmtWan(c.remaining) }}万</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cyh { margin-bottom: 14px; }
.cyh-title { font-size: var(--fs-2); font-weight: 700; color: var(--txt); margin-bottom: 6px; }
.cyh-row { display: grid; grid-template-columns: repeat(12, 1fr); gap: 4px; }
.cyh-cell { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 8px 2px; border: 1px solid var(--line); border-radius: 8px; color: var(--txt); }
.cyh-cell.hot { cursor: pointer; }
.cyh-cell.hot:hover { border-color: var(--accent); }
.cyh-cell.active { box-shadow: 0 0 0 2px var(--accent) inset; }
.cyh-m { font-size: var(--fs-1); color: var(--sub); }
.cyh-amt { font-size: var(--fs-1); font-weight: 700; }
</style>
