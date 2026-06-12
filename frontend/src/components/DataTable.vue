<script setup lang="ts">
import { computed } from 'vue'

export interface DataColumn {
  key: string
  label: string
  width?: number | string
  sortable?: boolean
  /** 单元格格式化；返回展示字符串 */
  formatter?: (value: any, row: Record<string, any>) => string
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
        :sortable="!!col.sortable"
        show-overflow-tooltip
      >
        <template #default="scope">
          <slot :name="`cell-${col.key}`" :row="scope.row" :value="scope.row[col.key]">
            {{ col.formatter ? col.formatter(scope.row[col.key], scope.row) : scope.row[col.key] }}
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
</style>
