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
  }>(),
  { showCount: true },
)

const count = computed(() => props.rows.length)
</script>

<template>
  <div class="data-table">
    <div v-if="props.showCount" class="dt-count">共 {{ count }} 条</div>
    <el-table :data="props.rows" border stripe style="width: 100%">
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
          {{ col.formatter ? col.formatter(scope.row[col.key], scope.row) : scope.row[col.key] }}
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<style scoped>
.data-table { width: 100%; }
.dt-count { font-size: 12px; color: var(--mut); margin: 4px 0; }
</style>
