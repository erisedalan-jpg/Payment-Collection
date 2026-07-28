<script setup lang="ts">
import { computed, onMounted } from 'vue'
import PageHeader from '@/components/PageHeader.vue'
import AppCard from '@/components/AppCard.vue'
import SectionTitle from '@/components/SectionTitle.vue'
import MetricGrid from '@/components/MetricGrid.vue'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'
import YitianToolbar from '@/components/YitianToolbar.vue'
import { useYitianStore } from '@/stores/yitian'
import { useYitianViewStore } from '@/stores/yitianView'
import { useScopedYitian } from '@/composables/useScopedData'
import { selectCpEntries, type CpFilter } from '@/lib/yitian/customerProduct'
import { presaleHintByL4, unattributedByWorkType, calibStat, pmShare } from '@/lib/yitian/governance'

// tab 条由 AppLayout 按 route.meta.tabGroup 统一渲染,页面不得自绘(与 YitianCustomerProductView 同)。

const store = useYitianStore()
const scoped = useScopedYitian()
const view = useYitianViewStore()

onMounted(() => { view.hydrate(); store.load() })

const ready = computed(() => !!store.data)

const filter = computed<CpFilter>(() => ({
  start: view.start, end: view.end, l4s: view.l4s,
  prodCats: view.prodCats, types: view.types, mgrMode: view.mgrMode,
}))

const rows = computed(() => (scoped.value ? selectCpEntries(scoped.value, filter.value) : []))

// B-5① 收 CpFilter(遍历 issues 而非 entries,自己走筛选);另三个收已筛好的 entries。
// 签名不同是刻意的,勿统一。
const hintRows = computed(() => (scoped.value ? presaleHintByL4(scoped.value, filter.value) : []))
const unattrRows = computed(() => (scoped.value ? unattributedByWorkType(scoped.value, rows.value) : []))
const calib = computed(() => (scoped.value
  ? calibStat(scoped.value, rows.value)
  : { raw: 0, calibrated: 0, ambiguous: 0, unmatched: 0, pending: 0, rate: null }))
const pmL4 = computed(() => (scoped.value ? pmShare(scoped.value, rows.value, 'l4') : []))
const pmEmp = computed(() => (scoped.value ? pmShare(scoped.value, rows.value, 'emp') : []))

const fmtH = (v: unknown) => (typeof v === 'number' ? Math.round(v).toLocaleString() : '')
const fmtPct = (v: unknown) => (v === null || v === undefined ? '-' : `${Math.round(Number(v) * 100)}%`)

/** 三个异常指标卡。数值越大越该关注,故一律走 warn 色(为 0 时不上色)。 */
const abnormalKpi = computed(() => {
  const hint = hintRows.value.reduce((s, r) => s + r.count, 0)
  const unattrH = unattrRows.value.reduce((s, r) => s + r.hours, 0)
  const unattrC = unattrRows.value.reduce((s, r) => s + r.count, 0)
  const c = calib.value
  return [
    { k: '售前服务类未关联产品', v: String(hint), sub: '条(产品线填「其他」)',
      cls: hint ? 'warn' : '' },
    { k: '客户不可归属', v: String(Math.round(unattrH)), sub: `h · ${unattrC} 条`,
      cls: unattrH ? 'warn' : '' },
    { k: '产品线校准覆盖率', v: c.rate === null ? '-' : `${Math.round(c.rate * 100)}%`,
      sub: c.pending ? `已校准 ${c.calibrated} / 待校准 ${c.pending}` : '无待校准记录' },
  ]
})

