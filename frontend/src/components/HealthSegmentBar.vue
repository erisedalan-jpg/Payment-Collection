<script setup lang="ts">
import { computed } from 'vue'

interface Seg { key: string; label: string; count: number; color: string; to?: string }
const props = withDefaults(defineProps<{
  segments: Seg[]
  height?: number
  minSegmentPct?: number
}>(), { height: 14, minSegmentPct: 4 })

const shown = computed(() => props.segments.filter((s) => s.count > 0))
const total = computed(() => shown.value.reduce((sum, s) => sum + s.count, 0))
const widths = computed<Record<string, number>>(() => {
  const t = total.value
  const m: Record<string, number> = {}
  for (const s of shown.value) {
    const raw = t > 0 ? (s.count / t) * 100 : 0
    m[s.key] = Math.max(raw, props.minSegmentPct)
  }
  return m
})
</script>

<template>
  <div class="hsb">
    <div class="hsb-bar" :style="{ height: `${height}px` }">
      <div v-for="s in shown" :key="s.key" class="hsb-seg"
        :style="{ width: `${widths[s.key]}%`, background: s.color }" :title="`${s.label} ${s.count}`"></div>
    </div>
    <div class="hsb-legend">
      <component :is="s.to ? 'RouterLink' : 'span'" v-for="s in shown" :key="s.key"
        class="hsb-leg" :class="{ 'hsb-leg--link': s.to }" :to="s.to">
        <span class="hsb-dot" :style="{ background: s.color }"></span>
        <span class="hsb-leg-label">{{ s.label }}</span>
        <b class="hsb-leg-count u-num">{{ s.count }}</b>
      </component>
    </div>
  </div>
</template>

<style scoped>
.hsb { display: flex; flex-direction: column; gap: var(--sp-2); }
.hsb-bar { display: flex; width: 100%; border-radius: var(--r-full); overflow: hidden; background: var(--line); }
.hsb-seg { height: 100%; }
.hsb-legend { display: flex; flex-wrap: wrap; gap: var(--sp-4); }
.hsb-leg { display: inline-flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-1); color: var(--sub); text-decoration: none; }
.hsb-leg--link { cursor: pointer; padding: 0 var(--sp-1); border-radius: var(--r-sm); }
.hsb-leg--link:hover { background: var(--hover-tint); }
.hsb-dot { width: 10px; height: 10px; border-radius: var(--r-full); flex: none; }
.hsb-leg-label { color: var(--sub); }
.hsb-leg-count { font-size: var(--fs-4); font-weight: 700; color: var(--txt); }
</style>
