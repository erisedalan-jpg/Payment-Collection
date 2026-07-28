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

/** 产品大类选项:取自数据码表,按 dims.prodCats 原序(后端已按业务顺序排,「其他」末位)。
 *  绝不写死清单——写死会在数据换档(产品分类.xlsx 增删大类)时静默错位。 */
const prodCatOptions = computed(() => store.data?.dims.prodCats ?? [])
/** 工时类型选项:同样取自数据码表。 */
const typeOptions = computed(() => store.data?.dims.types ?? [])

const MGR_OPTIONS = [
  { value: 'all', label: '全部' },
  { value: 'only', label: '仅管理干部' },
  { value: 'exclude', label: '排除管理干部' },
] as const
const DISPLAY_OPTIONS = [
  { value: 'hours', label: '只显示工时' },
  { value: 'pct', label: '只显示比例' },
  { value: 'both', label: '工时和比例' },
] as const

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
        :disabled-date="disabledDate" :clearable="false" size="small" class="yt-date"
        @update:model-value="onRangeChange" />

      <el-radio-group v-model="view.weekMode" size="small">
        <el-radio-button value="calc" title="计算周:周五~周四">计算周</el-radio-button>
        <el-radio-button value="iso" title="自然周:周一~周日">自然周</el-radio-button>
      </el-radio-group>

      <el-select v-model="view.l4s" multiple collapse-tags collapse-tags-tooltip clearable
        placeholder="全部 L4 组织" size="small" class="yt-l4">
        <el-option v-for="o in l4Options" :key="o" :label="o" :value="o" />
      </el-select>

      <el-select v-model="view.prodCats" multiple collapse-tags collapse-tags-tooltip clearable
        placeholder="产品大类(全部)" size="small" class="yt-sel" data-test="yt-prodcat">
        <el-option v-for="c in prodCatOptions" :key="c" :label="c" :value="c" />
      </el-select>

      <el-select v-model="view.types" multiple collapse-tags collapse-tags-tooltip clearable
        placeholder="工时类型(全部)" size="small" class="yt-sel" data-test="yt-type">
        <el-option v-for="t in typeOptions" :key="t" :label="t" :value="t" />
      </el-select>

      <el-select v-model="view.mgrMode" size="small" class="yt-sel yt-sel--sm" data-test="yt-mgr">
        <el-option v-for="o in MGR_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
      </el-select>

      <el-radio-group v-model="view.displayMode" size="small" data-test="yt-display">
        <el-radio-button v-for="o in DISPLAY_OPTIONS" :key="o.value" :value="o.value">
          {{ o.label }}
        </el-radio-button>
      </el-radio-group>

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
.yt-date { width: 260px; }
.yt-l4 { min-width: 180px; max-width: 240px; }
.yt-sel { min-width: 180px; max-width: 240px; }
.yt-sel--sm { min-width: 140px; max-width: 160px; }
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
