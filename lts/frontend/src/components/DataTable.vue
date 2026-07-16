<script setup lang="ts">
import { computed, ref, nextTick, watch } from 'vue'
import { useTableMaxHeight } from '@/composables/useTableMaxHeight'

export interface DataColumn {
  key: string
  label: string
  width?: number | string
  sortable?: boolean
  /** 单元格格式化；返回展示字符串 */
  formatter?: (value: any, row: Record<string, any>) => string
  /** 为真时该列不截断、单元格内换行（长文本列用） */
  wrap?: boolean
  /** 固定列：'left' | 'right'（横向滚动时常驻）；默认不固定 */
  fixed?: 'left' | 'right'
  /** 数字列：为真时单元格挂 .u-num（tabular-nums），CLAUDE.md 硬约束 */
  num?: boolean
}

const props = withDefaults(
  defineProps<{
    columns: DataColumn[]
    rows: Record<string, any>[]
    showCount?: boolean
    clickable?: boolean
    /** 外部排序模式：sortable 列渲染为 el-table 'custom'(不内部排序、仅发 sort-change),
     * 由父级对全量数据排序后再传分页切片。默认 false=保持原内置布尔排序(排当前 rows)。 */
    externalSort?: boolean
    /** opt-in 表底汇总行(el-table 原生 show-summary，恒在表底、不随排序移动)；默认关，不影响既有调用方 */
    showSummary?: boolean
    summaryMethod?: (ctx: { columns: { property: string }[]; data: Record<string, any>[] }) => string[]
    /** 初始排序(透传 el-table :default-sort);用于持久化恢复表头排序箭头。 */
    defaultSort?: { prop: string; order: 'ascending' | 'descending' } | null
    /** 首行冻结:为真时给 el-table 设动态 max-height,启用 EP 原生固定表头 + 表体内滚。默认关=零回归。 */
    stickyHeader?: boolean
    /** 首行冻结时的固定 max-height(px);设了就用它、跳过动态测量。仅在 stickyHeader 为真时生效。 */
    maxHeightPx?: number
  }>(),
  { showCount: true, clickable: false, externalSort: false, showSummary: false, stickyHeader: false },
)

const emit = defineEmits<{
  'row-click': [Record<string, any>]
  'sort-change': [{ prop: string | null; order: string | null }]
}>()

const count = computed(() => props.rows.length)

function onSortChange(e: { prop: string | null; order: string | null }) {
  emit('sort-change', { prop: e.prop, order: e.order })
}

const tableRef = ref<any>(null)
const { maxHeight, recompute } = useTableMaxHeight(
  () => tableRef.value?.$el as HTMLElement | undefined,
  // 传了固定 maxHeightPx 就不跑动态测量、不挂 resize 监听(useTableMaxHeight 内 addListener/
  // recompute 都先查 enabled())——固定值场景下动态测量纯属浪费。
  { enabled: () => props.stickyHeader && props.maxHeightPx == null },
)
const tableMaxHeight = computed(() => {
  if (!props.stickyHeader) return undefined
  return props.maxHeightPx ?? maxHeight.value
})
// 数据变化(分页/筛选/排序切片)后表格高度可能变,重算一次
watch(() => props.rows, () => { if (props.stickyHeader) nextTick(recompute) }, { flush: 'post' })
</script>

<template>
  <div class="data-table">
    <div v-if="props.showCount" class="dt-count">共 {{ count }} 条</div>
    <el-table
      ref="tableRef"
      :data="props.rows"
      border
      stripe
      style="width: 100%"
      :max-height="tableMaxHeight"
      :row-class-name="props.clickable ? 'dt-clickable-row' : ''"
      @row-click="(row: Record<string, any>) => emit('row-click', row)"
      @sort-change="onSortChange"
      :show-summary="props.showSummary"
      :summary-method="props.summaryMethod"
      :default-sort="props.defaultSort ?? undefined"
    >
      <el-table-column
        v-for="col in props.columns"
        :key="col.key"
        :prop="col.key"
        :label="col.label"
        :width="col.width"
        :fixed="col.fixed"
        :sortable="props.externalSort ? (col.sortable ? 'custom' : false) : !!col.sortable"
        :show-overflow-tooltip="!col.wrap"
        :cell-class-name="col.wrap ? 'dt-wrap-col' : ''"
      >
        <template #header>
          <slot :name="`header-${col.key}`" :col="col">{{ col.label }}</slot>
        </template>
        <template #default="scope">
          <slot :name="`cell-${col.key}`" :row="scope.row" :value="scope.row[col.key]">
            <!-- wrap 列双重打 dt-wrap-col 类:cell-class-name 给 <td>(浏览器换行)、内层 span 给 jsdom 测试可靠定位(cell-class-name 在 jsdom 不渲染到 td);勿删 span -->
            <span v-if="col.wrap" class="dt-wrap-col">{{ col.formatter ? col.formatter(scope.row[col.key], scope.row) : scope.row[col.key] }}</span>
            <!-- num 列挂 .u-num(tabular-nums)，CLAUDE.md 硬约束：表格数字列必须挂 .u-num -->
            <span v-else-if="col.num" class="u-num">{{ col.formatter ? col.formatter(scope.row[col.key], scope.row) : scope.row[col.key] }}</span>
            <template v-else>{{ col.formatter ? col.formatter(scope.row[col.key], scope.row) : scope.row[col.key] }}</template>
          </slot>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<style scoped>
.data-table { width: 100%; }
.dt-count { font-size: var(--fs-1); color: var(--mut); margin: var(--sp-1) 0; }
:deep(.dt-clickable-row) { cursor: pointer; }
:deep(.dt-wrap-col) { white-space: normal; word-break: break-word; }
/* el-table 原生表底汇总行(show-summary)不吃 cell-class-name，普通列靠 col.num→.u-num
   的路子在 footer 上不生效；数字列必须 tabular-nums(CLAUDE.md 硬约束)，这里直接兜底(M-6)。
   同时惠及复用 DataTable 的 PaymentL4Table 等页面。 */
:deep(.el-table__footer .cell) { font-variant-numeric: tabular-nums; }
</style>
