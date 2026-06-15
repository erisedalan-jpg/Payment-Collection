<script setup lang="ts">
import Modal from './Modal.vue'
import FollowupRecords from './FollowupRecords.vue'

const props = defineProps<{ modelValue: boolean; projectId: string; projectName: string }>()
const emit = defineEmits<{ 'update:modelValue': [boolean] }>()
</script>

<template>
  <Modal
    :model-value="props.modelValue"
    :title="`跟进记录 - ${props.projectName || props.projectId}`"
    width="80%"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <FollowupRecords v-if="props.modelValue" :project-id="props.projectId" :project-name="props.projectName" />
  </Modal>
</template>
