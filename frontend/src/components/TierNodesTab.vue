<script setup lang="ts">
import { computed } from 'vue'
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'
import { formatCellValue } from '@/lib/cellFormat'

const props = defineProps<{ tier: string }>()

const data = useDataStore()
const filter = useFilterStore()

const rows = computed(() => filter.filteredNodes.filter((n) => n.tier === props.tier))

const columns = computed<DataColumn[]>(() => {
  const cols = (data.data?.displayColumns as Record<string, any[]> | undefined)?.[props.tier] ?? []
  return cols
    .filter((c) => c.visible !== false)
    .map((c) => ({
      key: c.key,
      label: c.label,
      formatter: (value: unknown) => formatCellValue(value, c.key),
    }))
})
</script>

<template>
  <DataTable :columns="columns" :rows="rows as any[]" />
</template>
