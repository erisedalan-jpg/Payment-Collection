<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import YitianToolbar from '@/components/YitianToolbar.vue'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'
import MetricGrid from '@/components/MetricGrid.vue'
import RatioRing from '@/components/RatioRing.vue'
import ChartBox from '@/charts/ChartBox.vue'
import { useYitianStore } from '@/stores/yitian'
import { useYitianViewStore } from '@/stores/yitianView'
import { useYitianSettingsStore } from '@/stores/yitianSettings'
import { issueRows, countByCode, countByL4, issueHeatmap, ISSUE_LABELS, type IssueHeatmap } from '@/lib/yitian/compliance'
import { kpi } from '@/lib/yitian/metrics'
import { STATUS_LIGHT, STATUS_DARK, STRUCT_LIGHT, STRUCT_DARK } from '@/charts/echartsTheme'
import { useSettingsStore } from '@/stores/settings'
import { exportRows } from '@/lib/exportXlsx'

const store = useYitianStore()
const view = useYitianViewStore()
const settings = useYitianSettingsStore()
const themeStore = useSettingsStore()

onMounted(() => { store.load(); settings.load() })

// 图表 option 里显式写死的颜色不随 ChartBox 主题色板联动,须自己按主题选浅/暗两套镜像常量(不新增颜色)。
const pal = computed(() => themeStore.theme === 'dark'
  ? { status: STATUS_DARK, struct: STRUCT_DARK }
  : { status: STATUS_LIGHT, struct: STRUCT_LIGHT })

const ready = computed(() => !!store.data)
const codeFilter = ref<string[]>([])

// excludedTypes 必须传进去,否则超管在 /data 剔除某类型后,总览/趋势页的问题数变了,
// 这里仍原样列出,两页口径漂移(I-7)。
const allRows = computed(() =>
  store.data ? issueRows(store.data, view.start, view.end, view.l4s, settings.settings.excludedTypes) : [])

const codeDist = computed(() => countByCode(allRows.value))
const l4Dist = computed(() => countByL4(allRows.value))
const heatmap = computed(() => issueHeatmap(allRows.value))

const codeOptions = computed(() =>
  codeDist.value.map((c) => ({ value: c.code, label: `${c.label} (${c.count})` })))

const rows = computed(() => {
  const keep = new Set(codeFilter.value)
  const src = keep.size
    ? allRows.value.filter((r) => r.codes.some((c) => keep.has(c)))
    : allRows.value
  return src.map((r) => ({
    ...r,
    okText: r.ok === 2 ? '问题' : '提示',
    issueText: r.msgs.length ? r.msgs.join('；') : r.codes.map((c) => ISSUE_LABELS[c] ?? c).join('；'),
  }))
})

// 健康带:合规率环 + 三项计数卡(均取自 issueRows 派生,与问题明细同源,不会对不上)。
const k = computed(() => (store.data
  ? kpi(store.data, view.start, view.end, view.l4s, settings.settings.excludedTypes)
  : null))
const complianceRatio = computed(() => k.value?.complianceRate ?? null)

const healthMetrics = computed(() => {
  const r = allRows.value
  return [
    { k: '总问题数', v: String(r.length) },
    { k: '问题人次', v: String(new Set(r.map((x) => x.empId)).size) },
    { k: '涉及组织数', v: String(new Set(r.map((x) => x.l4)).size) },
  ]
})

/** 问题分布横向柱:按码前缀上色,HINT_=warn(提示),其余=danger(问题),与旧 pill 列表语义一致(M-5)。 */
function codeBarOption(codes: { label: string; code: string; count: number }[]) {
  const rows2 = [...codes].sort((a, b) => a.count - b.count)
  const status = pal.value.status
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 8, right: 24, top: 8, bottom: 24, containLabel: true },
    xAxis: { type: 'value' },
    yAxis: { type: 'category', data: rows2.map((r) => r.label) },
    series: [{
      type: 'bar',
      data: rows2.map((r) => ({
        value: r.count,
        itemStyle: { color: r.code.startsWith('HINT_') ? status.warn : status.danger },
      })),
    }],
  }
}
const codeBarChartOption = computed(() => codeBarOption(codeDist.value))
const codeBarHeight = computed(() => `${Math.max(240, codeDist.value.length * 32 + 96)}px`)

/** 问题按 L4 组织分布横向柱:与 codeBarOption 同构,无问题码前缀语义,走主题默认色。 */
function l4BarOption(rows2: { l4: string; count: number }[]) {
  const sorted = [...rows2].sort((a, b) => a.count - b.count)
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 8, right: 24, top: 8, bottom: 24, containLabel: true },
    xAxis: { type: 'value' },
    yAxis: { type: 'category', data: sorted.map((r) => r.l4) },
    series: [{ type: 'bar', data: sorted.map((r) => r.count) }],
  }
}
const l4BarChartOption = computed(() => l4BarOption(l4Dist.value))
const l4BarHeight = computed(() => `${Math.max(240, l4Dist.value.length * 32 + 96)}px`)

