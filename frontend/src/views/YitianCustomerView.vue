<script setup lang="ts">
import { computed, onMounted } from 'vue'
import YitianToolbar from '@/components/YitianToolbar.vue'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'
import MetricGrid from '@/components/MetricGrid.vue'
import ChartBox from '@/charts/ChartBox.vue'
import { useYitianStore } from '@/stores/yitian'
import { useYitianViewStore } from '@/stores/yitianView'
import { top1000ByL4, bgSupport } from '@/lib/yitian/customer'

const store = useYitianStore()
const view = useYitianViewStore()

onMounted(() => { store.load() })

const ready = computed(() => !!store.data)

function hrs(v: number): string {
  return v.toFixed(1)
}
function pct(v: number): string {
  return (v * 100).toFixed(1) + '%'
}

const topRows = computed(() => {
  if (!store.data) return []
  return top1000ByL4(store.data, view.start, view.end, view.l4s).map((r) => ({
    ...r,
    hoursText: hrs(r.hours),
    topHoursText: hrs(r.topHours),
    pctText: pct(r.pct),
  }))
})

const topCols: DataColumn[] = [
  { key: 'l4', label: 'L4 组织', width: 150 },
  { key: 'hoursText', label: '客户类总工时', width: 130, num: true, sortable: true },
  { key: 'topHoursText', label: 'TOP1000 工时', width: 130, num: true, sortable: true },
  { key: 'pctText', label: 'TOP1000 占比', width: 130, num: true, sortable: true },
  { key: 'topCustomers', label: 'TOP1000 客户数', width: 140, num: true, sortable: true },
]

const bg = computed(() =>
  store.data ? bgSupport(store.data, view.start, view.end, view.l4s)
             : { thisBg: 0, crossBg: 0, thisPct: 0, crossPct: 0, total: 0 })

const bgMetrics = computed(() => [
  { k: '本 BG 工时', v: hrs(bg.value.thisBg), sub: pct(bg.value.thisPct) },
  { k: '跨 BG 工时', v: hrs(bg.value.crossBg), sub: pct(bg.value.crossPct), cls: 'warn' },
  { k: '合计（项目类+售前类）', v: hrs(bg.value.total) },
])

const bgOption = computed(() => ({
  tooltip: { trigger: 'item', valueFormatter: (v: number) => `${v} h` },
  legend: { bottom: 0 },
  series: [{
    type: 'pie',
    radius: ['45%', '70%'],
    data: [
      { name: '本 BG', value: Number(bg.value.thisBg.toFixed(1)) },
      { name: '跨 BG', value: Number(bg.value.crossBg.toFixed(1)) },
    ],
    label: { formatter: '{b} {d}%' },
  }],
}))

defineExpose({ topRows, bg })
</script>

<template>
  <div class="yt-page">
    <YitianToolbar v-if="ready" />

    <el-alert v-if="store.error" :title="store.error" type="error" show-icon :closable="false" />
    <el-skeleton v-else-if="store.loading && !ready" :rows="6" animated />

    <template v-if="ready">
      <section class="yt-card">
        <h3 class="yt-h">TOP1000 大客户支持<span class="yt-sub">（仅项目类 / 售前类 / 售后类）</span></h3>
        <DataTable :columns="topCols" :rows="topRows" :show-count="false" />
      </section>

      <section class="yt-card">
        <h3 class="yt-h">跨 BG 支持<span class="yt-sub">（仅项目类 / 售前类；本 BG 按销售 L2 组织判定）</span></h3>
        <MetricGrid :items="bgMetrics" col-min="200px" />
        <ChartBox :option="bgOption" height="280px" />
      </section>
    </template>
  </div>
</template>

<style scoped>
.yt-page { display: flex; flex-direction: column; gap: var(--gap-section); padding: var(--sp-4); }
.yt-card {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  padding: var(--card-pad);
  box-shadow: var(--shadow-1);
}
.yt-h { font-size: var(--fs-3); font-weight: 600; color: var(--txt); margin-bottom: var(--gap-stack); }
.yt-sub { font-size: var(--fs-1); font-weight: 400; color: var(--mut); margin-left: var(--sp-2); }
</style>
