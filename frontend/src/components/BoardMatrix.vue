<script setup lang="ts">
import type { CrossMatrix } from '@/lib/pivot'

const props = defineProps<{
  matrix: CrossMatrix<unknown>
  rowLabel: string
  colLabel: string
  format: (v: number) => string
}>()
const emit = defineEmits<{ 'cell-click': [{ row: string; col: string }] }>()

function has(row: string, col: string): boolean {
  return !!props.matrix.index[row]?.[col]
}
</script>

<template>
  <div class="bm-wrap">
    <table class="bm">
      <thead>
        <tr>
          <th class="bm-corner">{{ rowLabel }} \ {{ colLabel }}</th>
          <th v-for="c in matrix.cols" :key="c" class="bm-colhead" :title="c">{{ c }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(rv, ri) in matrix.rows" :key="rv">
          <th class="bm-rowhead" :title="rv">{{ rv }}</th>
          <td
            v-for="(cv, ci) in matrix.cols"
            :key="cv"
            class="bm-cell"
            :class="{ 'bm-click': has(rv, cv), 'bm-zero': !has(rv, cv) }"
            v-activate="has(rv, cv)"
            @click="has(rv, cv) && emit('cell-click', { row: rv, col: cv })"
          >
            {{ format(matrix.cells[ri][ci]) }}
          </td>
        </tr>
      </tbody>
    </table>
    <div v-if="!matrix.rows.length" class="bm-empty">暂无数据</div>
  </div>
</template>

<style scoped>
.bm-wrap { overflow-x: auto; }
.bm { border-collapse: collapse; font-size: var(--fs-2); width: 100%; }
.bm th, .bm td { border: 1px solid var(--line); padding: 6px 10px; white-space: nowrap; }
.bm-corner { background: var(--card2); color: var(--mut); text-align: left; font-weight: 600; position: sticky; left: 0; }
.bm-colhead { background: var(--card2); color: var(--sub); font-weight: 600; }
.bm-rowhead { background: var(--card2); color: var(--txt); text-align: left; font-weight: 600; position: sticky; left: 0; max-width: 160px; overflow: hidden; text-overflow: ellipsis; }
.bm-cell { text-align: right; color: var(--txt); }
.bm-click { cursor: pointer; }
.bm-click:hover { background: color-mix(in srgb, var(--accent) 10%, transparent); }
.bm-zero { color: var(--mut); }
.bm-empty { color: var(--mut); padding: 16px; text-align: center; }
</style>
