<script setup lang="ts">
import { computed } from 'vue'
import { calMonthGrid, calDayTooltipText, type CalDayData } from '@/lib/calendar'

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
            c.count > 0 ? 'has-nodes status-' + c.statusClass : '',
            !c.otherMonth && selectedDate === c.dateStr ? 'selected' : '',
          ]"
          :title="c.count > 0 ? tip(c.dateStr) : ''"
          @click="onClick(c.otherMonth ? '' : c.dateStr)"
        >
          {{ c.day }}<span v-if="c.count > 0" class="cal-badge">{{ c.count }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cal-grid-row { display: flex; gap: 16px; flex-wrap: wrap; }
.cal-month { flex: 1; min-width: 280px; }
.cal-month-title { text-align: center; font-size: 14px; font-weight: 800; color: #0f172a; margin-bottom: 8px; }
.cal-weekdays { display: grid; grid-template-columns: repeat(7, 1fr); text-align: center; font-size: 12px; color: #64748b; margin-bottom: 4px; }
.cal-weekdays .wkend { color: #f59e0b; }
.cal-days { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
.cal-day {
  position: relative;
  aspect-ratio: 1 / 1;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #f1f5f9;
  border-radius: 6px;
  font-size: 13px;
  cursor: default;
  color: #0f172a;
}
.cal-day.other-month { color: #cbd5e1; background: #fafafa; }
.cal-day.weekend:not(.other-month) { background: #fcfcfd; }
.cal-day.today { outline: 2px solid #4f46e5; outline-offset: -2px; font-weight: 800; }
.cal-day.has-nodes { cursor: pointer; font-weight: 700; }
.cal-day.selected { box-shadow: 0 0 0 2px #4f46e5 inset; }
.cal-day.status-mixed { background: #ede9fe; }
.cal-day.status-delayed { background: #fee2e2; }
.cal-day.status-ontime { background: #dbeafe; }
.cal-day.status-advance { background: #d1fae5; }
.cal-day.status-canadvance { background: #e0e7ff; }
.cal-day.status-reached { background: #fef3c7; }
.cal-day.status-fullpaid { background: #d1fae5; }
.cal-day.status-pending { background: #f1f5f9; }
.cal-badge {
  position: absolute;
  top: 2px;
  right: 3px;
  font-size: 10px;
  font-weight: 700;
  color: #fff;
  background: #ef4444;
  border-radius: 8px;
  padding: 0 4px;
  line-height: 14px;
}
</style>
