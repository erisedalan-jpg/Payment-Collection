<script setup lang="ts">
import { computed, onMounted } from 'vue'
import YitianToolbar from '@/components/YitianToolbar.vue'
import MetricGrid from '@/components/MetricGrid.vue'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'
import ChartBox from '@/charts/ChartBox.vue'
import { useYitianStore } from '@/stores/yitian'
import { useYitianViewStore } from '@/stores/yitianView'
import { useYitianSettingsStore } from '@/stores/yitianSettings'
import { kpi, typeHours, orgSummary, selectEntries } from '@/lib/yitian/metrics'

const store = useYitianStore()
const view = useYitianViewStore()
const settings = useYitianSettingsStore()

onMounted(() => { store.load(); settings.load() })

const ready = computed(() => !!store.data)

const k = computed(() => (store.data
  ? kpi(store.data, view.start, view.end, view.l4s, settings.settings.excludedTypes)
  : null))

function pct(v: number | null | undefined): string {
  return v === null || v === undefined ? '-' : (v * 100).toFixed(1) + '%'
}
function hrs(v: number): string {
  return v.toFixed(1)
}

const metrics = computed(() => {
  const x = k.value
  if (!x) return []
  return [
    { k: '总工时', v: hrs(x.totalHours), sub: `人均基础 ${x.baseHours}h` },
    { k: '平均饱和度', v: pct(x.avgSat), sub: `补全后 ${pct(x.avgSatFilled)}` },
    { k: '未填人数', v: String(x.unfilledCount), sub: `其中一条未填 ${x.neverFilledCount} 人`,
      cls: x.unfilledCount > 0 ? 'danger' : undefined },
    { k: '加班人数', v: String(x.overtimeCount), sub: `累计 ${hrs(x.overtimeHours)}h` },
    { k: '合规率', v: pct(x.complianceRate), sub: `问题 ${x.issueCount} 条`,
      cls: x.complianceRate !== null && x.complianceRate < 0.9 ? 'warn' : 'ok' },
  ]
})

const typeRows = computed(() =>
  store.data ? typeHours(store.data, selectEntries(store.data, view.start, view.end, view.l4s)) : [])

const typeOption = computed(() => ({
  tooltip: { trigger: 'item' },
  legend: { bottom: 0 },
  series: [{
    type: 'pie',
    radius: ['45%', '70%'],
    data: typeRows.value.map((t) => ({ name: t.type, value: Number(t.hours.toFixed(1)) })),
    label: { formatter: '{b} {d}%' },
  }],
}))

const ORG_LEVEL_LABEL: Record<string, string> = { l3: 'L3', l31: 'L3-1', l4: 'L4' }

const orgCols: DataColumn[] = [
  { key: 'levelLabel', label: '层级', width: 80 },
  { key: 'name', label: '组织', width: 160 },
  { key: 'parent', label: '上级组织', width: 140 },
  { key: 'people', label: '人数', width: 90, num: true, sortable: true },
  { key: 'hoursText', label: '实际工时', width: 110, num: true, sortable: true },
  { key: 'baseText', label: '基础工时', width: 110, num: true },
  { key: 'satText', label: '饱和度', width: 110, num: true, sortable: true },
]

const orgRows = computed(() => {
  if (!store.data) return []
  return orgSummary(store.data, view.start, view.end, view.l4s).map((r) => ({
    ...r,
    levelLabel: ORG_LEVEL_LABEL[r.level] ?? r.level,
    hoursText: hrs(r.hours),
    baseText: hrs(r.base),
    satText: pct(r.sat),
  }))
})
</script>

<template>
  <div class="yt-page">
    <YitianToolbar v-if="ready" />

    <el-alert v-if="store.error" :title="store.error" type="error" show-icon :closable="false" />
    <el-skeleton v-else-if="store.loading && !ready" :rows="6" animated />

    <template v-if="ready">
      <MetricGrid :items="metrics" col-min="180px" />

      <div class="yt-grid">
        <section class="yt-card">
          <h3 class="yt-h">工时类型占比</h3>
          <ChartBox :option="typeOption" height="300px" />
        </section>

        <section class="yt-card">
          <h3 class="yt-h">分层汇总（L3 → L3-1 → L4）</h3>
          <DataTable :columns="orgCols" :rows="orgRows" :show-count="false" />
        </section>
      </div>
    </template>
  </div>
</template>

<style scoped>
.yt-page { display: flex; flex-direction: column; gap: var(--gap-section); }
.yt-grid { display: grid; grid-template-columns: minmax(320px, 1fr) minmax(480px, 2fr); gap: var(--gap-card); }
@media (max-width: 1200px) { .yt-grid { grid-template-columns: 1fr; } }
.yt-card {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  padding: var(--card-pad);
  box-shadow: var(--shadow-1);
}
.yt-h { font-size: var(--fs-3); font-weight: 600; color: var(--txt); margin-bottom: var(--gap-stack); }
</style>