/** 问题码 × L4 热力图,色阶三档全取已导出 echarts 主题常量(按当前主题挑浅/暗那一套),不新增颜色。 */
function heatmapOption(h: IssueHeatmap) {
  const { status, struct } = pal.value
  return {
    tooltip: { position: 'top' },
    grid: { left: 8, right: 8, top: 8, bottom: 60, containLabel: true },
    xAxis: { type: 'category', data: h.l4s, axisLabel: { interval: 0, rotate: 30 } },
    yAxis: { type: 'category', data: h.codes.map((c) => c.label) },
    visualMap: {
      min: 0, max: Math.max(1, h.max), calculable: true, orient: 'horizontal', left: 'center', bottom: 0,
      inRange: { color: [struct.card, status.warn, status.danger] },
    },
    series: [{ type: 'heatmap', data: h.cells, label: { show: true } }],
  }
}
const heatmapChartOption = computed(() => heatmapOption(heatmap.value))
const heatmapHeight = computed(() => `${Math.max(320, heatmap.value.codes.length * 40 + 140)}px`)

const cols: DataColumn[] = [
  { key: 'date', label: '工作日', width: 110, sortable: true },
  { key: 'empName', label: '员工', width: 90, sortable: true },
  { key: 'l4', label: 'L4 组织', width: 130, sortable: true },
  { key: 'type', label: '工时类型', width: 100, sortable: true },
  { key: 'hours', label: '工时', width: 80, num: true, sortable: true },
  { key: 'customer', label: '客户', width: 160 },
  { key: 'workOrder', label: '工单编号', width: 140 },
  { key: 'okText', label: '状态', width: 80, sortable: true },
  { key: 'issueText', label: '问题', width: 320, wrap: true },
  { key: 'snippet', label: '工作成果摘要', width: 360, wrap: true },
]

function onExport() {
  // 既有签名是 exportRows(filename, rows) —— 文件名在前,别写反
  exportRows(
    `倚天工时合规问题_${view.start}_${view.end}.xlsx`,
    rows.value.map((r) => ({
      工作日: r.date, 员工: r.empName, L4组织: r.l4, 工时类型: r.type, 工时: r.hours,
      客户: r.customer, 工单编号: r.workOrder, 状态: r.okText, 问题: r.issueText, 工作成果摘要: r.snippet,
    })),
  )
}

defineExpose({ codeFilter, rows, codeDist, codeBarChartOption })
</script>

<template>
  <div class="yt-page">
    <YitianToolbar v-if="ready" />

    <el-alert v-if="store.error" :title="store.error" type="error" show-icon :closable="false" />
    <el-skeleton v-else-if="store.loading && !ready" :rows="6" animated />

    <template v-if="ready">
      <div class="yt-kpi-row">
        <MetricGrid :items="healthMetrics" col-min="180px" class="yt-kpi-grid" />
        <div class="yt-ring-card">
          <RatioRing :ratio="complianceRatio" label="合规率" :size="140" />
        </div>
      </div>

      <section class="yt-card">
        <div class="yt-head">
          <h3 class="yt-h">问题分布</h3>
          <div class="yt-actions">
            <el-select v-model="codeFilter" multiple collapse-tags clearable placeholder="全部问题类型"
              class="yt-code">
              <el-option v-for="o in codeOptions" :key="o.value" :label="o.label" :value="o.value" />
            </el-select>
            <el-button @click="onExport">导出</el-button>
          </div>
        </div>
        <div v-if="!codeDist.length" class="yt-empty">本区间无合规问题</div>
        <ChartBox v-else :option="codeBarChartOption" :height="codeBarHeight" />
      </section>

      <section class="yt-card">
        <h3 class="yt-h">问题按 L4 组织分布</h3>
        <div v-if="!l4Dist.length" class="yt-empty">本区间无合规问题</div>
        <ChartBox v-else :option="l4BarChartOption" :height="l4BarHeight" />
      </section>

      <section class="yt-card">
        <h3 class="yt-h">问题码 × L4 热力图</h3>
        <div v-if="!heatmap.codes.length" class="yt-empty">本区间无合规问题</div>
        <ChartBox v-else :option="heatmapChartOption" :height="heatmapHeight" />
      </section>

      <section class="yt-card">
        <h3 class="yt-h">问题明细</h3>
        <DataTable :columns="cols" :rows="rows" sticky-header />
      </section>
    </template>
  </div>
</template>

<style scoped>
.yt-page { display: flex; flex-direction: column; gap: var(--gap-section); padding: var(--sp-4); }
.yt-kpi-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: stretch; gap: var(--gap-card); }
@media (max-width: 768px) { .yt-kpi-row { grid-template-columns: 1fr; } }
.yt-kpi-grid { min-width: 0; }
.yt-ring-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--sp-2);
  min-width: 200px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  padding: var(--card-pad);
}
.yt-card {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  padding: var(--card-pad);
  box-shadow: var(--shadow-1);
}
.yt-head { display: flex; justify-content: space-between; align-items: center; gap: var(--gap-stack); flex-wrap: wrap; }
.yt-actions { display: flex; gap: var(--gap-stack); align-items: center; }
.yt-code { min-width: 240px; }
.yt-h { font-size: var(--fs-3); font-weight: 600; color: var(--txt); margin-bottom: var(--gap-stack); }
.yt-empty { color: var(--mut); font-size: var(--fs-2); padding: var(--sp-3) 0; }
</style>
