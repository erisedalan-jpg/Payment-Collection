<script setup lang="ts">
import { computed } from 'vue'
import { calMonthGrid, calDayTooltipText, type CalDayData } from '@/lib/calendar'
import { fmtWan } from '@/lib/format'

const props = defineProps<{
  year: number
  month: number
  dateData: Record<string, CalDayData>
  selectedDate: string
  today?: Date
}>()
const emit = defineEmits<{ select: [string] }>()

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

const months = computed(() => {
  let y2 = props.year
  let m2 = props.month + 1
  if (m2 > 11) {
    m2 = 0
    y2 = props.year + 1
  }
  const t = props.today ?? new Date()
  return [
    { year: props.year, month: props.month, cells: calMonthGrid(props.year, props.month, props.dateData, t) },
    { year: y2, month: m2, cells: calMonthGrid(y2, m2, props.dateData, t) },
  ]
})

function tip(ds: string): string {
  const dd = props.dateData[ds]
  return dd ? calDayTooltipText(dd) : ''
}
function onClick(ds: string) {
  if (ds) emit('select', ds)
}
</script>

<template>
  <div class="cal-grid-row">
    <div v-for="mo in months" :key="mo.year + '-' + mo.month" class="cal-month">
      <div class="cal-month-title">{{ mo.year }}年{{ mo.month + 1 }}月</div>
      <div class="cal-weekdays">
        <span v-for="(wd, i) in WEEKDAYS" :key="wd" :class="{ wkend: i >= 5 }">{{ wd }}</span>
      </div>
      <div class="cal-days">
        <div
          v-for="(c, i) in mo.cells"
          :key="i"
          class="cal-day"
          :class="[
            c.otherMonth ? 'other-month' : '',
            c.isToday ? 'today' : '',
            c.isWeekend ? 'weekend' : '',
            c.count > 0 ? 'has-nodes st-' + c.statusClass : '',
            !c.otherMonth && selectedDate === c.dateStr ? 'selected' : '',
          ]"
          :title="c.count > 0 ? tip(c.dateStr) : ''"
          v-activate="!c.otherMonth && c.count > 0"
          @click="onClick(c.otherMonth ? '' : c.dateStr)"
        >
          <div class="cd-top">
            <span class="cd-num">{{ c.day }}</span>
            <span v-if="c.count > 0" class="cd-dot" />
          </div>
          <div v-if="c.count > 0" class="cd-meta">
            <span>{{ c.count }}笔</span>
            <span class="cd-amt">{{ fmtWan(c.remaining) }}万</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cal-grid-row { display: flex; gap: 16px; flex-wrap: wrap; }
.cal-month { flex: 1; min-width: 300px; }
.cal-month-title { text-align: center; font-size: var(--fs-3); font-weight: 800; color: var(--txt); margin-bottom: 8px; }
.cal-weekdays { display: grid; grid-template-columns: repeat(7, 1fr); text-align: center; font-size: var(--fs-1); color: var(--sub); margin-bottom: 4px; }
.cal-weekdays .wkend { color: var(--c-pending); }
.cal-days { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
.cal-day {
  --sc: var(--mut);
  min-height: 58px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 4px 6px;
  font-size: var(--fs-2);
  color: var(--txt);
}
.cal-day.other-month { color: var(--mut); background: var(--card2); opacity: 0.5; }
.cal-day.weekend:not(.other-month) { background: var(--card2); }
.cal-day.today { outline: 2px solid var(--accent); outline-offset: -2px; }
.cal-day.has-nodes { cursor: pointer; background: color-mix(in srgb, var(--sc) 14%, transparent); }
.cal-day.has-nodes:hover { background: color-mix(in srgb, var(--sc) 24%, transparent); }
.cal-day.selected { box-shadow: 0 0 0 2px var(--accent) inset; }
.st-delayed { --sc: var(--danger); }
.st-pending { --sc: var(--mut); }
.st-partial { --sc: var(--accent); }
.st-warranty { --sc: var(--warn); }
.st-mixed { --sc: var(--accent); }
.cd-top { display: flex; align-items: center; justify-content: space-between; }
.cd-num { font-weight: 700; }
.cd-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--sc); }
.cd-meta { display: flex; flex-direction: column; font-size: var(--fs-1); color: var(--sub); line-height: 1.3; }
.cd-amt { color: var(--sc); font-weight: 700; }
</style>
