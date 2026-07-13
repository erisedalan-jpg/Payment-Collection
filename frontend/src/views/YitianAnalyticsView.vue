<script setup lang="ts">
import { computed, onMounted } from 'vue'
import YitianToolbar from '@/components/YitianToolbar.vue'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'
import { useYitianStore } from '@/stores/yitian'
import { useYitianViewStore } from '@/stores/yitianView'
import { empStats, saturationTop, unfilledList, neverFilledList, type EmpStat } from '@/lib/yitian/metrics'

const store = useYitianStore()
const view = useYitianViewStore()

onMounted(() => { store.load() })

const ready = computed(() => !!store.data)

function pct(v: number | null): string {
  return v === null ? '-' : (v * 100).toFixed(1) + '%'
}
function hrs(v: number): string {
  return v.toFixed(1)
}
function shape(s: EmpStat) {
  return {
    ...s,
    hoursText: hrs(s.hours),
    baseText: hrs(s.base),
    satText: pct(s.sat),
    diffText: (s.diff > 0 ? '+' : '') + hrs(s.diff),
  }
}

const stats = computed(() =>
  store.data ? empStats(store.data, view.start, view.end, view.l4s) : [])

const empRows = computed(() => stats.value.map(shape))
const topRows = computed(() => saturationTop(stats.value, 10).map(shape))
const unfilledRows = computed(() => unfilledList(stats.value).map(shape))
const neverRows = computed(() => neverFilledList(stats.value).map(shape))

const empCols: DataColumn[] = [
  { key: 'id', label: '工号', width: 100 },
  { key: 'name', label: '姓名', width: 90, sortable: true },
  { key: 'l31', label: 'L3-1', width: 110, sortable: true },
  { key: 'l4', label: 'L4 组织', width: 130, sortable: true },
  { key: 'hoursText', label: '实际工时', width: 110, num: true, sortable: true },
  { key: 'baseText', label: '基础工时', width: 110, num: true },
  { key: 'satText', label: '饱和度', width: 100, num: true, sortable: true },
  { key: 'diffText', label: '差值', width: 100, num: true, sortable: true },
]

const shortCols: DataColumn[] = [
  { key: 'name', label: '姓名', width: 90 },
  { key: 'l4', label: 'L4 组织', width: 130 },
  { key: 'hoursText', label: '实际工时', width: 100, num: true },
  { key: 'diffText', label: '差值', width: 100, num: true },
]

const neverCols: DataColumn[] = [
  { key: 'id', label: '工号', width: 100 },
  { key: 'name', label: '姓名', width: 90 },
  { key: 'l31', label: 'L3-1', width: 110 },
  { key: 'l4', label: 'L4 组织', width: 130 },
]

defineExpose({ empRows, topRows, unfilledRows, neverRows })
</script>

<template>
  <div class="yt-page">
    <YitianToolbar v-if="ready" />

    <el-alert v-if="store.error" :title="store.error" type="error" show-icon :closable="false" />
    <el-skeleton v-else-if="store.loading && !ready" :rows="6" animated />

    <template v-if="ready">
      <div class="yt-grid">
        <section class="yt-card">
          <h3 class="yt-h">饱和度 TOP10</h3>
          <DataTable :columns="shortCols" :rows="topRows" :show-count="false" />
        </section>

        <section class="yt-card">
          <h3 class="yt-h">未按时填写<span class="yt-sub">（有记录但工时不足）</span></h3>
          <div v-if="!unfilledRows.length" class="yt-empty">无</div>
          <DataTable v-else :columns="shortCols" :rows="unfilledRows" :show-count="false" />
        </section>

        <section class="yt-card">
          <h3 class="yt-h">完全未填<span class="yt-sub">（本区间一条记录都没有）</span></h3>
          <div v-if="!neverRows.length" class="yt-empty">无</div>
          <DataTable v-else :columns="neverCols" :rows="neverRows" :show-count="false" />
        </section>
      </div>

      <section class="yt-card">
        <h3 class="yt-h">员工工时明细</h3>
        <DataTable :columns="empCols" :rows="empRows" />
      </section>
    </template>
  </div>
</template>

<style scoped>
.yt-page { display: flex; flex-direction: column; gap: var(--gap-section); padding: var(--sp-4); }
.yt-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: var(--gap-card); }
.yt-card {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  padding: var(--card-pad);
  box-shadow: var(--shadow-1);
}
.yt-h { font-size: var(--fs-3); font-weight: 600; color: var(--txt); margin-bottom: var(--gap-stack); }
.yt-sub { font-size: var(--fs-1); font-weight: 400; color: var(--mut); margin-left: var(--sp-2); }
.yt-empty { color: var(--mut); font-size: var(--fs-2); padding: var(--sp-3) 0; }
</style>
