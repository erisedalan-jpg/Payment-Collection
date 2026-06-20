<script setup lang="ts">
import { ref, watch, toRef } from 'vue'
import ColumnFilter from './ColumnFilter.vue'
import { fmtYuan, fmtRatio } from '@/lib/format'
import { usePagedRows } from '@/lib/usePagedRows'

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
}>()

const { paged, currentPage, pageSize } = usePagedRows(toRef(props, 'projects'), 50)

const expandedIdx = ref(-1)
// 忠实移植 filterLedger 的 _expandedLedgerIdx=-1：过滤导致数据集变化时收起下钻
watch(
  () => props.projects,
  () => {
    expandedIdx.value = -1
  },
)
// 翻页时收起已展开行（expandedIdx 是当前页内索引，跨页须复位避免串位）
watch(currentPage, () => {
  expandedIdx.value = -1
})
function toggle(idx: number) {
  expandedIdx.value = expandedIdx.value === idx ? -1 : idx
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
        <template v-for="(p, idx) in paged" :key="p.projectId">
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
                <div v-if="(p.nodes || []).length" class="lt-nodes">
                  <div class="lt-nodes-title">回款节点明细 ({{ p.nodes.length }})</div>
                  <table class="lt-node-table">
                    <thead>
                      <tr>
                        <th>阶段</th><th>计划日期</th><th>已收(元)</th><th>未收(元)</th><th>实际比例</th><th>状态</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="(n, ni) in p.nodes" :key="ni">
                        <td>{{ n.stage || '-' }}</td>
                        <td>{{ n.planDate || '-' }}</td>
                        <td>{{ fmtYuan(n.receivedAmount) }}</td>
                        <td>{{ fmtYuan(n.unpaidAmount) }}</td>
                        <td>{{ fmtRatio(n.actualRatio, '待上报') }}</td>
                        <td>{{ n.status }}</td>
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
    <div class="lt-foot">
      <span class="lt-count">共 {{ projects.length }} 条记录</span>
      <el-pagination
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        :page-sizes="[20, 50, 80, 100]"
        :total="projects.length"
        layout="sizes, prev, pager, next"
        size="small"
        background
      />
    </div>
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
.lt-foot { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3); flex-wrap: wrap; padding: var(--sp-2) 0; }
.lt-count { font-size: 12px; color: var(--mut); }
</style>
