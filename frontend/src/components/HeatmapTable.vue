<script setup lang="ts">
import { computed } from 'vue'
import type { Matrix } from '@/lib/yitian/customerProduct'

const props = defineProps<{
  matrix: Matrix
  rowLabel: string
  displayMode: 'hours' | 'pct' | 'both'
}>()

/** 单元格文案。零值留白 —— 满屏的 0 比留白难读得多。 */
function cellText(v: number): string {
  if (!v) return ''
  const h = String(Math.round(v))
  const p = props.matrix.total ? `${Math.round((v / props.matrix.total) * 100)}%` : '0%'
  if (props.displayMode === 'hours') return h
  if (props.displayMode === 'pct') return p
  return `${h} · ${p}`
}

/** 底色深浅按「该格 / 全表最大格」派生,只用 --accent 的 alpha,不引入新色。
 *  文字恒 --txt:设计规范禁止实底 + 小号白字。 */
const maxCell = computed(() =>
  Math.max(0, ...props.matrix.cells.flatMap((r) => r)))

function cellStyle(v: number): Record<string, string> {
  if (!v || !maxCell.value) return {}
  const pct = Math.round((v / maxCell.value) * 60)   // 上限 60% 保证文字始终可读
  return { background: `color-mix(in srgb, var(--accent) ${pct}%, transparent)` }
}
</script>

<template>
  <div class="hm-wrap">
    <table class="hm">
      <thead>
        <tr>
          <th class="hm-rowhead">{{ rowLabel }}</th>
          <th v-for="c in matrix.cols" :key="c">{{ c }}</th>
          <th class="hm-total">合计</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(r, ri) in matrix.rows" :key="r">
          <td class="hm-rowhead">{{ r }}</td>
          <td v-for="(v, ci) in matrix.cells[ri]" :key="ci" class="u-num" data-test="hm-cell"
              :data-v="v" :style="cellStyle(v)">{{ cellText(v) }}</td>
          <td class="u-num hm-total">{{ cellText(matrix.rowTotals[ri]) }}</td>
        </tr>
        <tr v-if="matrix.rows.length" class="hm-foot">
          <td class="hm-rowhead">合计</td>
          <td v-for="(v, ci) in matrix.colTotals" :key="ci" class="u-num">{{ cellText(v) }}</td>
          <td class="u-num hm-total">{{ cellText(matrix.total) }}</td>
        </tr>
      </tbody>
    </table>
    <p v-if="!matrix.rows.length" class="hm-empty">本区间无数据</p>
  </div>
</template>

<style scoped>
/* 宽表必须自己横向滚动,页面 body 不得出现横向滚动条 */
.hm-wrap { overflow-x: auto; }
.hm { border-collapse: collapse; width: 100%; font-size: var(--fs-1); }
.hm th, .hm td {
  padding: var(--sp-2) var(--sp-3); border: 1px solid var(--line);
  text-align: right; white-space: nowrap; vertical-align: middle; color: var(--txt);
}
.hm th { font-weight: 600; color: var(--sub); background: var(--card2); }
.hm-rowhead { text-align: left; font-weight: 600; background: var(--card2); }
.hm-total { font-weight: 700; }
.hm-foot td { background: var(--card2); font-weight: 700; }
.hm-empty { margin: var(--sp-3) 0 0; color: var(--mut); font-size: var(--fs-1); }
</style>
