<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useDataStore } from '@/stores/data'
import { useScopedProjects } from '@/composables/useScopedData'
import { useFilterStore } from '@/stores/filter'
import { paymentNodeRows } from '@/lib/paymentPmis'
import { inRange } from '@/lib/paymentRange'
import {
  calFilterOptions,
  calDashboardStats,
  calExcludePaid,
  applyCalFilters,
  calDateData,
  calListNodes,
  calListGroups,
  calUpcoming,
  calAgendaGroups,
  calYearHeat,
  type CalFilters,
} from '@/lib/calendar'
import { fmtWan } from '@/lib/format'
import SegToggle from '@/components/SegToggle.vue'
import CalYearHeat from '@/components/CalYearHeat.vue'
import CalGrid from '@/components/CalGrid.vue'
import CalDayDetail from '@/components/CalDayDetail.vue'
import CalAgenda from '@/components/CalAgenda.vue'
import CalNodeTable from '@/components/CalNodeTable.vue'

const data = useDataStore()
const scoped = useScopedProjects()
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
  orgL3_1: state.filterOrgL3,
  orgL4: state.filterOrgL4,
  pm: state.filterPM,
}))

const allNodes = computed(() =>
  paymentNodeRows(scoped.value?.paymentNodes, scoped.value?.projects ?? [], scoped.value?.projectPmis))
const baseNodes = computed(() =>
  filter.excludeOn ? allNodes.value.filter((n) => !filter.excludedIds[n.projectId]) : allNodes.value)
const filtered = computed(() =>
  baseNodes.value.filter((n) => inRange(n.planDate || '', filter.dateStart, filter.dateEnd)))

const options = computed(() => calFilterOptions(filtered.value))
const dashboard = computed(() => calDashboardStats(filtered.value, calFilters.value, new Date(), scoped.value?.paymentRecords))
const gridNodes = computed(() => applyCalFilters(calExcludePaid(filtered.value), calFilters.value))
const gridDateData = computed(() => calDateData(gridNodes.value))
const yearHeat = computed(() => calYearHeat(gridNodes.value, state.year))
const listNodes = computed(() =>
  calListNodes(filtered.value, calFilters.value, {
    year: state.year,
    month: state.month,
    selectedDate: state.selectedDate,
  }),
)
const listGroups = computed(() => calListGroups(listNodes.value))
const upcoming = computed(() => calUpcoming(filtered.value, calFilters.value, new Date()))

const listTitle = computed(() => (state.selectedDate ? `${state.selectedDate} 回款节点` : '当月/次月回款节点'))

const view = ref('grid')
const VIEW_OPTS = [
  { value: 'grid', label: '网格' },
  { value: 'agenda', label: '议程列表' },
]
const agendaNodes = computed(() =>
  calListNodes(filtered.value, calFilters.value, {
    year: state.year,
    month: state.month,
    selectedDate: '',
  }),
)
const agendaGroups = computed(() => calAgendaGroups(agendaNodes.value))

const DASH = computed(() => [
  { label: '当月待回款(万)', value: fmtWan(dashboard.value.mRemaining), cls: 'danger' },
  { label: '当月已回款(万)', value: fmtWan(dashboard.value.mActual), cls: 'paid' },
  { label: '7天内到期', value: String(dashboard.value.upcoming7), cls: 'pending' },
  { label: '当月回款节点', value: String(dashboard.value.mCount), cls: 'accent' },
  { label: '延期节点', value: String(dashboard.value.delayed), cls: 'danger' },
])