const HINT_COLS: DataColumn[] = [
  { key: 'l4', label: 'L4 组织', width: 160 },
  { key: 'count', label: '条数', width: 100, num: true, sortable: true },
  { key: 'hours', label: '工时', width: 110, num: true, sortable: true, formatter: fmtH },
]
const UNATTR_COLS: DataColumn[] = [
  { key: 'workType3', label: '工作类型三', width: 160 },
  { key: 'count', label: '条数', width: 100, num: true, sortable: true },
  { key: 'hours', label: '工时', width: 110, num: true, sortable: true, formatter: fmtH },
]
const PM_L4_COLS: DataColumn[] = [
  { key: 'name', label: 'L4 组织', width: 160 },
  { key: 'total', label: '客户类工时', width: 130, num: true, sortable: true, formatter: fmtH },
  { key: 'pm', label: '项目管理工时', width: 130, num: true, sortable: true, formatter: fmtH },
  { key: 'share', label: '占比', width: 100, num: true, sortable: true, formatter: fmtPct },
]
const PM_EMP_COLS: DataColumn[] = [
  { key: 'name', label: '员工', width: 120 },
  { key: 'total', label: '客户类工时', width: 130, num: true, sortable: true, formatter: fmtH },
  { key: 'pm', label: '项目管理工时', width: 130, num: true, sortable: true, formatter: fmtH },
  { key: 'share', label: '占比', width: 100, num: true, sortable: true, formatter: fmtPct },
]

defineExpose({ rows, hintRows, unattrRows, calib, pmL4, pmEmp, abnormalKpi })
</script>

<template>
  <div class="ygv-page">
    <PageHeader title="工时治理监控" />
    <YitianToolbar v-if="ready" />

    <AppCard v-if="store.error"><p class="ygv-err">{{ store.error }}</p></AppCard>
    <el-skeleton v-else-if="store.loading && !ready" :rows="6" animated />
    <template v-else>
      <AppCard variant="default">
        <SectionTitle level="section" class="ygv-h">异常指标监控</SectionTitle>
        <p class="ygv-note">
          看的是「某类填报习惯的总量」，不是待整改的单条问题 ——
          单条合规判定见「合规检查」页。三项数值越大，「可转移非原厂」的结论水分越大。
        </p>
        <MetricGrid :items="abnormalKpi" col-min="200px" />
      </AppCard>

      <AppCard variant="default">
        <SectionTitle level="section" class="ygv-h">售前服务类工时未关联产品</SectionTitle>
        <p class="ygv-note">项目类型含「售前服务」、工作类型三非项目管理类、且产研侧产品线填「其他」。</p>
        <DataTable :columns="HINT_COLS" :rows="hintRows" />
      </AppCard>

      <AppCard variant="default">
        <SectionTitle level="section" class="ygv-h">客户不可归属</SectionTitle>
        <p class="ygv-note">
          客户字段为空或填了占位词，该条工时无法归属真实客户 → 客户象限判不出 →
          对「可转移非原厂」是结论盲区。
        </p>
        <DataTable :columns="UNATTR_COLS" :rows="unattrRows" />
      </AppCard>

      <AppCard variant="default">
        <SectionTitle level="section" class="ygv-h">项目管理工时概况</SectionTitle>
        <p class="ygv-note">分母 = 客户类工时（项目类/售前类/售后类），分子 = 带项目管理标签的工时。</p>
        <SectionTitle level="section" class="ygv-h ygv-t2">按 L4 组织</SectionTitle>
        <div data-test="ygv-pm-l4">
          <DataTable :columns="PM_L4_COLS" :rows="pmL4" />
        </div>
        <SectionTitle level="section" class="ygv-h ygv-t2">按员工</SectionTitle>
        <div data-test="ygv-pm-emp">
          <DataTable :columns="PM_EMP_COLS" :rows="pmEmp" />
        </div>
      </AppCard>
    </template>
  </div>
</template>

<style scoped>
.ygv-page { display: flex; flex-direction: column; gap: var(--gap-section); padding: var(--sp-4); }
/* 字号/字重/色已收归 SectionTitle(section 级);这里只留布局属性 */
.ygv-h { margin-bottom: var(--gap-stack); }
.ygv-err { margin: 0; color: var(--danger-text); }
.ygv-note { margin: 0 0 var(--sp-3); font-size: var(--fs-1); color: var(--mut); }
.ygv-t2 { margin-top: var(--sp-4); }
</style>
