<script setup lang="ts">
import type { QualityRow, Severity } from '@/lib/dataQuality'

defineProps<{ rows: QualityRow[] }>()
const emit = defineEmits<{ drill: [{ checkIdx: number; tierIdx: number }] }>()

const TIER_LABELS = ['100万以上', '50-100万', '50万以下']
const sevColor = (s: Severity) => (s === 'h' ? 'var(--danger)' : s === 'm' ? 'var(--c-pending)' : 'var(--mut)')
const cellColor = (count: number, s: Severity) => (count > 0 ? sevColor(s) : 'var(--c-paid)')
</script>

<template>
  <table class="dq-table">
    <thead>
      <tr>
        <th>检查项</th>
        <th v-for="t in TIER_LABELS" :key="t" class="c">{{ t }}</th>
        <th class="c">合计</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="(r, ci) in rows" :key="r.key">
        <td>
          <span class="dq-dot" :style="{ background: sevColor(r.severity) }"></span>{{ r.name }}
        </td>
        <td
          v-for="(v, ti) in r.byTier"
          :key="ti"
          class="dq-cell c"
          :class="{ clickable: v > 0 }"
          :style="{ color: cellColor(v, r.severity) }"
          v-activate="v > 0"
          @click="v > 0 && emit('drill', { checkIdx: ci, tierIdx: ti })"
        >
          {{ v }}
        </td>
        <td
          class="dq-cell c total"
          :class="{ clickable: r.total > 0 }"
          :style="{ color: cellColor(r.total, r.severity) }"
          v-activate="r.total > 0"
          @click="r.total > 0 && emit('drill', { checkIdx: ci, tierIdx: -1 })"
        >
          {{ r.total }}
        </td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
.dq-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.dq-table th, .dq-table td { border: 1px solid var(--line); padding: 8px 10px; }
.dq-table th { background: var(--card2); color: var(--sub); font-weight: 600; }
.dq-table th.c, .dq-cell.c { text-align: center; }
.dq-cell { font-family: var(--font-mono, monospace); font-weight: 700; }
.dq-cell.clickable { cursor: pointer; }
.dq-cell.clickable:hover { background: var(--card2); }
.dq-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 8px; vertical-align: middle; }
</style>
