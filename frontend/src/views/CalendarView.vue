<script setup lang="ts">
import { computed, onMounted, reactive } from 'vue'
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'
import { naguanFilter } from '@/lib/ledger'
import {
  calFilterOptions,
  calDashboardStats,
  calExcludePaid,
  applyCalFilters,
  calDateData,
  calListNodes,
  calListGroups,
  calUpcoming,
  type CalFilters,
} from '@/lib/calendar'
import { fmtWan } from '@/lib/format'
import CalGrid from '@/components/CalGrid.vue'
import CalNodeTable from '@/components/CalNodeTable.vue'

const data = useDataStore()
const filter = useFilterStore()
onMounted(() => {
  if (!data.data) data.load()
})

const init = new Date()
const state = reactive({
  year: init.getFullYear(),
  month: init.getMonth(),
  selectedDate: '',
  filterOrgL3: '',
  filterOrgL4: '',
  filterPM: '',
})
const calFilters = computed<CalFilters>(() => ({
  orgL3: state.filterOrgL3,
  orgL4: state.filterOrgL4,
  pm: state.filterPM,
}))

const rawNodes = computed(() => (data.data?.rawNodes ?? []) as Record<string, any>[])
const naguanNodes = computed(
  () =>
    naguanFilter(
      rawNodes.value as any,
      filter.naguanOn,
      (data.data?.naguanExclude ?? {}) as Record<string, boolean>,
    ) as Record<string, any>[],
)

const options = computed(() => calFilterOptions(naguanNodes.value as any))
const dashboard = computed(() => calDashboardStats(filter.filteredNodes as any, calFilters.value, new Date()))
const gridDateData = computed(() =>
  calDateData(
    applyCalFilters(
      calExcludePaid(naguanNodes.value.filter((n) => n.isPaymentRelated && n.planDate) as any),
      calFilters.value,
    ),
  ),
)
const listNodes = computed(() =>
  calListNodes(naguanNodes.value as any, calFilters.value, {
    year: state.year,
    month: state.month,
    selectedDate: state.selectedDate,
  }),
)
const listGroups = computed(() => calListGroups(listNodes.value))
const upcoming = computed(() => calUpcoming(naguanNodes.value as any, calFilters.value, new Date()))

const listTitle = computed(() => (state.selectedDate ? `${state.selectedDate} 回款节点` : '当月回款节点'))

function prevYear() {
  state.year--
}
function nextYear() {
  state.year++
}
function prevMonth() {
  state.month--
  if (state.month < 0) {
    state.month = 11
    state.year--
  }
}
function nextMonth() {
  state.month++
  if (state.month > 11) {
    state.month = 0
    state.year++
  }
}
function onSelectDay(ds: string) {
  state.selectedDate = state.selectedDate === ds ? '' : ds
}
function clearFilters() {
  state.filterOrgL3 = ''
  state.filterOrgL4 = ''
  state.filterPM = ''
}
</script>

