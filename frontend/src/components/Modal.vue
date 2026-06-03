<script setup lang="ts">
defineProps<{
  modelValue: boolean
  title?: string
  width?: string | number
}>()
defineEmits<{ 'update:modelValue': [boolean] }>()
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    :title="title"
    :width="width || '50%'"
    append-to-body
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <slot />
    <template v-if="$slots.footer" #footer>
      <slot name="footer" />
    </template>
  </el-dialog>
</template>
