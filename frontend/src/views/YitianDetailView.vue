<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import YitianToolbar from '@/components/YitianToolbar.vue'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'
import ColumnFilter from '@/components/ColumnFilter.vue'
import ColumnPicker from '@/components/ColumnPicker.vue'
import { useYitianStore } from '@/stores/yitian'
import { useScopedYitian } from '@/composables/useScopedData'
import { useYitianViewStore } from '@/stores/yitianView'
import { useCrossFilterStore } from '@/stores/crossFilter'
import { applyColumnFilters, cfUniqueValues } from '@/lib/crossFilter'
import { useColumnPrefs } from '@/lib/useColumnPrefs'
import { usePersistentSort } from '@/lib/usePersistentSort'
import { useViewScrollMemory } from '@/lib/useViewScrollMemory'
import { userScopedKey } from '@/lib/userScopedKey'
import { exportSheets } from '@/lib/exportXlsx'
import {
  buildDetailRows, filterDetailRows, detailSummary, buildDetailSheetRows,
  ALL_COLUMNS, ALL_KEYS, DEFAULT_VISIBLE, FILTERABLE,
} from '@/lib/yitian/detail'
import { parseDetailDrill } from '@/lib/yitian/detailDrill'

const TABLE_ID = 'yitian-detail'
const store = useYitianStore()
const scopedYitian = useScopedYitian()
const view = useYitianViewStore()
const cf = useCrossFilterStore()

const onlyIssues = ref(false)
const prefs = useColumnPrefs(userScopedKey(TABLE_ID), ALL_KEYS, DEFAULT_VISIBLE)
const psort = usePersistentSort(userScopedKey(TABLE_ID))
useViewScrollMemory()

const ready = computed(() => !!store.data)
const rows = computed(() => (scopedYitian.value ? buildDetailRows(scopedYitian.value) : []))
const scoped = computed(() => filterDetailRows(rows.value, {
  start: view.start, end: view.end, l4s: view.l4s, onlyIssues: onlyIssues.value,
}))
const filtered = computed(() => applyColumnFilters(scoped.value, cf.tableFilters(TABLE_ID)) as typeof scoped.value)
const summary = computed(() => detailSummary(filtered.value))

const pickerColumns = computed(() => ALL_COLUMNS.map((c) => ({ key: c.key, label: c.label })))
const onToggle = prefs.makeToggle(cf, TABLE_ID)
const visibleColumns = computed<DataColumn[]>(() =>
  prefs.visibleKeys.value
    .map((k) => ALL_COLUMNS.find((c) => c.key === k))
    .filter((c): c is DataColumn => !!c))

const pageSize = ref(50)
const currentPage = ref(1)
const paged = computed(() => filtered.value.slice((currentPage.value - 1) * pageSize.value, currentPage.value * pageSize.value))
watch(filtered, () => { currentPage.value = 1 })

function onExport() {
  if (!filtered.value.length) { ElMessage.warning('无可导出数据'); return }
  exportSheets('工时明细.xlsx', [{ name: '工时明细', rows: buildDetailSheetRows(filtered.value, visibleColumns.value) }])
}

const route = useRoute()
const router = useRouter()

// 下钻落地:复刻 analytics/compliance 范式——ready 门控 + flush:'post' + nextTick 一次性 watcher,
// 避免 YitianToolbar 的 view.hydrate() 用 localStorage 历史区间覆盖掉刚设的下钻日期(见 analytics 注释)。
let drillApplied = false
function applyDrillLanding() {
  if (drillApplied) return
  const q = route.query
  if (!Object.keys(q).length) { drillApplied = true; return }
  drillApplied = true
  const d = parseDetailDrill(q)
  const setters: [string, string][] = []
  if (d.l4) setters.push(['l4', d.l4])
  if (d.emp) setters.push(['empId', d.emp]) // 隐藏键:按工号精确,避同名
  if (setters.length) {
    cf.clearAll(TABLE_ID)
    for (const [col, val] of setters) {
      cf.setColumnFilter(TABLE_ID, col, [val], cfUniqueValues(rows.value, col).length)
    }
  }
  if (d.start && d.end) { view.start = d.start; view.end = d.end }
  if (d.only) onlyIssues.value = true
  const rest: Record<string, any> = { ...route.query }
  delete rest.dL4; delete rest.dEmp; delete rest.dStart; delete rest.dEnd; delete rest.dOnly
  router.replace({ query: rest })
}
watch(ready, (r) => { if (r) nextTick(applyDrillLanding) }, { immediate: true, flush: 'post' })

onMounted(() => { store.load() })

