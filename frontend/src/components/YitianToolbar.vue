<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useYitianStore } from '@/stores/yitian'
import { useYitianViewStore } from '@/stores/yitianView'
import { dataRange } from '@/lib/yitian/calendar'
import { NO_L4 } from '@/lib/yitian/metrics'

const store = useYitianStore()
const view = useYitianViewStore()

const days = computed(() => store.data?.days ?? [])
const range = computed(() => dataRange(days.value))

// 空 L4 兜底为「未分配L4」——花名册里确有 L4 为空的部门负责人,直接 filter 掉会让他们的工时筛不出来
const l4Options = computed(() => {
  const set = new Set((store.data?.roster ?? []).map((p) => p.l4 || NO_L4))
  return [...set].sort()
})

const isFallback = computed(() => store.data?.meta.calendarSource === 'fallback')

/** 数据跨度外的日期禁选——没有工作日标注就算不出基础工时。 */
function disabledDate(d: Date): boolean {
  const r = range.value
  if (!r.start || !r.end) return false
  // 用本地日期分量拼串,不要用 toISOString()——那会先转 UTC,在 UTC+8 下本地零点的 Date
  // 会退回前一天,导致数据跨度的第一天被误判为「早于跨度」而禁选(I-2)。
  const s = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return s < r.start || s > r.end
}

// 与 FilterBar.vue 同款写法:el-date-picker 的 daterange 类型经 value-format 回传的类型偏宽,
// 用 :model-value + @update:model-value(而非可写 computed 的 get/set 对象)绕开 TS 元组类型窄化的重载解析问题。
const rangeModel = computed<[string, string] | null>(() => (view.start && view.end ? [view.start, view.end] : null))

function onRangeChange(v: any): void {
  view.start = v?.[0] ?? ''
  view.end = v?.[1] ?? ''
  view.ensureRange(range.value.start, range.value.end)
}

onMounted(() => {
  view.hydrate()
  view.ensureRange(range.value.start, range.value.end)
})

defineExpose({ l4Options, disabledDate })
</script>

<template>
  <div class="yt-bar">
    <div class="yt-row">
      <el-date-picker :model-value="rangeModel" type="daterange" value-format="YYYY-MM-DD" unlink-panels
        range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期"
        :disabled-date="disabledDate" :clearable="false" @update:model-value="onRangeChange" />

      <el-radio-group v-model="view.weekMode" size="default">
        <el-radio-button value="calc">计算周(周五~周四)</el-radio-button>
        <el-radio-button value="iso">自然周(周一~周日)</el-radio-button>
      </el-radio-group>

      <el-select v-model="view.l4s" multiple collapse-tags collapse-tags-tooltip clearable
        placeholder="全部 L4 组织" class="yt-l4">
        <el-option v-for="o in l4Options" :key="o" :label="o" :value="o" />
      </el-select>

      <span class="yt-hint u-num">数据跨度 {{ range.start || '-' }} ~ {{ range.end || '-' }}</span>
    </div>

    <div v-if="isFallback" class="yt-warn">
      未提供 input/yitian/holidays.csv，工作日按「周一~周五」近似计算；含法定节假日的周期，饱和度会偏低、未填名单会误报。
    </div>
  </div>
</template>

<style scoped>
.yt-bar { margin-bottom: var(--gap-section); }
.yt-row { display: flex; flex-wrap: wrap; gap: var(--gap-stack); align-items: center; }
.yt-l4 { min-width: 220px; }
.yt-hint { color: var(--mut); font-size: var(--fs-1); }
.yt-warn {
  margin-top: var(--gap-stack);
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--r-sm);
  background: var(--warn-bg);
  color: var(--warn-text);
  font-size: var(--fs-2);
}
</style>
