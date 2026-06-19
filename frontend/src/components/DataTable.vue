<script setup lang="ts">
import { computed } from 'vue'

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
  }>(),
  { showCount: true, clickable: false },
)

const emit = defineEmits<{ 'row-click': [Record<string, any>] }>()

const count = computed(() => props.rows.length)
</script>

<template>
  <div class="data-table">
    <div v-if="props.showCount" class="dt-count">共 {{ count }} 条</div>
    <el-table
      :data="props.rows"
      border
      stripe
      style="width: 100%"
      :row-class-name="props.clickable ? 'dt-clickable-row' : ''"
      @row-click="(row: Record<string, any>) => emit('row-click', row)"
    >
      <el-table-column
        v-for="col in props.columns"
        :key="col.key"
        :prop="col.key"
        :label="col.label"
        :width="col.width"
        :fixed="col.fixed"
        :sortable="!!col.sortable"
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
</style>
