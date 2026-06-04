<script setup lang="ts">
import ColumnFilter from './ColumnFilter.vue'
import { formatCellValue } from '@/lib/cellFormat'
import { fmtWan, pct } from '@/lib/format'
import type { PlanBoardDef, BoardStats } from '@/lib/planBoards'

defineProps<{
  board: PlanBoardDef
  tableId: string
  nodes: Record<string, any>[]
  stats: BoardStats
  columns: { key: string; label: string }[]
  sourceRows: Record<string, any>[]
  group: string[]
}>()

const rateColor = (r: number) => (r >= 0.8 ? '#10b981' : r >= 0.5 ? '#f59e0b' : '#ef4444')
</script>

<template>
  <div class="plan-board">
    <div class="pb-header" :style="{ background: board.color }">{{ board.label }}</div>
    <div class="pb-stats">
      <div class="ps"><div class="ps-label">节点总数</div><div class="ps-val">{{ stats.count }}</div></div>
      <div class="ps"><div class="ps-label">节点计划回款金额(万)</div><div class="ps-val" style="color:#3b82f6">{{ fmtWan(stats.totalExp) }}</div></div>
      <div class="ps"><div class="ps-label">节点已回款金额(万)</div><div class="ps-val" style="color:#10b981">{{ fmtWan(stats.totalAct) }}</div></div>
      <div class="ps"><div class="ps-label">节点待回款金额(万)</div><div class="ps-val" :style="{ color: stats.remaining > 0 ? '#ef4444' : '#10b981' }">{{ fmtWan(stats.remaining) }}</div></div>
      <div class="ps"><div class="ps-label">节点完成率</div><div class="ps-val" :style="{ color: rateColor(stats.rate) }">{{ pct(stats.rate) }}</div></div>
    </div>
    <div class="pb-table-wrap">
      <table class="pb-table">
        <thead>
          <tr>
            <th v-for="col in columns" :key="col.key">
              <span class="th-label">{{ col.label }}</span>
              <ColumnFilter
                :table-id="tableId"
                :col-key="col.key"
                :source-rows="sourceRows"
                :group="group"
              />
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(n, i) in nodes.slice(0, 100)" :key="i">
            <td v-for="col in columns" :key="col.key" :title="String(n[col.key] ?? '')">
              {{ formatCellValue(n[col.key], col.key) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="pb-footer">共 {{ stats.count }} 条记录</div>
  </div>
</template>

<style scoped>
.plan-board {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 16px;
}
.pb-header {
  color: #fff;
  font-weight: 700;
  font-size: 14px;
  padding: 8px 14px;
}
.pb-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid #f1f5f9;
}
.ps-label {
  font-size: 12px;
  color: #64748b;
}
.ps-val {
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}
.pb-table-wrap {
  overflow-x: auto;
}
.pb-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.pb-table th,
.pb-table td {
  border: 1px solid #f1f5f9;
  padding: 6px 8px;
  text-align: left;
  white-space: nowrap;
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pb-table th {
  background: #f8fafc;
  color: #475569;
  font-weight: 600;
}
.pb-footer {
  font-size: 12px;
  color: #94a3b8;
  padding: 6px 14px;
}
</style>
