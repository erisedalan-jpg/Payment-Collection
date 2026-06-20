<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useDataStore } from '@/stores/data'
import { useSettingsStore } from '@/stores/settings'
import type { Project, ProjectPmis } from '@/types/analysis'
import { buildCostRows, costKpis, costL4Dist, costL4Summary } from '@/lib/costAnalysis'
import { STATUS_LIGHT, STATUS_DARK } from '@/charts/echartsTheme'
import MetricGrid from '@/components/MetricGrid.vue'
import ChartBox from '@/charts/ChartBox.vue'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'
import { useRouter } from 'vue-router'
import { usePagedRows } from '@/lib/usePagedRows'
import { exportRows } from '@/lib/exportXlsx'
import StatusBadge from '@/components/StatusBadge.vue'

const data = useDataStore()
const settings = useSettingsStore()
onMounted(() => { if (!data.data) data.load() })

const sc = computed(() => (settings.theme === 'dark' ? STATUS_DARK : STATUS_LIGHT))
const rows = computed(() => buildCostRows(
  (data.data?.projects ?? []) as Project[],
  (data.data?.projectPmis ?? {}) as Record<string, ProjectPmis>,
))

const kpi = computed(() => costKpis(rows.value))
const kpiItems = computed(() => {
  const k = kpi.value
  return [
    { k: '成本统计项目数', v: String(k.total) },
    { k: '未超支', v: String(k.normal), cls: 'ok' },
    { k: '超支不足5K', v: String(k.under5k), cls: 'warn' },
    { k: '超支大于5K', v: String(k.over5k), cls: 'danger' },
  ]
})

const dist = computed(() => costL4Dist(rows.value))
const distOption = computed(() => {
  const d = dist.value, s = sc.value
  const lbl = { show: true, formatter: (p: any) => p.value || '' }
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { data: ['超支不足5k', '超支大于5k'], top: 0 },
    grid: { left: 56, right: 20, top: 36, bottom: 64 },
    xAxis: { type: 'category', data: d.map((x) => x.orgL4), axisLabel: { interval: 0, rotate: d.length > 6 ? 30 : 0, fontSize: 11, margin: 10 } },
    yAxis: { type: 'value', name: '超支项目数', nameLocation: 'middle', nameGap: 38, nameRotate: 90 },
    series: [
      { name: '超支不足5k', type: 'bar', stack: 't', color: s.warn, label: lbl, data: d.map((x) => x.under5k) },
      { name: '超支大于5k', type: 'bar', stack: 't', color: s.danger, label: lbl, data: d.map((x) => x.over5k) },
    ],
  }
})

const l4Rows = computed(() => costL4Summary(rows.value))
const L4_COLS: DataColumn[] = [
  { key: 'orgL4', label: 'L4部门', width: 140 },
  { key: 'total', label: '项目总数', width: 90, num: true },
  { key: 'normal', label: '未超支', width: 90, num: true },
  { key: 'under5k', label: '超支不足5k', width: 110, num: true },
  { key: 'over5k', label: '超支大于5k', width: 110, num: true },
  { key: 'over5kRatio', label: '超支占比', width: 100, num: true },
]

const router = useRouter()
const STATUS_OPTS = ['未超支', '超支不足5k', '超支大于5k']
const fL3 = ref<string[]>([])
const fL3_1 = ref<string[]>([])
const fL4 = ref<string[]>([])
const fStatus = ref<string[]>([])
const fType = ref<string[]>([])
const fManager = ref('')
const fKw = ref('')