<template>
  <div class="cal-view">
    <h2 class="cal-title">回款日历</h2>

    <div class="cal-dash">
      <div class="cd-card"><div class="cd-label">当月待回款(万)</div><div class="cd-val" style="color:#ef4444">{{ fmtWan(dashboard.mRemaining) }}</div></div>
      <div class="cd-card"><div class="cd-label">当月已回款(万)</div><div class="cd-val" style="color:#10b981">{{ fmtWan(dashboard.mActual) }}</div></div>
      <div class="cd-card"><div class="cd-label">7天内到期</div><div class="cd-val" style="color:#f59e0b">{{ dashboard.upcoming7 }}</div></div>
      <div class="cd-card"><div class="cd-label">当月回款节点</div><div class="cd-val" style="color:#3b82f6">{{ dashboard.mCount }}</div></div>
      <div class="cd-card"><div class="cd-label">延期节点</div><div class="cd-val" style="color:#ef4444">{{ dashboard.delayed }}</div></div>
    </div>

    <div class="cal-filterbar">
      <div class="cal-nav">
        <button class="cal-arrow" @click="prevYear">‹</button>
        <span class="cal-navlabel">{{ state.year }}年</span>
        <button class="cal-arrow" @click="nextYear">›</button>
      </div>
      <div class="cal-nav">
        <button class="cal-arrow" @click="prevMonth">‹</button>
        <span class="cal-navlabel">{{ state.month + 1 }}月</span>
        <button class="cal-arrow" @click="nextMonth">›</button>
      </div>
      <el-select v-model="state.filterOrgL3" size="small" placeholder="PM L3-1部门" clearable style="width:150px">
        <el-option v-for="o in options.orgL3" :key="o" :label="o" :value="o" />
      </el-select>
      <el-select v-model="state.filterOrgL4" size="small" placeholder="项目经理L4部门" clearable style="width:160px">
        <el-option v-for="o in options.orgL4" :key="o" :label="o" :value="o" />
      </el-select>
      <el-select v-model="state.filterPM" size="small" placeholder="项目经理" clearable style="width:130px">
        <el-option v-for="o in options.pm" :key="o" :label="o" :value="o" />
      </el-select>
      <el-button size="small" @click="clearFilters">清除所有筛选</el-button>
    </div>

    <CalGrid
      :year="state.year"
      :month="state.month"
      :date-data="gridDateData"
      :selected-date="state.selectedDate"
      @select="onSelectDay"
    />

    <div class="cal-list">
      <div class="cal-list-title">{{ listTitle }}</div>
      <div v-if="!listGroups.length" class="cal-empty">暂无回款节点</div>
      <div v-for="g in listGroups" :key="g.key" class="cal-list-group">
        <div class="cal-group-header" :style="{ borderLeftColor: g.color }">
          <span :style="{ color: g.color }">{{ g.key }}</span>
          <span class="cal-group-sub">{{ g.nodes.length }}个节点，待回款小计 {{ fmtWan(g.subRemaining) }}万</span>
        </div>
        <CalNodeTable :nodes="g.nodes as Record<string, any>[]" />
      </div>
    </div>

    <div class="cal-upcoming">
      <div class="cal-up-title">即将到期回款节点</div>
      <div class="cal-up-row">
        <div class="cal-up-panel">
          <div class="cal-up-header orange">15天内到期</div>
          <CalNodeTable :nodes="upcoming.up15 as Record<string, any>[]" :max-show="50" />
        </div>
        <div class="cal-up-panel">
          <div class="cal-up-header blue">30天内到期</div>
          <CalNodeTable :nodes="upcoming.up30 as Record<string, any>[]" :max-show="100" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cal-view { padding: 16px; }
.cal-title { font-size: 18px; font-weight: 700; color: #0f172a; margin: 0 0 14px; }
.cal-dash { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 14px; margin-bottom: 14px; }
.cd-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 10px; text-align: center; }
.cd-label { font-size: 11px; color: #8c8c9e; margin-bottom: 4px; }
.cd-val { font-size: 24px; font-weight: 800; }
.cal-filterbar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 14px; }
.cal-nav { display: inline-flex; align-items: center; gap: 6px; }
.cal-arrow { border: 1px solid #e2e8f0; background: #fff; border-radius: 6px; width: 26px; height: 26px; cursor: pointer; font-weight: 900; color: #475569; }
.cal-navlabel { font-size: 14px; font-weight: 700; color: #0f172a; min-width: 48px; text-align: center; }
.cal-list { margin-top: 18px; }
.cal-list-title { font-size: 15px; font-weight: 800; color: #0f172a; margin-bottom: 8px; }
.cal-empty { color: #94a3b8; text-align: center; padding: 20px; }
.cal-list-group { margin-bottom: 14px; }
.cal-group-header { display: flex; align-items: center; gap: 10px; font-weight: 700; padding: 8px 12px; border-left: 3px solid #94a3b8; background: #f8fafc; font-size: 13px; }
.cal-group-sub { color: #334155; font-size: 12px; font-weight: 400; }
.cal-upcoming { margin-top: 22px; }
.cal-up-title { font-size: 16px; font-weight: 800; color: #0f172a; margin-bottom: 12px; }
.cal-up-row { display: flex; gap: 16px; flex-wrap: wrap; }
.cal-up-panel { flex: 1; min-width: 320px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
.cal-up-header { color: #fff; font-weight: 700; font-size: 13px; padding: 8px 12px; }
.cal-up-header.orange { background: #f59e0b; }
.cal-up-header.blue { background: #3b82f6; }
</style>
