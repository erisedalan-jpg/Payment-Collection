<script setup lang="ts">
import type { PivotResult } from '@/lib/pivot'

const props = defineProps<{
  pivot: PivotResult<unknown>
  format: (v: number) => string
}>()
const emit = defineEmits<{ 'cell-click': [{ rowKey: string; colKey: string }] }>()

function has(rowKey: string, colKey: string): boolean {
  return !!props.pivot.index[rowKey]?.[colKey]
}
</script>

<template>
  <div class="pv-wrap">
    <table class="pv">
      <thead>
        <tr>
          <th v-for="(rl, i) in pivot.rowDimLabels" :key="'rl' + i" class="pv-rowdim">{{ rl }}</th>
          <th v-for="c in pivot.cols" :key="c.key" class="pv-colhead" :title="c.label">{{ c.label }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(r, ri) in pivot.rows" :key="r.key">
          <th v-for="(tv, ti) in r.tuple" :key="ti" class="pv-rowval" :title="tv">{{ tv }}</th>
          <td
            v-for="(c, ci) in pivot.cols"
            :key="c.key"
            class="pv-cell"
            :class="{ 'pv-click': has(r.key, c.key), 'pv-zero': !has(r.key, c.key) }"
            v-activate="has(r.key, c.key)"
            @click="has(r.key, c.key) && emit('cell-click', { rowKey: r.key, colKey: c.key })"
          >
            {{ format(pivot.cells[ri][ci]) }}
          </td>
        </tr>
      </tbody>
    </table>
    <div v-if="!pivot.rows.length" class="pv-empty">暂无数据</div>
  </div>
</template>

<style scoped>
.pv-wrap { overflow-x: auto; }
.pv { border-collapse: collapse; font-size: var(--fs-2); width: 100%; }
.pv th, .pv td { border: 1px solid var(--line); padding: 6px 10px; white-space: nowrap; }
.pv-rowdim { background: var(--card2); color: var(--mut); text-align: left; font-weight: 600; }
.pv-colhead { background: var(--card2); color: var(--sub); font-weight: 600; text-align: right; }
.pv-rowval { background: var(--card2); color: var(--txt); text-align: left; font-weight: 600; max-width: 160px; overflow: hidden; text-overflow: ellipsis; }
.pv-cell { text-align: right; color: var(--txt); }
.pv-click { cursor: pointer; }
.pv-click:hover { background: color-mix(in srgb, var(--accent) 10%, transparent); }
.pv-zero { color: var(--mut); }
.pv-empty { color: var(--mut); padding: 16px; text-align: center; }
</style>
