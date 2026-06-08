<script setup lang="ts">
import type { DeptStat } from '@/lib/followup'

const props = defineProps<{
  index: number
  stat: DeptStat
  max: { d7: number; d15: number; d30: number; delay: number }
}>()

const emit = defineEmits<{ expand: [{ dept: string; timeWin: string }] }>()

const BARS = [
  { key: 'd7', flw: 'd7flw', color: 'var(--c-urgent)' },
  { key: 'd15', flw: 'd15flw', color: 'var(--c-pending)' },
  { key: 'd30', flw: 'd30flw', color: 'var(--accent)' },
  { key: 'delay', flw: 'delayFlw', color: 'var(--danger)' },
] as const

const rate = (s: DeptStat) => (s.total > 0 ? Math.round((s.flw / s.total) * 100) : 0)
const barW = (v: number, mx: number) => (mx > 0 ? Math.round((v / mx) * 100) : 0)
const rankColor = (i: number) => (i === 0 ? 'var(--danger)' : i === 1 ? 'var(--c-pending)' : 'var(--mut)')
const rateColor = (r: number) => (r >= 80 ? 'var(--c-paid)' : r >= 50 ? 'var(--c-pending)' : 'var(--danger)')
const val = (b: { key: string }) => (props.stat as Record<string, any>)[b.key] as number
const flwVal = (b: { flw: string }) => ((props.stat as Record<string, any>)[b.flw] as number) || 0
const maxVal = (b: { key: string }) => (props.max as Record<string, any>)[b.key] as number
</script>

<template>
  <div class="sig-row">
    <div class="sig-rank" :style="{ color: rankColor(index) }">{{ index + 1 }}</div>
    <div v-activate class="sig-dept clickable" @click="emit('expand', { dept: stat.name, timeWin: '' })">
      <div class="sig-dept-name">{{ stat.name }}</div>
      <div class="sig-dept-count">共{{ stat.total }}个项目</div>
    </div>
    <div class="sig-bars">
      <div
        v-for="b in BARS"
        :key="b.key"
        v-activate
        class="sig-bar-group clickable"
        @click="emit('expand', { dept: stat.name, timeWin: b.key })"
      >
        <div class="sig-bar-line">
          <div class="sig-bar-wrap">
            <div class="sig-bar-fill" :style="{ width: barW(val(b), maxVal(b)) + '%', background: b.color }"></div>
          </div>
          <span class="sig-bar-num" :style="{ color: b.color }">{{ val(b) }}</span>
        </div>
        <div class="sig-bar-sub">已跟进{{ flwVal(b) }}/待跟进{{ val(b) - flwVal(b) }}个</div>
      </div>
    </div>
    <div class="sig-rate" :style="{ color: rateColor(rate(stat)) }">{{ rate(stat) }}%</div>
  </div>
</template>

<style scoped>
.sig-row { display: grid; grid-template-columns: 40px 160px 1fr 70px; gap: 12px; align-items: center; padding: 10px 14px; border-bottom: 1px solid var(--line); }
.sig-rank { text-align: center; font-weight: 800; font-size: 15px; }
.sig-dept-name { font-weight: 700; font-size: 13px; color: var(--txt); }
.sig-dept-count { font-size: 11px; color: var(--mut); }
.sig-bars { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.sig-bar-group { display: flex; flex-direction: column; gap: 2px; }
.sig-bar-line { display: flex; align-items: center; gap: 8px; }
.sig-bar-wrap { flex: 1; height: 8px; background: var(--line); border-radius: 4px; overflow: hidden; }
.sig-bar-fill { height: 100%; border-radius: 4px; }
.sig-bar-num { font-weight: 800; font-size: 13px; min-width: 22px; text-align: right; }
.sig-bar-sub { font-size: 11px; color: var(--mut); text-align: center; }
.sig-rate { text-align: center; font-weight: 800; font-size: 14px; }
.clickable { cursor: pointer; }
.clickable:hover { background: var(--card2); border-radius: 6px; }
</style>
