<script setup lang="ts">
import { computed } from 'vue'
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'
import { formatCellValue } from '@/lib/cellFormat'
import { TIERS } from '@/nav'

const props = defineProps<{ tier: string }>()

const data = useDataStore()
const filter = useFilterStore()

const rows = computed(() => filter.filteredNodes.filter((n) => props.tier === '' || n.tier === props.tier))

const columns = computed<DataColumn[]>(() => {
  const cols =
    (data.data?.displayColumns as Record<string, any[]> | undefined)?.[props.tier] ??
    (data.data?.displayColumns as Record<string, any[]> | undefined)?.[TIERS[0].label] ??
    []
  const mappedCols = cols
    .filter((c) => c.visible !== false)
    .map((c) => ({
      key: c.key,
      label: c.label,
      formatter: (value: unknown) => formatCellValue(value, c.key),
    }))
  if (props.tier === '') {
    const tierCol: DataColumn = {
      key: 'tier',
      label: '档位',
      formatter: (value: unknown) => String(value ?? '-'),
    }
    return [tierCol, ...mappedCols]
  }
  return mappedCols
})
</script>

<template>
  <DataTable :columns="columns" :rows="rows as any[]" />
</template>