defineExpose({ rows, scoped, filtered, paged, summary, onlyIssues, visibleColumns, onExport })
</script>

<template>
  <div class="yd-view">
    <h2 class="yd-title">工时明细</h2>
    <YitianToolbar v-if="ready" />

    <el-alert v-if="store.error" :title="store.error" type="error" show-icon :closable="false" />
    <el-skeleton v-else-if="store.loading && !ready" :rows="6" animated />
    <div v-else-if="ready && !rows.length" class="yd-empty">暂无工时数据——请在「数据管理」导入工时并点「更新数据」。</div>

    <template v-else-if="ready">
      <div class="yd-bar">
        <div class="yd-summary u-num">
          <span>共 {{ summary.count }} 条</span>
          <span>总工时 {{ summary.totalHours }}h</span>
          <span class="yd-tag yd-tag--ok">合规 {{ summary.ok }}</span>
          <span class="yd-tag yd-tag--warn">提示 {{ summary.warn }}</span>
          <span class="yd-tag yd-tag--danger">问题 {{ summary.issue }}</span>
        </div>
        <el-switch v-model="onlyIssues" active-text="仅看异常" size="small" />
        <ColumnPicker :columns="pickerColumns" :visible-keys="prefs.visibleKeys.value"
          @toggle="onToggle" @move-up="prefs.moveUp" @move-down="prefs.moveDown" @reset="prefs.reset" />
        <el-button size="small" @click="onExport">导出</el-button>
        <el-button v-if="cf.hasFilters(TABLE_ID)" size="small" style="margin-left:auto" @click="cf.clearAll(TABLE_ID)">清除所有筛选</el-button>
      </div>

      <div class="yd-scroll">
        <DataTable :columns="visibleColumns" :rows="paged" :show-count="false" clickable sticky-header
          :default-sort="psort.defaultSort.value" @sort-change="psort.onSortChange">
          <template v-for="col in visibleColumns" :key="col.key" #[`header-${col.key}`]="{ col: c }">
            <span class="yd-th">{{ c.label }}<ColumnFilter v-if="FILTERABLE.has(c.key)" :table-id="TABLE_ID" :col-key="c.key" :source-rows="scoped" /></span>
          </template>
          <template #cell-okText="{ row }">
            <span class="yd-badge" :class="`yd-badge--${row.ok}`">{{ row.okText }}</span>
          </template>
          <template #cell-issueReason="{ row }">
            <el-tooltip v-if="row.snippet" :content="row.snippet" placement="top">
              <span>{{ row.issueReason }}</span>
            </el-tooltip>
            <span v-else>{{ row.issueReason }}</span>
          </template>
        </DataTable>
      </div>

      <div class="yd-pager">
        <span class="yd-total u-num">共 {{ filtered.length }} 条</span>
        <el-pagination v-model:current-page="currentPage" v-model:page-size="pageSize"
          :page-sizes="[20, 50, 80, 100]" :total="filtered.length"
          layout="sizes, prev, pager, next" size="small" background />
      </div>
    </template>
  </div>
</template>

<style scoped>
.yd-view { display: flex; flex-direction: column; gap: var(--gap-section); padding: var(--sp-4); }
.yd-title { font-size: var(--fs-4); font-weight: 700; color: var(--txt); margin: 0; }
.yd-empty { color: var(--mut); font-size: var(--fs-2); padding: var(--sp-3) 0; }
.yd-bar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--gap-stack); }
.yd-summary { display: flex; flex-wrap: wrap; align-items: center; gap: var(--gap-stack); font-size: var(--fs-2); color: var(--sub); }
.yd-tag { padding: 2px var(--sp-2); border-radius: var(--r-sm); font-size: var(--fs-1); }
.yd-tag--ok { background: var(--ok-bg); color: var(--ok-text); }
.yd-tag--warn { background: var(--warn-bg); color: var(--warn-text); }
.yd-tag--danger { background: var(--danger-bg); color: var(--danger-text); }
.yd-scroll { overflow-x: auto; }
.yd-th { display: inline-flex; align-items: center; gap: 4px; }
.yd-badge { padding: 2px var(--sp-2); border-radius: var(--r-sm); font-size: var(--fs-1); }
.yd-badge--0 { background: var(--mut-bg, transparent); color: var(--sub); }
.yd-badge--1 { background: var(--warn-bg); color: var(--warn-text); }
.yd-badge--2 { background: var(--danger-bg); color: var(--danger-text); }
.yd-pager { display: flex; align-items: center; gap: var(--gap-stack); }
.yd-total { font-size: var(--fs-1); color: var(--mut); }
</style>
