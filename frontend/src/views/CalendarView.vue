<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
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
const gridNodes = computed(() =>
  applyCalFilters(
    calExcludePaid(naguanNodes.value.filter((n) => n.isPaymentRelated && n.planDate) as any),
    calFilters.value,
  ),
)
const gridDateData = computed(() => calDateData(gridNodes.value))
const yearHeat = computed(() => calYearHeat(gridNodes.value as any, state.year))
const listNodes = computed(() =>
  calListNodes(naguanNodes.value as any, calFilters.value, {
    year: state.year,
    month: state.month,
    selectedDate: state.selectedDate,
  }),
)
const listGroups = computed(() => calListGroups(listNodes.value))
const upcoming = computed(() => calUpcoming(naguanNodes.value as any, calFilters.value, new Date()))

const listTitle = computed(() => (state.selectedDate ? `${state.selectedDate} 回款节点` : '当月/次月回款节点'))

const view = ref('grid')
const VIEW_OPTS = [
  { value: 'grid', label: '网格' },
  { value: 'agenda', label: '议程列表' },
]
const agendaNodes = computed(() =>
  calListNodes(naguanNodes.value as any, calFilters.value, {
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
        <div class="cd-val" :class="c.cls">{{ c.value }}</div>
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
.cal-view { padding: 16px; }
.cal-title { font-size: var(--fs-4); font-weight: 700; color: var(--txt); margin: 0 0 14px; }
.cal-dash { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 14px; margin-bottom: 14px; }
.cd-card { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 14px 10px; text-align: center; }
.cd-label { font-size: var(--fs-1); color: var(--mut); margin-bottom: 4px; }
.cd-val { font-size: var(--fs-5); font-weight: 800; color: var(--txt); }
.cd-val.danger { color: var(--danger); }
.cd-val.paid { color: var(--c-paid); }
.cd-val.pending { color: var(--c-pending); }
.cd-val.accent { color: var(--accent); }
.cal-filterbar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 14px; }
.cal-viewbar { margin-bottom: 12px; }
.cal-nav { display: inline-flex; align-items: center; gap: 6px; }
.cal-arrow { border: 1px solid var(--line); background: var(--card); border-radius: 6px; width: 28px; height: 28px; cursor: pointer; font-weight: 900; color: var(--sub); }
.cal-arrow:hover { background: var(--card2); color: var(--accent); }
.cal-navlabel { font-size: var(--fs-2); font-weight: 700; color: var(--txt); min-width: 48px; text-align: center; }
.cal-upcoming { margin-top: 22px; }
.cal-up-title { font-size: var(--fs-4); font-weight: 800; color: var(--txt); margin-bottom: 12px; }
.cal-up-row { display: flex; gap: 16px; flex-wrap: wrap; }
.cal-up-panel { flex: 1; min-width: 320px; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
.cal-up-header { color: var(--on-accent); font-weight: 700; font-size: var(--fs-2); padding: 8px 12px; }
.cal-up-header.pending { background: var(--c-pending); }
.cal-up-header.accent { background: var(--accent); }
</style>