function prevYear() { state.year-- }
function nextYear() { state.year++ }
function prevMonth() {
  state.month--
  if (state.month < 0) { state.month = 11; state.year-- }
}
function nextMonth() {
  state.month++
  if (state.month > 11) { state.month = 0; state.year++ }
}
function onSelectDay(ds: string) {
  state.selectedDate = state.selectedDate === ds ? '' : ds
}
function onSelectMonth(m: number) {
  state.month = m
  state.selectedDate = ''
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
      <div v-for="c in DASH" :key="c.label" class="cd-card">
        <div class="cd-label">{{ c.label }}</div>
        <div class="cd-val u-num" :class="c.cls">{{ c.value }}</div>
      </div>
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
        <el-option v-for="o in options.orgL3_1" :key="o" :label="o" :value="o" />
      </el-select>
      <el-select v-model="state.filterOrgL4" size="small" placeholder="项目经理L4部门" clearable style="width:160px">
        <el-option v-for="o in options.orgL4" :key="o" :label="o" :value="o" />
      </el-select>
      <el-select v-model="state.filterPM" size="small" placeholder="项目经理" clearable style="width:130px">
        <el-option v-for="o in options.pm" :key="o" :label="o" :value="o" />
      </el-select>
      <el-button size="small" @click="clearFilters">清除所有筛选</el-button>
    </div>

    <CalYearHeat :cells="yearHeat" :active-month="state.month" @select="onSelectMonth" />

    <div class="cal-viewbar">
      <SegToggle v-model="view" :options="VIEW_OPTS" />
    </div>

    <template v-if="view === 'grid'">
      <CalGrid
        :year="state.year"
        :month="state.month"
        :date-data="gridDateData"
        :selected-date="state.selectedDate"
        @select="onSelectDay"
      />
      <CalDayDetail :title="listTitle" :groups="listGroups" />
    </template>
    <template v-else>
      <CalAgenda :groups="agendaGroups" />
    </template>

    <div class="cal-upcoming">
      <div class="cal-up-title">即将到期回款节点</div>
      <div class="cal-up-row">
        <div class="cal-up-panel">
          <div class="cal-up-header pending">15天内到期</div>
          <CalNodeTable :nodes="upcoming.up15 as Record<string, any>[]" :max-show="50" />
        </div>
        <div class="cal-up-panel">
          <div class="cal-up-header accent">30天内到期</div>
          <CalNodeTable :nodes="upcoming.up30 as Record<string, any>[]" :max-show="100" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cal-view { padding: var(--sp-4); }
.cal-title { font-size: var(--fs-4); font-weight: 700; color: var(--txt); margin: 0 0 var(--sp-4); }
.cal-dash { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: var(--sp-4); margin-bottom: var(--sp-4); }
.cd-card { background: var(--card); border: 1px solid var(--line); border-radius: var(--r-sm); padding: var(--sp-4) var(--sp-3); text-align: center; }
.cd-label { font-size: var(--fs-1); color: var(--mut); margin-bottom: var(--sp-1); }
.cd-val { font-size: var(--fs-5); font-weight: 700; color: var(--txt); }
.cd-val.danger { color: var(--danger-text); }
.cd-val.paid { color: var(--ok-text); }
.cd-val.pending { color: var(--warn-text); }
.cd-val.accent { color: var(--accent); }
.cal-filterbar { display: flex; gap: var(--sp-3); align-items: center; flex-wrap: wrap; margin-bottom: var(--sp-4); }
.cal-viewbar { margin-bottom: var(--sp-3); }
.cal-nav { display: inline-flex; align-items: center; gap: var(--sp-2); }
.cal-arrow { border: 1px solid var(--line); background: var(--card); border-radius: var(--r-sm); width: 28px; height: 28px; cursor: pointer; font-weight: 700; color: var(--sub); }
.cal-arrow:hover { background: var(--card2); color: var(--accent); }
.cal-navlabel { font-size: var(--fs-2); font-weight: 700; color: var(--txt); min-width: 48px; text-align: center; }
.cal-upcoming { margin-top: var(--sp-5); }
.cal-up-title { font-size: var(--fs-4); font-weight: 700; color: var(--txt); margin-bottom: var(--sp-3); }
.cal-up-row { display: flex; gap: var(--sp-4); flex-wrap: wrap; }
.cal-up-panel { flex: 1; min-width: 320px; border: 1px solid var(--line); border-radius: var(--r-sm); overflow: hidden; }
.cal-up-header { color: var(--warn-text); font-weight: 700; font-size: var(--fs-2); padding: var(--sp-2) var(--sp-3); }
.cal-up-header.pending { background: var(--warn-bg); }
.cal-up-header.accent { background: var(--card2); color: var(--accent); }
</style>
