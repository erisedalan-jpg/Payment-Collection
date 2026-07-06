<script setup lang="ts">
import { ref } from 'vue'
import type { ProfitRow } from '@/types/analysis'
import { DEFAULT_OPEN, hasChildren, visibleRows, isRateRow } from '@/lib/profitTree'
import { fmtYuan, fmtRatio } from '@/lib/format'

// 预算核算科目树(R2 spec §3):列=预算/概算/核算(budget_data)/实际发生/剩余/消耗率;毛利率行按比率格式化
const props = defineProps<{ rows: ProfitRow[] }>()
const open = ref(new Set(DEFAULT_OPEN))
function toggle(code: string) {
  const s = new Set(open.value)
  if (s.has(code)) s.delete(code)
  else s.add(code)
  open.value = s
}
const money = (r: ProfitRow, v: number | null | undefined) => (isRateRow(r) ? fmtRatio(v) : fmtYuan(v))
</script>

<template>
  <table class="pt-table">
    <thead>
      <tr><th>科目</th><th>预算(元)</th><th>概算(元)</th><th>核算(元)</th><th>实际发生(元)</th><th>剩余(元)</th><th>消耗率</th></tr>
    </thead>
    <tbody>
      <tr v-for="r in visibleRows(props.rows, open)" :key="r.code + r.name" :class="`pt-l${r.level ?? 1}`">
        <td class="pt-name" :style="{ paddingLeft: `calc(var(--sp-3) + ${(r.level ?? 1) - 1} * 16px)` }">
          <button v-if="hasChildren(props.rows, r)" class="pt-toggle" :class="{ open: open.has(r.code) }" @click="toggle(r.code)">▾</button>
          <span>{{ r.code }} {{ r.name }}</span>
        </td>
        <td class="u-num">{{ money(r, r.budget) }}</td>
        <td class="u-num">{{ money(r, r.estimate) }}</td>
        <td class="u-num">{{ money(r, r.final) }}</td>
        <td class="u-num">{{ money(r, r.actual) }}</td>
        <td class="u-num" :class="{ 'pt-neg': !isRateRow(r) && (r.remaining ?? 0) < 0 }">{{ money(r, r.remaining) }}</td>
        <td class="u-num">{{ fmtRatio(r.rate) }}</td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
.pt-table { width: 100%; border-collapse: collapse; font-size: var(--fs-2); }
.pt-table th, .pt-table td { padding: var(--sp-2) var(--sp-3); text-align: right; border-bottom: 1px solid var(--line); color: var(--txt); }
.pt-table th { color: var(--sub); font-weight: 600; font-size: var(--fs-1); }
.pt-table th:first-child, .pt-table td:first-child { text-align: left; }
.pt-l1 { font-weight: 700; background: var(--card2); }
.pt-l2 { font-weight: 600; }
.pt-l3 { color: var(--sub); }
.pt-toggle { background: none; border: none; cursor: pointer; color: var(--mut); padding: 0 var(--sp-1); transition: transform var(--dur-1) var(--ease); display: inline-block; }
.pt-toggle:not(.open) { transform: rotate(-90deg); }
.pt-neg { color: var(--danger-text); }
</style>
