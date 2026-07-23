<script setup lang="ts">
import { computed } from 'vue'
import RichTextCell from '@/components/RichTextCell.vue'
import type { CustomColumn } from '@/lib/followupColumns'

const props = defineProps<{
  col: CustomColumn
  row: Record<string, any>
  editable: boolean
  save: (v: string) => void | Promise<void>
}>()

const value = computed<string>(() => String(props.row[props.col.key] ?? ''))
const editTime = computed<string>(() => {
  const t = props.row[props.col.key + 'EditTime']
  return t ? `${t}：` : ''
})
</script>

<template>
  <RichTextCell
    v-if="col.type === 'text'"
    :content="value"
    :editable="editable"
    :prefix="editTime"
    :save-handler="(html: string) => save(html)"
  />
  <el-date-picker
    v-else-if="col.type === 'date' && editable"
    :model-value="value || ''"
    type="date"
    value-format="YYYY-MM-DD"
    size="small"
    style="width: 150px"
    placeholder="选择日期"
    @click.stop
    @update:model-value="(v: string | null) => save(v ?? '')"
  />
  <span v-else>{{ value || '-' }}</span>
</template>
