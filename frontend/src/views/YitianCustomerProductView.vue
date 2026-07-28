<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import PageHeader from '@/components/PageHeader.vue'
import AppCard from '@/components/AppCard.vue'
import SectionTitle from '@/components/SectionTitle.vue'
import MetricGrid from '@/components/MetricGrid.vue'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'
import HeatmapTable from '@/components/HeatmapTable.vue'
import ChartBox from '@/charts/ChartBox.vue'
import YitianToolbar from '@/components/YitianToolbar.vue'
import { useYitianStore } from '@/stores/yitian'
import { useYitianViewStore } from '@/stores/yitianView'
import { useScopedYitian } from '@/composables/useScopedData'
import { transferBuckets } from '@/lib/yitian/derived'
import {
  selectCpEntries, custSupport, custList, top1000Coverage,
  custClassProductMatrix, orgProductMatrix, custProductCross, type CpFilter,
} from '@/lib/yitian/customerProduct'

// tab 条由 AppLayout 按 route.meta.tabGroup 统一渲染,页面不得自绘(与 YitianCustomerView 同)。

const CUST_TOP_N = 50      // B-2 默认行数(实测 953 个客户,全量渲染不可用)
const CROSS_TOP_N = 20     // A-4 图表客户数上限

const store = useYitianStore()
const scoped = useScopedYitian()
const view = useYitianViewStore()
const showAllCustomers = ref(false)

onMounted(() => { view.hydrate(); store.load() })

const ready = computed(() => !!store.data)

const filter = computed<CpFilter>(() => ({
  start: view.start, end: view.end, l4s: view.l4s,
  prodCats: view.prodCats, types: view.types, mgrMode: view.mgrMode,
}))

const rows = computed(() => (scoped.value ? selectCpEntries(scoped.value, filter.value) : []))

const kpi = computed(() => {
  const d = scoped.value
  if (!d) return []
  return transferBuckets(d, rows.value).map((b, i) => ({
    k: b.label,
    v: String(Math.round(b.hours)),
    sub: `${Math.round(b.pct * 100)}%`,
    cls: i === 4 ? 'ok' : i === 0 ? 'warn' : '',
  }))
})

const supportRows = computed(() => (scoped.value ? custSupport(scoped.value, rows.value) : []))
const coverageRows = computed(() => (scoped.value ? top1000Coverage(scoped.value, rows.value) : []))
const listRows = computed(() => (scoped.value
  ? custList(scoped.value, rows.value, showAllCustomers.value ? Number.MAX_SAFE_INTEGER : CUST_TOP_N)
  : []))
const EMPTY_MATRIX = { rows: [], cols: [], cells: [], rowTotals: [], colTotals: [], total: 0 }
const matrixCust = computed(() => (scoped.value
  ? custClassProductMatrix(scoped.value, rows.value)
  : EMPTY_MATRIX))
const matrixOrg = computed(() => (scoped.value
  ? orgProductMatrix(scoped.value, rows.value)
  : EMPTY_MATRIX))
const cross = computed(() => (scoped.value
  ? custProductCross(scoped.value, rows.value, CROSS_TOP_N)
  : { cols: [] as string[], rows: [] as { customer: string; cells: number[]; total: number }[] }))

const fmtH = (v: unknown) => (typeof v === 'number' ? Math.round(v).toLocaleString() : '')
const fmtPct = (v: unknown) => (v === null || v === undefined ? '-' : `${Math.round(Number(v) * 100)}%`)

const SUPPORT_COLS: DataColumn[] = [
  { key: 'custClass', label: '客户分类', width: 110 },
  { key: 'quad', label: '客户象限', width: 100 },
  { key: 'customers', label: '支持客户数', width: 110, num: true, sortable: true },
  { key: 'hours', label: '累计工时', width: 110, num: true, sortable: true, formatter: fmtH },
  { key: 'project', label: '项目类', width: 100, num: true, formatter: fmtH },
  { key: 'presale', label: '售前类', width: 100, num: true, formatter: fmtH },
  { key: 'postsale', label: '售后类', width: 100, num: true, formatter: fmtH },
]

const COVERAGE_COLS: DataColumn[] = [
  { key: 'bg', label: '市场BG', width: 120 },
  { key: 'named', label: '指名客户数', width: 110, num: true, sortable: true },
  { key: 'supported', label: '实际支持', width: 100, num: true, sortable: true },
  { key: 'coverage', label: '支持覆盖率', width: 110, num: true, sortable: true, formatter: fmtPct },
  { key: 'hours', label: '累计工时', width: 110, num: true, sortable: true, formatter: fmtH },
  { key: 'project', label: '项目类', width: 100, num: true, formatter: fmtH },
  { key: 'presale', label: '售前类', width: 100, num: true, formatter: fmtH },
  { key: 'postsale', label: '售后类', width: 100, num: true, formatter: fmtH },
]

