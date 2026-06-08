<script setup lang="ts">
import { ref, watch } from 'vue'
import ColumnFilter from './ColumnFilter.vue'
import { getNodeRemaining } from '@/lib/riskGroups'
import { fmtYuan, fmtRatio } from '@/lib/format'

interface LedgerCol {
  key: string
  label: string
  formatter?: (value: any, row: Record<string, any>) => string
}

const props = defineProps<{
  tableId: string
  projects: Record<string, any>[]
  columns: LedgerCol[]
  sourceRows: Record<string, any>[]
  rawNodes: Record<string, any>[]
}>()

const expandedIdx = ref(-1)
// 忠实移植 filterLedger 的 _expandedLedgerIdx=-1：过滤导致数据集变化时收起下钻
watch(
  () => props.projects,
  () => {
    expandedIdx.value = -1
  },
)
function toggle(idx: number) {
  expandedIdx.value = expandedIdx.value === idx ? -1 : idx
}
function projNodes(projectId: string) {
  return props.rawNodes.filter((n) => n.projectId === projectId && n.isPaymentRelated)
}
function cell(row: Record<string, any>, col: LedgerCol) {
  return col.formatter ? col.formatter(row[col.key], row) : String(row[col.key] ?? '-')
}
</script>

<template>
  <div class="ledger-table-wrap">
    <table class="ledger-table">
      <thead>
        <tr>
          <th v-for="col in columns" :key="col.key">
            <span class="th-label">{{ col.label }}</span>
            <ColumnFilter :table-id="tableId" :col-key="col.key" :source-rows="sourceRows" />
          </th>
        </tr>
      </thead>
      <tbody>
        <template v-for="(p, idx) in projects.slice(0, 500)" :key="p.projectId">
          <tr v-activate class="lt-row" :class="{ expanded: expandedIdx === idx }" @click="toggle(idx)">
            <td v-for="col in columns" :key="col.key" :title="String(p[col.key] ?? '')">
              {{ cell(p, col) }}
            </td>
          </tr>
          <tr v-if="expandedIdx === idx" class="lt-detail-row">
            <td :colspan="columns.length">
              <div class="lt-detail">
                <div class="lt-detail-title">
                  {{ p.projectName || p.projectId }}
                  <span class="lt-detail-id">项目编号: {{ p.projectId }}</span>
                </div>
                <div v-if="projNodes(p.projectId).length" class="lt-nodes">
                  <div class="lt-nodes-title">回款节点明细 ({{ projNodes(p.projectId).length }})</div>
                  <table class="lt-node-table">
                    <thead>
                      <tr>
                        <th>节点</th><th>计划日期</th><th>待回款(元)</th><th>实际比例</th><th>状态</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="(n, ni) in projNodes(p.projectId)" :key="ni">
                        <td>{{ n.milestone || n.stageName || n.nodeName || '-' }}</td>
                        <td>{{ n.planDate || '-' }}</td>
                        <td>{{ fmtYuan(getNodeRemaining(n)) }}</td>
                        <td>{{ fmtRatio(n.actualPaymentRatio, '待上报') }}</td>
                        <td>{{ n.nodeStatus }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div v-else class="lt-nodes-empty">无回款节点</div>
              </div>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
    <div class="lt-count">共 {{ projects.length }} 条记录</div>
  </div>
</template>

<style scoped>
.ledger-table-wrap { overflow-x: auto; }
.ledger-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.ledger-table th,
.ledger-table td {
  border: 1px solid var(--line);
  padding: 6px 8px;
  text-align: left;
  white-space: nowrap;
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ledger-table th { background: var(--card2); color: var(--sub); font-weight: 600; }
.lt-row { cursor: pointer; }
.lt-row:hover { background: var(--card2); }
.lt-row.expanded { background: color-mix(in srgb, var(--accent) 12%, transparent); }
.lt-detail-row > td { background: var(--card2); white-space: normal; max-width: none; }
.lt-detail { padding: 14px; border: 2px solid color-mix(in srgb, var(--accent) 12%, transparent); border-radius: 8px; background: var(--card); }
.lt-detail-title { font-weight: 700; color: var(--txt); margin-bottom: 10px; }
.lt-detail-id { margin-left: 12px; font-size: 12px; color: var(--mut); font-weight: 400; }
.lt-nodes-title { font-weight: 700; color: var(--accent); font-size: 13px; margin-bottom: 8px; }
.lt-node-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.lt-node-table th { background: var(--line); }
.lt-nodes-empty { color: var(--mut); font-size: 12px; }
.lt-count { font-size: 12px; color: var(--mut); padding: 6px 0; }
</style>
