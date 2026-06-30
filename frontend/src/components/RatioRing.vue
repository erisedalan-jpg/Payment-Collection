<script setup lang="ts">
import { computed } from 'vue'
import { fmtRatio } from '@/lib/format'

const props = withDefaults(defineProps<{
  ratio: number | null
  label?: string
  size?: number
  thickness?: number
  color?: string
}>(), { label: '', size: 96, thickness: 10, color: 'var(--accent)' })

const isNull = computed(() => props.ratio == null)
const deg = computed(() => Math.max(0, Math.min(1, props.ratio ?? 0)) * 360)
const ringStyle = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  background: isNull.value
    ? 'var(--line)'
    : `conic-gradient(${props.color} ${deg.value}deg, var(--line) 0)`,
}))
const holeStyle = computed(() => ({ inset: `${props.thickness}px` }))
const text = computed(() => fmtRatio(props.ratio))
const textColor = computed(() => (isNull.value ? 'var(--mut)' : props.color))
</script>

<template>
  <div class="ratio-ring" :style="ringStyle" role="img" :aria-label="`${label} ${text}`">
    <div class="ratio-ring-hole" :style="holeStyle">
      <div class="ratio-ring-val u-num" :style="{ color: textColor }">{{ text }}</div>
      <div v-if="label" class="ratio-ring-label">{{ label }}</div>
    </div>
  </div>
</template>

<style scoped>
.ratio-ring { position: relative; border-radius: var(--r-full); flex: none; }
.ratio-ring-hole { position: absolute; background: var(--card); border-radius: var(--r-full); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; }
.ratio-ring-val { font-size: var(--fs-5); font-weight: 700; line-height: var(--lh-tight, 1.15); }
.ratio-ring-label { font-size: var(--fs-1); color: var(--mut); }
</style>