const LIST_COLS: DataColumn[] = [
  { key: 'customer', label: '客户名称', width: 240 },
  { key: 'custClass', label: '客户分类', width: 110 },
  { key: 'quad', label: '客户象限', width: 100 },
  { key: 'hours', label: '累计工时', width: 110, num: true, sortable: true, formatter: fmtH },
  { key: 'project', label: '项目类', width: 100, num: true, formatter: fmtH },
  { key: 'presale', label: '售前类', width: 100, num: true, formatter: fmtH },
  { key: 'postsale', label: '售后类', width: 100, num: true, formatter: fmtH },
  { key: 'topProducts', label: '主要支持产品', width: 320, wrap: true },
]

/** A-4:横轴产品大类、按客户分组的堆叠柱。客户已按工时降序取前 20。 */
const crossOption = computed(() => ({
  tooltip: { trigger: 'axis' },
  legend: { type: 'scroll' },
  grid: { left: 8, right: 8, bottom: 8, top: 40, containLabel: true },
  xAxis: { type: 'category', data: cross.value.rows.map((r) => r.customer),
           axisLabel: { interval: 0, rotate: 40, width: 90, overflow: 'truncate' } },
  yAxis: { type: 'value', name: '工时' },
  series: cross.value.cols.map((c, ci) => ({
    name: c, type: 'bar', stack: 'total',
    data: cross.value.rows.map((r) => r.cells[ci]),
  })),
}))

defineExpose({ rows, kpi, supportRows, coverageRows, listRows, matrixCust, matrixOrg, cross })
</script>

<template>
  <div class="ycp-page">
    <PageHeader title="客户与产品分析" />
    <YitianToolbar v-if="ready" />

    <AppCard v-if="store.error"><p class="ycp-err">{{ store.error }}</p></AppCard>
    <el-skeleton v-else-if="store.loading && !ready" :rows="6" animated />
    <template v-else>
      <AppCard variant="default">
        <SectionTitle level="section" class="ycp-h">可转移非原厂支持</SectionTitle>
        <p class="ycp-note">
          随上方筛选联动。口径边界见「工时总览」页的数据就绪度卡：
          TOP1000 清单不全会让「可转移」偏高。
        </p>
        <MetricGrid :items="kpi" col-min="170px" />
      </AppCard>

      <AppCard variant="default">
        <SectionTitle level="section" class="ycp-h">客户支持情况</SectionTitle>
        <DataTable :columns="SUPPORT_COLS" :rows="supportRows" />
      </AppCard>

      <AppCard variant="default">
        <SectionTitle level="section" class="ycp-h">TOP1000 大客户支持覆盖度</SectionTitle>
        <p class="ycp-note">
          指名客户数取自 TOP1000 清单全量，不随筛选变；实际支持数与工时随筛选变。
        </p>
        <DataTable :columns="COVERAGE_COLS" :rows="coverageRows" />
      </AppCard>

      <AppCard variant="default">
        <SectionTitle level="section" class="ycp-h">客户支持清单</SectionTitle>
        <div class="ycp-bar">
          <span class="ycp-note ycp-note--inline">
            共 {{ listRows.length }} 行{{ showAllCustomers ? '（全部）' : `（工时前 ${CUST_TOP_N}）` }}
          </span>
          <el-switch v-model="showAllCustomers" active-text="显示全部" data-test="ycp-showall" />
        </div>
        <DataTable :columns="LIST_COLS" :rows="listRows" />
      </AppCard>

      <AppCard variant="default">
        <SectionTitle level="section" class="ycp-h">客户分级 × 产品大类</SectionTitle>
        <HeatmapTable :matrix="matrixCust" row-label="客户分级" :display-mode="view.displayMode" />
      </AppCard>

      <AppCard variant="default">
        <SectionTitle level="section" class="ycp-h">L4 组织 × 产品大类</SectionTitle>
        <p class="ycp-note">与上表行维度不同：上表看「哪档客户消耗哪类产品」，本表看「哪个组在做哪类产品」。</p>
        <HeatmapTable :matrix="matrixOrg" row-label="L4 组织" :display-mode="view.displayMode" />
      </AppCard>

      <AppCard variant="default">
        <SectionTitle level="section" class="ycp-h">客户 × 产品交叉</SectionTitle>
        <p class="ycp-note">按累计工时取前 {{ CROSS_TOP_N }} 个客户。</p>
        <ChartBox :option="crossOption" height="420px" />
      </AppCard>
    </template>
  </div>
</template>

<style scoped>
.ycp-page { display: flex; flex-direction: column; gap: var(--gap-section); padding: var(--sp-4); }
/* 字号/字重/色已收归 SectionTitle(section 级);这里只留布局属性 */
.ycp-h { margin-bottom: var(--gap-stack); }
.ycp-err { margin: 0; color: var(--danger-text); }
.ycp-note { margin: 0 0 var(--sp-3); font-size: var(--fs-1); color: var(--mut); }
.ycp-note--inline { margin: 0; }
.ycp-bar { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3); margin-bottom: var(--sp-3); }
</style>
