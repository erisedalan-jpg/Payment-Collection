<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useOpportunitiesStore } from '@/stores/opportunities'
import { useCrossFilterStore } from '@/stores/crossFilter'
import { applyColumnFilters } from '@/lib/crossFilter'
import { useColumnPrefs } from '@/lib/useColumnPrefs'
import { OPP_COLUMNS, DEFAULT_VISIBLE, FILTERABLE, recentUpdateOf } from '@/lib/opportunityColumns'
import type { OppColumn } from '@/lib/opportunityColumns'
import ColumnPicker from '@/components/ColumnPicker.vue'
import ColumnFilter from '@/components/ColumnFilter.vue'
import StatusBadge from '@/components/StatusBadge.vue'

const TABLE_ID = 'opportunities'
const auth = useAuthStore()
const store = useOpportunitiesStore()
const cf = useCrossFilterStore()
cf.clearAll(TABLE_ID)

onMounted(() => {
  if (!store.loaded) store.load()
})

const now = new Date()

// 选列
const prefs = useColumnPrefs(TABLE_ID, OPP_COLUMNS.map((c) => c.key), DEFAULT_VISIBLE)
const visibleColumns = computed(() =>
  prefs.visibleKeys.value
    .map((k) => OPP_COLUMNS.find((c) => c.key === k))
    .filter((c): c is OppColumn => !!c),
)
const pickerColumns = OPP_COLUMNS.map((c) => ({ key: c.key, label: c.label }))

function onToggle(key: string) {
  if (prefs.visibleKeys.value.includes(key)) cf.clearColumn(TABLE_ID, key)
  prefs.toggle(key)
}

// 派生注入：在过滤前注入 recentUpdate，使其可筛/可排/可导出
const withDerived = computed(() =>
  store.rows.map((r) => ({
    ...r,
    recentUpdate: recentUpdateOf((r as any).lastUpdate || '', now),
  })),
)

// 数据流水线
const fKw = ref('')

const afterColumnFilter = computed(() =>
  applyColumnFilters(withDerived.value, cf.tableFilters(TABLE_ID)) as Record<string, any>[],
)

const filtered = computed(() => {
  const kw = fKw.value.trim()
  if (!kw) return afterColumnFilter.value
  return afterColumnFilter.value.filter(
    (r) =>
      String(r.customer || '').includes(kw) ||
      String(r.name || '').includes(kw) ||
      String(r.salesOwner || '').includes(kw),
  )
})

// 全局排序
const sortState = ref<{ prop: string; order: '' | 'asc' | 'desc' }>({ prop: '', order: '' })

function onSortChange({ prop, order }: { prop: string | null; order: string | null }) {
  sortState.value = {
    prop: prop || '',
    order: order === 'ascending' ? 'asc' : order === 'descending' ? 'desc' : '',
  }
}

const sorted = computed(() => {
  const { prop, order } = sortState.value
  if (!prop || !order) return filtered.value
  const dir = order === 'asc' ? 1 : -1
  const col = OPP_COLUMNS.find((c) => c.key === prop)
  const isNum = col?.type === 'number'
  return [...filtered.value].sort((a, b) => {
    const x = a[prop]
    const y = b[prop]
    if (isNum) return ((Number(x) || 0) - (Number(y) || 0)) * dir
    return String(x ?? '').localeCompare(String(y ?? ''), 'zh') * dir
  })
})

// 分页
const pageSize = ref(50)
const currentPage = ref(1)
const paged = computed(() =>
  sorted.value.slice((currentPage.value - 1) * pageSize.value, currentPage.value * pageSize.value),
)
watch(filtered, () => {
  currentPage.value = 1
})

// 行选择（超管）
const selectedRows = ref<Record<string, any>[]>([])
function onSel(rows: Record<string, any>[]) {
  selectedRows.value = rows
}

// 格式化单元格
function fmtCell(col: OppColumn, row: Record<string, any>): string {
  const v = row[col.key]
  if (col.type === 'date') return (v || '').slice(0, 10) || '-'
  if (col.type === 'number') {
    if (v !== '' && v != null) return Number(v).toLocaleString('zh-CN', { maximumFractionDigits: 1 })
    return '-'
  }
  // text / select / auto
  return v ?? '-'
}

defineExpose({ store, filtered, paged, selectedRows, visibleColumns, fKw, sortState, auth, withDerived })
</script>

<template>
  <div class="opp-view">
    <h2 class="opp-title">重点商机进展</h2>

    <!-- 工具栏 -->
    <div class="opp-toolbar">
      <el-input
        v-model="fKw"
        size="small"
        placeholder="客户/商机/销售负责人"
        clearable
        style="width: 200px"
        data-test="opp-kw"
      />
      <ColumnPicker
        :columns="pickerColumns"
        :visible-keys="prefs.visibleKeys.value"
        @toggle="onToggle"
        @move-up="prefs.moveUp"
        @move-down="prefs.moveDown"
        @reset="prefs.reset"
      />
      <el-button
        v-if="cf.hasFilters(TABLE_ID)"
        size="small"
        style="margin-left: auto"
        @click="cf.clearAll(TABLE_ID)"
      >清除所有筛选</el-button>
    </div>

    <!-- 表格 -->
    <div class="opp-scroll">
      <el-table
        :data="paged"
        border
        style="width: 100%"
        @selection-change="onSel"
        @sort-change="onSortChange"
      >
        <!-- 选择列：超管专属 -->
        <el-table-column v-if="auth.isSuper" type="selection" width="48" />

        <!-- 动态列 -->
        <el-table-column
          v-for="col in visibleColumns"
          :key="col.key"
          :prop="col.key"
          :label="col.label"
          :width="col.width"
          :sortable="col.sortable ? 'custom' : false"
          :show-overflow-tooltip="!col.wrap"
        >
          <template #header>
            <span class="opp-th">
              {{ col.label }}
              <ColumnFilter
                v-if="FILTERABLE.has(col.key)"
                :table-id="TABLE_ID"
                :col-key="col.key"
                :source-rows="withDerived"
              />
            </span>
          </template>
          <template #default="{ row }">
            <template v-if="col.type === 'derived' && col.key === 'recentUpdate'">
              <StatusBadge
                :label="row.recentUpdate"
                :tone="row.recentUpdate === '是' ? 'ok' : 'mut'"
              />
            </template>
            <template v-else>
              {{ fmtCell(col, row) }}
            </template>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 分页条 -->
    <div class="opp-pager">
      <span class="u-num">共 {{ filtered.length }} 条</span>
      <el-pagination
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        :page-sizes="[20, 50, 80, 100]"
        :total="filtered.length"
        layout="sizes, prev, pager, next"
        size="small"
        background
      />
    </div>
  </div>
</template>

<style scoped>
.opp-view {
  padding: var(--sp-4);
}
.opp-title {
  font-size: var(--fs-4);
  font-weight: 700;
  color: var(--txt);
  margin: 0 0 var(--sp-3);
}
.opp-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2);
  margin-bottom: var(--sp-3);
}
.opp-scroll {
  overflow-x: auto;
}
.opp-th {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
}
.opp-pager {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  margin-top: var(--sp-3);
}
</style>