const uniq = (key: 'orgL3' | 'orgL3_1' | 'orgL4' | 'projectType') =>
  computed(() => [...new Set(rows.value.map((r) => r[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b)))
const l3Opts = uniq('orgL3'); const l31Opts = uniq('orgL3_1'); const l4Opts = uniq('orgL4'); const typeOpts = uniq('projectType')

const TONE: Record<string, string> = { 未超支: 'ok', 超支不足5k: 'warn', 超支大于5k: 'danger' }
const filtered = computed(() => rows.value.filter((r) =>
  (fL3.value.length === 0 || fL3.value.includes(r.orgL3)) &&
  (fL3_1.value.length === 0 || fL3_1.value.includes(r.orgL3_1)) &&
  (fL4.value.length === 0 || fL4.value.includes(r.orgL4)) &&
  (fStatus.value.length === 0 || fStatus.value.includes(r.status)) &&
  (fType.value.length === 0 || fType.value.includes(r.projectType)) &&
  (!fManager.value || r.manager.includes(fManager.value)) &&
  (!fKw.value || r.projectId.includes(fKw.value) || r.projectName.includes(fKw.value)),
).sort((a, b) => a.orgL3.localeCompare(b.orgL3) || a.orgL3_1.localeCompare(b.orgL3_1) || a.orgL4.localeCompare(b.orgL4)))
const { paged, currentPage, pageSize } = usePagedRows(filtered, 20)
const pagedSeq = computed(() => paged.value.map((r, i) => ({ ...r, _seq: (currentPage.value - 1) * pageSize.value + i + 1 })))

const yuan = (v: any) => '¥' + Number(v || 0).toLocaleString('zh-CN')
const DETAIL_COLS: DataColumn[] = [
  { key: '_seq', label: '序号', width: 60, num: true },
  { key: 'projectId', label: '项目编号', width: 150 },
  { key: 'projectName', label: '项目名称', wrap: true },
  { key: 'projectType', label: '类型', width: 100 },
  { key: 'orgL3', label: 'L3部门', width: 110 },
  { key: 'orgL3_1', label: 'L3-1部门', width: 110 },
  { key: 'orgL4', label: 'L4部门', width: 110 },
  { key: 'manager', label: '项目经理', width: 90 },
  { key: 'amount', label: '项目金额', width: 130, num: true, formatter: yuan },
  { key: 'status', label: '成本状态', width: 110 },
  { key: 'totalBudget', label: '总预算(元)', width: 130, num: true, formatter: yuan },
  { key: 'actualCost', label: '已核算(元)', width: 130, num: true, formatter: yuan },
  { key: 'remaining', label: '剩余预算(元)', width: 140, num: true, formatter: yuan },
]
function reset() { fL3.value = []; fL3_1.value = []; fL4.value = []; fStatus.value = []; fType.value = []; fManager.value = ''; fKw.value = '' }
function onExport() {
  exportRows('项目成本明细.xlsx', filtered.value.map((r) => ({
    项目编号: r.projectId, 项目名称: r.projectName, 项目类型: r.projectType, L3部门: r.orgL3, 'L3-1部门': r.orgL3_1,
    L4部门: r.orgL4, 项目经理: r.manager, 项目金额: r.amount, 成本状态: r.status,
    总预算: r.totalBudget, 已核算: r.actualCost, 剩余预算: r.remaining,
  })))
}
function onRow(row: Record<string, any>) { router.push('/project/' + row.projectId) }
</script>

<template>
  <div class="cd-view">
    <h2 class="cd-title">成本分析</h2>

    <div v-if="!rows.length" class="cd-empty">暂无主域成本数据——请在「数据管理」提供 PMIS 文件后点「更新数据」。</div>

    <template v-else>
      <MetricGrid :items="kpiItems" :col-min="'160px'" />
      <div class="cd-grid2">
        <div class="cd-card"><div class="cd-card-h">超支项目分布(按 L4,剔 XS)</div><ChartBox :option="distOption" height="300px" /></div>
        <div class="cd-card"><div class="cd-card-h">L4 部门成本情况汇总</div><DataTable :columns="L4_COLS" :rows="l4Rows" :show-count="false">
          <template #cell-over5kRatio="{ row, value }"><span class="u-num" :class="row.over5k > 0 ? 'cd-red' : 'cd-green'">{{ value }}%</span></template>
        </DataTable></div>
      </div>
      <div class="cd-card">
        <div class="cd-card-h">项目成本明细(按 L4 组织排序)</div>
        <div class="cd-bar">
          <el-select v-model="fL3" size="small" multiple collapse-tags clearable placeholder="L3部门" style="width: 140px"><el-option v-for="o in l3Opts" :key="o" :value="o" :label="o" /></el-select>
          <el-select v-model="fL3_1" size="small" multiple collapse-tags clearable placeholder="L3-1部门" style="width: 140px"><el-option v-for="o in l31Opts" :key="o" :value="o" :label="o" /></el-select>
          <el-select v-model="fL4" size="small" multiple collapse-tags clearable placeholder="L4部门" style="width: 140px"><el-option v-for="o in l4Opts" :key="o" :value="o" :label="o" /></el-select>
          <el-select v-model="fStatus" size="small" multiple collapse-tags clearable placeholder="成本状态" style="width: 150px"><el-option v-for="o in STATUS_OPTS" :key="o" :value="o" :label="o" /></el-select>
          <el-select v-model="fType" size="small" multiple collapse-tags clearable placeholder="项目类型" style="width: 140px"><el-option v-for="o in typeOpts" :key="o" :value="o" :label="o" /></el-select>
          <el-input v-model="fManager" size="small" placeholder="项目经理" style="width: 110px" />
          <el-input v-model="fKw" size="small" placeholder="编号/名称" style="width: 130px" />
          <button class="cd-btn" @click="reset">重置</button>
          <button class="cd-btn" data-test="cost-export" @click="onExport">导出Excel</button>
        </div>
        <div class="cd-scroll">
          <DataTable :columns="DETAIL_COLS" :rows="pagedSeq" :show-count="false" clickable @row-click="onRow">
            <template #cell-projectId="{ value }"><span class="cd-link">{{ value }}</span></template>
            <template #cell-status="{ value }"><StatusBadge :label="value" :tone="TONE[value]" /></template>
            <template #cell-remaining="{ row, value }"><span class="u-num" :class="row.remaining < 0 ? 'cd-red' : 'cd-green'">{{ yuan(value) }}</span></template>
          </DataTable>
        </div>
        <div class="cd-pager">
          <span class="u-num">共 {{ filtered.length }} 条</span>
          <el-pagination v-model:current-page="currentPage" v-model:page-size="pageSize" :page-sizes="[20, 50, 100]" :total="filtered.length" layout="sizes, prev, pager, next" size="small" background />
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.cd-view { padding: var(--sp-4); }
.cd-title { font-size: var(--fs-4); font-weight: 700; color: var(--txt); margin: 0 0 var(--sp-3); }
.cd-grid2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(380px, 1fr)); gap: var(--gap-card); }
.cd-card { background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); padding: var(--sp-3); margin-bottom: var(--sp-3); }
.cd-card-h { font-size: var(--fs-2); font-weight: 600; color: var(--txt); margin-bottom: var(--sp-2); }
.cd-red { color: var(--danger); font-weight: 600; }
.cd-green { color: var(--ok); }
.cd-empty { color: var(--mut); padding: var(--sp-7) 0; text-align: center; background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); }
.cd-bar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-3); }
.cd-btn { padding: var(--sp-1) var(--sp-3); border: 1px solid var(--line2); border-radius: var(--r-sm); background: var(--card2); color: var(--sub); cursor: pointer; font-size: var(--fs-1); }
.cd-btn:hover { background: var(--bg); color: var(--accent); }
.cd-scroll { overflow-x: auto; }
.cd-link { color: var(--accent); cursor: pointer; }
.cd-pager { display: flex; align-items: center; gap: var(--sp-3); margin-top: var(--sp-3); }
</style>
